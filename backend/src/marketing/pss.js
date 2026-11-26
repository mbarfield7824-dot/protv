// PROtv Social Studio (PSS) integration. PSS, on the studio PC, is PROtv's single Meta publisher: it holds the Meta app
// credentials and Page/Instagram tokens (DPAPI-protected, never leaving that PC). Marketing Studio queues approved
// Facebook/Instagram posts; PSS polls over outbound HTTPS, claims each post, publishes it with its existing connection
// and reports the result. Requests are signed with MARKETING_PSS_SECRET, domain-separated from every other integration.
const crypto = require('node:crypto');
const express = require('express');

const DOMAIN = 'protv-pss-v1';
const PSS_PLATFORMS = new Set(['facebook', 'instagram']);
const STALE_CLAIM_MS = 30 * 60_000;

function pssSignature(secret, method, pathName, timestamp, body) {
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  return crypto.createHmac('sha256', secret).update(`${DOMAIN}\n${method.toUpperCase()}\n${pathName}\n${timestamp}\n${digest}`).digest('hex');
}

function requirePssSignature(secret = () => process.env.MARKETING_PSS_SECRET || '') {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const key = secret();
    if (!key) return res.status(503).json({ error: 'The PROtv Social Studio link is not configured.' });
    const timestamp = String(req.get('X-PROtv-PSS-Timestamp') || '');
    const signature = String(req.get('X-PROtv-PSS-Signature') || '');
    if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) return res.status(401).json({ error: 'Stale or missing timestamp.' });
    const body = req.method === 'GET' ? '' : JSON.stringify(req.body ?? {});
    const expected = pssSignature(key, req.method, req.originalUrl.split('?')[0], timestamp, body);
    if (!/^[0-9a-f]{64}$/.test(signature) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(401).json({ error: 'Invalid signature.' });
    return next();
  };
}

// What the Studio stores about PSS: readiness only (no tokens, no secrets).
function cleanStatus(input = {}) {
  const page = input.page && typeof input.page === 'object' ? { id: String(input.page.id || '').slice(0, 40), name: String(input.page.name || '').slice(0, 120) } : null;
  const instagram = input.instagram && typeof input.instagram === 'object' ? { id: String(input.instagram.id || '').slice(0, 40), username: String(input.instagram.username || '').slice(0, 60) } : null;
  return {
    version: String(input.version || '').slice(0, 40), connected: input.connected === true, reauthRequired: input.reauthRequired === true,
    connectionExpiresAt: typeof input.connectionExpiresAt === 'string' ? input.connectionExpiresAt.slice(0, 40) : null,
    facebookReady: input.facebookReady === true, instagramReady: input.instagramReady === true, page, instagram,
    userTokenExpiresAt: typeof input.userTokenExpiresAt === 'string' ? input.userTokenExpiresAt.slice(0, 40) : null,
    dataAccessExpiresAt: typeof input.dataAccessExpiresAt === 'string' ? input.dataAccessExpiresAt.slice(0, 40) : null,
    pageTokenNeverExpires: input.pageTokenNeverExpires === true, healthCheckedAt: typeof input.healthCheckedAt === 'string' ? input.healthCheckedAt.slice(0, 40) : null,
    appSecretAccepted: typeof input.appSecretAccepted === 'boolean' ? input.appSecretAccepted : null,
    scopes: Array.isArray(input.scopes) ? input.scopes.map((scope) => String(scope).replace(/[^a-z_]/g, '').slice(0, 60)).filter(Boolean).slice(0, 30) : [],
  };
}

function createPssRouter({ service, secret }) {
  const router = express.Router();
  router.use(requirePssSignature(secret));
  const handle = (fn) => async (req, res) => {
    try { return res.json(await fn(req)); } catch (error) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
      console.error('[marketing/pss]', error);
      return res.status(500).json({ error: 'The request could not be completed.' });
    }
  };
  router.post('/heartbeat', handle((req) => service.pssHeartbeat(cleanStatus(req.body?.pss))));
  router.get('/queue', handle(() => service.pssQueue()));
  router.post('/posts/:id/claim', handle((req) => service.pssClaim(req.params.id)));
  router.post('/posts/:id/result', handle((req) => service.pssResult(req.params.id, req.body || {})));
  router.post('/metrics', handle((req) => service.pssMetrics(req.body?.items)));
  return router;
}

module.exports = { DOMAIN, PSS_PLATFORMS, STALE_CLAIM_MS, pssSignature, requirePssSignature, cleanStatus, createPssRouter };

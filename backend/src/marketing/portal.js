// Marketing Studio → Creator Portal (render worker, Hype Clip Studio exports, portal AI). Requests are signed with the
// shared PROtv publishing secret, domain-separated so they cannot be replayed against any other integration.
const crypto = require('node:crypto');

class PortalUnavailableError extends Error {}

function marketingSignature(secret, method, pathName, timestamp, body) {
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  return crypto.createHmac('sha256', secret).update(`protv-marketing-v1\n${method.toUpperCase()}\n${pathName}\n${timestamp}\n${digest}`).digest('hex');
}
function fileSignature(secret, kind, id, expires) {
  return crypto.createHmac('sha256', secret).update(`protv-marketing-file-v1\n${kind}\n${id}\n${expires}`).digest('hex');
}

function createPortalClient({
  baseUrl = () => String(process.env.CREATOR_PORTAL_URL || '').trim().replace(/\/+$/, ''),
  secret = () => process.env.PROTV_PUBLISHING_SECRET || '',
  fetcher = fetch,
  now = () => Date.now(),
} = {}) {
  const configured = () => Boolean(baseUrl() && secret());
  async function call(method, pathName, body) {
    if (!configured()) throw new PortalUnavailableError('The Creator Portal render worker is not configured (CREATOR_PORTAL_URL and PROTV_PUBLISHING_SECRET).');
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(now());
    const response = await fetcher(`${baseUrl()}${pathName}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'X-PROtv-Marketing-Timestamp': timestamp,
        'X-PROtv-Marketing-Signature': marketingSignature(secret(), method, pathName, timestamp, raw),
      },
      ...(body === undefined ? {} : { body: raw }),
      signal: AbortSignal.timeout(method === 'POST' && pathName.endsWith('/ai') ? 90_000 : 20_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new PortalUnavailableError(data.error || `The Creator Portal answered ${response.status}.`);
    return data;
  }
  const fileUrl = (kind, id, { ttlMs = 6 * 3600_000, download = false } = {}) => {
    const expires = now() + ttlMs;
    const route = kind === 'render' ? 'renders' : 'hype-clips';
    const url = new URL(`${baseUrl()}/api/integrations/marketing/${route}/${encodeURIComponent(id)}/file`);
    url.searchParams.set('expires', String(expires));
    url.searchParams.set('signature', fileSignature(secret(), kind, id, expires));
    if (download) url.searchParams.set('download', '1');
    return url.toString();
  };
  return {
    configured,
    submitRender: (plan) => call('POST', '/api/integrations/marketing/renders', { plan }),
    renderStatus: (id) => call('GET', `/api/integrations/marketing/renders/${encodeURIComponent(id)}`),
    cancelRender: (id) => call('POST', `/api/integrations/marketing/renders/${encodeURIComponent(id)}/cancel`, {}),
    hypeClips: () => call('GET', '/api/integrations/marketing/hype-clips'),
    ai: (system, user, maxTokens = 800) => call('POST', '/api/integrations/marketing/ai', { system, user, maxTokens }),
    fileUrl,
  };
}

module.exports = { createPortalClient, marketingSignature, fileSignature, PortalUnavailableError };

// Marketing Studio HTTP routes.
//   /api/admin/marketing/*             Administrators only (verifyAdmin), no caching.
//   /api/marketing/events              anonymous aggregate counters from the website (rate-limited, no identifiers).
//   /api/marketing/oauth/:p/callback   platform OAuth return (validated by a single-use state).
//   /api/integrations/marketing/dispatch  publishes due, approved posts; called by the portal worker every few
//                                         minutes, signed with the shared publishing secret.
const express = require('express');
const crypto = require('node:crypto');
const { MarketingError } = require('./service');
const { PortalUnavailableError, marketingSignature } = require('./portal');
const { SocialError } = require('./social');
const { runAgent } = require('./agent');

const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
const actor = (req) => req.user?.uid || 'admin';

function fail(res, error, what) {
  if (error instanceof MarketingError || error instanceof SocialError) return res.status(error.status || 400).json({ error: error.message });
  if (error instanceof PortalUnavailableError) return res.status(503).json({ error: error.message });
  if (error?.name === 'CreativeValidationError') return res.status(400).json({ error: error.message });
  console.error(`[marketing] ${what} failed`, error);
  return res.status(500).json({ error: `The ${what} could not be completed.` });
}
const handle = (what, fn) => async (req, res) => { try { return res.json(await fn(req, res)); } catch (error) { return fail(res, error, what); } };

function createAdminMarketingRouter({ service, verifyAdmin, loadCatalog, redirectBase = () => process.env.FRONTEND_URL || 'https://watchprotv.com' }) {
  const router = express.Router();
  router.use(noStore, verifyAdmin);
  router.get('/overview', handle('overview', () => service.overview()));
  router.get('/footage', handle('footage list', (req) => service.eligibleFootage({ destination: req.query.destination || 'social', network: req.query.network === '1' })));
  router.get('/live', handle('LIVE lineup', (req) => service.liveUpcoming(Math.min(14 * 24, Number(req.query.hours) || 7 * 24))));

  router.get('/campaigns', handle('campaign list', () => service.listCampaigns()));
  router.post('/campaigns', handle('campaign', (req) => service.createCampaign(req.body || {}, actor(req))));
  router.get('/campaigns/:id', handle('campaign', (req) => service.getCampaign(req.params.id)));
  router.patch('/campaigns/:id', handle('campaign', (req) => service.updateCampaign(req.params.id, req.body || {}, actor(req))));
  router.post('/campaigns/:id/:action(submit|approve|activate|pause|resume|complete|archive|reopen)', handle('campaign', (req) => service.transitionCampaign(req.params.id, req.params.action, actor(req), req.body?.note)));
  router.post('/campaigns/:id/duplicate', handle('campaign', (req) => service.duplicateCampaign(req.params.id, actor(req))));

  router.get('/commercials', handle('commercial list', () => service.listCommercials()));
  router.post('/commercials', handle('commercial', (req) => service.createCommercial(req.body || {}, actor(req))));
  router.get('/commercials/:id', handle('commercial', (req) => service.getCommercial(req.params.id)));
  router.put('/commercials/:id/storyboard', handle('storyboard', (req) => service.updateStoryboard(req.params.id, req.body?.storyboard, actor(req), { theme: req.body?.theme, branding: req.body?.branding, music: req.body?.music, title: req.body?.title })));
  router.post('/commercials/:id/duplicate', handle('duplicate', (req) => service.duplicateCommercial(req.params.id, actor(req))));
  router.post('/preview', handle('preview', (req) => service.previewPlan(req.body || {})));
  router.get('/design', handle('design options', () => service.designOptions()));
  router.get('/templates', handle('template list', () => service.listTemplates()));
  router.post('/templates', handle('template', (req) => service.saveTemplate(req.body || {}, actor(req))));
  router.put('/templates/:id', handle('template', (req) => service.updateTemplate(req.params.id, req.body || {}, actor(req))));
  router.delete('/templates/:id', handle('template', (req) => service.deleteTemplate(req.params.id, actor(req))));
  router.post('/commercials/:id/render', handle('render', (req) => service.renderCommercial(req.params.id, { formats: req.body?.formats }, actor(req))));
  router.post('/commercials/:id/refresh', handle('render status', (req) => service.refreshCommercial(req.params.id)));
  router.post('/commercials/:id/cancel', handle('render cancel', (req) => service.cancelRender(req.params.id, req.body?.format, actor(req))));
  router.post('/commercials/:id/review', handle('review', (req) => service.reviewCommercial(req.params.id, req.body || {}, actor(req))));
  router.post('/commercials/:id/sponsor-approval', handle('sponsor approval', (req) => service.recordSponsorApproval(req.params.id, req.body || {}, actor(req))));
  router.post('/commercials/:id/live', handle('LIVE registration', (req) => service.registerForLive(req.params.id, req.body || {}, actor(req))));
  router.get('/commercials/:id/captions.srt', async (req, res) => {
    try { res.type('application/x-subrip').attachment(`${req.params.id}.srt`).send(await service.srt(req.params.id)); } catch (error) { fail(res, error, 'captions'); }
  });

  router.get('/assets', handle('asset list', () => service.listAssets()));
  router.post('/assets/:id/download', handle('download', (req) => service.downloadAsset(req.params.id, actor(req))));
  router.post('/assets/hype-clips/:jobId/import', handle('Hype Clip import', (req) => service.importHypeClip(req.params.jobId, actor(req))));

  router.get('/posts', handle('post list', () => service.listPosts()));
  router.post('/posts', handle('post', (req) => service.createPost(req.body || {}, actor(req))));
  router.post('/posts/:id/approve', handle('post approval', (req) => service.approvePost(req.params.id, actor(req))));
  router.post('/posts/:id/test', handle('publishing test', (req) => service.testPost(req.params.id, actor(req))));
  router.post('/posts/:id/publish', handle('publishing', (req) => service.publishPost(req.params.id, actor(req))));
  router.post('/posts/:id/manual', handle('manual post', (req) => service.recordManualPost(req.params.id, req.body || {}, actor(req))));
  router.post('/posts/:id/cancel', handle('post', (req) => service.cancelPost(req.params.id, actor(req))));
  router.post('/plan/seven-days', handle('seven-day plan', (req) => service.sevenDayPlan(actor(req), { platforms: req.body?.platforms })));

  router.get('/accounts', handle('accounts', () => service.accounts()));
  router.post('/accounts/:platform/connect', handle('connection', (req) => service.startConnect(req.params.platform, `${String(redirectBase()).replace(/\/+$/, '')}/api/marketing/oauth/${req.params.platform === 'instagram' ? 'facebook' : req.params.platform}/callback`, actor(req))));
  router.post('/accounts/:platform/disconnect', handle('disconnection', (req) => service.disconnect(req.params.platform, actor(req))));

  router.get('/ads', handle('paid campaigns', () => service.listAds()));
  router.post('/ads', handle('paid campaign', (req) => service.createAd(req.body || {}, actor(req))));
  router.post('/ads/:id/:action(approve|prepare|activate|resume|pause|emergency-pause)', handle('paid campaign', (req) => service.adAction(req.params.id, req.params.action, actor(req))));

  router.get('/creators', handle('creator kits', () => service.creatorKits()));
  router.get('/analytics', handle('analytics', (req) => service.report({ days: Math.min(365, Number(req.query.days) || 30) })));
  router.get('/settings', handle('settings', async () => ({ settings: await service.settings(), providers: service.providers() })));
  router.put('/settings', handle('settings', (req) => service.saveSettings(req.body || {}, actor(req))));
  router.get('/audit', handle('audit log', () => service.auditLog(200)));
  router.post('/agent', handle('agent', (req) => runAgent(service, String(req.body?.instruction || '').slice(0, 500), actor(req), { loadCatalog })));
  return router;
}

function createPublicMarketingRouter({ service, rateLimit, clientAddress, redirectBase = () => process.env.FRONTEND_URL || 'https://watchprotv.com' }) {
  const router = express.Router();
  router.post('/events', noStore, async (req, res) => {
    try {
      if (rateLimit) { const address = clientAddress(req); await rateLimit(address, `marketing-event:${address}`); }
      const ok = await service.record({ event: String(req.body?.event || ''), campaign: String(req.body?.campaign || ''), content: String(req.body?.content || '') });
      return res.status(ok ? 204 : 400).end();
    } catch (error) {
      if (error?.status === 429) return res.status(429).end();
      return res.status(204).end(); // measurement never breaks the site
    }
  });
  router.get('/oauth/:platform/callback', noStore, async (req, res) => {
    const base = String(redirectBase()).replace(/\/+$/, '');
    try {
      const result = await service.finishConnect({ state: req.query.state, code: req.query.code, error: req.query.error_description || req.query.error });
      return res.redirect(`${base}/admin?section=accounts&connected=${encodeURIComponent(result.platform)}#marketing-studio`);
    } catch (error) {
      return res.redirect(`${base}/admin?section=accounts&connectError=${encodeURIComponent(String(error.message).slice(0, 200))}#marketing-studio`);
    }
  });
  return router;
}

function createDispatchHandler({ service, secret = () => process.env.PROTV_PUBLISHING_SECRET || '', cronSecret = () => process.env.CRON_SECRET || '' }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const timestamp = String(req.get('X-PROtv-Marketing-Timestamp') || '');
    const signature = String(req.get('X-PROtv-Marketing-Signature') || '');
    const key = secret();
    const signedOk = key && /^\d{13}$/.test(timestamp) && Math.abs(Date.now() - Number(timestamp)) < 5 * 60_000 && /^[0-9a-f]{64}$/.test(signature)
      && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(marketingSignature(key, req.method, req.originalUrl.split('?')[0], timestamp, req.method === 'GET' ? '' : JSON.stringify(req.body ?? {}))));
    const cronOk = cronSecret() && req.get('Authorization') === `Bearer ${cronSecret()}`;
    if (!signedOk && !cronOk) return res.status(401).json({ error: 'Not authorized.' });
    try { return res.json(await service.dispatchDue('scheduler')); } catch (error) { return fail(res, error, 'dispatch'); }
  };
}

function createMarketingRouters(dependencies = {}) {
  const { db, getApprovedVideos } = require('../firebase');
  const { FirestoreMarketingStore } = require('./store');
  const { createMarketingService } = require('./service');
  const { createPortalClient } = require('./portal');
  const { FirestoreLinearStore } = require('../linear/store');
  const { createLinearService } = require('../linear/service');
  const loadCatalog = dependencies.loadCatalog || getApprovedVideos;
  const linearStore = new FirestoreLinearStore(db);
  const service = dependencies.service || createMarketingService({
    store: new FirestoreMarketingStore(db), portal: createPortalClient(), loadCatalog, linearStore,
    linearService: createLinearService({ store: linearStore }), mux: require('../mux'),
    audit: (event) => require('../adminBot/adminAudit').logAdminEvent(event),
  });
  const rateLimit = async (address, key) => {
    const { PlaybackTrackingService } = require('../playback/trackingService');
    const limiter = new PlaybackTrackingService({ db });
    limiter.requireConfigured();
    await limiter.consumeRateLimit(address, key);
  };
  return {
    service,
    adminRouter: createAdminMarketingRouter({ service, loadCatalog, verifyAdmin: dependencies.verifyAdmin || require('../middleware/auth').verifyAdmin }),
    publicRouter: createPublicMarketingRouter({ service, rateLimit, clientAddress: require('../reports/clientAddress').reportingClientAddress }),
    dispatchHandler: createDispatchHandler({ service }),
    pssRouter: require('./pss').createPssRouter({ service }),
  };
}

module.exports = { createAdminMarketingRouter, createPublicMarketingRouter, createDispatchHandler, createMarketingRouters };

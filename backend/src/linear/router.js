const express = require('express');
const { LinearValidationError } = require('./model');
const { LinearNotFoundError } = require('./service');
const { LinearEventError, validateLinearEvent } = require('./analytics');

const noStore = (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' });
  next();
};

function fail(res, error, context) {
  if (error instanceof LinearValidationError || error instanceof LinearEventError) return res.status(400).json({ error: error.message });
  if (error instanceof LinearNotFoundError) return res.status(404).json({ error: error.message });
  console.error(`PROtv LIVE ${context} failed:`, error.message);
  return res.status(503).json({ error: 'PROtv LIVE is temporarily unavailable.' });
}

// Public channel API, shared by the website today and designed for the Roku and Fire TV apps later.
function createLinearRouter({ service, analytics, authenticate, rateLimit, clientAddress }) {
  const router = express.Router();
  router.use(noStore);

  // Read by every website header, so the CDN may hold it for a minute.
  router.get('/status', async (req, res) => {
    try {
      const status = await service.status();
      res.set({ 'Cache-Control': 'public, max-age=60', 'CDN-Cache-Control': 'public, max-age=60', 'Vercel-CDN-Cache-Control': 'public, max-age=60' });
      return res.json(status);
    } catch {
      return res.json({ public: false });
    }
  });

  router.get('/channel', authenticate, async (req, res) => {
    try {
      const preview = req.query.preview === '1' && req.user?.admin === true;
      return res.json(await service.channelState({ preview }));
    } catch (error) {
      return fail(res, error, 'channel');
    }
  });

  router.post('/events', authenticate, async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'Events require application/json.' });
    try {
      if (Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8') > 1024) return res.status(413).json({ error: 'Event exceeds 1 KB.' });
      const event = validateLinearEvent(req.body);
      const status = await service.status();
      if (!status.public && req.user?.admin !== true) return res.status(404).json({ error: 'PROtv LIVE is not available.' });
      if (req.user?.admin === true) return res.status(200).json({ recorded: false, excluded: true });
      await rateLimit(clientAddress(req), `linear:${event.sessionId}`);
      const onAir = event.eventType === 'tune_in' ? await service.entryOnAir(null)
        : event.entryId ? await service.entryOnAir(event.entryId) : null;
      const result = await analytics.record(event, { user: req.user || null, entry: onAir?.entry || null, title: onAir?.title || '' });
      return res.status(result.recorded ? 201 : 200).json(result);
    } catch (error) {
      if (error?.retryAfter) {
        return res.set('Retry-After', String(error.retryAfter)).status(429).json({ error: 'Too many events. Try again later.' });
      }
      return fail(res, error, 'event');
    }
  });

  return router;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function createAdminLinearRouter({ service, analytics, verifyAdmin, audit }) {
  const router = express.Router();
  router.use(noStore, verifyAdmin);
  const actor = (req) => req.user?.uid || 'admin';
  const record = (req, type, message, details) => audit({ type: `linear.${type}`, message, actorId: actor(req), details })
    .catch(() => console.error('PROtv LIVE audit entry could not be written.'));

  router.get('/settings', async (req, res) => {
    try { return res.json(await service.settings()); } catch (error) { return fail(res, error, 'settings'); }
  });

  router.put('/settings', async (req, res) => {
    try {
      const saved = await service.updateSettings(req.body || {}, actor(req));
      await record(req, 'settings', `Updated PROtv LIVE settings${req.body?.status ? ` (channel ${saved.status})` : ''}.`, { fields: Object.keys(req.body || {}).filter((key) => key !== 'confirmation') });
      return res.json(saved);
    } catch (error) { return fail(res, error, 'settings update'); }
  });

  router.get('/schedule', async (req, res) => {
    try { return res.json({ items: await service.listSchedule({ from: req.query.from, to: req.query.to }) }); } catch (error) { return fail(res, error, 'schedule'); }
  });

  router.get('/coverage', async (req, res) => {
    try { return res.json(await service.weekCoverage(String(req.query.weekOf || ''))); } catch (error) { return fail(res, error, 'coverage'); }
  });

  router.post('/schedule/repeat', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await service.repeatWeek({
        sourceWeekOf: body.sourceWeekOf, targetWeekOf: body.targetWeekOf, weeks: body.weeks ?? 1,
        apply: body.apply === true, keepPrimetimeOpen: body.keepPrimetimeOpen !== false,
      }, actor(req));
      if (result.applied) {
        await record(req, 'schedule_repeat', `Repeated the week of ${body.sourceWeekOf} from ${body.targetWeekOf} for ${body.weeks ?? 1} week(s): ${result.created} approved, ${result.skipped} skipped.`,
          { sourceWeekOf: body.sourceWeekOf, targetWeekOf: body.targetWeekOf, weeks: body.weeks ?? 1, created: result.created });
      }
      return res.json(result);
    } catch (error) { return fail(res, error, 'schedule repeat'); }
  });

  router.post('/schedule', async (req, res) => {
    try {
      const entry = await service.createEntry(req.body || {}, actor(req));
      await record(req, 'schedule_create', `Drafted ${entry.typeLabel} "${entry.title}" for ${entry.startLabel}.`, { entryId: entry.id, videoId: entry.videoId });
      return res.status(201).json(entry);
    } catch (error) { return fail(res, error, 'schedule create'); }
  });

  router.patch('/schedule/:id', async (req, res) => {
    try {
      const entry = await service.updateEntry(req.params.id, req.body || {}, actor(req));
      await record(req, 'schedule_update', `Changed "${entry.title}" to ${entry.startLabel}; it needs approval again.`, { entryId: entry.id });
      return res.json(entry);
    } catch (error) { return fail(res, error, 'schedule update'); }
  });

  router.post('/schedule/:id/approve', async (req, res) => {
    try {
      const entry = await service.approveEntry(req.params.id, { acknowledgeWarnings: req.body?.acknowledgeWarnings === true }, actor(req));
      await record(req, 'schedule_approve', `Approved "${entry.title}" for ${entry.startLabel}.`, { entryId: entry.id, videoId: entry.videoId, warnings: entry.issues.warnings });
      return res.json(entry);
    } catch (error) { return fail(res, error, 'schedule approval'); }
  });

  router.post('/schedule/:id/withdraw', async (req, res) => {
    try {
      const entry = await service.withdrawEntry(req.params.id, actor(req));
      await record(req, 'schedule_withdraw', `Withdrew approval for "${entry.title}" at ${entry.startLabel}.`, { entryId: entry.id });
      return res.json(entry);
    } catch (error) { return fail(res, error, 'schedule withdrawal'); }
  });

  router.delete('/schedule/:id', async (req, res) => {
    try {
      const removed = await service.deleteEntry(req.params.id);
      await record(req, 'schedule_delete', `Removed a schedule entry at ${removed.startAt}.`, { entryId: req.params.id, videoId: removed.videoId || null });
      return res.status(204).end();
    } catch (error) { return fail(res, error, 'schedule removal'); }
  });

  router.get('/programs', async (req, res) => {
    try { return res.json({ items: await service.programs() }); } catch (error) { return fail(res, error, 'programs'); }
  });

  router.get('/rights', async (req, res) => {
    try { return res.json(await service.rightsReview()); } catch (error) { return fail(res, error, 'rights review'); }
  });

  router.put('/rights/:key', async (req, res) => {
    try {
      const saved = await service.setRights(req.params.key, req.body || {}, actor(req));
      await record(req, 'rights', `Recorded linear rights ${saved.status} for ${saved.key}.`, { key: saved.key, status: saved.status, agreementReference: saved.agreementReference });
      return res.json(saved);
    } catch (error) { return fail(res, error, 'rights update'); }
  });

  router.post('/primetime/draft', async (req, res) => {
    try {
      const results = await service.draftPrimetimeWeek(req.body?.weekOf, actor(req));
      await record(req, 'primetime_draft', `Drafted primetime for the week of ${req.body?.weekOf}: ${results.filter((item) => item.created).length} of ${results.length} slots filled.`, { weekOf: req.body?.weekOf });
      return res.json({ items: results });
    } catch (error) { return fail(res, error, 'primetime draft'); }
  });

  router.get('/analytics', async (req, res) => {
    const { from, to } = req.query;
    if (!DATE.test(String(from || '')) || !DATE.test(String(to || '')) || from > to
      || Date.parse(to) - Date.parse(from) > 92 * 86_400_000) {
      return res.status(400).json({ error: 'Choose a date range (YYYY-MM-DD) of up to 92 days.' });
    }
    try { return res.json(await analytics.report({ from, to })); } catch (error) { return fail(res, error, 'analytics'); }
  });

  return router;
}

// Production wiring: Firestore store, Mux signing, playback-tracking rate limits, and the shared admin audit log.
function createLinearRouters(dependencies = {}) {
  const { db } = require('../firebase');
  const { FirestoreLinearStore } = require('./store');
  const { createLinearService } = require('./service');
  const { LinearAnalytics } = require('./analytics');
  const service = dependencies.service || createLinearService({ store: new FirestoreLinearStore(db) });
  const analytics = dependencies.analytics || new LinearAnalytics({ db });
  const rateLimit = dependencies.rateLimit || (async (address, key) => {
    const { PlaybackTrackingService } = require('../playback/trackingService');
    const limiter = new PlaybackTrackingService({ db });
    limiter.requireConfigured();
    await limiter.consumeRateLimit(address, key);
  });
  return {
    publicRouter: createLinearRouter({
      service, analytics, rateLimit,
      authenticate: dependencies.authenticate || require('../middleware/auth').verifyOptionalToken,
      clientAddress: dependencies.clientAddress || require('../reports/clientAddress').reportingClientAddress,
    }),
    adminRouter: createAdminLinearRouter({
      service, analytics,
      verifyAdmin: dependencies.verifyAdmin || require('../middleware/auth').verifyAdmin,
      audit: dependencies.audit || ((event) => require('../adminBot/adminAudit').logAdminEvent(event)),
    }),
  };
}

module.exports = { createAdminLinearRouter, createLinearRouter, createLinearRouters };

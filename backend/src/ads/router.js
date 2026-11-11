const express = require('express');
const path = require('path');
const { db, getVideoById } = require('../firebase');
const { verifyAdmin } = require('../middleware/auth');
const {
  AdRevenueStore,
  TELEMETRY_EVENTS,
  createAdSessionToken,
  forwardCreatorRevenue,
  verifyAdSessionToken,
  verifySignedBody,
} = require('./adRevenueService');
const { FirestorePlacementSettings } = require('./placementSettings');
const { sponsoredConsentMode } = require('./consentRegion');
const { auth } = require('../firebase');
const { reportingClientAddress } = require('../reports/clientAddress');
const {
  AdMeasurementInputError,
  AdMeasurementOrderError,
  AdMeasurementRateLimitError,
  AdMeasurementService,
  validateEvent,
  validateSessionRequest,
} = require('./adMeasurement');

const NO_STORE = { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' };

// Optional sign-in, used only to keep Administrator and owner activity out of the valid totals. A missing or
// unusable token simply means an anonymous viewer: measurement never requires the viewer to identify themselves.
async function identifyViewer(request) {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization || '');
  if (!match || !auth) return null;
  try { return await auth.verifyIdToken(match[1]); } catch { return null; }
}

// Per-instance cap on measurement events from one address (300 a minute). Signed sessions already bound what can be
// counted; this bounds Firestore writes. Over the cap, events are refused, so the effect is undercounting, never more.
function createEventLimiter({ limit = 300, now = () => Date.now() } = {}) {
  const windows = new Map();
  return (address) => {
    const minute = Math.floor(now() / 60_000);
    if (windows.size > 10_000) for (const [key, value] of windows) if (value.minute !== minute) windows.delete(key);
    const current = windows.get(address);
    const entry = current?.minute === minute ? current : { minute, count: 0 };
    entry.count += 1;
    windows.set(address, entry);
    return entry.count <= limit;
  };
}

function measurementFailure(response, error, label) {
  if (error instanceof AdMeasurementInputError) return response.status(400).json({ error: error.message });
  if (error instanceof AdMeasurementOrderError) return response.status(409).json({ error: error.message, recorded: false });
  if (error instanceof AdMeasurementRateLimitError) {
    return response.set('Retry-After', String(error.retryAfter)).status(429).json({ error: 'Too many ad measurement requests.' });
  }
  console.error(`${label} could not be recorded.`, { name: error.name, code: error.code });
  return response.status(503).json({ error: 'Ad measurement is temporarily unavailable.' });
}

function validateProviderEvent(body) {
  const event = {
    providerEventId: String(body.providerEventId || '').trim(),
    catalogId: String(body.catalogId || '').trim(),
    periodStart: String(body.periodStart || '').trim(),
    periodEnd: String(body.periodEnd || '').trim(),
    currency: String(body.currency || '').trim().toUpperCase(),
    grossRevenueCents: Number(body.grossRevenueCents),
    impressions: Number(body.impressions),
    receivedAt: new Date().toISOString(),
  };
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(event.providerEventId)) throw new Error('A valid provider event ID is required.');
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(event.catalogId)) throw new Error('A valid catalog ID is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(event.periodEnd) || event.periodStart > event.periodEnd) {
    throw new Error('A valid revenue reporting period is required.');
  }
  if (event.currency !== 'USD') throw new Error('Only USD ad revenue is currently supported.');
  if (!Number.isSafeInteger(event.grossRevenueCents) || event.grossRevenueCents < 0) throw new Error('Gross revenue must be a non-negative integer number of cents.');
  if (!Number.isSafeInteger(event.impressions) || event.impressions < 0) throw new Error('Impressions must be a non-negative integer.');
  return event;
}

function createAdsRouter(dependencies = {}) {
  const router = express.Router();
  const store = dependencies.store || new AdRevenueStore({
    db,
    filePath: path.resolve(process.env.AD_REVENUE_FILE || path.join(__dirname, '../../.data/ad-revenue.json')),
  });
  const getVideo = dependencies.getVideo || getVideoById;
  const forwardRevenue = dependencies.forwardRevenue || forwardCreatorRevenue;
  const measurement = dependencies.measurement || new AdMeasurementService({ db });
  const identify = dependencies.identify || identifyViewer;
  const clientAddress = dependencies.clientAddress || reportingClientAddress;
  const allowEvent = dependencies.allowEvent || createEventLimiter();
  const sessionContext = async (request) => ({
    userAgent: request.get('user-agent') || '',
    test: request.get('x-protv-ad-test') === '1',
    user: await identify(request),
    clientAddress: clientAddress(request),
  });

  router.get('/session/:videoId', async (request, response) => {
    const adTagUrl = String(process.env.VAST_AD_TAG_URL || '').trim();
    const signingSecret = String(process.env.AD_EVENT_SIGNING_SECRET || '').trim();
    if (!adTagUrl || !signingSecret) return response.json({ enabled: false });
    try {
      const parsed = new URL(adTagUrl);
      if (parsed.protocol !== 'https:') throw new Error('The VAST ad tag must use HTTPS.');
      const video = await getVideo(request.params.videoId);
      if (video.approvalStatus !== 'approved' || !video.muxPlaybackId) {
        return response.status(409).json({ error: 'Ads are available only for approved playback-ready titles.' });
      }
      // Measurement is best effort: if it is unavailable the ad still plays and simply is not counted.
      let measurementToken = null;
      if (measurement.configured) {
        try {
          ({ token: measurementToken } = await measurement.startSession({
            channel: 'video', placement: 'preroll', scope: video.id, ...(await sessionContext(request)),
          }));
        } catch (error) {
          if (!(error instanceof AdMeasurementRateLimitError)) console.error('Ad measurement session unavailable.', { name: error.name });
        }
      }
      response.set(NO_STORE).json({
        enabled: true,
        adTagUrl: parsed.toString(),
        sessionToken: createAdSessionToken({ videoId: video.id, secret: signingSecret }),
        measurementToken,
      });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  router.post('/events', async (request, response) => {
    try {
      const payload = verifyAdSessionToken(request.body.sessionToken, process.env.AD_EVENT_SIGNING_SECRET || '');
      const eventType = String(request.body.eventType || '');
      if (!TELEMETRY_EVENTS.has(eventType)) throw new Error('Unsupported ad telemetry event.');
      const result = await store.recordTelemetry({
        sessionId: payload.sessionId,
        videoId: payload.videoId,
        eventType,
        occurredAt: new Date().toISOString(),
      });
      response.status(result.duplicate ? 200 : 201).json({ recorded: !result.duplicate });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  // Display placements: one measurement session per ad request, opened only when the ad is actually requested (after
  // consent where it is required, or automatically under a notice where it is not).
  router.post('/measurement/session', async (request, response) => {
    response.set(NO_STORE);
    if (!request.is('application/json')) return response.status(415).json({ error: 'Ad measurement requires application/json.' });
    if (!measurement.configured) return response.json({ enabled: false });
    try {
      const input = validateSessionRequest(request.body);
      const settings = await placements.read();
      if (settings.nativeBannerEnabled !== true) return response.json({ enabled: false });
      const { token } = await measurement.startSession({ ...input, ...(await sessionContext(request)) });
      return response.status(201).json({ enabled: true, token });
    } catch (error) {
      return measurementFailure(response, error, 'Ad measurement session');
    }
  });

  router.post('/measurement/events', async (request, response) => {
    response.set(NO_STORE);
    if (!request.is('application/json')) return response.status(415).json({ error: 'Ad measurement requires application/json.' });
    if (Buffer.byteLength(JSON.stringify(request.body ?? null), 'utf8') > 2048) return response.status(413).json({ error: 'Ad event exceeds 2 KB.' });
    if (!measurement.configured) return response.status(503).json({ error: 'Ad measurement is not configured.' });
    if (!allowEvent(clientAddress(request))) {
      return response.set('Retry-After', '60').status(429).json({ error: 'Too many ad measurement events.' });
    }
    try {
      const event = validateEvent(request.body);
      const result = await measurement.recordEvent({ event, userAgent: request.get('user-agent') || '', clientAddress: clientAddress(request) });
      return response.status(result.duplicate ? 200 : 201).json({ recorded: result.recorded, duplicate: result.duplicate === true });
    } catch (error) {
      return measurementFailure(response, error, 'Ad measurement event');
    }
  });

  router.post('/provider-revenue', async (request, response) => {
    try {
      const rawBody = request.rawBody?.toString('utf8') || '';
      verifySignedBody(
        rawBody,
        request.header('x-protv-ad-signature') || '',
        process.env.AD_PROVIDER_WEBHOOK_SECRET || '',
      );
      const event = validateProviderEvent(request.body);
      const video = await getVideo(event.catalogId);
      const stored = await store.recordProviderRevenue(event);
      const creatorSync = await forwardRevenue({
        event,
        video,
        endpoint: process.env.CREATOR_AGENT_REVENUE_URL || '',
        secret: process.env.CREATOR_AGENT_REVENUE_SECRET || '',
      });
      response.status(stored.duplicate ? 200 : 202).json({
        accepted: true,
        duplicate: stored.duplicate,
        creatorSync: creatorSync.status,
      });
    } catch (error) {
      const status = /signature|authentication/.test(error.message) ? 401 : 400;
      response.status(status).json({ error: error.message });
    }
  });

  const placements = dependencies.placements || new FirestorePlacementSettings(db);
  const requireAdmin = dependencies.verifyAdmin || verifyAdmin;
  const audit = dependencies.audit || ((event) => require('../adminBot/adminAudit').logAdminEvent(event));

  // Public, website-only: whether the Sponsored placement is switched on, and which consent rule applies to this
  // visitor ('notice' or 'opt_in', see consentRegion.js). Fails closed: any error means off. Never cached, because
  // the consent rule differs per visitor location.
  router.get('/placements', async (request, response) => {
    response.set({ 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' });
    const consent = sponsoredConsentMode(request.headers);
    try {
      const settings = await placements.read();
      response.json({ nativeBanner: { enabled: settings.nativeBannerEnabled === true, consent } });
    } catch (error) {
      console.error('Advertising settings unavailable; Sponsored placement stays off.', error.message);
      response.json({ nativeBanner: { enabled: false, consent } });
    }
  });

  router.get('/admin/placements', requireAdmin, async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try { response.json(await placements.read()); }
    catch { response.status(503).json({ error: 'Advertising settings are temporarily unavailable.' }); }
  });

  router.put('/admin/placements', requireAdmin, async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (typeof request.body?.nativeBannerEnabled !== 'boolean') {
      return response.status(400).json({ error: 'nativeBannerEnabled must be true or false.' });
    }
    try {
      const saved = await placements.setNativeBanner(request.body.nativeBannerEnabled, request.user?.uid);
      await audit({
        type: 'advertising.native_banner', actorId: request.user?.uid || 'admin',
        message: `Sponsored native banner ${saved.nativeBannerEnabled ? 'enabled' : 'disabled'}.`,
        details: { nativeBannerEnabled: saved.nativeBannerEnabled },
      });
      return response.json(saved);
    } catch {
      return response.status(503).json({ error: 'Advertising settings could not be saved.' });
    }
  });

  router.get('/admin/measurement', requireAdmin, async (request, response) => {
    response.set('Cache-Control', 'no-store');
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const to = String(request.query.to || new Date().toISOString().slice(0, 10));
    const from = String(request.query.from || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
    if (!day.test(from) || !day.test(to) || from > to) return response.status(400).json({ error: 'A valid date range is required.' });
    try {
      const report = await measurement.report({ from, to });
      const titles = await Promise.all(report.titles.slice(0, 100).map(async (title) => {
        try { return { ...title, title: (await getVideo(title.videoId))?.title || null }; } catch { return { ...title, title: null }; }
      }));
      return response.json({
        ...report,
        titles,
        legacy: await measurement.legacyTotals(),
        configuration: {
          measurement: measurement.configured,
          videoPreroll: Boolean(String(process.env.VAST_AD_TAG_URL || '').trim() && String(process.env.AD_EVENT_SIGNING_SECRET || '').trim()),
          nativeBanner: (await placements.read().catch(() => ({}))).nativeBannerEnabled === true,
        },
      });
    } catch (error) {
      console.error('Ad measurement report unavailable.', { name: error.name, code: error.code });
      return response.status(503).json({ error: 'Ad measurement reporting is temporarily unavailable.' });
    }
  });

  router.get('/admin/titles/:videoId', requireAdmin, async (request, response) => {
    try {
      response.json(await store.getTitleMetrics(request.params.videoId) || {
        videoId: request.params.videoId,
        playerImpressions: 0,
        providerImpressions: 0,
        grossRevenueCents: 0,
        currency: 'USD',
      });
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createAdsRouter, validateProviderEvent };

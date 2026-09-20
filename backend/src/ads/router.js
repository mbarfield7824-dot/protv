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
      response.json({
        enabled: true,
        adTagUrl: parsed.toString(),
        sessionToken: createAdSessionToken({ videoId: video.id, secret: signingSecret }),
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

  router.get('/admin/titles/:videoId', verifyAdmin, async (request, response) => {
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

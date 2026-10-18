const express = require('express');
const { db } = require('../firebase');
const { verifyOptionalToken } = require('../middleware/auth');
const { reportingClientAddress } = require('../reports/clientAddress');
const {
  PlaybackInputError,
  PlaybackNotEligibleError,
  PlaybackRateLimitError,
  PlaybackTrackingService,
  validatePlaybackEvent,
} = require('./trackingService');

function createPlaybackRouter({
  service = new PlaybackTrackingService({ db }),
  authenticate = verifyOptionalToken,
  clientAddress = reportingClientAddress,
} = {}) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set({
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    });
    next();
  });

  router.post('/events', authenticate, async (request, response) => {
    if (!request.is('application/json')) {
      return response.status(415).json({ error: 'Playback events require application/json.' });
    }
    try {
      if (Buffer.byteLength(JSON.stringify(request.body ?? null), 'utf8') > 2048) {
        return response.status(413).json({ error: 'Playback event exceeds 2 KB.' });
      }
      const event = validatePlaybackEvent(request.body);
      const result = await service.recordEvent({
        event,
        user: request.user || null,
        clientAddress: clientAddress(request),
      });
      return response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof PlaybackInputError) return response.status(400).json({ error: error.message });
      if (error instanceof PlaybackNotEligibleError) return response.status(404).json({ error: 'Title is not available for playback tracking.' });
      if (error instanceof PlaybackRateLimitError) {
        return response.set('Retry-After', String(error.retryAfter))
          .status(429).json({ error: 'Too many playback events. Try again later.' });
      }
      console.error('Playback event could not be recorded.', { name: error.name, code: error.code });
      return response.status(503).json({ error: 'Playback tracking is temporarily unavailable.' });
    }
  });

  return router;
}

module.exports = { createPlaybackRouter };

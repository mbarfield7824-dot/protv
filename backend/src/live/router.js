const express = require('express');
const { createLiveService } = require('./service');
const { discoverableEvents, isDiscoverable, publicEvent } = require('./readModel');

function createLiveRouter({ service = createLiveService() } = {}) {
  const router = express.Router();

  router.get('/events', async (req, res) => {
    try {
      return res.json({ items: discoverableEvents(await service.list()) });
    } catch (error) {
      console.error('Failed to load public Live events:', error);
      return res.status(503).json({ error: 'Live events are temporarily unavailable.' });
    }
  });

  router.get('/events/:id', async (req, res) => {
    try {
      const event = await service.get(req.params.id);
      if (!isDiscoverable(event)) return res.status(404).json({ error: 'Live event not found.' });
      return res.json(publicEvent(event));
    } catch (error) {
      console.error('Failed to load public Live event:', error);
      return res.status(503).json({ error: 'Live events are temporarily unavailable.' });
    }
  });

  return router;
}

module.exports = { createLiveRouter };

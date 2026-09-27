const express = require('express');
const { verifyAdmin } = require('../middleware/auth');
const { createAdminLiveService } = require('./adminService');
const { LiveValidationError, adminEvent } = require('./adminModel');

function createAdminLiveRouter({ service = createAdminLiveService(), authorize = verifyAdmin } = {}) {
  const router = express.Router();
  router.use(authorize);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const handle = (action) => async (req, res) => {
    try {
      const result = await action(req);
      if (result === null) return res.status(404).json({ error: 'Live event not found.' });
      return res.status(req.method === 'POST' ? 201 : 200).json(result);
    } catch (error) {
      if (error instanceof LiveValidationError) return res.status(400).json({ error: error.message });
      console.error('Live administration failed:', error);
      return res.status(503).json({ error: 'Live administration is temporarily unavailable.' });
    }
  };

  router.get('/events', handle(async () => ({
    items: (await service.list()).map(adminEvent)
      .sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt) || a.id.localeCompare(b.id)),
  })));
  router.get('/events/:id', handle(async (req) => {
    const event = await service.get(req.params.id);
    return event ? adminEvent(event) : null;
  }));
  router.post('/events', handle(async (req) => adminEvent(await service.create(req.body))));
  router.patch('/events/:id', handle(async (req) => {
    const event = await service.update(req.params.id, req.body);
    return event ? adminEvent(event) : null;
  }));
  return router;
}

module.exports = { createAdminLiveRouter };

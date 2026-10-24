const express = require('express');
const { verifyAdmin } = require('../middleware/auth');
const { db, auth } = require('../firebase');
const {
  createAccountDeletionAdminService,
  DeletionRequestError,
} = require('../accountDeletionAdmin');

function createAccountDeletionAdminRouter({
  service = createAccountDeletionAdminService({ getDb: () => db, getAuth: () => auth }),
  authorize = verifyAdmin,
} = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    });
    next();
  }, authorize, express.json({ limit: '16kb' }));

  router.get('/', async (req, res, next) => {
    try {
      return res.json(await service.listRequests());
    } catch (error) {
      if (error instanceof DeletionRequestError) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  });

  router.get('/:requestId', async (req, res, next) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.requestId)) {
      return res.status(400).json({ error: 'A valid request ID is required.' });
    }
    try {
      const request = await service.getRequest(req.params.requestId);
      return request ? res.json(request) : res.status(404).json({ error: 'Deletion request not found.' });
    } catch (error) {
      if (error instanceof DeletionRequestError) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  });

  router.patch('/:requestId', async (req, res, next) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.requestId)) {
      return res.status(400).json({ error: 'A valid request ID is required.' });
    }
    if (!req.body || Object.keys(req.body).some((key) => !['status', 'reason'].includes(key))) {
      return res.status(400).json({ error: 'Only status and reason may be changed.' });
    }
    try {
      const request = await service.reviewRequest(
        req.params.requestId,
        { status: req.body.status, reason: req.body.reason },
        req.user?.uid,
      );
      return request ? res.json({ request }) : res.status(404).json({ error: 'Deletion request not found.' });
    } catch (error) {
      if (error instanceof DeletionRequestError) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  });

  return router;
}

module.exports = { createAccountDeletionAdminRouter };

const express = require('express');
const { verifyAdmin } = require('../middleware/auth');
const { db, auth } = require('../firebase');
const {
  createAccountDeletionAdminService,
  DeletionRequestError,
} = require('../accountDeletionAdmin');
const { requireAccountDeletionEnvironment } = require('../accountDeletionEnvironment');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const REVIEW_FIELDS = ['status', 'reason', 'creatorPortalReviewed'];

function createAccountDeletionAdminRouter({
  service = createAccountDeletionAdminService({ getDb: () => db, getAuth: () => auth }),
  authorize = verifyAdmin,
  environment = requireAccountDeletionEnvironment(),
} = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    });
    next();
  }, environment, authorize, express.json({ limit: '16kb' }));

  function handle(handler) {
    return async (req, res, next) => {
      try {
        return await handler(req, res);
      } catch (error) {
        if (error instanceof DeletionRequestError) return res.status(error.status).json({ error: error.message });
        return next(error);
      }
    };
  }

  router.get('/', handle(async (req, res) => res.json(await service.listRequests())));

  router.post('/', handle(async (req, res) => {
    if (!req.body || Object.keys(req.body).some((key) => !['uid', 'reason'].includes(key))) {
      return res.status(400).json({ error: 'Only uid and reason may be provided.' });
    }
    const request = await service.recordEmailRequest(
      { uid: req.body.uid, reason: req.body.reason },
      req.user?.uid,
    );
    return res.status(201).json({ request });
  }));

  router.get('/:requestId', handle(async (req, res) => {
    if (!REQUEST_ID_PATTERN.test(req.params.requestId)) {
      return res.status(400).json({ error: 'A valid request ID is required.' });
    }
    const request = await service.getRequest(req.params.requestId);
    return request ? res.json(request) : res.status(404).json({ error: 'Deletion request not found.' });
  }));

  router.patch('/:requestId', handle(async (req, res) => {
    if (!REQUEST_ID_PATTERN.test(req.params.requestId)) {
      return res.status(400).json({ error: 'A valid request ID is required.' });
    }
    if (!req.body || Object.keys(req.body).some((key) => !REVIEW_FIELDS.includes(key))) {
      return res.status(400).json({ error: 'Only status, reason and creatorPortalReviewed may be sent.' });
    }
    const request = await service.reviewRequest(
      req.params.requestId,
      { status: req.body.status, reason: req.body.reason, creatorPortalReviewed: req.body.creatorPortalReviewed },
      req.user?.uid,
    );
    return request ? res.json({ request }) : res.status(404).json({ error: 'Deletion request not found.' });
  }));

  return router;
}

module.exports = { createAccountDeletionAdminRouter };

const express = require('express');
const { db } = require('../firebase');
const { verifyToken, requireInteractiveUserSession } = require('../middleware/auth');
const { requireRecentAuthentication } = require('../middleware/recentAuthentication');
const { createAccountDeletionRequestService } = require('../accountDeletionRequests');

function createAccountDeletionRequestRouter({
  service = createAccountDeletionRequestService({ getDb: () => db }),
  verifyToken: verify = verifyToken,
  requireInteractiveUserSession: requireInteractive = requireInteractiveUserSession,
  requireRecentAuthentication: requireRecent = requireRecentAuthentication,
} = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    });
    next();
  });

  router.get('/', verify, async (req, res, next) => {
    try {
      res.json({ request: await service.getRequest(req.user.uid) });
    } catch (error) {
      if (error.status === 503) return res.status(503).json({ error: error.message });
      next(error);
    }
  });

  // TV sign-in sessions (custom tokens) cannot submit: the person must sign in on the
  // website with their password or Google account within the last five minutes.
  router.post('/', verify, requireInteractive, requireRecent, async (req, res, next) => {
    try {
      const result = await service.submitRequest(req.user.uid);
      res.status(result.created ? 201 : 200).json({ request: result.request });
    } catch (error) {
      if (error.status === 503) return res.status(503).json({ error: error.message });
      next(error);
    }
  });

  return router;
}

module.exports = { createAccountDeletionRequestRouter };

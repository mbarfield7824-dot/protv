const express = require('express');

function createAccountDeletionRequestRouter({
  service,
  verifyToken,
  requireInteractiveUserSession,
  requireRecentAuthentication,
}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', verifyToken, async (req, res, next) => {
    try {
      res.json({ request: await service.getRequest(req.user.uid) });
    } catch (error) {
      if (error.status === 503) return res.status(503).json({ error: error.message });
      next(error);
    }
  });

  router.post(
    '/',
    verifyToken,
    requireInteractiveUserSession,
    requireRecentAuthentication,
    async (req, res, next) => {
      try {
        const result = await service.submitRequest(req.user.uid);
        res.status(result.created ? 201 : 200).json({ request: result.request });
      } catch (error) {
        if (error.status === 503) return res.status(503).json({ error: error.message });
        next(error);
      }
    },
  );

  return router;
}

module.exports = { createAccountDeletionRequestRouter };

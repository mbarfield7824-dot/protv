const express = require('express');
const path = require('path');
const { db } = require('../firebase');
const { verifyAdmin } = require('../middleware/auth');
const { ReportStore, ReportRateLimitError } = require('./store');
const { REPORT_ID, ReportInputError, submission, review, pagination } = require('./validation');

function createReportRouters({
  store = new ReportStore({
    db, filePath: process.env.SAFETY_REPORTS_FILE || path.join(__dirname, '../../.data/safety-reports.json'),
  }),
  authorize = verifyAdmin,
} = {}) {
  const publicRouter = express.Router();
  const adminRouter = express.Router();
  const noStore = (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' });
    next();
  };
  publicRouter.use(noStore);
  adminRouter.use(noStore, authorize, express.json({ limit: '16kb' }));

  function fail(res, error) {
    if (error instanceof ReportInputError) return res.status(400).json({ error: error.message });
    if (error instanceof ReportRateLimitError) {
      return res.set('Retry-After', String(error.retryAfter)).status(429).json({ error: error.message });
    }
    // Do not log submitted text, reporter contact information, or review notes.
    console.error('Safety report operation failed.', { name: error.name, code: error.code });
    return res.status(503).json({ error: 'Safety reporting is temporarily unavailable. Please try again.' });
  }
  const validId = (req, res) => {
    if (REPORT_ID.test(req.params.id)) return true;
    res.status(400).json({ error: 'A valid report ID is required.' });
    return false;
  };

  publicRouter.post('/', async (req, res, next) => {
    try {
      await store.consumeRateLimit(req.ip || req.socket.remoteAddress || 'unknown');
      if (!req.is('application/json')) return res.status(415).json({ error: 'Reports require application/json; uploads are not accepted.' });
      return next();
    } catch (error) { return fail(res, error); }
  }, express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const id = await store.create(submission(req.body));
      return res.status(201).json({ id, status: 'received' });
    } catch (error) { return fail(res, error); }
  });
  adminRouter.get('/', async (req, res) => {
    try { return res.json(await store.list(pagination(req.query))); } catch (error) { return fail(res, error); }
  });
  adminRouter.get('/:id', async (req, res) => {
    if (!validId(req, res)) return;
    try {
      const report = await store.get(req.params.id);
      return report ? res.json(report) : res.status(404).json({ error: 'Report not found.' });
    } catch (error) { return fail(res, error); }
  });
  adminRouter.patch('/:id', async (req, res) => {
    if (!validId(req, res)) return;
    try {
      const changes = review(req.body);
      const actor = req.user?.uid;
      if (typeof actor !== 'string' || !actor) throw new Error('Admin actor missing.');
      const updated = await store.review(req.params.id, changes, actor);
      return updated ? res.json({ id: req.params.id, status: changes.status })
        : res.status(404).json({ error: 'Report not found.' });
    } catch (error) { return fail(res, error); }
  });
  const parseError = (error, req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Report JSON exceeds 16 KB.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid report JSON.' });
    return fail(res, error);
  };
  publicRouter.use(parseError);
  adminRouter.use(parseError);
  return { publicRouter, adminRouter };
}

module.exports = { createReportRouters };

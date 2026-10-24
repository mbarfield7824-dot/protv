const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const userRoutes = require('./routes/users');
const { createAccountDeletionAdminRouter } = require('./routes/accountDeletionAdmin');
const { createAdminBotRouter } = require('./adminBot/router');
const { createDistributorIngestionRouter } = require('./distributorIngestion/router');
const { createAdminAssistantRouter } = require('./admin/router');
const { createAdsRouter } = require('./ads/router');
const { createCatalogRouter } = require('./catalog/router');
const { createAdminPodcastRouter } = require('./catalog/adminPodcastRouter');
const { createLiveRouter } = require('./live/router');
const { createAdminLiveRouter } = require('./live/adminRouter');
const { createReportRouters } = require('./reports/router');
const { createCreatorPosterRouter, createCreatorPosterStorageCheckRouter, posterNotFound } = require('./integrations/creatorPosterStore');
const { createTitlePosterRouter } = require('./integrations/titlePosterUpload');

const app = express();
const apiPrefix = process.env.VERCEL ? '/api' : '';

app.use(cors());
const reportRouters = createReportRouters();
app.use(`${apiPrefix}/reports`, reportRouters.publicRouter);
app.use(`${apiPrefix}/admin/reports`, reportRouters.adminRouter);
app.use(express.json({
  verify: (request, response, buffer) => {
    request.rawBody = Buffer.from(buffer);
  },
}));
app.use(`${apiPrefix}/posters`, createCreatorPosterRouter());
app.use(`${apiPrefix}/admin/creator-posters`, createCreatorPosterStorageCheckRouter());
app.use(`${apiPrefix}/admin/title-posters`, createTitlePosterRouter());
app.use(
  `${apiPrefix}/posters`,
  express.static(path.resolve(process.env.PD_POSTER_DIRECTORY || path.join(__dirname, '../.data/posters')), {
    fallthrough: false,
    maxAge: '7d',
  })
);

app.get(`${apiPrefix}/health`, (req, res) => {
  res.json({ status: 'Backend is running!' });
});

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/videos`, videoRoutes);
app.use(`${apiPrefix}/mux`, (req, res, next) => {
  if (req.method === 'POST' && req.path === '/webhook') return videoRoutes(req, res, next);
  return next();
});
app.use(`${apiPrefix}/v1/catalog`, createCatalogRouter());
app.use(`${apiPrefix}/admin/podcasts`, createAdminPodcastRouter());
app.use(`${apiPrefix}/v1/live`, createLiveRouter());
app.use(`${apiPrefix}/admin/live`, createAdminLiveRouter());
app.use(`${apiPrefix}/users`, userRoutes);
app.use(`${apiPrefix}/admin/account-deletion-requests`, createAccountDeletionAdminRouter());
app.use(`${apiPrefix}/admin-bot`, createAdminBotRouter());
app.use(`${apiPrefix}/distributor-ingestion`, createDistributorIngestionRouter());
app.use(`${apiPrefix}/admin-assistant`, createAdminAssistantRouter());
app.use(`${apiPrefix}/ads`, createAdsRouter());

// Client errors raised by middleware (missing static files, oversized or
// malformed bodies) keep their 4xx status; everything else stays a generic 500.
app.use((err, req, res, next) => {
  const status = Number(err.status || err.statusCode);
  if (status === 404 && req.path.startsWith(`${apiPrefix}/posters/`)) return posterNotFound(res);
  if (status >= 400 && status < 500) {
    const messages = { 404: 'Not found.', 413: 'Request body is too large.' };
    return res.status(status).json({ error: messages[status] || 'Invalid request.' });
  }
  console.error(err.stack);
  return res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const userRoutes = require('./routes/users');
const { createAdminBotRouter } = require('./adminBot/router');
const { createDistributorIngestionRouter } = require('./distributorIngestion/router');
const { createAdminAssistantRouter } = require('./admin/router');
const { createAdsRouter } = require('./ads/router');

const app = express();
const apiPrefix = process.env.VERCEL ? '/api' : '';

app.use(cors());
app.use(express.json({
  verify: (request, response, buffer) => {
    request.rawBody = Buffer.from(buffer);
  },
}));
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
app.use(`${apiPrefix}/users`, userRoutes);
app.use(`${apiPrefix}/admin-bot`, createAdminBotRouter());
app.use(`${apiPrefix}/distributor-ingestion`, createDistributorIngestionRouter());
app.use(`${apiPrefix}/admin-assistant`, createAdminAssistantRouter());
app.use(`${apiPrefix}/ads`, createAdsRouter());

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;

const express = require('express');
const { db, getApprovedVideos, getAllVideosAdmin } = require('../firebase');
const { browse, seriesCatalog } = require('./readModel');

function createCatalogRouter({
  loadApproved = db
    ? getApprovedVideos
    : async () => (await getAllVideosAdmin()).filter((video) => video.approvalStatus === 'approved'),
} = {}) {
  const router = express.Router();
  const load = async () => loadApproved();

  router.get('/', async (req, res) => {
    try {
      const items = browse(await load(), req.query);
      res.json({ items });
    } catch (error) {
      if (!(error instanceof RangeError)) console.error('Failed to load viewer catalog:', error);
      res.status(error instanceof RangeError ? 400 : 500).json({
        error: error instanceof RangeError ? error.message : 'The catalog is temporarily unavailable.',
      });
    }
  });

  router.get('/series', async (req, res) => {
    try {
      const items = seriesCatalog(await load()).map(({ seasons, ...summary }) => summary);
      res.json({ items });
    } catch (error) {
      console.error('Failed to load viewer series:', error);
      res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  router.get('/series/:key', async (req, res) => {
    try {
      const series = seriesCatalog(await load()).find((item) => item.key === req.params.key);
      if (!series) return res.status(404).json({ error: 'Series not found.' });
      return res.json(series);
    } catch (error) {
      console.error('Failed to load viewer series detail:', error);
      return res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  return router;
}

module.exports = { createCatalogRouter };

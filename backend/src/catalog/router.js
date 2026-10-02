const express = require('express');
const { db, getApprovedVideos, getAllVideosAdmin } = require('../firebase');
const { browse, playableCatalog, podcastCatalog, seriesCatalog } = require('./readModel');

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

  router.get('/podcasts', async (req, res) => {
    try {
      const items = podcastCatalog(await load()).map(({ episodes, ...show }) => show);
      res.json({ items });
    } catch (error) {
      console.error('Failed to load viewer podcasts:', error);
      res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  router.get('/podcasts/:id', async (req, res) => {
    try {
      const show = podcastCatalog(await load()).find((item) => item.id === req.params.id);
      if (!show) return res.status(404).json({ error: 'Podcast show not found.' });
      return res.json(show);
    } catch (error) {
      console.error('Failed to load viewer podcast show:', error);
      return res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  const loadTitle = async (id) => playableCatalog(await load()).find((item) => item.id === id);

  router.get('/titles/:id', async (req, res) => {
    try {
      const title = await loadTitle(req.params.id);
      if (!title) return res.status(404).json({ error: 'Title not found.' });
      return res.json(title);
    } catch (error) {
      console.error('Failed to load viewer title:', error);
      return res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  router.get('/titles/:id/playback', async (req, res) => {
    try {
      const title = await loadTitle(req.params.id);
      if (!title) return res.status(404).json({ error: 'Title not found.' });
      return res.json({
        id: title.id,
        streamType: 'on-demand',
        muxPlaybackId: title.muxPlaybackId,
      });
    } catch (error) {
      console.error('Failed to load viewer playback:', error);
      return res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  return router;
}

module.exports = { createCatalogRouter };

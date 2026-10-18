const express = require('express');
const { SERIES_RELEASE, seriesReleaseId, releaseUpdate, releaseEligible } = require('./releases');

function createReleaseRouter({ db, loadVideos, authenticate }) {
  const router = express.Router();
  router.use(authenticate);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', async (req, res) => {
    try {
      const videos = await loadVideos();
      const titles = videos.filter((video) => video.contentType !== SERIES_RELEASE
        && (video.creatorProjectId || video.contentType === 'EPISODE'));
      const series = [...new Set(titles.filter((video) => video.seriesId).map((video) => video.seriesId))]
        .map((id) => ({
          id, title: titles.find((video) => video.seriesId === id).seriesTitle,
          ...(videos.find((video) => video.id === seriesReleaseId(id)) || { releaseStatus: 'published' }),
          seriesId: id,
        }));
      res.json({ titles: titles.map((video) => ({
        id: video.id, title: video.title, contentType: video.contentType,
        seriesId: video.seriesId || null, seriesTitle: video.seriesTitle || '',
        seasonNumber: video.seasonNumber ?? null, episodeNumber: video.episodeNumber ?? null,
        status: video.status, approvalStatus: video.approvalStatus,
        releaseStatus: video.releaseStatus || 'published', releaseAt: video.releaseAt || null,
        releaseTimeZone: video.releaseTimeZone || null,
        live: video.status === 'ready' && Boolean(video.muxPlaybackId)
          && video.approvalStatus === 'approved' && releaseEligible(video, videos),
        protectedPlayback: video.muxPlaybackPolicy === 'signed',
      })), series });
    } catch (error) {
      console.error('Release queue could not be loaded.', error.message);
      res.status(503).json({ error: 'The release queue is temporarily unavailable.' });
    }
  });
  router.patch('/:kind/:id', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Release controls require transactional Firestore storage.' });
    if (!['titles', 'series'].includes(req.params.kind)
      || !/^[A-Za-z0-9_-]{1,200}$/.test(req.params.id)) {
      return res.status(400).json({ error: 'A valid release target is required.' });
    }
    let updates;
    try {
      updates = releaseUpdate(req.body, req.user.uid);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    try {
      const isSeries = req.params.kind === 'series';
      const reference = db.collection('videos').doc(isSeries ? seriesReleaseId(req.params.id) : req.params.id);
      if (isSeries) {
        const episodes = await db.collection('videos').where('seriesId', '==', req.params.id).get();
        if (!episodes.docs.some((doc) => doc.data().contentType === 'EPISODE')) {
          return res.status(404).json({ error: 'Series not found.' });
        }
      }
      const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        if (!isSeries && (!current || !(current.creatorProjectId || current.contentType === 'EPISODE')
          || current.contentType === SERIES_RELEASE)) return null;
        const data = isSeries ? {
          contentType: SERIES_RELEASE, seriesId: req.params.id, approvalStatus: 'approved',
          submittedAt: current?.submittedAt || updates.releaseUpdatedAt, ...updates,
        } : updates;
        transaction.set(reference, data, { merge: true });
        transaction.set(db.collection('releaseAudit').doc(), {
          targetId: req.params.id, targetKind: req.params.kind,
          previousReleaseStatus: current?.releaseStatus || 'published', ...updates,
        });
        return { id: reference.id, ...updates };
      });
      if (!result) return res.status(404).json({ error: 'Release target not found.' });
      return res.json(result);
    } catch (error) {
      console.error('Release change could not be saved.', error.message);
      return res.status(503).json({ error: 'Release change could not be saved. Refresh the queue before retrying.' });
    }
  });
  return router;
}

module.exports = { createReleaseRouter };

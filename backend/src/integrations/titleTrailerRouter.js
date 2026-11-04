const express = require('express');

const VIDEO_ID = /^[A-Za-z0-9_-]{1,200}$/;
const TRAILER_TYPES = new Set(['MOVIE', 'EPISODE', 'SERIES']);

function createTitleTrailerRouter({
  verifyAdmin = require('../middleware/auth').verifyAdmin,
  getVideoById = (id) => require('../firebase').getVideoById(id),
  updateVideo = (id, updates) => require('../firebase').updateVideo(id, updates),
  addVideo = (record) => require('../firebase').addVideo(record),
  getAllVideos = () => require('../firebase').getAllVideosAdmin(),
  createDirectUpload = (...args) => require('../mux').createDirectUpload(...args),
  getUpload = (id) => require('../mux').getUpload(id),
  getAsset = (id) => require('../mux').getAsset(id),
  getPlaybackId = (...args) => require('../mux').getPlaybackId(...args),
  signPlayback = (...args) => require('../mux').signPlayback(...args),
  cancelUpload = (id) => require('../mux').mux.video.uploads.cancel(id),
  deleteAsset = (id) => require('../mux').mux.video.assets.delete(id),
  logError = (message, error) => console.error(message, error),
} = {}) {
  const router = express.Router();
  const fail = (res, status, error) => res.status(status).set('Cache-Control', 'no-store').json({ error });
  router.use(verifyAdmin);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/series-record', async (req, res) => {
    const { seriesTitle, description, rightsHolder, rightsVerificationNotes } = req.body;
    if ([seriesTitle, description, rightsHolder, rightsVerificationNotes]
      .some(value => typeof value !== 'string' || !value.trim() || value.length > 10_000)
      || seriesTitle.length > 200) {
      return fail(res, 400, 'Show title, synopsis, rights holder, and trailer rights evidence are required.');
    }
    try {
      const { seriesKey } = require('../catalog/readModel');
      const records = await getAllVideos();
      if (records.some(record => record.contentType === 'SERIES'
        && seriesKey(record.seriesTitle || record.title) === seriesKey(seriesTitle))) {
        return fail(res, 409, 'A show record already exists. Manage its trailer in the catalog.');
      }
      const id = await addVideo({
        contentType: 'SERIES', title: seriesTitle.trim(), seriesTitle: seriesTitle.trim(),
        description: description.trim(), rightsHolder: rightsHolder.trim(),
        rightsVerificationNotes: rightsVerificationNotes.trim(),
        approvalStatus: 'draft', status: 'ready',
      });
      return res.status(201).json(await getVideoById(id));
    } catch (error) {
      logError('Show trailer record could not be created.', error);
      return fail(res, 503, 'Show trailer record could not be created.');
    }
  });

  async function reconcile(videoId) {
    let video = await getVideoById(videoId);
    if (!video.trailerUploadId) return video;

    const upload = await getUpload(video.trailerUploadId);
    if (['errored', 'cancelled'].includes(upload.status)) {
      await updateVideo(videoId, {
        trailerUploadStatus: 'errored',
        trailerError: 'Mux could not process the trailer upload.',
        trailerUploadId: null,
      });
      return getVideoById(videoId);
    }
    if (!upload.asset_id) return video;

    const asset = await getAsset(upload.asset_id);
    if (asset.status === 'errored') {
      await updateVideo(videoId, {
        trailerUploadStatus: 'errored',
        trailerError: 'Mux could not process the trailer upload.',
        trailerUploadId: null,
      });
      return getVideoById(videoId);
    }
    if (asset.status !== 'ready') return video;

    const playbackId = getPlaybackId(asset, 'signed');
    if (!playbackId) throw new Error('Mux trailer asset is ready without signed playback.');
    video = await getVideoById(videoId);
    if (video.trailerUploadId !== upload.id) return video;

    await updateVideo(videoId, {
      trailerAssetId: asset.id,
      trailerPlaybackId: playbackId,
      trailerDuration: Math.round(asset.duration || 0),
      trailerStatus: 'ready',
      trailerUploadStatus: null,
      trailerError: '',
      trailerUploadId: null,
      trailerUrl: '',
    });
    if (video.trailerAssetId && video.trailerAssetId !== asset.id) {
      try {
        await deleteAsset(video.trailerAssetId);
      } catch (error) {
        logError('Replaced Mux trailer asset could not be deleted.', error);
      }
    }
    return getVideoById(videoId);
  }

  router.post('/:videoId/upload-url', async (req, res) => {
    const { videoId } = req.params;
    if (!VIDEO_ID.test(videoId)) return fail(res, 400, 'Invalid title identifier.');
    let upload;
    try {
      const video = await getVideoById(videoId);
      if (!TRAILER_TYPES.has(video.contentType)) {
        return fail(res, 400, 'Trailers are supported for movies, TV episodes, and shows only.');
      }
      if (video.trailerUploadId) return fail(res, 409, 'A trailer upload is already processing for this title.');
      upload = await createDirectUpload(process.env.FRONTEND_URL, { playbackPolicy: 'signed' });
      await updateVideo(videoId, {
        trailerUploadId: upload.id,
        trailerUploadStatus: 'processing',
        trailerError: '',
      });
      return res.status(201).json({ uploadId: upload.id, uploadUrl: upload.url, status: 'processing' });
    } catch (error) {
      if (upload?.id) {
        try {
          await cancelUpload(upload.id);
        } catch (cleanupError) {
          logError('Orphaned Mux trailer upload could not be cancelled.', cleanupError);
        }
      }
      logError('Trailer upload could not be started.', error);
      if (error?.constructor?.name === 'VideoNotFoundError') return fail(res, 404, 'Title not found.');
      return fail(res, 503, 'Trailer upload is temporarily unavailable.');
    }
  });

  router.get('/:videoId/status', async (req, res) => {
    const { videoId } = req.params;
    if (!VIDEO_ID.test(videoId)) return fail(res, 400, 'Invalid title identifier.');
    try {
      const video = await reconcile(videoId);
      return res.json({
        videoId,
        status: video.trailerUploadId
          ? video.trailerUploadStatus || 'processing'
          : video.trailerUploadStatus === 'errored' ? 'errored' : video.trailerStatus || 'empty',
        available: video.trailerStatus === 'ready' && Boolean(video.trailerPlaybackId),
        error: video.trailerError || '',
      });
    } catch (error) {
      logError('Trailer upload status could not be checked.', error);
      return fail(res, 503, 'Trailer status is temporarily unavailable.');
    }
  });

  router.get('/:videoId/preview', async (req, res) => {
    const { videoId } = req.params;
    if (!VIDEO_ID.test(videoId)) return fail(res, 400, 'Invalid title identifier.');
    try {
      const video = await reconcile(videoId);
      if (video.trailerStatus !== 'ready' || !video.trailerPlaybackId) {
        return fail(res, 409, 'The trailer is not ready to preview.');
      }
      return res.json({
        id: videoId,
        muxPlaybackId: video.trailerPlaybackId,
        playbackToken: await signPlayback(video.trailerPlaybackId, video.trailerDuration),
      });
    } catch (error) {
      logError('Trailer preview could not be prepared.', error);
      return fail(res, 503, 'Trailer preview is temporarily unavailable.');
    }
  });

  router.delete('/:videoId', async (req, res) => {
    const { videoId } = req.params;
    if (!VIDEO_ID.test(videoId)) return fail(res, 400, 'Invalid title identifier.');
    try {
      const video = await reconcile(videoId);
      if (video.trailerUploadId) {
        const upload = await getUpload(video.trailerUploadId);
        if (upload.asset_id) await deleteAsset(upload.asset_id);
        else await cancelUpload(video.trailerUploadId);
      }
      if (video.trailerAssetId) await deleteAsset(video.trailerAssetId);
      await updateVideo(videoId, {
        trailerAssetId: null,
        trailerPlaybackId: null,
        trailerDuration: null,
        trailerStatus: null,
        trailerUploadStatus: null,
        trailerError: '',
        trailerUploadId: null,
        trailerUrl: '',
      });
      return res.status(204).end();
    } catch (error) {
      logError('Trailer could not be removed.', error);
      return fail(res, 503, 'Trailer removal failed. The catalog was not changed.');
    }
  });

  return router;
}

module.exports = { createTitleTrailerRouter };

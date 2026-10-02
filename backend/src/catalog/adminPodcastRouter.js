const express = require('express');
const {
  addVideo, getVideoById, updateVideo, updateVideoApproval, updatePodcastIngestion, VideoNotFoundError,
} = require('../firebase');
const { verifyAdmin } = require('../middleware/auth');
const { createDirectUpload, createAssetFromUrl } = require('../mux');
const {
  PODCAST_SHOW, PODCAST_EPISODE, validatePodcastEpisodeReference,
} = require('./podcasts');

const SHOW_FIELDS = ['title', 'description', 'artworkUrl', 'host', 'creator', 'category', 'genres'];
const EPISODE_FIELDS = [
  'title', 'description', 'thumbnailUrl', 'posterUrl', 'category', 'genres',
  'podcastShowId', 'episodeNumber', 'rightsHolder', 'rightsVerificationNotes',
];
class InputError extends Error {}

function requireFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('A JSON object is required.');
  const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
  if (unexpected) throw new InputError(`Unsupported Podcast field: ${unexpected}.`);
}

function text(value, field, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim())) {
    throw new InputError(`${field} must be ${required ? 'a nonblank' : 'a'} string.`);
  }
  return value.trim();
}

function genres(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((genre) => typeof genre !== 'string' || !genre.trim())) {
    throw new InputError('genres must be an array of nonblank strings.');
  }
  return [...new Set(value.map((genre) => genre.trim()))];
}

function showData(body, publish = false) {
  const data = {
    title: text(body.title, 'title', true),
    description: text(body.description, 'description'),
    artworkUrl: text(body.artworkUrl, 'artworkUrl'),
    host: text(body.host, 'host'),
    creator: text(body.creator, 'creator'),
    category: text(body.category, 'category'),
    genres: genres(body.genres),
  };
  if (publish && (!data.description || !data.artworkUrl || (!data.host && !data.creator)
    || (!data.category && !data.genres.length))) {
    throw new InputError('Publishing a Podcast Show requires description, artworkUrl, host or creator, and category or genres.');
  }
  return data;
}

function episodeData(body, parent) {
  const data = {
    title: text(body.title, 'title', true),
    description: text(body.description, 'description'),
    thumbnailUrl: text(body.thumbnailUrl, 'thumbnailUrl'),
    posterUrl: text(body.posterUrl, 'posterUrl'),
    category: text(body.category, 'category'),
    genres: genres(body.genres),
    podcastShowId: body.podcastShowId,
    episodeNumber: body.episodeNumber,
    rightsHolder: text(body.rightsHolder, 'rightsHolder', true),
    rightsVerificationNotes: text(body.rightsVerificationNotes, 'rightsVerificationNotes', true),
  };
  try {
    validatePodcastEpisodeReference({ contentType: PODCAST_EPISODE, ...data }, parent);
  } catch (error) {
    throw new InputError(error.message);
  }
  return data;
}

function isMissing(error) {
  return error instanceof VideoNotFoundError || error.message === 'Video not found';
}

function createAdminPodcastRouter({
  store = { addVideo, getVideoById, updateVideo, updateVideoApproval, updatePodcastIngestion },
  media = { createDirectUpload, createAssetFromUrl },
  authorize = verifyAdmin,
} = {}) {
  const router = express.Router();
  router.use(authorize);

  async function load(req, res, type) {
    try {
      const record = await store.getVideoById(req.params.id);
      if (record.contentType !== type) {
        res.status(404).json({ error: 'Podcast record not found.' });
        return null;
      }
      return record;
    } catch (error) {
      if (isMissing(error)) {
        res.status(404).json({ error: 'Podcast record not found.' });
        return null;
      }
      throw error;
    }
  }

  async function parentFor(showId) {
    if (typeof showId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(showId)) {
      throw new InputError('A valid podcastShowId is required.');
    }
    try {
      return await store.getVideoById(showId);
    } catch (error) {
      if (isMissing(error)) throw new InputError('podcastShowId must reference an existing Podcast Show.');
      throw error;
    }
  }

  function respondError(res, error) {
    if (error instanceof InputError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Podcast Admin operation failed:', error);
    return res.status(503).json({ error: 'Podcast administration is temporarily unavailable.' });
  }

  function expectedAttempt(episode) {
    return {
      status: episode.status, approvalStatus: episode.approvalStatus,
      muxUploadId: episode.muxUploadId, muxAssetId: episode.muxAssetId,
      podcastShowId: episode.podcastShowId, episodeNumber: episode.episodeNumber,
      title: episode.title, rightsHolder: episode.rightsHolder,
      rightsVerificationNotes: episode.rightsVerificationNotes,
    };
  }

  router.post('/shows', async (req, res) => {
    try {
      requireFields(req.body, [...SHOW_FIELDS, 'contentType', 'approvalStatus']);
      if (req.body.contentType !== undefined && req.body.contentType !== PODCAST_SHOW) {
        throw new InputError('Podcast Show contentType is immutable.');
      }
      const data = showData(req.body);
      const id = await store.addVideo({ ...data, contentType: PODCAST_SHOW, approvalStatus: 'draft', createdBy: req.user.uid });
      return res.status(201).json({ id, ...data, contentType: PODCAST_SHOW, approvalStatus: 'draft' });
    } catch (error) { return respondError(res, error); }
  });

  router.patch('/shows/:id', async (req, res) => {
    try {
      const existing = await load(req, res, PODCAST_SHOW);
      if (!existing) return;
      requireFields(req.body, SHOW_FIELDS);
      if (!Object.keys(req.body).length) throw new InputError('No Podcast metadata changes were supplied.');
      const data = showData({ ...existing, ...req.body }, existing.approvalStatus === 'approved');
      const changes = Object.fromEntries(Object.keys(req.body).map((key) => [key, data[key]]));
      await store.updateVideo(existing.id, changes);
      return res.json({ ...existing, ...changes });
    } catch (error) { return respondError(res, error); }
  });

  router.post('/shows/:id/approve', async (req, res) => {
    try {
      const existing = await load(req, res, PODCAST_SHOW);
      if (!existing) return;
      requireFields(req.body, ['approvalNotes']);
      showData(existing, true);
      const approvalNotes = text(req.body.approvalNotes, 'approvalNotes');
      await store.updateVideoApproval(existing.id, { approvalStatus: 'approved', approvalNotes, approvedBy: req.user.uid });
      return res.json(await store.getVideoById(existing.id));
    } catch (error) { return respondError(res, error); }
  });

  router.post('/episodes', async (req, res) => {
    try {
      requireFields(req.body, [...EPISODE_FIELDS, 'contentType', 'approvalStatus']);
      if (req.body.contentType !== undefined && req.body.contentType !== PODCAST_EPISODE) {
        throw new InputError('Podcast Episode contentType is immutable.');
      }
      const data = episodeData(req.body, await parentFor(req.body.podcastShowId));
      const id = await store.addVideo({ ...data, contentType: PODCAST_EPISODE, approvalStatus: 'draft', createdBy: req.user.uid });
      return res.status(201).json({ id, ...data, contentType: PODCAST_EPISODE, approvalStatus: 'draft' });
    } catch (error) { return respondError(res, error); }
  });

  router.patch('/episodes/:id', async (req, res) => {
    try {
      const existing = await load(req, res, PODCAST_EPISODE);
      if (!existing) return;
      requireFields(req.body, EPISODE_FIELDS);
      if (!Object.keys(req.body).length) throw new InputError('No Podcast metadata changes were supplied.');
      const data = episodeData({ ...existing, ...req.body }, await parentFor(req.body.podcastShowId ?? existing.podcastShowId));
      const changes = Object.fromEntries(Object.keys(req.body).map((key) => [key, data[key]]));
      if (existing.approvalStatus === 'approved'
        && ['podcastShowId', 'rightsHolder', 'rightsVerificationNotes'].some((key) => (
          Object.hasOwn(changes, key) && changes[key] !== (typeof existing[key] === 'string' ? existing[key].trim() : existing[key])
        ))) {
        Object.assign(changes, { approvalStatus: 'draft', approvedAt: null, approvedBy: null, approvalNotes: '' });
      }
      await store.updateVideo(existing.id, changes);
      return res.json({ ...existing, ...changes });
    } catch (error) { return respondError(res, error); }
  });

  router.post('/episodes/:id/approve', async (req, res) => {
    try {
      const existing = await load(req, res, PODCAST_EPISODE);
      if (!existing) return;
      requireFields(req.body, ['approvalNotes']);
      episodeData(existing, await parentFor(existing.podcastShowId));
      if (existing.status !== 'ready' || typeof existing.muxPlaybackId !== 'string' || !existing.muxPlaybackId.trim()) {
        throw new InputError('Podcast Episode must be ready with a Mux playback ID before approval.');
      }
      const approvalNotes = text(req.body.approvalNotes, 'approvalNotes');
      await store.updateVideoApproval(existing.id, { approvalStatus: 'approved', approvalNotes, approvedBy: req.user.uid });
      return res.json(await store.getVideoById(existing.id));
    } catch (error) { return respondError(res, error); }
  });

  for (const [segment, type] of [['shows', PODCAST_SHOW], ['episodes', PODCAST_EPISODE]]) {
    router.post(`/${segment}/:id/unpublish`, async (req, res) => {
      try {
        const existing = await load(req, res, type);
        if (!existing) return;
        requireFields(req.body, []);
        await store.updateVideo(existing.id, {
          approvalStatus: 'draft', approvedAt: null, approvedBy: null, approvalNotes: '',
        });
        return res.json(await store.getVideoById(existing.id));
      } catch (error) { return respondError(res, error); }
    });
  }

  router.post('/episodes/:id/upload-url', async (req, res) => {
    try {
      const existing = await load(req, res, PODCAST_EPISODE);
      if (!existing) return;
      requireFields(req.body, []);
      episodeData(existing, await parentFor(existing.podcastShowId));
      if (existing.approvalStatus !== 'draft' || (existing.muxAssetId && existing.status !== 'errored')
        || (existing.muxUploadId && existing.status === 'processing')) {
        return res.status(409).json({ error: 'Podcast Episode must be a draft without an active upload.' });
      }
      const upload = await media.createDirectUpload(process.env.FRONTEND_URL);
      const claimed = await store.updatePodcastIngestion(existing.id, expectedAttempt(existing), {
        muxUploadId: upload.id, muxAssetId: null, muxPlaybackId: null, duration: 0, status: 'processing',
      });
      if (!claimed) return res.status(409).json({ error: 'Podcast Episode ingestion changed; retry the request.' });
      return res.status(201).json({ videoId: existing.id, uploadId: upload.id, uploadUrl: upload.url });
    } catch (error) { return respondError(res, error); }
  });

  router.post('/episodes/:id/from-url', async (req, res) => {
    try {
      const existing = await load(req, res, PODCAST_EPISODE);
      if (!existing) return;
      requireFields(req.body, ['sourceUrl']);
      episodeData(existing, await parentFor(existing.podcastShowId));
      if (existing.approvalStatus !== 'draft' || (existing.muxAssetId && existing.status !== 'errored')
        || (existing.muxUploadId && existing.status === 'processing')) {
        return res.status(409).json({ error: 'Podcast Episode must be a draft without an active upload.' });
      }
      const sourceUrl = text(req.body.sourceUrl, 'sourceUrl', true);
      let parsed;
      try { parsed = new URL(sourceUrl); } catch { throw new InputError('Podcast sourceUrl must be a valid HTTP or HTTPS URL.'); }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new InputError('Podcast sourceUrl must be HTTP or HTTPS.');
      const asset = await media.createAssetFromUrl(sourceUrl);
      const claimed = await store.updatePodcastIngestion(existing.id, expectedAttempt(existing), {
        muxUploadId: null, muxAssetId: asset.id, muxPlaybackId: null, duration: 0, status: 'processing',
      });
      if (!claimed) return res.status(409).json({ error: 'Podcast Episode ingestion changed; retry the request.' });
      return res.status(201).json({ videoId: existing.id, assetId: asset.id });
    } catch (error) { return respondError(res, error); }
  });

  return router;
}

module.exports = { createAdminPodcastRouter };

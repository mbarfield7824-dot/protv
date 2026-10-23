const express = require('express');
const { CreatorPosterStore } = require('./creatorPosterStore');

// Administrator poster uploads for any catalog title. The image is decoded,
// stripped and re-encoded exactly like Creator transfers, stored in the same
// durable bucket under title-posters/, and both artwork fields point at it.
// Pasted third-party image links can expire; uploaded copies do not.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Below Vercel's 4.5 MB request limit.
const MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const VIDEO_ID = /^[A-Za-z0-9_-]{1,200}$/;
const PODCAST_TYPES = new Set(['PODCAST_SHOW', 'PODCAST_EPISODE']);

function createTitlePosterRouter({
  store,
  verifyAdmin = require('../middleware/auth').verifyAdmin,
  getVideoById = (id) => require('../firebase').getVideoById(id),
  updateVideo = (id, updates) => require('../firebase').updateVideo(id, updates),
  logAdminEvent = (event) => require('../adminBot/adminAudit').logAdminEvent(event),
  normalizePosterImage = (bytes, mimeType) => require('./creatorPromotional').normalizePosterImage(bytes, mimeType),
} = {}) {
  const router = express.Router();
  const fail = (response, status, error) => response.status(status).set('Cache-Control', 'no-store').json({ error });

  router.put('/:videoId', verifyAdmin, express.raw({ type: [...MIME_TYPES], limit: MAX_UPLOAD_BYTES }), async (request, response) => {
    const { videoId } = request.params;
    const mimeType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!VIDEO_ID.test(videoId)) return fail(response, 400, 'Invalid title identifier.');
    if (!MIME_TYPES.has(mimeType)) return fail(response, 415, 'Upload a PNG or JPEG poster image.');
    if (!Buffer.isBuffer(request.body) || !request.body.length) return fail(response, 400, 'The poster image is empty.');

    const current = store || new CreatorPosterStore();
    try {
      current.assertAvailable();
    } catch {
      return fail(response, 503, 'Poster storage is not configured. No catalog record was changed.');
    }

    let video;
    try {
      video = await getVideoById(videoId);
    } catch (error) {
      if (error?.constructor?.name === 'VideoNotFoundError') return fail(response, 404, 'Title not found.');
      return fail(response, 503, 'The catalog is temporarily unavailable. No poster was stored.');
    }
    if (PODCAST_TYPES.has(video.contentType)) return fail(response, 400, 'Podcast artwork is managed in the Podcasts editor.');

    let clean;
    try {
      clean = await normalizePosterImage(request.body, mimeType);
    } catch {
      return fail(response, 422, 'The poster must be a valid, static PNG or JPEG image.');
    }

    let posterUrl;
    try {
      posterUrl = await current.save(clean, mimeType, 'title');
    } catch {
      return fail(response, 503, 'Poster storage is temporarily unavailable. No catalog record was changed.');
    }

    const previous = { posterUrl: video.posterUrl || '', thumbnailUrl: video.thumbnailUrl || '' };
    try {
      await updateVideo(videoId, { posterUrl, thumbnailUrl: posterUrl });
    } catch {
      return fail(response, 503, 'The poster was stored but the catalog could not be updated. Try again.');
    }
    // Previous values are kept in the audit log so a replacement can be reverted.
    await logAdminEvent({
      type: 'title_poster_uploaded',
      message: `Uploaded a durable poster for ${video.title || videoId}.`,
      actorId: request.user.uid,
      details: {
        videoId, posterUrl, bytes: clean.length, mimeType,
        previousPosterUrl: previous.posterUrl.slice(0, 2000),
        previousThumbnailUrl: previous.thumbnailUrl.slice(0, 2000),
      },
    }).catch(() => {});
    return response.set('Cache-Control', 'no-store').json({ videoId, posterUrl, thumbnailUrl: posterUrl });
  });

  // Body-size and parse failures from express.raw.
  router.use((error, request, response, next) => {
    if (error?.type === 'entity.too.large') return fail(response, 413, 'Poster images must be 4 MB or smaller.');
    if (error?.status >= 400 && error.status < 500) return fail(response, 400, 'The poster upload could not be read.');
    return next(error);
  });
  return router;
}

module.exports = { createTitlePosterRouter, MAX_UPLOAD_BYTES };

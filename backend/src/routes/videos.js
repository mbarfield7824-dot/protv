const express = require('express');
const path = require('path');
const {
  db,
  getAllVideos,
  getApprovedVideos,
  getAllVideosAdmin,
  getVideoById,
  getCategories,
  addVideo,
  updateVideo,
  deleteVideo,
  updateVideoApproval,
  getVideoByUploadId,
  getVideoByAssetId,
  grantAdminRole,
} = require('../firebase');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const {
  createDirectUpload,
  getUpload,
  createAssetFromUrl,
  getAsset,
  getPlaybackId,
} = require('../mux');
const { createCandidateStore } = require('../adminBot/candidateStore');
const { verifySignedBody } = require('../ads/adRevenueService');
const { getImdbRating } = require('../omdb');
const {
  CreatorPublishingService,
  validateCreatorActionRequest,
} = require('../integrations/creatorPublishingService');
const router = express.Router();
const publicDomainCandidates = createCandidateStore({
  db,
  filePath: path.resolve(
    process.env.PD_CANDIDATE_STORE_FILE
      || process.env.PD_CANDIDATE_FILE
      || path.join(__dirname, '../../.data/pd-candidates.json')
  ),
});
const creatorPublishing = new CreatorPublishingService({
  creatorAgentOrigin: process.env.CREATOR_AGENT_ORIGIN || '',
});

async function updateImdbRating(video) {
  try {
    const rating = await getImdbRating(video);
    await updateVideo(video.id, rating);
    return rating;
  } catch (error) {
    console.warn(`IMDb rating lookup failed for "${video.title}" (${video.id}): ${error.message}`);
    return null;
  }
}

function optionalHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Trailer link must be a valid HTTP or HTTPS URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Trailer link must use HTTP or HTTPS.');
  }

  return url.toString();
}

function publicVideo(video) {
  const sanitized = { ...video };
  delete sanitized.adminSourceFilePath;
  delete sanitized.publicDomainFileHash;
  delete sanitized.distributorId;
  delete sanitized.distributorExternalId;
  delete sanitized.rightsStartAt;
  delete sanitized.rightsEndAt;
  delete sanitized.rightsTerritories;
  delete sanitized.rightsExclusive;
  delete sanitized.publicDomainSourceId;
  delete sanitized.publicDomainLicenseEvidence;
  delete sanitized.publicDomainLicenseUrl;
  delete sanitized.publicDomainConfirmedBy;
  delete sanitized.publicDomainConfirmedAt;
  delete sanitized.creatorProjectId;
  return sanitized;
}

// GET /videos - Get all APPROVED videos (public facing - only approved content)
router.get('/', async (req, res) => {
  const externalQueryKeys = Object.keys(req.query).filter((key) => key !== 'path');
  if (externalQueryKeys.length > 0) {
    return res.redirect(307, '/api/videos');
  }

  try {
    const videos = await getApprovedVideos();
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.json(videos.map(publicVideo));
  } catch (error) {
    res.set('Cache-Control', 'no-store');
    res.status(500).json({ error: error.message });
  }
});

// ADMIN: GET /videos/admin/all - Get ALL videos (including draft, pending, rejected) for admin dashboard
router.get('/admin/all', verifyAdmin, async (req, res) => {
  try {
    const videos = await getAllVideosAdmin();
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bootstrap is restricted to the exact owner identity configured on Vercel.
// After success, subsequent management requests require the durable admin claim.
router.post('/admin/claim-owner', verifyToken, async (req, res) => {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return res.status(503).json({ error: 'Owner access has not been configured.' });
  }
  if (req.user.email?.toLowerCase() !== ownerEmail) {
    return res.status(403).json({ error: 'This account is not the configured owner.' });
  }

  try {
    await grantAdminRole(ownerEmail);
    res.json({ message: 'Owner access activated. Refresh your sign-in token to continue.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/integrations/creator-link', async (req, res) => {
  try {
    verifySignedBody(
      req.rawBody?.toString('utf8') || '',
      req.header('x-protv-signature') || '',
      process.env.PROTV_CREATOR_LINK_SECRET || '',
    );
    const catalogId = String(req.body.catalogId || '').trim();
    const creatorProjectId = String(req.body.creatorProjectId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(catalogId)) throw new Error('A valid catalog ID is required.');
    if (!/^[0-9a-f-]{36}$/i.test(creatorProjectId)) throw new Error('A valid creator project ID is required.');
    const video = await getVideoById(catalogId);
    if (video.approvalStatus !== 'approved') {
      return res.status(409).json({ error: 'Only approved catalog titles can be linked to a creator project.' });
    }
    await updateVideo(catalogId, { creatorProjectId, creatorLinkedAt: new Date().toISOString() });
    res.json({ linked: true, catalogId, creatorProjectId });
  } catch (error) {
    const status = /signature|authentication/.test(error.message) ? 401 : 400;
    res.status(status).json({ error: error.message });
  }
});

router.post('/integrations/creator-actions', async (req, res) => {
  try {
    const rawBody = req.rawBody?.toString('utf8') || '';
    const payload = validateCreatorActionRequest(
      rawBody,
      req.header('x-protv-signature') || '',
      process.env.PROTV_PUBLISHING_SECRET || '',
    );
    const result = await creatorPublishing.execute(payload);
    res.status(result.status === 'processing' ? 202 : 200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Creator Agent request failed.';
    const status = /signature|authentication|configured/.test(message)
      ? 401
      : /still processing|before starting|does not match/.test(message)
        ? 409
        : 400;
    res.status(status).json({ error: message });
  }
});

// ADMIN: PATCH /videos/admin/:id/approve - Approve a video
router.patch('/admin/:id/approve', verifyAdmin, async (req, res) => {
  try {
    const { approvalNotes } = req.body;
    await updateVideoApproval(req.params.id, {
      approvalStatus: 'approved',
      approvalNotes: approvalNotes || '',
      approvedBy: req.user.uid,
    });
    const video = await getVideoById(req.params.id);
    res.json({ message: 'Video approved', video });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ADMIN: PATCH /videos/admin/:id/reject - Reject a video
router.patch('/admin/:id/reject', verifyAdmin, async (req, res) => {
  try {
    const { approvalNotes } = req.body;
    await updateVideoApproval(req.params.id, {
      approvalStatus: 'rejected',
      approvalNotes: approvalNotes || '',
      approvedBy: req.user.uid,
    });
    const video = await getVideoById(req.params.id);
    res.json({ message: 'Video rejected', video });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ADMIN: PATCH /videos/admin/:id/verify - Request rights verification
router.patch('/admin/:id/verify', verifyAdmin, async (req, res) => {
  try {
    const { approvalNotes } = req.body;
    await updateVideoApproval(req.params.id, {
      approvalStatus: 'rights-verification-required',
      approvalNotes: approvalNotes || '',
      approvedBy: req.user.uid,
    });
    const video = await getVideoById(req.params.id);
    res.json({ message: 'Rights verification requested', video });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ADMIN: Send an existing catalog entry's authorized source file to Mux.
// This keeps the original catalog record and lets the normal status endpoint
// attach the playback ID as soon as Mux finishes processing it.
router.post('/admin/:id/ingest', verifyAdmin, async (req, res) => {
  try {
    const video = await getVideoById(req.params.id);

    if (!video.videoUrl) {
      return res.status(400).json({ error: 'This catalog entry has no source video URL.' });
    }

    if (video.muxAssetId && video.status !== 'errored') {
      return res.status(409).json({ error: 'This catalog entry is already being processed by Mux.' });
    }

    const asset = await createAssetFromUrl(video.videoUrl);
    await updateVideo(req.params.id, {
      category: video.category || video.genre || 'General',
      thumbnailUrl: video.thumbnailUrl || video.posterUrl || '',
      muxAssetId: asset.id,
      status: 'processing',
    });

    res.status(202).json({
      message: 'Mux ingestion started',
      videoId: req.params.id,
      assetId: asset.id,
      status: 'processing',
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /videos/:id - Get single video
router.get('/:id', async (req, res) => {
  try {
    const video = await getVideoById(req.params.id);
    res.json(publicVideo(video));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.patch('/:id', verifyAdmin, async (req, res) => {
  const {
    title,
    description,
    category,
    subgenre,
    thumbnailUrl,
    year,
    maturityRating,
    cast,
    creator,
    language,
    subtitles,
    trailerUrl,
    contentType,
    seriesTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle,
  } = req.body;
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'A title is required.' });
  }

  try {
    const isEpisode = contentType === 'EPISODE';
    await updateVideo(req.params.id, {
      title: title.trim(),
      description: typeof description === 'string' ? description : '',
      category: typeof category === 'string' && category ? category : 'General',
      subgenre: typeof subgenre === 'string' ? subgenre.trim() : '',
      thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : '',
      year: Number.isInteger(Number(year)) && Number(year) >= 1888 ? Number(year) : null,
      maturityRating: typeof maturityRating === 'string' ? maturityRating.trim() : '',
      cast: typeof cast === 'string' ? cast.trim() : '',
      creator: typeof creator === 'string' ? creator.trim() : '',
      language: typeof language === 'string' ? language.trim() : '',
      subtitles: typeof subtitles === 'string' ? subtitles.trim() : '',
      trailerUrl: optionalHttpUrl(trailerUrl),
      contentType: isEpisode ? 'EPISODE' : 'MOVIE',
      seriesTitle: isEpisode && typeof seriesTitle === 'string' ? seriesTitle.trim() : '',
      seasonNumber: isEpisode && Number.isInteger(Number(seasonNumber)) && Number(seasonNumber) > 0
        ? Number(seasonNumber)
        : null,
      episodeNumber: isEpisode && Number.isInteger(Number(episodeNumber)) && Number(episodeNumber) > 0
        ? Number(episodeNumber)
        : null,
      episodeTitle: isEpisode && typeof episodeTitle === 'string' ? episodeTitle.trim() : '',
    });
    res.json(await getVideoById(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ADMIN: Look up and persist a title's IMDb rating via OMDb.
router.post('/admin/:id/imdb-rating', verifyAdmin, async (req, res) => {
  try {
    const video = await getVideoById(req.params.id);
    const rating = await getImdbRating(video);
    await updateVideo(req.params.id, rating);
    res.json({ id: req.params.id, ...rating });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const video = await getVideoById(req.params.id);
    if (video.status === 'ready' && video.muxPlaybackId) {
      return res.status(409).json({ error: 'Ready titles cannot be removed from this cleanup tool.' });
    }
    await deleteVideo(req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /videos/categories - Get all categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await getCategories();
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /videos - Add new video with comprehensive metadata (ADMIN ONLY - requires authentication)
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const {
      title,
      year,
      genre,
      subgenre,
      description,
      runtime,
      country,
      videoUrl,
      trailerUrl,
      posterUrl,
      backdropUrl,
      maturityRating,
      cast,
      creator,
      language,
      subtitles,
      audioInfo,
      subtitleInfo,
      copyrightStatus,
      licenseType,
      rightsHolder,
      commercialUseStatus,
      attributionRequired,
      attributionText,
      rightsVerificationNotes,
      sourceUrl,
      approvalStatus,
    } = req.body;

    // Validate required fields for comprehensive content submission
    if (!title || !videoUrl || !rightsHolder || !rightsVerificationNotes) {
      return res.status(400).json({
        error: 'title, videoUrl, rightsHolder, and rightsVerificationNotes are required',
      });
    }

    const videoData = {
      title,
      year: year || new Date().getFullYear(),
      genre: genre || '',
      subgenre: subgenre || '',
      description: description || '',
      runtime: runtime || 0,
      country: country || '',
      videoUrl,
      trailerUrl: optionalHttpUrl(trailerUrl),
      posterUrl: posterUrl || '',
      backdropUrl: backdropUrl || '',
      maturityRating: maturityRating || '',
      cast: cast || '',
      creator: creator || '',
      language: language || audioInfo || '',
      subtitles: subtitles || subtitleInfo || '',
      audioInfo: audioInfo || '',
      subtitleInfo: subtitleInfo || '',
      copyrightStatus: copyrightStatus || 'unknown',
      licenseType: licenseType || '',
      rightsHolder,
      commercialUseStatus: commercialUseStatus || 'requires-verification',
      attributionRequired: attributionRequired || false,
      attributionText: attributionText || '',
      rightsVerificationNotes,
      sourceUrl: sourceUrl || '',
      approvalStatus: approvalStatus || 'draft',
      views: 0,
      createdBy: req.user.uid,
    };

    const videoId = await addVideo(videoData);
    res.status(201).json({
      message: 'Video added successfully',
      id: videoId,
      videoId,
      ...videoData,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /videos/upload-url - Step 1 of the "upload a file" flow.
// Creates a Mux direct-upload URL and a placeholder Firestore doc
// (status: "processing") that the frontend can immediately show while
// Mux transcodes the video in the background.
router.post('/upload-url', verifyAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      subgenre,
      thumbnailUrl,
      year,
      maturityRating,
      cast,
      creator,
      language,
      subtitles,
      trailerUrl,
      contentType,
      seriesTitle,
      seasonNumber,
      episodeNumber,
      episodeTitle,
    } = req.body;

    if (!title || !category) {
      return res.status(400).json({
        error: 'title and category are required',
      });
    }

    const upload = await createDirectUpload(process.env.FRONTEND_URL);
    const isEpisode = contentType === 'EPISODE';
    if (isEpisode && (!seriesTitle?.trim() || !Number.isInteger(Number(seasonNumber)) || !Number.isInteger(Number(episodeNumber)))) {
      return res.status(400).json({ error: 'TV episodes require a series title, season number, and episode number.' });
    }

    const videoId = await addVideo({
      title,
      description: description || '',
      category,
      subgenre: typeof subgenre === 'string' ? subgenre.trim() : '',
      thumbnailUrl: thumbnailUrl || '',
      year: Number.isInteger(Number(year)) && Number(year) >= 1888 ? Number(year) : null,
      maturityRating: typeof maturityRating === 'string' ? maturityRating.trim() : '',
      cast: typeof cast === 'string' ? cast.trim() : '',
      creator: typeof creator === 'string' ? creator.trim() : '',
      language: typeof language === 'string' ? language.trim() : '',
      subtitles: typeof subtitles === 'string' ? subtitles.trim() : '',
      trailerUrl: optionalHttpUrl(trailerUrl),
      duration: 0,
      views: 0,
      createdBy: req.user.uid,
      approvalStatus: 'approved',
      status: 'processing',
      muxUploadId: upload.id,
      contentType: isEpisode ? 'EPISODE' : 'MOVIE',
      seriesTitle: isEpisode ? seriesTitle.trim() : '',
      seasonNumber: isEpisode ? Number(seasonNumber) : null,
      episodeNumber: isEpisode ? Number(episodeNumber) : null,
      episodeTitle: isEpisode && typeof episodeTitle === 'string' ? episodeTitle.trim() : '',
    });

    res.status(201).json({
      videoId,
      uploadUrl: upload.url,
      uploadId: upload.id,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /videos/from-url - "Paste a URL" flow. Ingests an already-hosted
// video file (S3/GCS/CDN link) directly into Mux without a file upload.
router.post('/from-url', verifyAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      subgenre,
      thumbnailUrl,
      year,
      maturityRating,
      cast,
      creator,
      language,
      subtitles,
      trailerUrl,
      sourceUrl,
      duration,
      contentType,
      seriesTitle,
      seasonNumber,
      episodeNumber,
      episodeTitle,
    } = req.body;

    if (!title || !category || !sourceUrl) {
      return res.status(400).json({
        error: 'title, category, and sourceUrl are required',
      });
    }

    const asset = await createAssetFromUrl(sourceUrl);
    const isEpisode = contentType === 'EPISODE';
    if (isEpisode && (!seriesTitle?.trim() || !Number.isInteger(Number(seasonNumber)) || !Number.isInteger(Number(episodeNumber)))) {
      return res.status(400).json({ error: 'TV episodes require a series title, season number, and episode number.' });
    }

    const videoId = await addVideo({
      title,
      description: description || '',
      category,
      subgenre: typeof subgenre === 'string' ? subgenre.trim() : '',
      thumbnailUrl: thumbnailUrl || '',
      year: Number.isInteger(Number(year)) && Number(year) >= 1888 ? Number(year) : null,
      maturityRating: typeof maturityRating === 'string' ? maturityRating.trim() : '',
      cast: typeof cast === 'string' ? cast.trim() : '',
      creator: typeof creator === 'string' ? creator.trim() : '',
      language: typeof language === 'string' ? language.trim() : '',
      subtitles: typeof subtitles === 'string' ? subtitles.trim() : '',
      trailerUrl: optionalHttpUrl(trailerUrl),
      duration: duration || 0,
      views: 0,
      createdBy: req.user.uid,
      approvalStatus: 'approved',
      status: 'processing',
      muxAssetId: asset.id,
      contentType: isEpisode ? 'EPISODE' : 'MOVIE',
      seriesTitle: isEpisode ? seriesTitle.trim() : '',
      seasonNumber: isEpisode ? Number(seasonNumber) : null,
      episodeNumber: isEpisode ? Number(episodeNumber) : null,
      episodeTitle: isEpisode && typeof episodeTitle === 'string' ? episodeTitle.trim() : '',
    });

    res.status(201).json({
      videoId,
      assetId: asset.id,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /videos/:id/status - Poll processing status (fallback for when
// webhooks aren't reachable, e.g. local dev without a public URL).
router.get('/:id/status', async (req, res) => {
  try {
    const video = await getVideoById(req.params.id);

    if (video.status !== 'processing') {
      return res.json(publicVideo(video));
    }

    let asset = null;

    if (video.muxUploadId) {
      const upload = await getUpload(video.muxUploadId);
      if (upload.asset_id) {
        asset = await getAsset(upload.asset_id);
      }
    } else if (video.muxAssetId) {
      asset = await getAsset(video.muxAssetId);
    }

    if (asset && asset.status === 'ready') {
      const playbackId = getPlaybackId(asset);
      const readyUpdates = {
        status: 'ready',
        muxPlaybackId: playbackId,
        muxAssetId: asset.id,
        duration: asset.duration ? Math.round(asset.duration) : video.duration,
      };
      await updateVideo(req.params.id, readyUpdates);
      const rating = await updateImdbRating({ ...video, ...readyUpdates });
      return res.json(publicVideo({ ...video, ...readyUpdates, ...rating }));
    }

    if (asset && asset.status === 'errored') {
      await updateVideo(req.params.id, { status: 'errored' });
      return res.json(publicVideo({ ...video, status: 'errored' }));
    }

    res.json(publicVideo(video));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /videos/webhook - Mux calls this automatically when an asset
// finishes transcoding (video.asset.ready) or fails (video.asset.errored).
// Requires a publicly reachable URL registered in the Mux dashboard.
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;

    if (event.type === 'video.asset.ready') {
      const asset = event.data;
      const uploadId = asset.upload_id;
      const playbackId = getPlaybackId(asset);

      const video = uploadId
        ? await getVideoByUploadId(uploadId)
        : await getVideoByAssetId(asset.id);

      if (video) {
        const readyUpdates = {
          status: 'ready',
          muxPlaybackId: playbackId,
          muxAssetId: asset.id,
          duration: asset.duration ? Math.round(asset.duration) : video.duration,
        };
        await updateVideo(video.id, readyUpdates);
        if (video.publicDomainCandidateId) {
          await updateVideoApproval(video.id, {
            approvalStatus: 'approved',
            approvalNotes: 'Published after Administrator confirmation of source evidence.',
            approvedBy: video.publicDomainConfirmedBy || 'system:mux-webhook',
          });
          await publicDomainCandidates.setDecision(video.publicDomainCandidateId, 'approved', {
            catalogId: video.id,
            approvedBy: video.publicDomainConfirmedBy || 'system:mux-webhook',
            progressPercent: 100,
            stage: 'Published',
          });
        }
        await updateImdbRating({ ...video, ...readyUpdates });
      }
    }

    if (event.type === 'video.asset.errored') {
      const asset = event.data;
      const video = asset.upload_id
        ? await getVideoByUploadId(asset.upload_id)
        : await getVideoByAssetId(asset.id);

      if (video) {
        await updateVideo(video.id, { status: 'errored' });
        if (video.publicDomainCandidateId) {
          await publicDomainCandidates.setDecision(video.publicDomainCandidateId, 'failed', {
            catalogId: video.id,
            lastError: 'Mux could not transcode the selected title.',
            progressPercent: 100,
            stage: 'Needs attention',
          });
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

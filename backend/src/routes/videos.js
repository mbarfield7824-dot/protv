const express = require('express');
const {
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
const router = express.Router();

// GET /videos - Get all APPROVED videos (public facing - only approved content)
router.get('/', async (req, res) => {
  try {
    const videos = await getApprovedVideos();
    res.json(videos);
  } catch (error) {
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
    res.json(video);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.patch('/:id', verifyAdmin, async (req, res) => {
  const {
    title,
    description,
    category,
    thumbnailUrl,
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
      thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : '',
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
      trailerUrl: trailerUrl || '',
      posterUrl: posterUrl || '',
      backdropUrl: backdropUrl || '',
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
      thumbnailUrl,
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
      thumbnailUrl: thumbnailUrl || '',
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
    const { title, description, category, thumbnailUrl, sourceUrl, duration, contentType, seriesTitle, seasonNumber, episodeNumber, episodeTitle } = req.body;

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
      thumbnailUrl: thumbnailUrl || '',
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
      return res.json(video);
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
      await updateVideo(req.params.id, {
        status: 'ready',
        muxPlaybackId: playbackId,
        muxAssetId: asset.id,
        duration: asset.duration ? Math.round(asset.duration) : video.duration,
      });
      return res.json({ ...video, status: 'ready', muxPlaybackId: playbackId });
    }

    if (asset && asset.status === 'errored') {
      await updateVideo(req.params.id, { status: 'errored' });
      return res.json({ ...video, status: 'errored' });
    }

    res.json(video);
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
        await updateVideo(video.id, {
          status: 'ready',
          muxPlaybackId: playbackId,
          muxAssetId: asset.id,
          duration: asset.duration ? Math.round(asset.duration) : video.duration,
        });
      }
    }

    if (event.type === 'video.asset.errored') {
      const asset = event.data;
      const video = asset.upload_id
        ? await getVideoByUploadId(asset.upload_id)
        : await getVideoByAssetId(asset.id);

      if (video) {
        await updateVideo(video.id, { status: 'errored' });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

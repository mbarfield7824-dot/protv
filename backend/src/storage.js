const fs = require('fs');
const path = require('path');

// Simple file-based storage for development when Firebase isn't available
const STORAGE_DIR = path.join(__dirname, '../.data');
const VIDEOS_FILE = path.join(STORAGE_DIR, 'videos.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Load all videos from file
function loadVideos() {
  try {
    if (fs.existsSync(VIDEOS_FILE)) {
      const data = fs.readFileSync(VIDEOS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading videos:', error.message);
  }
  return {};
}

// Save all videos to file
function saveVideos(videos) {
  try {
    fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videos, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving videos:', error.message);
    throw error;
  }
}

// Get all videos
function getAllVideos() {
  return Object.values(loadVideos());
}

// Get approved videos only
function getApprovedVideos() {
  return Object.values(loadVideos()).filter(v => v.approvalStatus === 'approved');
}

// Get video by ID
function getVideoById(id) {
  const videos = loadVideos();
  if (!videos[id]) {
    throw new Error('Video not found');
  }
  return { id, ...videos[id] };
}

// Add new video
function addVideo(videoData) {
  const videos = loadVideos();
  const id = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  videos[id] = {
    ...videoData,
    approvalStatus: videoData.approvalStatus || 'draft',
    copyrightStatus: videoData.copyrightStatus || 'unknown',
    licenseType: videoData.licenseType || '',
    rightsHolder: videoData.rightsHolder || '',
    commercialUseStatus: videoData.commercialUseStatus || 'unverified',
    attributionRequired: videoData.attributionRequired || false,
    attributionText: videoData.attributionText || '',
    rightsVerificationNotes: videoData.rightsVerificationNotes || '',
    submittedAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
    approvalNotes: '',
    createdAt: new Date().toISOString(),
  };

  saveVideos(videos);
  return id;
}

// Update video
function updateVideo(id, updates) {
  const videos = loadVideos();
  if (!videos[id]) {
    throw new Error('Video not found');
  }
  videos[id] = { ...videos[id], ...updates };
  saveVideos(videos);
}

// Update video approval
function updateVideoApproval(id, approvalData) {
  const videos = loadVideos();
  if (!videos[id]) {
    throw new Error('Video not found');
  }

  const updates = {
    approvalStatus: approvalData.approvalStatus,
    approvalNotes: approvalData.approvalNotes || '',
    approvedBy: approvalData.approvedBy,
  };

  if (approvalData.approvalStatus === 'approved') {
    updates.approvedAt = new Date().toISOString();
  }

  videos[id] = { ...videos[id], ...updates };
  saveVideos(videos);
}

// Get all videos for admin (including drafts, pending, etc)
function getAllVideosAdmin() {
  return Object.entries(loadVideos())
    .map(([id, video]) => ({ id, ...video }))
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

// Get categories from videos
function getCategories() {
  const videos = Object.values(loadVideos());
  const categories = new Set();

  videos.forEach(v => {
    if (v.genre) categories.add(v.genre);
    if (v.category) categories.add(v.category);
  });

  return Array.from(categories).map((name, index) => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
  }));
}

// Get video by upload ID (Mux)
function getVideoByUploadId(uploadId) {
  const videos = Object.entries(loadVideos());
  const found = videos.find(([_, v]) => v.muxUploadId === uploadId);
  return found ? { id: found[0], ...found[1] } : null;
}

// Get video by asset ID (Mux)
function getVideoByAssetId(assetId) {
  const videos = Object.entries(loadVideos());
  const found = videos.find(([_, v]) => v.muxAssetId === assetId);
  return found ? { id: found[0], ...found[1] } : null;
}

module.exports = {
  getAllVideos,
  getApprovedVideos,
  getVideoById,
  addVideo,
  updateVideo,
  updateVideoApproval,
  getAllVideosAdmin,
  getCategories,
  getVideoByUploadId,
  getVideoByAssetId,
};

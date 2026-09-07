const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccountKeyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKeyPath) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set');
}

const serviceAccount = require(path.resolve(serviceAccountKeyPath));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

// Get Firestore instance
const db = admin.firestore();
const auth = admin.auth();

// Helper function to create a new user
async function createUser(email, password, displayName) {
  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
    });
    return userRecord;
  } catch (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

// Helper function to get user by ID
async function getUserById(uid) {
  try {
    const userRecord = await auth.getUser(uid);
    return userRecord;
  } catch (error) {
    throw new Error(`Failed to get user: ${error.message}`);
  }
}

// Helper function to add video to Firestore
async function addVideo(videoData) {
  try {
    const docRef = await db.collection('videos').add({
      ...videoData,
      // Rights/Legal defaults
      approvalStatus: videoData.approvalStatus || 'draft',
      copyrightStatus: videoData.copyrightStatus || 'unknown',
      licenseType: videoData.licenseType || '',
      rightsHolder: videoData.rightsHolder || '',
      commercialUseStatus: videoData.commercialUseStatus || 'unverified',
      attributionRequired: videoData.attributionRequired || false,
      attributionText: videoData.attributionText || '',
      rightsVerificationNotes: videoData.rightsVerificationNotes || '',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedAt: null,
      approvedBy: null,
      approvalNotes: '',
      // Basic metadata
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    throw new Error(`Failed to add video: ${error.message}`);
  }
}

// Helper function to get all videos
async function getAllVideos() {
  try {
    const snapshot = await db.collection('videos').get();
    const videos = [];
    snapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    return videos;
  } catch (error) {
    throw new Error(`Failed to get videos: ${error.message}`);
  }
}

// Helper function to get video by ID
async function getVideoById(videoId) {
  try {
    const doc = await db.collection('videos').doc(videoId).get();
    if (!doc.exists) {
      throw new Error('Video not found');
    }
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    throw new Error(`Failed to get video: ${error.message}`);
  }
}

// Helper function to update an existing video (e.g. once Mux finishes
// transcoding and we can fill in the real playback ID/duration/status)
async function updateVideo(videoId, updates) {
  try {
    await db.collection('videos').doc(videoId).update(updates);
    return true;
  } catch (error) {
    throw new Error(`Failed to update video: ${error.message}`);
  }
}

// Helper function to find a video by its associated Mux direct-upload ID
async function getVideoByUploadId(uploadId) {
  try {
    const snapshot = await db
      .collection('videos')
      .where('muxUploadId', '==', uploadId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    throw new Error(`Failed to find video by upload id: ${error.message}`);
  }
}

// Helper function to find a video by its associated Mux asset ID
async function getVideoByAssetId(assetId) {
  try {
    const snapshot = await db
      .collection('videos')
      .where('muxAssetId', '==', assetId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    throw new Error(`Failed to find video by asset id: ${error.message}`);
  }
}

// Helper function to get all categories
async function getCategories() {
  try {
    const snapshot = await db.collection('categories').get();
    const categories = [];
    snapshot.forEach((doc) => {
      categories.push({ id: doc.id, ...doc.data() });
    });
    return categories;
  } catch (error) {
    throw new Error(`Failed to get categories: ${error.message}`);
  }
}

// Helper function to get ONLY approved videos (public facing)
async function getApprovedVideos() {
  try {
    const snapshot = await db
      .collection('videos')
      .where('approvalStatus', '==', 'approved')
      .get();
    const videos = [];
    snapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    return videos;
  } catch (error) {
    throw new Error(`Failed to get approved videos: ${error.message}`);
  }
}

// Helper function to get all videos (admin only)
async function getAllVideosAdmin() {
  try {
    const snapshot = await db.collection('videos').orderBy('submittedAt', 'desc').get();
    const videos = [];
    snapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    return videos;
  } catch (error) {
    throw new Error(`Failed to get all videos: ${error.message}`);
  }
}

// Helper function to update video approval status
async function updateVideoApproval(videoId, approvalData) {
  try {
    const updates = {
      approvalStatus: approvalData.approvalStatus,
      approvalNotes: approvalData.approvalNotes || '',
      approvedBy: approvalData.approvedBy,
    };
    if (approvalData.approvalStatus === 'approved') {
      updates.approvedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await db.collection('videos').doc(videoId).update(updates);
    return true;
  } catch (error) {
    throw new Error(`Failed to update approval status: ${error.message}`);
  }
}

module.exports = {
  db,
  auth,
  createUser,
  getUserById,
  addVideo,
  getAllVideos,
  getApprovedVideos,
  getAllVideosAdmin,
  updateVideoApproval,
  getVideoById,
  updateVideo,
  getVideoByUploadId,
  getVideoByAssetId,
  getCategories,
};

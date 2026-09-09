const admin = require('firebase-admin');
const path = require('path');

// Vercel supplies the credential as a protected JSON environment variable;
// local development keeps using the ignored credential file.
const serviceAccountKeyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

let db = null;
let auth = null;
let firebaseError = null;

try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : serviceAccountKeyPath
      ? require(path.resolve(serviceAccountKeyPath))
      : null;
  if (!serviceAccount) {
    throw new Error('Firebase service account credentials are not configured');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });

  // Get Firestore instance
  db = admin.firestore();
  auth = admin.auth();
  console.log('✓ Firebase Admin SDK initialized successfully');
} catch (err) {
  firebaseError = err;
  console.warn('⚠ Firebase initialization failed:', err.message);
  console.warn('⚠ Falling back to file-based storage');
}

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

async function grantAdminRole(email) {
  if (!auth) {
    throw new Error('Firebase Admin SDK is not configured');
  }

  const userRecord = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(userRecord.uid, {
    ...userRecord.customClaims,
    admin: true,
  });
  return userRecord;
}

// Helper function to add video to Firestore
async function addVideo(videoData) {
  if (!db) {
    // Fall back to file-based storage
    const fileStorage = require('./storage');
    return fileStorage.addVideo(videoData);
  }

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
    console.warn('⚠ Firebase write failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.addVideo(videoData);
  }
}

// Helper function to get all videos
async function getAllVideos() {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.getAllVideos();
  }

  try {
    const snapshot = await db.collection('videos').get();
    const videos = [];
    snapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    return videos;
  } catch (error) {
    console.warn('⚠ Firebase read failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.getAllVideos();
  }
}

// Helper function to get video by ID
async function getVideoById(videoId) {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.getVideoById(videoId);
  }

  try {
    const doc = await db.collection('videos').doc(videoId).get();
    if (!doc.exists) {
      throw new Error('Video not found');
    }
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.warn('⚠ Firebase read failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.getVideoById(videoId);
  }
}

// Helper function to update an existing video (e.g. once Mux finishes
// transcoding and we can fill in the real playback ID/duration/status)
async function updateVideo(videoId, updates) {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.updateVideo(videoId, updates);
  }

  async function deleteVideo(videoId) {
    if (!db) {
      const fileStorage = require('./storage');
      return fileStorage.deleteVideo(videoId);
    }

    await db.collection('videos').doc(videoId).delete();
    return true;
  }

  try {
    await db.collection('videos').doc(videoId).update(updates);
    return true;
  } catch (error) {
    console.warn('⚠ Firebase write failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.updateVideo(videoId, updates);
  }
}

// Helper function to find a video by its associated Mux direct-upload ID
async function getVideoByUploadId(uploadId) {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.getVideoByUploadId(uploadId);
  }

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
    console.warn('⚠ Firebase read failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.getVideoByUploadId(uploadId);
  }
}

// Helper function to find a video by its associated Mux asset ID
async function getVideoByAssetId(assetId) {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.getVideoByAssetId(assetId);
  }

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
    console.warn('⚠ Firebase read failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.getVideoByAssetId(assetId);
  }
}

// Helper function to get all categories
async function getCategories() {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.getCategories();
  }

  try {
    const snapshot = await db.collection('categories').get();
    const categories = [];
    snapshot.forEach((doc) => {
      categories.push({ id: doc.id, ...doc.data() });
    });
    return categories;
  } catch (error) {
    console.warn('⚠ Firebase read failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.getCategories();
  }
}

// Helper function to get ONLY approved videos (public facing)
async function getApprovedVideos() {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.getApprovedVideos();
  }

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
    console.warn('⚠ Firebase read failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.getApprovedVideos();
  }
}

// Helper function to get all videos (admin only)
async function getAllVideosAdmin() {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.getAllVideosAdmin();
  }

  try {
    const snapshot = await db.collection('videos').orderBy('submittedAt', 'desc').get();
    const videos = [];
    snapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    return videos;
  } catch (error) {
    console.warn('⚠ Firebase read failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.getAllVideosAdmin();
  }
}

// Helper function to update video approval status
async function updateVideoApproval(videoId, approvalData) {
  if (!db) {
    const fileStorage = require('./storage');
    return fileStorage.updateVideoApproval(videoId, approvalData);
  }

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
    console.warn('⚠ Firebase write failed, falling back to file-based storage:', error.message);
    const fileStorage = require('./storage');
    return fileStorage.updateVideoApproval(videoId, approvalData);
  }
}

module.exports = {
  db,
  auth,
  createUser,
  getUserById,
  grantAdminRole,
  addVideo,
  getAllVideos,
  getApprovedVideos,
  getAllVideosAdmin,
  updateVideoApproval,
  getVideoById,
  updateVideo,
  deleteVideo,
  getVideoByUploadId,
  getVideoByAssetId,
  getCategories,
};

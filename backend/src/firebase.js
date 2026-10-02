const admin = require('firebase-admin');
const path = require('path');
const { podcastIngestionMatches } = require('./catalog/podcasts');

// Vercel supplies the credential as a protected JSON environment variable;
// local development keeps using the ignored credential file.
const serviceAccountKeyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

let db = null;
let auth = null;
let firebaseError = null;

class VideoNotFoundError extends Error {}
function localVideoStorage(error) {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Video storage is temporarily unavailable.');
  if (error) console.warn('Firebase operation failed; using local video storage:', error.message);
  return require('./storage');
}
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
  console.warn(process.env.VERCEL || process.env.NODE_ENV === 'production'
    ? '⚠ Local video storage disabled in production.' : '⚠ Falling back to file-based storage');
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
    return localVideoStorage().addVideo(videoData);
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
    return localVideoStorage(error).addVideo(videoData);
  }
}

async function createCreatorVideo(creatorProjectId, videoData) {
  if (!db) {
    return localVideoStorage().createCreatorVideo(creatorProjectId, videoData);
  }
  const id = `creator_${creatorProjectId}`;
  const document = db.collection('videos').doc(id);
  try {
    await document.create({
      ...videoData,
      creatorProjectId,
      approvalStatus: videoData.approvalStatus || 'draft',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedAt: null,
      approvedBy: null,
      approvalNotes: '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id, created: true };
  } catch (error) {
    if (error.code === 6 || error.code === 'already-exists') {
      return { id, created: false };
    }
    throw new Error(`Failed to reserve the creator catalog title: ${error.message}`);
  }
}

// Helper function to get all videos
async function getAllVideos() {
  if (!db) {
    return localVideoStorage().getAllVideos();
  }

  try {
    const snapshot = await db.collection('videos').get();
    const videos = [];
    snapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    return videos;
  } catch (error) {
    return localVideoStorage(error).getAllVideos();
  }
}

// Helper function to get video by ID
async function getVideoById(videoId) {
  if (!db) {
    return localVideoStorage().getVideoById(videoId);
  }

  let doc;
  try {
    doc = await db.collection('videos').doc(videoId).get();
  } catch (error) {
    return localVideoStorage(error).getVideoById(videoId);
  }
  if (!doc.exists) throw new VideoNotFoundError('Video not found');
  return { id: doc.id, ...doc.data() };
}

// Helper function to update an existing video (e.g. once Mux finishes
// transcoding and we can fill in the real playback ID/duration/status)
async function updateVideo(videoId, updates) {
  if (!db) {
    return localVideoStorage().updateVideo(videoId, updates);
  }

  try {
    await db.collection('videos').doc(videoId).update(updates);
    return true;
  } catch (error) {
    return localVideoStorage(error).updateVideo(videoId, updates);
  }
}

async function updatePodcastIngestion(videoId, expected, updates) {
  if (!db) return localVideoStorage().updatePodcastIngestion(videoId, expected, updates);
  try {
    const ref = db.collection('videos').doc(videoId);
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || !podcastIngestionMatches(snapshot.data(), expected)) return false;
      transaction.update(ref, updates);
      return true;
    });
  } catch (error) {
    return localVideoStorage(error).updatePodcastIngestion(videoId, expected, updates);
  }
}

async function deleteVideo(videoId) {
  if (!db) {
    return localVideoStorage().deleteVideo(videoId);
  }

  await db.collection('videos').doc(videoId).delete();
  return true;
}

// Helper function to find a video by its associated Mux direct-upload ID
async function getVideoByUploadId(uploadId) {
  if (!db) {
    return localVideoStorage().getVideoByUploadId(uploadId);
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
    return localVideoStorage(error).getVideoByUploadId(uploadId);
  }
}

// Helper function to find a video by its associated Mux asset ID
async function getVideoByAssetId(assetId) {
  if (!db) {
    return localVideoStorage().getVideoByAssetId(assetId);
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
    return localVideoStorage(error).getVideoByAssetId(assetId);
  }
}

async function getVideoByCreatorProjectId(creatorProjectId) {
  if (!db) {
    return localVideoStorage().getVideoByCreatorProjectId(creatorProjectId);
  }

  try {
    const snapshot = await db
      .collection('videos')
      .where('creatorProjectId', '==', creatorProjectId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    throw new Error(`Failed to look up the creator catalog title: ${error.message}`);
  }
}

// Helper function to get all categories
async function getCategories() {
  if (!db) {
    return localVideoStorage().getCategories();
  }

  try {
    const snapshot = await db.collection('categories').get();
    const categories = [];
    snapshot.forEach((doc) => {
      categories.push({ id: doc.id, ...doc.data() });
    });
    return categories;
  } catch (error) {
    return localVideoStorage(error).getCategories();
  }
}

// Helper function to get ONLY approved videos (public facing)
async function getApprovedVideos() {
  if (!db) {
    return localVideoStorage().getApprovedVideos();
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
    throw new Error(`The production catalog is temporarily unavailable: ${error.message}`);
  }
}

// Helper function to get all videos (admin only)
async function getAllVideosAdmin() {
  if (!db) {
    return localVideoStorage().getAllVideosAdmin();
  }

  try {
    const snapshot = await db.collection('videos').orderBy('submittedAt', 'desc').get();
    const videos = [];
    snapshot.forEach((doc) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    return videos;
  } catch (error) {
    return localVideoStorage(error).getAllVideosAdmin();
  }
}

// Helper function to update video approval status
async function updateVideoApproval(videoId, approvalData) {
  if (!db) {
    return localVideoStorage().updateVideoApproval(videoId, approvalData);
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
    return localVideoStorage(error).updateVideoApproval(videoId, approvalData);
  }
}

module.exports = {
  db,
  auth,
  VideoNotFoundError,
  createUser,
  getUserById,
  grantAdminRole,
  addVideo,
  createCreatorVideo,
  getAllVideos,
  getApprovedVideos,
  getAllVideosAdmin,
  updateVideoApproval,
  getVideoById,
  updateVideo,
  updatePodcastIngestion,
  deleteVideo,
  getVideoByUploadId,
  getVideoByAssetId,
  getVideoByCreatorProjectId,
  getCategories,
};

const express = require('express');
const admin = require('firebase-admin');
const { db, getApprovedVideos } = require('../firebase');
const { verifyToken } = require('../middleware/auth');
const { restoredWatchProgress } = require('../watchProgress');
const { eligibleForPlatform, platformFromRequest } = require('../catalog/platformEligibility');

const router = express.Router();

router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
  });
  res.vary('X-PROtv-Platform');
  if (platformFromRequest(req) === 'ios') res.set('X-PROtv-Platform-Policy', 'ios-rights-v1');
  next();
});

function requireFirestore(res) {
  if (db) return true;
  res.status(503).json({ error: 'Favorites are temporarily unavailable.' });
  return false;
}

async function eligibleTitleIdsForRequest(req) {
  if (platformFromRequest(req) !== 'ios') return null;
  const videos = await getApprovedVideos();
  return new Set(eligibleForPlatform(videos, 'ios').map(({ id }) => id));
}

router.get('/me/favorites', verifyToken, async (req, res, next) => {
  if (!requireFirestore(res)) return;
  try {
    const profile = await db.collection('users').doc(req.user.uid).get();
    const favorites = profile.exists && Array.isArray(profile.data().favoriteVideoIds)
      ? profile.data().favoriteVideoIds
      : [];
    const eligibleIds = await eligibleTitleIdsForRequest(req);
    res.json(eligibleIds ? favorites.filter((id) => eligibleIds.has(id)) : favorites);
  } catch (error) {
    next(error);
  }
});

router.put('/me/favorites/:videoId', verifyToken, async (req, res, next) => {
  if (!requireFirestore(res)) return;
  const { videoId } = req.params;
  const { favorite } = req.body;
  if (typeof favorite !== 'boolean') {
    return res.status(400).json({ error: 'favorite must be a boolean.' });
  }

  try {
    const eligibleIds = await eligibleTitleIdsForRequest(req);
    if (favorite && eligibleIds && !eligibleIds.has(videoId)) {
      return res.status(404).json({ error: 'Title not found.' });
    }
    const userRef = db.collection('users').doc(req.user.uid);
    await db.runTransaction(async (transaction) => {
      const profile = await transaction.get(userRef);
      const favorites = profile.exists && Array.isArray(profile.data().favoriteVideoIds)
        ? profile.data().favoriteVideoIds
        : [];
      const nextFavorites = favorite
        ? [...new Set([...favorites, videoId])]
        : favorites.filter((id) => id !== videoId);
      transaction.set(userRef, {
        favoriteVideoIds: nextFavorites,
        updatedAt: new Date(),
      }, { merge: true });
    });
    res.json({ videoId, favorite });
  } catch (error) {
    next(error);
  }
});

// Watch progress powers both the "Continue Watching" rail and Watch History.
// Stored as a map keyed by videoId on the user doc so a single read on login
// loads everything, the same way favorites already works.
router.get('/me/progress', verifyToken, async (req, res, next) => {
  if (!requireFirestore(res)) return;
  try {
    const profile = await db.collection('users').doc(req.user.uid).get();
    // Includes entries that earlier writes stored as literal "watchProgress.<id>"
    // fields, so saved progress reappears without rewriting any record.
    const progress = profile.exists ? restoredWatchProgress(profile.data()) : {};
    const eligibleIds = await eligibleTitleIdsForRequest(req);
    res.json(eligibleIds
      ? Object.fromEntries(Object.entries(progress).filter(([id]) => eligibleIds.has(id)))
      : progress);
  } catch (error) {
    next(error);
  }
});

router.put('/me/progress/:videoId', verifyToken, async (req, res, next) => {
  if (!requireFirestore(res)) return;
  const { videoId } = req.params;
  const { positionSeconds, durationSeconds } = req.body;
  if (
    typeof positionSeconds !== 'number' ||
    typeof durationSeconds !== 'number' ||
    durationSeconds <= 0 ||
    positionSeconds < 0
  ) {
    return res.status(400).json({ error: 'positionSeconds and durationSeconds must be positive numbers.' });
  }

  const progressPercent = Math.min(100, Math.max(0, Math.round((positionSeconds / durationSeconds) * 100)));
  const entry = { positionSeconds, durationSeconds, progressPercent, updatedAt: Date.now() };

  try {
    const eligibleIds = await eligibleTitleIdsForRequest(req);
    if (eligibleIds && !eligibleIds.has(videoId)) {
      return res.status(404).json({ error: 'Title not found.' });
    }
    const userRef = db.collection('users').doc(req.user.uid);
    // set() treats a dotted key as a literal top-level field name (only
    // update() reads it as a path), so write the nested map, which merge
    // combines with sibling titles, and remove any literal legacy field.
    await userRef.set({
      watchProgress: { [videoId]: entry },
      [`watchProgress.${videoId}`]: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    res.json({ videoId, ...entry });
  } catch (error) {
    next(error);
  }
});

router.delete('/me/progress/:videoId', verifyToken, async (req, res, next) => {
  if (!requireFirestore(res)) return;
  const { videoId } = req.params;
  try {
    const userRef = db.collection('users').doc(req.user.uid);
    await userRef.set(
      {
        watchProgress: { [videoId]: admin.firestore.FieldValue.delete() },
        [`watchProgress.${videoId}`]: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
    res.json({ videoId, removed: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

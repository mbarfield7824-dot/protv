const express = require('express');
const admin = require('firebase-admin');
const { db } = require('../firebase');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

function requireFirestore(res) {
  if (db) return true;
  res.status(503).json({ error: 'Favorites are temporarily unavailable.' });
  return false;
}

router.get('/me/favorites', verifyToken, async (req, res, next) => {
  if (!requireFirestore(res)) return;
  try {
    const profile = await db.collection('users').doc(req.user.uid).get();
    res.json(profile.exists && Array.isArray(profile.data().favoriteVideoIds)
      ? profile.data().favoriteVideoIds
      : []);
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
    res.json(profile.exists && profile.data().watchProgress ? profile.data().watchProgress : {});
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
    const userRef = db.collection('users').doc(req.user.uid);
    // Dot-notation targets just this one nested key so sibling titles in
    // watchProgress aren't clobbered by the merge.
    await userRef.set({ [`watchProgress.${videoId}`]: entry }, { merge: true });
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
      { [`watchProgress.${videoId}`]: admin.firestore.FieldValue.delete() },
      { merge: true }
    );
    res.json({ videoId, removed: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

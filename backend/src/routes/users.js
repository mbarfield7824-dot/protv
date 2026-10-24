const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('../firebase');
const { requireRecentAuthentication, requireInteractiveUserSession, verifyToken } = require('../middleware/auth');
const { restoredWatchProgress } = require('../watchProgress');
const { createAccountDeletionRequestService } = require('../accountDeletionRequests');
const { createAccountDeletionRequestRouter } = require('./accountDeletionRequests');

const router = express.Router();
const deletionRequests = createAccountDeletionRequestService({ getDb: () => db });
router.use('/me/deletion-request', createAccountDeletionRequestRouter({
  service: deletionRequests,
  verifyToken,
  requireInteractiveUserSession,
  requireRecentAuthentication,
}));

function requireFirestore(res, message = 'Favorites are temporarily unavailable.') {
  if (db) return true;
  res.status(503).json({ error: message });
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
    // Includes entries that earlier writes stored as literal "watchProgress.<id>"
    // fields, so saved progress reappears without rewriting any record.
    res.json(profile.exists ? restoredWatchProgress(profile.data()) : {});
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
    // set() treats a dotted key as a literal top-level field name (only
    // update() reads it as a path), so write the nested map, which merge
    // combines with sibling titles, and remove any literal legacy field.
    await userRef.set({
      watchProgress: { [videoId]: entry },
      [`watchProgress.${videoId}`]: FieldValue.delete(),
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
        watchProgress: { [videoId]: FieldValue.delete() },
        [`watchProgress.${videoId}`]: FieldValue.delete(),
      },
      { merge: true }
    );
    res.json({ videoId, removed: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

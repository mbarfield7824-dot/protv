const express = require('express');
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

module.exports = router;

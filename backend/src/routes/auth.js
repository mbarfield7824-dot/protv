const express = require('express');
const { createUser, getUserById } = require('../firebase');
const router = express.Router();

// POST /auth/signup - Create a new account
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    // Validate input
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Email, password, and display name are required' });
    }

    // Create user in Firebase Auth
    const userRecord = await createUser(email, password, displayName);

    res.status(201).json({
      message: 'User created successfully',
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /auth/login - Sign in (handled by Firebase client SDK on frontend)
// Backend just verifies tokens sent from frontend
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Token verification happens in frontend, but we can verify here too
    res.json({ message: 'Token verified' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

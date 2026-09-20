const express = require('express');
const { createUser, getUserById } = require('../firebase');
const { verifyToken } = require('../middleware/auth');
const { createCreatorSsoToken } = require('../auth/creatorSso');
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

router.post('/creator-sso', verifyToken, (req, res) => {
  const portalUrl = String(process.env.CREATOR_PORTAL_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.CREATOR_SSO_SECRET || '').trim();
  if (!portalUrl || !secret) {
    return res.status(503).json({ error: 'Creator Portal SSO is not configured.' });
  }
  if (!req.user.uid || !req.user.email) {
    return res.status(400).json({ error: 'The signed-in PROtv account does not have a usable email address.' });
  }
  if (req.user.email_verified !== true) {
    return res.status(403).json({ error: 'Verify your PROtv email address before opening the Creator Portal.' });
  }
  try {
    const token = createCreatorSsoToken({ user: req.user, secret });
    res.json({ url: `${portalUrl}/#sso=${encodeURIComponent(token)}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

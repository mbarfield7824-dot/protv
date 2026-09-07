const { auth } = require('../firebase');

// Middleware to verify Firebase ID token, OR an admin API key
// (set ADMIN_API_KEY in .env) — useful until real user auth/login exists,
// so you can manage content immediately via the admin upload page.
async function verifyToken(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY) {
    req.user = { uid: 'admin' };
    return next();
  }

  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { verifyToken };

const { auth } = require('../firebase');

async function verifyToken(req, res, next) {
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

async function verifyAdmin(req, res, next) {
  await verifyToken(req, res, () => {
    if (req.user.admin !== true) {
      return res.status(403).json({ error: 'Admin access is required.' });
    }
    next();
  });
}

module.exports = { verifyToken, verifyAdmin };

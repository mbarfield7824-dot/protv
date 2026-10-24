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

function requireInteractiveUserSession(req, res, next) {
  const provider = req.user?.firebase?.sign_in_provider;
  if (provider !== 'password' && provider !== 'google.com') {
    return res.status(403).json({ error: 'An interactive PROtv sign-in is required.' });
  }
  return next();
}

function createRecentAuthenticationMiddleware({ getAuth = () => auth, now = () => Date.now() } = {}) {
  return async function requireRecentAuthentication(req, res, next) {
    const token = req.headers.authorization?.split('Bearer ')[1];
    try {
      const decodedToken = await getAuth().verifyIdToken(token, true);
      if (decodedToken.uid !== req.user?.uid) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.user = decodedToken;
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const authTime = req.user?.auth_time;
    const nowSeconds = Math.floor(now() / 1000);
    if (
      !Number.isInteger(authTime)
      || authTime > nowSeconds + 60
      || nowSeconds - authTime > 5 * 60
    ) {
      return res.status(403).json({ error: 'Sign in again to verify your identity before requesting account deletion.' });
    }
    return next();
  };
}

const requireRecentAuthentication = createRecentAuthenticationMiddleware();

async function verifyAdmin(req, res, next) {
  await verifyToken(req, res, () => {
    requireInteractiveUserSession(req, res, () => {
      if (req.user.admin !== true) {
        return res.status(403).json({ error: 'Admin access is required.' });
      }
      next();
    });
  });
}

module.exports = {
  verifyToken,
  requireInteractiveUserSession,
  createRecentAuthenticationMiddleware,
  requireRecentAuthentication,
  verifyAdmin,
};

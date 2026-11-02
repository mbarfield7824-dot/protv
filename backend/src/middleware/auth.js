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

function createOptionalTokenVerifier(tokenAuth = auth) {
  return async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (authorization === undefined) {
      req.user = null;
      return next();
    }

    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) return res.status(401).json({ error: 'Invalid authorization header.' });
    if (!tokenAuth) return res.status(503).json({ error: 'Account authentication is temporarily unavailable.' });

    try {
      req.user = await tokenAuth.verifyIdToken(match[1]);
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token.' });
    }
  };
}

const verifyOptionalToken = createOptionalTokenVerifier();
function requireInteractiveUserSession(req, res, next) {
  const provider = req.user?.firebase?.sign_in_provider;
  if (provider !== 'password' && provider !== 'google.com') {
    return res.status(403).json({ error: 'An interactive PROtv sign-in is required.' });
  }
  return next();
}

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
  verifyOptionalToken,
  createOptionalTokenVerifier,
  requireInteractiveUserSession,
  verifyAdmin,
};

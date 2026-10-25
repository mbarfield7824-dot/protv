const { auth } = require('../firebase');

const MAX_AUTHENTICATION_AGE_SECONDS = 5 * 60;
const CLOCK_SKEW_SECONDS = 60;

// Runs after verifyToken. Re-verifies the same ID token with revocation checking and
// requires a sign-in within the last five minutes, so a stale or revoked browser
// session cannot submit an account deletion request.
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

    const authTime = req.user.auth_time;
    const nowSeconds = Math.floor(now() / 1000);
    if (
      !Number.isInteger(authTime)
      || authTime > nowSeconds + CLOCK_SKEW_SECONDS
      || nowSeconds - authTime > MAX_AUTHENTICATION_AGE_SECONDS
    ) {
      return res.status(403).json({
        error: 'Sign in again to verify your identity before requesting account deletion.',
        code: 'recent_sign_in_required',
      });
    }
    return next();
  };
}

const requireRecentAuthentication = createRecentAuthenticationMiddleware();

module.exports = { createRecentAuthenticationMiddleware, requireRecentAuthentication };

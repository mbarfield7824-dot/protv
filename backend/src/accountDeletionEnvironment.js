// Deletion requests and reviews write durable records about real accounts, so they run
// only on the Production deployment or against the Firebase emulator. Everything else
// fails closed: Vercel Preview deployments, a Vercel deployment without VERCEL_ENV, and a
// local backend started with real credentials.
function accountDeletionAvailable(env = process.env) {
  if (env.VERCEL) return env.VERCEL_ENV === 'production';
  return Boolean(env.FIRESTORE_EMULATOR_HOST && env.FIREBASE_AUTH_EMULATOR_HOST);
}

function requireAccountDeletionEnvironment({ isAvailable = () => accountDeletionAvailable() } = {}) {
  return function accountDeletionEnvironment(req, res, next) {
    if (isAvailable()) return next();
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({
      error: 'Account deletion requests are only available on watchprotv.com.',
      code: 'deletion_unavailable_in_environment',
    });
  };
}

module.exports = { accountDeletionAvailable, requireAccountDeletionEnvironment };

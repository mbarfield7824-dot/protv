function createAccountDeletionHandler({ db, auth, enabled = () => process.env.ACCOUNT_DELETION_ENABLED === 'true', now = Date.now }) {
  return async (req, res, next) => {
    if (!enabled()) return res.status(503).json({ error: 'Automatic account deletion is not enabled. Contact support@watchprotv.com.' });
    if (!db || !auth) return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: 'Sign in again before deleting your account.' });
    let user;
    try {
      user = await auth.verifyIdToken(match[1], true);
    } catch {
      return res.status(401).json({ error: 'Sign in again before deleting your account.' });
    }
    if (!user.uid || !Number.isFinite(user.auth_time) || user.auth_time * 1000 > now()
      || now() - user.auth_time * 1000 > 5 * 60 * 1000
      || !['password', 'google.com'].includes(user.firebase?.sign_in_provider)) {
      return res.status(403).json({ error: 'A recent interactive sign-in is required to delete your account.' });
    }
    if (user.admin === true || user.creator === true) {
      return res.status(409).json({ error: 'Contact support to delete an administrative or creator account and review retained records.' });
    }
    try {
      await auth.revokeRefreshTokens(user.uid);
      let sessions;
      do {
        sessions = await db.collection('deviceSessions').where('approvedByUid', '==', user.uid).limit(200).get();
        if (sessions.size) {
          const batch = db.batch();
          for (const session of sessions.docs) batch.delete(session.ref);
          await batch.commit();
        }
      } while (sessions.size === 200);
      await db.recursiveDelete(db.collection('users').doc(user.uid));
      await auth.deleteUser(user.uid);
      return res.json({ deleted: true });
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createAccountDeletionHandler };

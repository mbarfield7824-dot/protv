// On-device TV sign-in, sign-up and password recovery (Roku certification
// 2.2: sign-in happens entirely on the TV; no website code linking).
//
// The TV sends the email and password here. The backend checks them with
// Firebase's standard email/password endpoints and returns a custom token for
// the same Firebase user, so the TV session is a "custom" sign-in. Such
// sessions carry the user's stored claims (an admin account still has
// admin: true), but requireInteractiveUserSession and verifyAdmin reject every
// provider except password and google.com, so a TV session never has
// administrative capability. tvSessionRestrictions.test.js verifies this.
//
// Passwords are never stored or logged, and request bodies never reach logs.
const crypto = require('crypto');
const express = require('express');
const { reportingClientAddress } = require('../reports/clientAddress');

const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';
const RATE_LIMITS = 'tvAuthRateLimits';
const MINUTE = 60 * 1000;
const LIMITS = {
  signInClient: { limit: 10, windowMs: 15 * MINUTE },
  signInEmail: { limit: 8, windowMs: 15 * MINUTE },
  signUpClient: { limit: 5, windowMs: 60 * MINUTE },
  resetClient: { limit: 5, windowMs: 60 * MINUTE },
  resetEmail: { limit: 3, windowMs: 60 * MINUTE },
};
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 6; // Same minimum as the website sign-up form.
const MAX_PASSWORD = 128;
const REQUEST_TIMEOUT_MS = 10000;

class TvAuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const errors = {
  invalidRequest: () => new TvAuthError(400, 'invalid_request', 'Enter a valid email address and a password of at least 6 characters.'),
  invalidCredentials: () => new TvAuthError(401, 'invalid_credentials', "That email and password don't match a PROtv account."),
  disabled: () => new TvAuthError(403, 'account_disabled', 'This PROtv account is disabled. Contact support@watchprotv.com.'),
  emailExists: () => new TvAuthError(409, 'email_exists', 'An account already uses this email. Choose Sign in instead.'),
  weakPassword: () => new TvAuthError(400, 'weak_password', 'Choose a password of at least 6 characters.'),
  rateLimited: () => new TvAuthError(429, 'rate_limited', 'Too many attempts. Wait a few minutes and try again.'),
  unavailable: () => new TvAuthError(503, 'unavailable', 'PROtv sign-in is temporarily unavailable. Try again shortly.'),
};

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function validEmail(value) {
  return typeof value === 'string' && value.trim().length <= 254 && EMAIL_PATTERN.test(value.trim());
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= MIN_PASSWORD && value.length <= MAX_PASSWORD;
}

// Firebase REST errors look like { error: { message: "CODE : detail" } }.
function firebaseErrorCode(data) {
  const message = data && data.error && typeof data.error.message === 'string' ? data.error.message : '';
  return message.split(' : ')[0].trim();
}

function createTvAuthService(options = {}) {
  const getDb = options.getDb || (() => require('../firebase').db);
  const getAuth = options.getAuth || (() => require('../firebase').auth);
  const apiKey = options.apiKey !== undefined
    ? options.apiKey
    // The website's public web key; production already defines VITE_FIREBASE_API_KEY.
    : String(process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '').trim();
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => Date.now());
  const identityUrl = options.identityUrl || IDENTITY_URL; // Tests point this at the Auth emulator.

  function requireReady() {
    const db = getDb();
    const auth = getAuth();
    if (!db || !auth || typeof auth.createCustomToken !== 'function' || !apiKey) throw errors.unavailable();
    return { db, auth };
  }

  async function identity(method, body) {
    let response;
    try {
      response = await fetchImpl(`${identityUrl}:${method}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw errors.unavailable();
    }
    const data = await response.json().catch(() => null);
    return { ok: response.ok, data, code: response.ok ? '' : firebaseErrorCode(data) };
  }

  // Fixed-window counters keyed by a hash, so no raw email or address is
  // stored. One document per key is reused across windows, so storage stays
  // bounded by distinct keys; the Firestore TTL policy on expiresAt removes
  // keys that go quiet. Transactions keep concurrent requests exact.
  async function consume(db, scope, key, { limit, windowMs }) {
    const windowIndex = Math.floor(now() / windowMs);
    const ref = db.collection(RATE_LIMITS).doc(`${scope}_${sha256Hex(key)}`);
    const allowed = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.exists ? snapshot.data() : null;
      const count = data && data.windowIndex === windowIndex ? Number(data.count) || 0 : 0;
      if (count >= limit) return false;
      transaction.set(ref, {
        scope,
        count: count + 1,
        windowIndex,
        windowStart: new Date(windowIndex * windowMs),
        expiresAt: new Date((windowIndex + 1) * windowMs),
      });
      return true;
    });
    if (!allowed) throw errors.rateLimited();
  }

  async function mint(auth, uid) {
    if (typeof uid !== 'string' || !uid) throw errors.unavailable();
    try {
      // No developer claims; restriction comes from the "custom" provider.
      return await auth.createCustomToken(uid);
    } catch {
      throw errors.unavailable();
    }
  }

  async function signIn({ email, password, client }) {
    if (!validEmail(email) || typeof password !== 'string' || !password || password.length > MAX_PASSWORD) {
      throw errors.invalidRequest();
    }
    const { db, auth } = requireReady();
    const normalized = email.trim().toLowerCase();
    await consume(db, 'signin_client', client, LIMITS.signInClient);
    await consume(db, 'signin_email', normalized, LIMITS.signInEmail);
    const result = await identity('signInWithPassword', { email: email.trim(), password, returnSecureToken: true });
    if (!result.ok) {
      if (['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_EMAIL', 'MISSING_PASSWORD'].includes(result.code)) {
        throw errors.invalidCredentials();
      }
      if (result.code === 'USER_DISABLED') throw errors.disabled();
      if (result.code === 'TOO_MANY_ATTEMPTS_TRY_LATER') throw errors.rateLimited();
      throw errors.unavailable();
    }
    return { customToken: await mint(auth, result.data && result.data.localId) };
  }

  async function signUp({ email, password, client }) {
    if (!validEmail(email)) throw errors.invalidRequest();
    if (!validPassword(password)) throw errors.weakPassword();
    const { db, auth } = requireReady();
    await consume(db, 'signup_client', client, LIMITS.signUpClient);
    const result = await identity('signUp', { email: email.trim(), password, returnSecureToken: true });
    if (!result.ok) {
      if (result.code === 'EMAIL_EXISTS') throw errors.emailExists();
      if (result.code.startsWith('WEAK_PASSWORD') || result.code.startsWith('PASSWORD_DOES_NOT_MEET_REQUIREMENTS')) throw errors.weakPassword();
      if (result.code === 'INVALID_EMAIL') throw errors.invalidRequest();
      if (result.code === 'TOO_MANY_ATTEMPTS_TRY_LATER') throw errors.rateLimited();
      throw errors.unavailable();
    }
    // Same policy as the website: send the verification email, do not block.
    let verificationEmailSent = false;
    if (result.data && typeof result.data.idToken === 'string') {
      const verification = await identity('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: result.data.idToken }).catch(() => ({ ok: false }));
      verificationEmailSent = verification.ok === true;
    }
    return { customToken: await mint(auth, result.data && result.data.localId), verificationEmailSent };
  }

  // Always the same answer for known and unknown emails.
  async function requestPasswordReset({ email, client }) {
    if (!validEmail(email)) throw errors.invalidRequest();
    const { db } = requireReady();
    await consume(db, 'reset_client', client, LIMITS.resetClient);
    await consume(db, 'reset_email', email.trim().toLowerCase(), LIMITS.resetEmail);
    const result = await identity('sendOobCode', { requestType: 'PASSWORD_RESET', email: email.trim() });
    if (!result.ok && result.code !== 'EMAIL_NOT_FOUND') {
      if (result.code === 'RESET_PASSWORD_EXCEED_LIMIT' || result.code === 'TOO_MANY_ATTEMPTS_TRY_LATER') throw errors.rateLimited();
      throw errors.unavailable();
    }
    return { status: 'sent' };
  }

  return { signIn, signUp, requestPasswordReset };
}

function createTvAuthRouter({ service = createTvAuthService(), clientAddress = reportingClientAddress } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const handle = (action) => async (req, res) => {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      res.status(200).json(await action({ email: body.email, password: body.password, client: clientAddress(req) }));
    } catch (error) {
      if (error instanceof TvAuthError) return res.status(error.status).json({ error: error.message, code: error.code });
      // Never log the request or the error message: either could carry credentials.
      console.error('TV sign-in failure:', error && error.name);
      const fallback = errors.unavailable();
      return res.status(fallback.status).json({ error: fallback.message, code: fallback.code });
    }
  };
  router.post('/sign-in', handle((input) => service.signIn(input)));
  router.post('/sign-up', handle((input) => service.signUp(input)));
  router.post('/password-reset', handle((input) => service.requestPasswordReset({ email: input.email, client: input.client })));
  return router;
}

module.exports = { createTvAuthService, createTvAuthRouter, TvAuthError, LIMITS, MIN_PASSWORD };

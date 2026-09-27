const crypto = require('crypto');
const express = require('express');

const SESSIONS = 'deviceSessions';
const ACTIVATION_CODES = 'deviceActivationCodes';
const RATE_LIMITS = 'deviceRateLimits';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_SECONDS = 5;
const ISSUANCE_LEASE_MS = 30 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const DEFAULT_VERIFICATION_URL = 'https://watchprotv.com/activate';
const DEFAULT_CREATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_APPROVE_ATTEMPT_LIMIT = 10;
const DEFAULT_APPROVE_WINDOW_MS = 15 * 60 * 1000;
const DUMMY_SECRET_HASH = '0'.repeat(64);

class DeviceSessionError extends Error {
  constructor(status, body) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}

const unavailable = () => new DeviceSessionError(503, { error: 'Device activation is temporarily unavailable.' });
const notFound = () => new DeviceSessionError(404, { error: 'Device session not found.' });
const invalidCode = () => new DeviceSessionError(404, { error: 'This activation code is invalid or has expired.' });

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Always performs a fixed-length constant-time comparison, including for
// unknown sessions, so callers cannot distinguish failure causes by timing.
function secretMatches(storedHash, secret) {
  const valid = typeof storedHash === 'string' && /^[0-9a-f]{64}$/.test(storedHash);
  const expected = Buffer.from(valid ? storedHash : DUMMY_SECRET_HASH, 'hex');
  const actual = Buffer.from(sha256Hex(typeof secret === 'string' ? secret : ''), 'hex');
  return crypto.timingSafeEqual(expected, actual) && valid;
}

function toMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  const millis = Number(value);
  return Number.isFinite(millis) ? millis : 0;
}

function normalizeActivationCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

function formatActivationCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function positiveIntegerFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function publicStatus(session, nowMs) {
  if (session.status === 'consumed') return 'consumed';
  if (nowMs >= toMillis(session.expiresAt)) return 'expired';
  if (session.status === 'pending') return 'pending';
  if (session.status === 'approved' || session.status === 'issuing') return 'approved';
  return 'expired';
}

function createDeviceSessionService(options = {}) {
  const getDb = options.getDb || (() => require('../firebase').db);
  const getAuth = options.getAuth || (() => require('../firebase').auth);
  const now = options.now || (() => Date.now());
  const randomBytes = options.randomBytes || crypto.randomBytes;

  function requireDb() {
    const db = getDb();
    if (!db) throw unavailable();
    return db;
  }

  function generateCode() {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    // 256 is a multiple of the 32-character alphabet, so masking is unbiased.
    for (let index = 0; index < CODE_LENGTH; index += 1) code += CODE_ALPHABET[bytes[index] & 31];
    return code;
  }

  async function consumeRateLimit(db, scope, key, limit, windowMs) {
    const windowIndex = Math.floor(now() / windowMs);
    const ref = db.collection(RATE_LIMITS).doc(`${scope}_${key}_${windowIndex}`);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const count = snapshot.exists ? Number(snapshot.data().count) || 0 : 0;
      if (count >= limit) return false;
      transaction.set(ref, {
        scope,
        count: count + 1,
        windowStart: new Date(windowIndex * windowMs),
        expiresAt: new Date((windowIndex + 1) * windowMs),
      });
      return true;
    });
  }

  async function createSession() {
    const db = requireDb();
    const createLimit = options.createLimitPerMinute
      || positiveIntegerFromEnv('DEVICE_SESSION_CREATE_LIMIT_PER_MINUTE', DEFAULT_CREATE_LIMIT_PER_MINUTE);
    if (!(await consumeRateLimit(db, 'create', 'global', createLimit, 60 * 1000))) {
      throw new DeviceSessionError(429, { error: 'Too many device sign-in requests. Try again shortly.' });
    }

    const sessionId = randomBytes(32).toString('base64url');
    const deviceSecret = randomBytes(32).toString('base64url');
    const secretHash = sha256Hex(deviceSecret);
    const verificationUrl = options.verificationUrl
      || String(process.env.DEVICE_ACTIVATION_URL || '').trim()
      || DEFAULT_VERIFICATION_URL;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const userCode = generateCode();
      const createdAtMs = now();
      const expiresAt = new Date(createdAtMs + SESSION_TTL_MS);
      const sessionRef = db.collection(SESSIONS).doc(sessionId);
      const codeRef = db.collection(ACTIVATION_CODES).doc(userCode);

      const created = await db.runTransaction(async (transaction) => {
        const codeSnapshot = await transaction.get(codeRef);
        const sessionSnapshot = await transaction.get(sessionRef);
        if (sessionSnapshot.exists) throw unavailable();
        if (codeSnapshot.exists && toMillis(codeSnapshot.data().expiresAt) > createdAtMs) return false;
        transaction.set(sessionRef, {
          secretHash,
          userCode,
          status: 'pending',
          createdAt: new Date(createdAtMs),
          expiresAt,
          approvedAt: null,
          approvedByUid: null,
          approvedProvider: null,
          issuanceId: null,
          issuanceLeaseUntil: null,
          consumedAt: null,
        });
        transaction.set(codeRef, { sessionId, expiresAt });
        return true;
      });

      if (created) {
        return {
          sessionId,
          deviceSecret,
          userCode: formatActivationCode(userCode),
          verificationUrl,
          expiresAt: expiresAt.toISOString(),
          interval: POLL_INTERVAL_SECONDS,
        };
      }
    }
    throw new DeviceSessionError(503, { error: 'Unable to allocate an activation code. Try again.' });
  }

  async function pollSession(sessionId, deviceSecret) {
    const db = requireDb();
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      secretMatches(null, deviceSecret);
      throw notFound();
    }
    const snapshot = await db.collection(SESSIONS).doc(sessionId).get();
    const session = snapshot.exists ? snapshot.data() : null;
    if (!secretMatches(session && session.secretHash, deviceSecret) || !session) throw notFound();
    return { status: publicStatus(session, now()) };
  }

  async function approveSession({ uid, provider, code }) {
    if (typeof uid !== 'string' || !uid) {
      throw new DeviceSessionError(403, { error: 'An interactive PROtv sign-in is required.' });
    }
    const normalizedCode = normalizeActivationCode(code);
    if (!normalizedCode) {
      throw new DeviceSessionError(400, { error: 'Enter the 8-character code shown on your TV.' });
    }
    const db = requireDb();
    const approveLimit = options.approveAttemptLimit || DEFAULT_APPROVE_ATTEMPT_LIMIT;
    const approveWindowMs = options.approveWindowMs || DEFAULT_APPROVE_WINDOW_MS;
    if (!(await consumeRateLimit(db, 'approve', sha256Hex(uid).slice(0, 32), approveLimit, approveWindowMs))) {
      throw new DeviceSessionError(429, { error: 'Too many activation attempts. Try again later.' });
    }

    const approvedAtMs = now();
    await db.runTransaction(async (transaction) => {
      const codeRef = db.collection(ACTIVATION_CODES).doc(normalizedCode);
      const codeSnapshot = await transaction.get(codeRef);
      if (!codeSnapshot.exists) throw invalidCode();
      const { sessionId, expiresAt: codeExpiresAt } = codeSnapshot.data();
      if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) throw invalidCode();

      const sessionRef = db.collection(SESSIONS).doc(sessionId);
      const sessionSnapshot = await transaction.get(sessionRef);
      const session = sessionSnapshot.exists ? sessionSnapshot.data() : null;
      if (
        !session
        || session.userCode !== normalizedCode
        || session.status !== 'pending'
        || approvedAtMs >= toMillis(session.expiresAt)
        || approvedAtMs >= toMillis(codeExpiresAt)
      ) {
        throw invalidCode();
      }

      transaction.update(sessionRef, {
        status: 'approved',
        approvedAt: new Date(approvedAtMs),
        approvedByUid: uid,
        approvedProvider: typeof provider === 'string' ? provider : null,
      });
      transaction.delete(codeRef);
    });
    return { status: 'approved' };
  }

  async function releaseIssuance(db, sessionRef, issuanceId) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(sessionRef);
      const session = snapshot.exists ? snapshot.data() : null;
      if (!session || session.status !== 'issuing' || session.issuanceId !== issuanceId) return;
      transaction.update(sessionRef, { status: 'approved', issuanceId: null, issuanceLeaseUntil: null });
    });
  }

  // State machine: approved -> issuing (short lease) -> consumed.
  // Only the holder of the current issuance lease can finalize, and a token is
  // returned only after finalization commits. A failed mint releases the lease;
  // a crashed holder's lease simply expires and the session becomes retryable.
  async function exchangeSession(sessionId, deviceSecret) {
    const db = requireDb();
    const auth = getAuth();
    if (!auth || typeof auth.createCustomToken !== 'function') throw unavailable();
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      secretMatches(null, deviceSecret);
      throw notFound();
    }

    const sessionRef = db.collection(SESSIONS).doc(sessionId);
    const issuanceId = randomBytes(16).toString('base64url');
    const uid = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(sessionRef);
      const session = snapshot.exists ? snapshot.data() : null;
      if (!secretMatches(session && session.secretHash, deviceSecret) || !session) throw notFound();

      const nowMs = now();
      if (session.status === 'consumed') {
        throw new DeviceSessionError(409, { error: 'This device session has already been used.', status: 'consumed' });
      }
      if (nowMs >= toMillis(session.expiresAt)) {
        throw new DeviceSessionError(410, { error: 'This device session has expired.', status: 'expired' });
      }
      if (session.status === 'pending') {
        throw new DeviceSessionError(409, { error: 'This device has not been approved yet.', status: 'pending' });
      }
      if (session.status === 'issuing' && nowMs < toMillis(session.issuanceLeaseUntil)) {
        throw new DeviceSessionError(409, { error: 'Sign-in is already being completed for this device.', status: 'issuing' });
      }
      if (
        (session.status !== 'approved' && session.status !== 'issuing')
        || typeof session.approvedByUid !== 'string'
        || !session.approvedByUid
      ) {
        throw new DeviceSessionError(410, { error: 'This device session has expired.', status: 'expired' });
      }

      transaction.update(sessionRef, {
        status: 'issuing',
        issuanceId,
        issuanceLeaseUntil: new Date(nowMs + ISSUANCE_LEASE_MS),
      });
      return session.approvedByUid;
    });

    let customToken;
    try {
      // No developer claims: TV sessions must never carry elevated privileges.
      customToken = await auth.createCustomToken(uid);
    } catch (error) {
      console.error('Device session token issuance failed:', error.message);
      await releaseIssuance(db, sessionRef, issuanceId).catch(() => {});
      throw new DeviceSessionError(503, {
        error: 'Unable to complete TV sign-in right now. Try again.',
        status: 'approved',
        retryable: true,
      });
    }

    const finalized = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(sessionRef);
      const session = snapshot.exists ? snapshot.data() : null;
      if (!session || session.status !== 'issuing' || session.issuanceId !== issuanceId) return false;
      transaction.update(sessionRef, {
        status: 'consumed',
        consumedAt: new Date(now()),
        issuanceId: null,
        issuanceLeaseUntil: null,
      });
      return true;
    });
    if (!finalized) {
      throw new DeviceSessionError(409, { error: 'Sign-in is already being completed for this device.', status: 'issuing' });
    }
    return { customToken };
  }

  return { createSession, pollSession, approveSession, exchangeSession };
}

function createDeviceSessionRouter({ service, verifyToken, requireInteractiveUserSession }) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const handle = (status, action) => async (req, res) => {
    try {
      res.status(status).json(await action(req));
    } catch (error) {
      if (error instanceof DeviceSessionError) return res.status(error.status).json(error.body);
      console.error('Device activation failure:', error.message);
      return res.status(503).json(unavailable().body);
    }
  };

  router.post('/', handle(201, () => service.createSession()));
  router.post('/approve', verifyToken, requireInteractiveUserSession, handle(200, (req) => service.approveSession({
    uid: req.user.uid,
    provider: req.user.firebase && req.user.firebase.sign_in_provider,
    code: req.body && req.body.code,
  })));
  router.get('/:sessionId', handle(200, (req) => service.pollSession(req.params.sessionId, req.get('x-device-secret'))));
  router.post('/:sessionId/exchange', handle(200, (req) => (
    service.exchangeSession(req.params.sessionId, req.get('x-device-secret'))
  )));
  return router;
}

module.exports = {
  createDeviceSessionService,
  createDeviceSessionRouter,
  normalizeActivationCode,
  DeviceSessionError,
  SESSION_TTL_MS,
  ISSUANCE_LEASE_MS,
};

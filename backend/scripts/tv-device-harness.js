// Opt-in developer test harness that behaves like a PROtv television and drives the
// existing device-activation protocol end to end. A human must approve the code on
// the real /activate page. Credentials live in memory only and are never printed.
//
// Usage (PowerShell), with values supplied by the invoking process only:
//   $env:PROTV_TV_HARNESS='1'
//   $env:PROTV_TV_HARNESS_API_BASE='http://localhost:5000'
//   $env:PROTV_TV_HARNESS_EXPECTED_UID='<dedicated non-owner test viewer UID>'
//   $env:PROTV_TV_HARNESS_ACTIVATE_ORIGIN='http://127.0.0.1:5173'   # optional
//   node scripts/tv-device-harness.js
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.resolve(__dirname, '../.env');
const HARNESS_KEY_PREFIX = 'PROTV_TV_HARNESS';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_S = 600;
const MAX_POLL_BACKOFFS = 3;
const MAX_SESSION_LIFETIME_MS = 15 * 60 * 1000;
const DEFAULT_CREATOR_PORTAL_OWNER_EMAIL = 'admin@watchprotv.com';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const POLL_STATUSES = new Set(['pending', 'approved', 'issuing', 'consumed', 'expired']);
const SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken';
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token';

class HarnessFailure extends Error {}
class HarnessInterrupted extends Error {}

function safeCode(value) {
  const code = String(value || '');
  return /^[A-Za-z0-9_./-]{1,80}$/.test(code) ? code : 'unrecognized-error';
}

// Firebase REST errors look like "INVALID_CUSTOM_TOKEN : description"; only the code is reported.
function safeRestError(body) {
  const message = body && body.error && typeof body.error.message === 'string' ? body.error.message : '';
  const code = message.split(' : ')[0].trim();
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : 'unrecognized-error';
}

function safeStatus(body) {
  const status = body && typeof body.status === 'string' ? body.status : '';
  return POLL_STATUSES.has(status) ? status : 'unknown';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseHttpUrl(value, label, { allowPath }) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new HarnessFailure(`${label} is not a valid URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HarnessFailure(`${label} must use http or https`);
  if (url.username || url.password) throw new HarnessFailure(`${label} must not contain credentials`);
  if (url.search || url.hash) throw new HarnessFailure(`${label} must not contain a query or fragment`);
  if (!allowPath && url.pathname !== '/') throw new HarnessFailure(`${label} must be an origin only`);
  return url;
}

function readHarnessConfiguration(env) {
  if (env.PROTV_TV_HARNESS !== '1') {
    throw new HarnessFailure('harness not enabled; set PROTV_TV_HARNESS=1 for this process');
  }
  if (env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new HarnessFailure('FIREBASE_AUTH_EMULATOR_HOST is set; refusing to mix emulator and live Firebase');
  }

  const apiUrl = parseHttpUrl(env.PROTV_TV_HARNESS_API_BASE, 'PROTV_TV_HARNESS_API_BASE', { allowPath: true });
  if (apiUrl.protocol === 'http:' && !LOCAL_HOSTS.has(apiUrl.hostname)) {
    throw new HarnessFailure('PROTV_TV_HARNESS_API_BASE must use https unless it targets localhost');
  }
  const apiBase = apiUrl.href.replace(/\/+$/, '');

  const expectedUid = String(env.PROTV_TV_HARNESS_EXPECTED_UID || '').trim();
  if (!expectedUid) throw new HarnessFailure('PROTV_TV_HARNESS_EXPECTED_UID must be supplied to this process');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(expectedUid)) {
    throw new HarnessFailure('PROTV_TV_HARNESS_EXPECTED_UID has an unexpected format');
  }

  let activateOrigin = null;
  if (env.PROTV_TV_HARNESS_ACTIVATE_ORIGIN !== undefined && env.PROTV_TV_HARNESS_ACTIVATE_ORIGIN !== '') {
    activateOrigin = parseHttpUrl(env.PROTV_TV_HARNESS_ACTIVATE_ORIGIN, 'PROTV_TV_HARNESS_ACTIVATE_ORIGIN', {
      allowPath: false,
    }).origin;
  }

  let timeoutS = MAX_TIMEOUT_S;
  if (env.PROTV_TV_HARNESS_TIMEOUT_S !== undefined && env.PROTV_TV_HARNESS_TIMEOUT_S !== '') {
    const raw = String(env.PROTV_TV_HARNESS_TIMEOUT_S).trim();
    timeoutS = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(timeoutS) || timeoutS < 1 || timeoutS > MAX_TIMEOUT_S) {
      throw new HarnessFailure(`PROTV_TV_HARNESS_TIMEOUT_S must be an integer from 1 to ${MAX_TIMEOUT_S}`);
    }
  }

  return { apiBase, expectedUid, activateOrigin, timeoutS };
}

// Loads existing backend configuration the same way the backend does (process
// values win over backend/.env) and initializes the Firebase Admin SDK.
function loadBackendConfiguration(options = {}) {
  const envPath = options.envPath || ENV_PATH;
  const processEnv = options.processEnv || process.env;
  const exists = options.exists || fs.existsSync;
  const readFile = options.readFile || fs.readFileSync;
  const requireFirebase = options.requireFirebase || (() => require('../src/firebase'));

  if (!exists(envPath)) throw new HarnessFailure('backend/.env was not found');
  let fileEnv;
  try {
    fileEnv = dotenv.parse(readFile(envPath));
  } catch {
    throw new HarnessFailure('backend/.env could not be read');
  }
  if (Object.keys(fileEnv).some((key) => key.startsWith(HARNESS_KEY_PREFIX))) {
    throw new HarnessFailure('harness values must not be stored in backend/.env');
  }
  for (const [key, value] of Object.entries(fileEnv)) {
    if (processEnv[key] === undefined) processEnv[key] = value;
  }

  if (processEnv.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new HarnessFailure('FIREBASE_AUTH_EMULATOR_HOST is set; refusing to mix emulator and live Firebase');
  }
  const apiKey = String(processEnv.FIREBASE_API_KEY || '').trim();
  if (!apiKey) throw new HarnessFailure('FIREBASE_API_KEY is not configured');
  const ownerEmail = String(processEnv.OWNER_EMAIL || '').trim().toLowerCase();
  if (!ownerEmail) throw new HarnessFailure('OWNER_EMAIL must be configured so the owner account can be excluded');
  const creatorOwnerEmail = String(processEnv.CREATOR_PORTAL_OWNER_EMAIL || DEFAULT_CREATOR_PORTAL_OWNER_EMAIL)
    .trim()
    .toLowerCase();

  // firebase.js logs raw initialization errors; silence it and report a sanitized result instead.
  const { log, warn, error } = console;
  let firebase;
  try {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    firebase = requireFirebase();
  } catch {
    firebase = null;
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
  const auth = firebase && firebase.auth;
  if (!auth || typeof auth.getUser !== 'function' || typeof auth.verifyIdToken !== 'function') {
    throw new HarnessFailure('Firebase Admin SDK could not be initialized from backend configuration');
  }
  // Only read-only Admin operations are exposed to the harness.
  return {
    apiKey,
    ownerEmail,
    creatorOwnerEmail,
    auth: {
      getUser: (uid) => auth.getUser(uid),
      verifyIdToken: (token) => auth.verifyIdToken(token),
    },
  };
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new HarnessInterrupted());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new HarnessInterrupted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function runHarness(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const signal = options.signal || new AbortController().signal;
  const sleep = options.sleep || ((ms) => defaultSleep(ms, signal));
  const loadBackend = options.loadBackend || (() => loadBackendConfiguration());
  const writeOut = options.out || ((line) => console.log(line));
  const writeErr = options.err || ((line) => console.error(line));
  const requestTimeoutMs = options.requestTimeoutMs || REQUEST_TIMEOUT_MS;

  // Every credential is held here and nowhere else so it can be wiped in one place.
  const vault = {
    apiKey: null,
    sessionId: null,
    deviceSecret: null,
    customToken: null,
    idToken: null,
    refreshToken: null,
    refreshedIdToken: null,
    refreshedRefreshToken: null,
  };

  // Defense in depth: any line that somehow contains a held credential is suppressed.
  const scrub = (line) => {
    const text = String(line);
    return Object.values(vault).some((secret) => typeof secret === 'string' && secret.length >= 6 && text.includes(secret))
      ? '[output suppressed: contained a credential]'
      : text;
  };
  const out = (line) => writeOut(scrub(line));
  const err = (line) => writeErr(scrub(line));
  const step = (label) => out(`STEP: ${label}`);
  const pass = (label) => out(`PASS: ${label}`);

  const checkAbort = () => {
    if (signal.aborted) throw new HarnessInterrupted();
  };

  async function request(label, url, init) {
    checkAbort();
    let response;
    try {
      response = await fetchImpl(url, {
        ...init,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]),
      });
    } catch (error) {
      checkAbort();
      if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new HarnessFailure(`${label} timed out`);
      }
      throw new HarnessFailure(`${label} request failed (network error)`);
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    checkAbort();
    return { status: response.status, body };
  }

  async function verifySession(auth, token, expectedUid, label) {
    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch (error) {
      checkAbort();
      throw new HarnessFailure(`${label} ID token verification failed (${safeCode(error && error.code)})`);
    }
    checkAbort();
    if (!decoded || decoded.uid !== expectedUid) {
      throw new HarnessFailure(`${label} ID token UID does not match the expected viewer`);
    }
    pass(`${label} ID token UID matches expected viewer`);
    const provider = decoded.firebase && decoded.firebase.sign_in_provider;
    if (provider !== 'custom') {
      throw new HarnessFailure(`${label} sign_in_provider is ${JSON.stringify(safeCode(provider))}, expected "custom"`);
    }
    pass(`${label} sign_in_provider = custom`);
    if (Object.hasOwn(decoded, 'admin')) throw new HarnessFailure(`${label} ID token unexpectedly carries an admin claim`);
    pass(`${label} ID token carries no admin claim`);
    return decoded.uid;
  }

  async function checkViewer(apiBase, token, label) {
    const headers = { Authorization: `Bearer ${token}` };
    const favorites = await request(`${label} My List`, `${apiBase}/users/me/favorites`, { method: 'GET', headers });
    if (favorites.status !== 200 || !Array.isArray(favorites.body)) {
      throw new HarnessFailure(`${label} My List request failed (HTTP ${favorites.status})`);
    }
    pass(`${label} My List readable (${favorites.body.length} item(s))`);
    const progress = await request(`${label} progress`, `${apiBase}/users/me/progress`, { method: 'GET', headers });
    if (progress.status !== 200 || !isPlainObject(progress.body)) {
      throw new HarnessFailure(`${label} progress request failed (HTTP ${progress.status})`);
    }
    pass(`${label} progress readable (${Object.keys(progress.body).length} entr${Object.keys(progress.body).length === 1 ? 'y' : 'ies'})`);
  }

  async function firebaseRest(label, url, init) {
    const result = await request(label, url, init);
    if (result.status !== 200) {
      throw new HarnessFailure(`${label} rejected (HTTP ${result.status}, ${safeRestError(result.body)})`);
    }
    if (!isPlainObject(result.body)) throw new HarnessFailure(`${label} returned an unreadable response`);
    return result.body;
  }

  try {
    step('checking harness configuration');
    const config = readHarnessConfiguration(env);
    const backend = await loadBackend();
    vault.apiKey = backend.apiKey;
    const { auth } = backend;
    pass('harness configuration');

    step('checking the dedicated test viewer (read-only)');
    let user;
    try {
      user = await auth.getUser(config.expectedUid);
    } catch (error) {
      checkAbort();
      throw new HarnessFailure(`test-viewer lookup failed (${safeCode(error && error.code)})`);
    }
    checkAbort();
    if (!user || user.uid !== config.expectedUid) throw new HarnessFailure('test-viewer lookup returned a different UID');
    if (user.disabled) throw new HarnessFailure('test viewer is disabled');
    if (user.customClaims && Object.keys(user.customClaims).length > 0) {
      throw new HarnessFailure('test viewer has custom claims; refusing to use it');
    }
    const email = String(user.email || '').trim().toLowerCase();
    if (email && (email === backend.ownerEmail || email === backend.creatorOwnerEmail)) {
      throw new HarnessFailure('test viewer is a configured owner account; refusing to use it');
    }
    pass('test-viewer safety checks');

    step('creating device session');
    const created = await request('device-session creation', `${config.apiBase}/auth/device-sessions`, { method: 'POST' });
    if (created.status === 429) throw new HarnessFailure('device-session creation rate limited (HTTP 429)');
    if (created.status !== 201 || !isPlainObject(created.body)) {
      throw new HarnessFailure(`device-session creation failed (HTTP ${created.status})`);
    }
    const session = created.body;
    if (typeof session.sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(session.sessionId)) {
      throw new HarnessFailure('device-session creation returned an invalid session identifier');
    }
    vault.sessionId = session.sessionId;
    if (typeof session.deviceSecret !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(session.deviceSecret)) {
      throw new HarnessFailure('device-session creation returned an invalid device secret');
    }
    vault.deviceSecret = session.deviceSecret;
    if (typeof session.userCode !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(session.userCode)) {
      throw new HarnessFailure('device-session creation returned an invalid activation code');
    }
    let verificationUrl;
    try {
      verificationUrl = parseHttpUrl(session.verificationUrl, 'verification URL', { allowPath: true });
    } catch {
      throw new HarnessFailure('device-session creation returned an invalid verification URL');
    }
    if (config.activateOrigin && verificationUrl.origin !== config.activateOrigin) {
      throw new HarnessFailure(
        `verification URL origin ${verificationUrl.origin} does not match PROTV_TV_HARNESS_ACTIVATE_ORIGIN`,
      );
    }
    const startedAt = now();
    const expiresAtMs = typeof session.expiresAt === 'string' ? Date.parse(session.expiresAt) : NaN;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= startedAt || expiresAtMs > startedAt + MAX_SESSION_LIFETIME_MS) {
      throw new HarnessFailure('device-session creation returned an invalid expiry');
    }
    if (!Number.isInteger(session.interval) || session.interval < 1 || session.interval > 60) {
      throw new HarnessFailure('device-session creation returned an invalid polling interval');
    }
    const intervalMs = session.interval * 1000;
    pass('device session created');

    const minutes = Math.max(1, Math.round((expiresAtMs - startedAt) / 60000));
    out('');
    out('ACTION REQUIRED (human):');
    out(`  1. Open ${verificationUrl.origin}${verificationUrl.pathname} in a normal browser.`);
    out('  2. Sign in with the dedicated test viewer (never the owner/admin account).');
    out(`  3. Enter activation code: ${session.userCode}`);
    out(`  Code expires at ${new Date(expiresAtMs).toISOString()} (about ${minutes} minute(s)).`);
    out('');

    step(`polling for approval every ${session.interval}s`);
    const timeoutDeadline = startedAt + config.timeoutS * 1000;
    const deadline = Math.min(expiresAtMs, timeoutDeadline);
    const deadlineFailure = () => new HarnessFailure(
      expiresAtMs <= timeoutDeadline ? 'session expired before approval' : 'polling timed out before approval',
    );
    const pollUrl = `${config.apiBase}/auth/device-sessions/${encodeURIComponent(vault.sessionId)}`;
    let waitMs = intervalMs;
    let backoffs = 0;
    for (;;) {
      if (now() + waitMs > deadline) throw deadlineFailure();
      await sleep(waitMs);
      checkAbort();
      const polled = await request('approval poll', pollUrl, {
        method: 'GET',
        headers: { 'x-device-secret': vault.deviceSecret },
      });
      if (polled.status === 429 || polled.status === 503) {
        backoffs += 1;
        if (backoffs > MAX_POLL_BACKOFFS) {
          throw new HarnessFailure(
            polled.status === 429 ? 'approval polling rate limited (HTTP 429)' : 'approval polling unavailable (HTTP 503)',
          );
        }
        waitMs = intervalMs * (2 ** backoffs);
        out(`WAIT: server busy (HTTP ${polled.status}); backing off ${waitMs / 1000}s`);
        continue;
      }
      if (polled.status === 404) throw new HarnessFailure('approval poll rejected (HTTP 404: session not found or wrong secret)');
      if (polled.status !== 200) throw new HarnessFailure(`approval poll failed (HTTP ${polled.status})`);
      const status = safeStatus(polled.body);
      backoffs = 0;
      waitMs = intervalMs;
      if (status === 'approved') break;
      if (status === 'pending') continue;
      if (status === 'expired') throw new HarnessFailure('session expired before approval');
      if (status === 'issuing' || status === 'consumed') {
        throw new HarnessFailure(`session is unexpectedly ${status}; it may have been exchanged elsewhere`);
      }
      throw new HarnessFailure('approval poll returned an unrecognized status');
    }
    pass('device approved by human');

    step('exchanging approved session (single attempt, no automatic retry)');
    const exchanged = await request(
      'session exchange',
      `${config.apiBase}/auth/device-sessions/${encodeURIComponent(vault.sessionId)}/exchange`,
      { method: 'POST', headers: { 'x-device-secret': vault.deviceSecret } },
    );
    if (exchanged.status !== 200) {
      const detail = exchanged.status === 404 ? 'session not found or wrong secret' : safeStatus(exchanged.body);
      const retry = exchanged.status === 503 && exchanged.body && exchanged.body.retryable === true
        ? '; server marked it retryable but the harness never retries automatically'
        : '';
      throw new HarnessFailure(`session exchange rejected (HTTP ${exchanged.status}, ${detail}${retry})`);
    }
    if (!isPlainObject(exchanged.body) || typeof exchanged.body.customToken !== 'string' || !exchanged.body.customToken) {
      throw new HarnessFailure('session exchange returned no custom token');
    }
    vault.customToken = exchanged.body.customToken;
    vault.deviceSecret = null;
    pass('custom token received');

    step('exchanging custom token for a Firebase session');
    const signIn = await firebaseRest('Firebase signInWithCustomToken', `${SIGN_IN_URL}?key=${encodeURIComponent(vault.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: vault.customToken, returnSecureToken: true }),
    });
    vault.customToken = null;
    if (!isPlainObject(signIn)
      || typeof signIn.idToken !== 'string' || !signIn.idToken
      || typeof signIn.refreshToken !== 'string' || !signIn.refreshToken) {
      throw new HarnessFailure('Firebase signInWithCustomToken did not return a complete session');
    }
    vault.idToken = signIn.idToken;
    vault.refreshToken = signIn.refreshToken;
    pass('Firebase session established');

    const verifiedUid = await verifySession(auth, vault.idToken, config.expectedUid, 'initial');
    await checkViewer(config.apiBase, vault.idToken, 'initial');

    step('refreshing Firebase session');
    const refreshed = await firebaseRest('Firebase token refresh', `${REFRESH_URL}?key=${encodeURIComponent(vault.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: vault.refreshToken }).toString(),
    });
    if (typeof refreshed.id_token !== 'string' || !refreshed.id_token) {
      throw new HarnessFailure('Firebase token refresh did not return an ID token');
    }
    vault.refreshedIdToken = refreshed.id_token;
    if (typeof refreshed.refresh_token === 'string') vault.refreshedRefreshToken = refreshed.refresh_token;
    if (refreshed.user_id !== undefined && refreshed.user_id !== verifiedUid) {
      throw new HarnessFailure('Firebase token refresh returned a different user');
    }
    pass('Firebase session refreshed for the same user');

    await verifySession(auth, vault.refreshedIdToken, verifiedUid, 'refreshed');
    await checkViewer(config.apiBase, vault.refreshedIdToken, 'refreshed');

    out('PASS: PROtv TV device harness completed');
    return 0;
  } catch (error) {
    if (error instanceof HarnessInterrupted || signal.aborted) {
      err('INTERRUPTED: harness stopped; in-memory credentials discarded');
      return 130;
    }
    err(`FAIL: ${error instanceof HarnessFailure ? error.message : 'unexpected error (details suppressed)'}`);
    err('FAIL: PROtv TV device harness');
    return 1;
  } finally {
    for (const key of Object.keys(vault)) vault[key] = null;
    if (typeof options.onCleanup === 'function') options.onCleanup({ ...vault });
  }
}

function main() {
  const controller = new AbortController();
  let signalExitCode = 0;
  const onSignal = (code) => () => {
    if (signalExitCode) process.exit(code);
    signalExitCode = code;
    controller.abort();
  };
  const onSigint = onSignal(130);
  const onSigterm = onSignal(143);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  const finish = (code) => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.exitCode = signalExitCode || code;
    // Firebase Admin may hold idle handles; do not let them keep the process alive.
    setTimeout(() => process.exit(process.exitCode), 2000).unref();
  };
  runHarness({ signal: controller.signal }).then(finish, () => {
    console.error('FAIL: unexpected error (details suppressed)');
    finish(1);
  });
}

if (require.main === module) main();

module.exports = {
  runHarness,
  readHarnessConfiguration,
  loadBackendConfiguration,
  HarnessFailure,
  MAX_TIMEOUT_S,
};

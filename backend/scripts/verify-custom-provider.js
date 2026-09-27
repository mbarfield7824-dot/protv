// Opt-in developer acceptance test: proves that Firebase sessions created from an
// Admin custom token report sign_in_provider "custom" before and after refresh.
// Never prints tokens, API keys, credentials or raw Firebase responses.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.resolve(__dirname, '../.env');
const REQUEST_TIMEOUT_MS = 15000;

// Opt-in values must come from the invoking process, never from backend/.env.
const optIn = process.env.PROTV_VERIFY_CUSTOM_PROVIDER;
const testUid = String(process.env.PROTV_CUSTOM_PROVIDER_TEST_UID || '').trim();

class AcceptanceFailure extends Error {}

const pass = (label) => console.log(`PASS: ${label}`);
const fail = (label) => console.error(`FAIL: ${label}`);

function safeCode(value) {
  const code = String(value || '');
  return /^[A-Za-z0-9_./-]{1,80}$/.test(code) ? code : 'unrecognized-error';
}

// Firebase REST errors use upper-case codes such as INVALID_CUSTOM_TOKEN,
// optionally followed by " : <description>". Only the code is ever reported.
function safeRestError(body) {
  const message = body && body.error && typeof body.error.message === 'string' ? body.error.message : '';
  const code = message.split(' : ')[0].trim();
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : 'unrecognized-error';
}

async function postFirebase(label, url, init) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new AcceptanceFailure(`${label} request failed (${safeCode(error && error.name)})`);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new AcceptanceFailure(`${label} rejected (HTTP ${response.status}, ${safeRestError(body)})`);
  }
  if (!body || typeof body !== 'object') {
    throw new AcceptanceFailure(`${label} returned an unreadable response`);
  }
  return body;
}

async function adminStep(label, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof AcceptanceFailure) throw error;
    throw new AcceptanceFailure(`${label} (${safeCode(error && error.code)})`);
  }
}

function assertSession(decoded, label) {
  if (!decoded || decoded.uid !== testUid) throw new AcceptanceFailure(`${label} token UID does not match the test user`);
  pass(`${label} token UID`);
  const provider = decoded.firebase && decoded.firebase.sign_in_provider;
  if (provider !== 'custom') {
    throw new AcceptanceFailure(`${label} sign_in_provider is ${JSON.stringify(safeCode(provider))}, expected "custom"`);
  }
  pass(`${label} sign_in_provider = custom`);
  if (Object.hasOwn(decoded, 'admin')) throw new AcceptanceFailure(`${label} token unexpectedly carries an admin claim`);
}

function loadConfiguration() {
  if (optIn !== '1') {
    throw new AcceptanceFailure('live test not enabled; set PROTV_VERIFY_CUSTOM_PROVIDER=1 for this process');
  }
  if (!testUid) {
    throw new AcceptanceFailure('PROTV_CUSTOM_PROVIDER_TEST_UID must be supplied to this process');
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(testUid)) {
    throw new AcceptanceFailure('PROTV_CUSTOM_PROVIDER_TEST_UID has an unexpected format');
  }
  if (!fs.existsSync(ENV_PATH)) throw new AcceptanceFailure('backend/.env was not found');

  const fileEnv = dotenv.parse(fs.readFileSync(ENV_PATH));
  if (Object.keys(fileEnv).some((key) => key.startsWith('PROTV_VERIFY_') || key.startsWith('PROTV_CUSTOM_PROVIDER_'))) {
    throw new AcceptanceFailure('acceptance-test opt-in values must not be stored in backend/.env');
  }
  const apiKey = String(fileEnv.FIREBASE_API_KEY || '').trim();
  if (!apiKey) throw new AcceptanceFailure('FIREBASE_API_KEY is not configured in backend/.env');

  dotenv.config({ path: ENV_PATH });
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new AcceptanceFailure('FIREBASE_AUTH_EMULATOR_HOST is set; refusing to mix emulator Admin calls with live Auth REST calls');
  }
  const ownerEmail = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (!ownerEmail) throw new AcceptanceFailure('OWNER_EMAIL must be configured so the owner account can be excluded');

  // firebase.js logs raw initialization errors; silence it and report a sanitized result instead.
  const { log, warn } = console;
  let firebase;
  try {
    console.log = () => {};
    console.warn = () => {};
    firebase = require('../src/firebase');
  } finally {
    console.log = log;
    console.warn = warn;
  }
  if (!firebase.auth) throw new AcceptanceFailure('Firebase Admin SDK could not be initialized from backend configuration');

  return { apiKey, ownerEmail, auth: firebase.auth };
}

async function run() {
  let auth = null;
  let sessionMayExist = false;
  let failed = false;

  try {
    const config = loadConfiguration();
    auth = config.auth;

    const user = await adminStep('test-user lookup failed', () => auth.getUser(testUid));
    const claims = user.customClaims || {};
    const email = String(user.email || '').trim().toLowerCase();
    const creatorOwnerEmail = String(process.env.CREATOR_PORTAL_OWNER_EMAIL || '').trim().toLowerCase();
    if (user.uid !== testUid) throw new AcceptanceFailure('test-user lookup returned a different UID');
    if (user.disabled) throw new AcceptanceFailure('dedicated test user is disabled');
    if (Object.keys(claims).length > 0) throw new AcceptanceFailure('dedicated test user has custom claims; refusing to use it');
    if (email && (email === config.ownerEmail || email === creatorOwnerEmail)) {
      throw new AcceptanceFailure('test UID belongs to the configured owner account; refusing to use it');
    }
    pass('dedicated test-user safety checks');

    const customToken = await adminStep('custom token creation failed', () => auth.createCustomToken(testUid));
    pass('custom token created');

    sessionMayExist = true;
    const signIn = await postFirebase(
      'signInWithCustomToken',
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    if (typeof signIn.idToken !== 'string' || typeof signIn.refreshToken !== 'string') {
      throw new AcceptanceFailure('signInWithCustomToken did not return an ID token and refresh token');
    }
    pass('custom token exchanged for Firebase session');

    const initial = await adminStep('initial ID token verification failed', () => auth.verifyIdToken(signIn.idToken));
    assertSession(initial, 'initial');

    const refreshed = await postFirebase(
      'Secure Token refresh',
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: signIn.refreshToken }).toString(),
      },
    );
    if (typeof refreshed.id_token !== 'string') throw new AcceptanceFailure('Secure Token refresh did not return an ID token');
    if (refreshed.user_id !== undefined && refreshed.user_id !== testUid) {
      throw new AcceptanceFailure('Secure Token refresh returned a different user');
    }
    pass('Firebase session refreshed');

    const afterRefresh = await adminStep('refreshed ID token verification failed', () => auth.verifyIdToken(refreshed.id_token));
    assertSession(afterRefresh, 'refreshed');
  } catch (error) {
    failed = true;
    fail(error instanceof AcceptanceFailure ? error.message : 'unexpected error (details suppressed)');
  } finally {
    if (sessionMayExist && auth) {
      try {
        await auth.revokeRefreshTokens(testUid);
        pass('test-user refresh tokens revoked');
      } catch (error) {
        failed = true;
        fail(`cleanup: revoking test-user refresh tokens failed (${safeCode(error && error.code)})`);
      }
    }
  }

  if (failed) {
    fail('PROtv custom-provider acceptance test');
    process.exitCode = 1;
  } else {
    pass('PROtv custom-provider acceptance test');
  }
}

run().catch(() => {
  console.error('FAIL: PROtv custom-provider acceptance test (unexpected error, details suppressed)');
  process.exitCode = 1;
});

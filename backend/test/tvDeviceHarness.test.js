const assert = require('node:assert/strict');
const test = require('node:test');

const {
  runHarness,
  readHarnessConfiguration,
  loadBackendConfiguration,
  HarnessFailure,
} = require('../scripts/tv-device-harness');

const API_BASE = 'http://localhost:5000';
const EXPECTED_UID = 'viewerUid123';
const START = Date.parse('2026-01-01T00:00:00.000Z');

const SECRETS = {
  apiKey: 'SENTINEL_API_KEY_a1b2c3',
  sessionId: 'SENTINELsessionIdentifier0123456789',
  deviceSecret: 'SENTINELdeviceSecret0123456789abcdef',
  customToken: 'SENTINEL_CUSTOM_TOKEN_x9y8',
  idToken: 'SENTINEL_ID_TOKEN_initial',
  refreshToken: 'SENTINEL_REFRESH_TOKEN_initial',
  refreshedIdToken: 'SENTINEL_ID_TOKEN_refreshed',
  refreshedRefreshToken: 'SENTINEL_REFRESH_TOKEN_refreshed',
};

function json(status, body) {
  return new Response(body === undefined ? 'not json' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createWorld(overrides = {}) {
  let clock = START;
  const calls = [];
  const sleeps = [];
  const stdout = [];
  const stderr = [];
  const controller = new AbortController();
  const pollResponses = [...(overrides.pollResponses || [
    () => json(200, { status: 'pending' }),
    () => json(200, { status: 'approved' }),
  ])];

  const decoded = {
    [SECRETS.idToken]: { uid: EXPECTED_UID, firebase: { sign_in_provider: 'custom' } },
    [SECRETS.refreshedIdToken]: { uid: EXPECTED_UID, firebase: { sign_in_provider: 'custom' } },
    ...overrides.decoded,
  };
  const user = { uid: EXPECTED_UID, email: 'viewer@example.com', disabled: false, customClaims: undefined, ...overrides.user };

  const auth = {
    getUserCalls: 0,
    async getUser(uid) {
      auth.getUserCalls += 1;
      if (overrides.getUserError) throw overrides.getUserError;
      return uid === EXPECTED_UID ? user : null;
    },
    async verifyIdToken(token) {
      if (!decoded[token]) throw Object.assign(new Error(`bad ${token}`), { code: 'auth/argument-error' });
      return decoded[token];
    },
  };

  const createBody = {
    sessionId: SECRETS.sessionId,
    deviceSecret: SECRETS.deviceSecret,
    userCode: 'ABCD-EFGH',
    verificationUrl: 'http://127.0.0.1:5173/activate',
    expiresAt: new Date(START + 10 * 60 * 1000).toISOString(),
    interval: 5,
    ...overrides.createBody,
  };

  const routes = {
    create: () => json(201, createBody),
    exchange: () => json(200, { customToken: SECRETS.customToken }),
    signIn: () => json(200, { idToken: SECRETS.idToken, refreshToken: SECRETS.refreshToken }),
    refresh: () => json(200, {
      id_token: SECRETS.refreshedIdToken,
      refresh_token: SECRETS.refreshedRefreshToken,
      user_id: EXPECTED_UID,
    }),
    favorites: () => json(200, ['v1', 'v2']),
    progress: () => json(200, { v1: { position: 10 } }),
    ...overrides.routes,
  };

  async function fetchImpl(url, init) {
    const headers = init.headers || {};
    const call = { url, method: init.method, headers, body: init.body, redirect: init.redirect, hasSignal: Boolean(init.signal) };
    const sessionPath = `${API_BASE}/auth/device-sessions/${SECRETS.sessionId}`;
    if (url === `${API_BASE}/auth/device-sessions` && init.method === 'POST') {
      call.kind = 'create';
    } else if (url === sessionPath && init.method === 'GET') {
      call.kind = 'poll';
    } else if (url === `${sessionPath}/exchange` && init.method === 'POST') {
      call.kind = 'exchange';
    } else if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=')) {
      call.kind = 'signIn';
    } else if (url.startsWith('https://securetoken.googleapis.com/v1/token?key=')) {
      call.kind = 'refresh';
    } else if (url === `${API_BASE}/users/me/favorites`) {
      call.kind = 'favorites';
    } else if (url === `${API_BASE}/users/me/progress`) {
      call.kind = 'progress';
    } else {
      throw new Error(`unexpected request ${url}`);
    }
    call.at = clock;
    calls.push(call);

    if (call.kind === 'poll' || call.kind === 'exchange') {
      if (headers['x-device-secret'] !== SECRETS.deviceSecret) return json(404, { error: 'Device session not found.' });
    }
    if (call.kind === 'poll') {
      const next = pollResponses.length > 1 ? pollResponses.shift() : pollResponses[0];
      return next(call);
    }
    return routes[call.kind](call);
  }

  const options = {
    env: {
      PROTV_TV_HARNESS: '1',
      PROTV_TV_HARNESS_API_BASE: API_BASE,
      PROTV_TV_HARNESS_EXPECTED_UID: EXPECTED_UID,
      ...overrides.env,
    },
    loadBackend: async () => ({
      apiKey: SECRETS.apiKey,
      ownerEmail: 'owner@example.com',
      creatorOwnerEmail: 'admin@watchprotv.com',
      auth,
    }),
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
      if (overrides.onSleep) overrides.onSleep({ controller, sleeps });
    },
    signal: controller.signal,
    out: (line) => stdout.push(String(line)),
    err: (line) => stderr.push(String(line)),
    onCleanup: (vault) => { world.cleanedVault = vault; },
  };

  const world = {
    options,
    calls,
    sleeps,
    stdout,
    stderr,
    auth,
    controller,
    count: (kind) => calls.filter((call) => call.kind === kind).length,
    output: () => [...stdout, ...stderr].join('\n'),
    run: () => runHarness(options),
  };
  return world;
}

function assertNoSecrets(world) {
  const output = world.output();
  for (const [name, secret] of Object.entries(SECRETS)) {
    assert.equal(output.includes(secret), false, `${name} leaked to output`);
  }
  assert.equal(/authorization|bearer/i.test(output), false, 'authorization header leaked to output');
}

function assertVaultWiped(world) {
  assert.ok(world.cleanedVault, 'cleanup ran');
  for (const [key, value] of Object.entries(world.cleanedVault)) assert.equal(value, null, `${key} was not wiped`);
}

test('happy path drives create, poll, exchange, sign-in, verify, viewer reads, refresh and re-verify', async () => {
  const world = createWorld();
  const code = await world.run();

  assert.equal(code, 0, world.output());
  assert.deepEqual(world.calls.map((call) => call.kind), [
    'create', 'poll', 'poll', 'exchange', 'signIn', 'favorites', 'progress', 'refresh', 'favorites', 'progress',
  ]);
  assert.ok(world.calls.every((call) => call.redirect === 'error' && call.hasSignal));
  assert.equal(world.auth.getUserCalls, 1);

  const [create, poll] = world.calls;
  assert.equal(create.body, undefined);
  assert.equal(poll.headers['x-device-secret'], SECRETS.deviceSecret);
  const signIn = world.calls.find((call) => call.kind === 'signIn');
  assert.ok(signIn.url.endsWith(`?key=${SECRETS.apiKey}`));
  assert.deepEqual(JSON.parse(signIn.body), { token: SECRETS.customToken, returnSecureToken: true });
  const refresh = world.calls.find((call) => call.kind === 'refresh');
  assert.equal(new URLSearchParams(refresh.body).get('grant_type'), 'refresh_token');
  assert.equal(new URLSearchParams(refresh.body).get('refresh_token'), SECRETS.refreshToken);

  const viewerCalls = world.calls.filter((call) => call.kind === 'favorites' || call.kind === 'progress');
  assert.deepEqual(viewerCalls.map((call) => call.method), ['GET', 'GET', 'GET', 'GET']);
  assert.deepEqual(viewerCalls.map((call) => call.headers.Authorization), [
    `Bearer ${SECRETS.idToken}`, `Bearer ${SECRETS.idToken}`,
    `Bearer ${SECRETS.refreshedIdToken}`, `Bearer ${SECRETS.refreshedIdToken}`,
  ]);

  const output = world.output();
  assert.match(output, /ABCD-EFGH/);
  assert.match(output, /http:\/\/127\.0\.0\.1:5173\/activate/);
  assert.match(output, /Code expires at 2026-01-01T00:10:00\.000Z/);
  assert.match(output, /initial My List readable \(2 item\(s\)\)/);
  assert.match(output, /initial progress readable \(1 entry\)/);
  assert.match(output, /refreshed My List readable \(2 item\(s\)\)/);
  assert.match(output, /refreshed sign_in_provider = custom/);
  assert.match(output, /PASS: PROtv TV device harness completed/);
  assert.deepEqual(world.stderr, []);
  assertNoSecrets(world);
  assertVaultWiped(world);
});

test('harness configuration requires process opt-in values and rejects unsafe settings', () => {
  const base = { PROTV_TV_HARNESS: '1', PROTV_TV_HARNESS_API_BASE: API_BASE, PROTV_TV_HARNESS_EXPECTED_UID: EXPECTED_UID };
  assert.deepEqual(readHarnessConfiguration(base), {
    apiBase: API_BASE, expectedUid: EXPECTED_UID, activateOrigin: null, timeoutS: 600,
  });
  assert.equal(readHarnessConfiguration({ ...base, PROTV_TV_HARNESS_API_BASE: 'https://x.example/api/' }).apiBase, 'https://x.example/api');
  const rejects = [
    { PROTV_TV_HARNESS: undefined },
    { PROTV_TV_HARNESS: 'true' },
    { PROTV_TV_HARNESS_API_BASE: undefined },
    { PROTV_TV_HARNESS_API_BASE: 'http://remote.example' },
    { PROTV_TV_HARNESS_API_BASE: 'ftp://localhost' },
    { PROTV_TV_HARNESS_API_BASE: 'http://user:pw@localhost:5000' },
    { PROTV_TV_HARNESS_EXPECTED_UID: '' },
    { PROTV_TV_HARNESS_EXPECTED_UID: 'bad uid!' },
    { PROTV_TV_HARNESS_ACTIVATE_ORIGIN: 'http://127.0.0.1:5173/activate' },
    { PROTV_TV_HARNESS_TIMEOUT_S: '601' },
    { PROTV_TV_HARNESS_TIMEOUT_S: '0' },
    { PROTV_TV_HARNESS_TIMEOUT_S: '5.5' },
    { FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' },
  ];
  for (const override of rejects) {
    assert.throws(() => readHarnessConfiguration({ ...base, ...override }), HarnessFailure, JSON.stringify(override));
  }
});

test('backend configuration loader fails closed on harness keys in backend/.env and emulator mode', () => {
  const firebase = { auth: { getUser() {}, verifyIdToken() {}, setCustomUserClaims() {}, revokeRefreshTokens() {} } };
  const load = (file, processEnv = {}) => loadBackendConfiguration({
    envPath: 'fake/.env',
    exists: () => true,
    readFile: () => Buffer.from(file),
    processEnv,
    requireFirebase: () => firebase,
  });

  const loaded = load('FIREBASE_API_KEY=file-key\nOWNER_EMAIL=Owner@Example.com\n');
  assert.equal(loaded.apiKey, 'file-key');
  assert.equal(loaded.ownerEmail, 'owner@example.com');
  assert.equal(loaded.creatorOwnerEmail, 'admin@watchprotv.com');
  assert.deepEqual(Object.keys(loaded.auth).sort(), ['getUser', 'verifyIdToken']);

  assert.throws(() => load('PROTV_TV_HARNESS=1\nFIREBASE_API_KEY=k\nOWNER_EMAIL=o@x.com\n'), /must not be stored in backend\/\.env/);
  assert.throws(() => load('PROTV_TV_HARNESS_EXPECTED_UID=u\nFIREBASE_API_KEY=k\nOWNER_EMAIL=o@x.com\n'), /must not be stored/);
  assert.throws(() => load('FIREBASE_AUTH_EMULATOR_HOST=localhost:9099\nFIREBASE_API_KEY=k\nOWNER_EMAIL=o@x.com\n'), /EMULATOR/);
  assert.throws(() => load('OWNER_EMAIL=o@x.com\n'), /FIREBASE_API_KEY/);
  assert.throws(() => load('FIREBASE_API_KEY=k\n'), /OWNER_EMAIL/);
  assert.throws(() => loadBackendConfiguration({
    envPath: 'fake/.env',
    exists: () => true,
    readFile: () => Buffer.from('FIREBASE_API_KEY=k\nOWNER_EMAIL=o@x.com\n'),
    processEnv: {},
    requireFirebase: () => { console.log('raw secret init error'); throw new Error('raw secret'); },
  }), /could not be initialized/);
});

test('expected-user safety checks reject unsafe viewers before any device session is created', async () => {
  const cases = [
    [{ user: { disabled: true } }, /disabled/],
    [{ user: { customClaims: { admin: true } } }, /custom claims/],
    [{ user: { email: 'OWNER@example.com' } }, /owner account/],
    [{ user: { email: 'admin@watchprotv.com' } }, /owner account/],
    [{ user: { uid: 'someoneElse' } }, /different UID/],
    [{ getUserError: Object.assign(new Error('raw detail'), { code: 'auth/user-not-found' }) }, /auth\/user-not-found/],
  ];
  for (const [overrides, pattern] of cases) {
    const world = createWorld(overrides);
    assert.equal(await world.run(), 1);
    assert.match(world.output(), pattern);
    assert.equal(world.calls.length, 0);
    assert.doesNotMatch(world.output(), /raw detail/);
  }
});

test('create responses are validated and origin mismatches fail closed', async () => {
  const cases = [
    [{ routes: { create: () => json(200, {}) } }, /creation failed \(HTTP 200\)/],
    [{ routes: { create: () => json(429, { error: 'x' }) } }, /rate limited \(HTTP 429\)/],
    [{ routes: { create: () => json(503) } }, /creation failed \(HTTP 503\)/],
    [{ createBody: { sessionId: 'short' } }, /invalid session identifier/],
    [{ createBody: { deviceSecret: undefined } }, /invalid device secret/],
    [{ createBody: { userCode: 'abcd' } }, /invalid activation code/],
    [{ createBody: { verificationUrl: 'javascript:alert(1)' } }, /invalid verification URL/],
    [{ createBody: { expiresAt: 'soon' } }, /invalid expiry/],
    [{ createBody: { expiresAt: new Date(START - 1).toISOString() } }, /invalid expiry/],
    [{ createBody: { interval: 0 } }, /invalid polling interval/],
    [{ env: { PROTV_TV_HARNESS_ACTIVATE_ORIGIN: 'http://localhost:5173' } }, /does not match PROTV_TV_HARNESS_ACTIVATE_ORIGIN/],
  ];
  for (const [overrides, pattern] of cases) {
    const world = createWorld(overrides);
    assert.equal(await world.run(), 1, JSON.stringify(overrides));
    assert.match(world.output(), pattern);
    assert.equal(world.count('poll'), 0);
    assertNoSecrets(world);
  }

  const production = createWorld({
    createBody: { verificationUrl: 'https://watchprotv.com/activate' },
    env: { PROTV_TV_HARNESS_ACTIVATE_ORIGIN: 'http://127.0.0.1:5173' },
  });
  assert.equal(await production.run(), 1);
  assert.match(production.output(), /https:\/\/watchprotv\.com does not match/);
  assert.doesNotMatch(production.output(), /ACTION REQUIRED/);

  const matching = createWorld({ env: { PROTV_TV_HARNESS_ACTIVATE_ORIGIN: 'http://127.0.0.1:5173' } });
  assert.equal(await matching.run(), 0);
});

test('polling honors the server interval and never polls faster', async () => {
  const world = createWorld({
    createBody: { interval: 7 },
    pollResponses: [
      () => json(200, { status: 'pending' }),
      () => json(200, { status: 'pending' }),
      () => json(200, { status: 'pending' }),
      () => json(200, { status: 'approved' }),
    ],
  });
  assert.equal(await world.run(), 0);
  assert.deepEqual(world.sleeps, [7000, 7000, 7000, 7000]);
  const pollTimes = world.calls.filter((call) => call.kind === 'poll').map((call) => call.at);
  assert.equal(pollTimes.length, 4);
  assert.equal(pollTimes[0] - START >= 7000, true);
  for (let i = 1; i < pollTimes.length; i += 1) assert.ok(pollTimes[i] - pollTimes[i - 1] >= 7000);
});

test('polling stops at session expiry or the configured timeout, whichever is earlier', async () => {
  const expiry = createWorld({
    createBody: { expiresAt: new Date(START + 20 * 1000).toISOString() },
    pollResponses: [() => json(200, { status: 'pending' })],
  });
  assert.equal(await expiry.run(), 1);
  assert.match(expiry.output(), /session expired before approval/);
  assert.equal(expiry.count('poll'), 4);
  assert.equal(expiry.count('exchange'), 0);

  const timeout = createWorld({
    env: { PROTV_TV_HARNESS_TIMEOUT_S: '12' },
    pollResponses: [() => json(200, { status: 'pending' })],
  });
  assert.equal(await timeout.run(), 1);
  assert.match(timeout.output(), /polling timed out before approval/);
  assert.equal(timeout.count('poll'), 2);

  const serverExpired = createWorld({ pollResponses: [() => json(200, { status: 'expired' })] });
  assert.equal(await serverExpired.run(), 1);
  assert.match(serverExpired.output(), /session expired before approval/);

  const consumed = createWorld({ pollResponses: [() => json(200, { status: 'consumed' })] });
  assert.equal(await consumed.run(), 1);
  assert.match(consumed.output(), /unexpectedly consumed/);
  assert.equal(consumed.count('exchange'), 0);
});

test('wrong device secret / 404 fails closed without dumping the response', async () => {
  const world = createWorld({
    pollResponses: [() => json(404, { error: 'Device session not found.', leaked: SECRETS.deviceSecret })],
  });
  assert.equal(await world.run(), 1);
  assert.match(world.output(), /HTTP 404: session not found or wrong secret/);
  assert.doesNotMatch(world.output(), /leaked/);
  assert.equal(world.count('poll'), 1);
  assertNoSecrets(world);
  assertVaultWiped(world);
});

test('poll rate limiting and unavailability back off with bounded retries', async () => {
  const recovered = createWorld({
    pollResponses: [
      () => json(429, {}),
      () => json(503, {}),
      () => json(200, { status: 'approved' }),
    ],
  });
  assert.equal(await recovered.run(), 0);
  assert.deepEqual(recovered.sleeps, [5000, 10000, 20000]);
  assert.match(recovered.output(), /WAIT: server busy \(HTTP 429\); backing off 10s/);

  const exhausted = createWorld({ pollResponses: [() => json(429, {})] });
  assert.equal(await exhausted.run(), 1);
  assert.match(exhausted.output(), /approval polling rate limited \(HTTP 429\)/);
  assert.equal(exhausted.count('poll'), 4);
  assert.deepEqual(exhausted.sleeps, [5000, 10000, 20000, 40000]);
});

test('exchange is called exactly once and failures are never retried automatically', async () => {
  const failures = [
    [() => json(503, { error: 'x', status: 'approved', retryable: true }), /HTTP 503, approved; server marked it retryable/],
    [() => json(409, { error: 'x', status: 'consumed' }), /HTTP 409, consumed/],
    [() => json(410, { error: 'x', status: 'expired' }), /HTTP 410, expired/],
    [() => json(404, { error: 'x' }), /HTTP 404, session not found or wrong secret/],
    [() => json(429, { error: 'x' }), /HTTP 429, unknown/],
    [() => json(200, {}), /returned no custom token/],
    [() => json(200), /returned no custom token/],
  ];
  for (const [exchange, pattern] of failures) {
    const world = createWorld({ routes: { exchange } });
    assert.equal(await world.run(), 1);
    assert.match(world.output(), pattern);
    assert.equal(world.count('exchange'), 1);
    assert.equal(world.count('signIn'), 0);
    assertNoSecrets(world);
  }

  const network = createWorld({ routes: { exchange: () => { throw new Error(`socket closed ${SECRETS.deviceSecret}`); } } });
  assert.equal(await network.run(), 1);
  assert.match(network.output(), /session exchange request failed \(network error\)/);
  assert.equal(network.count('exchange'), 1);
  assertNoSecrets(network);
});

test('Firebase custom-token exchange failures report only the Firebase error code', async () => {
  const world = createWorld({
    routes: { signIn: () => json(400, { error: { message: `INVALID_CUSTOM_TOKEN : detail ${SECRETS.customToken}` } }) },
  });
  assert.equal(await world.run(), 1);
  assert.match(world.output(), /signInWithCustomToken rejected \(HTTP 400, INVALID_CUSTOM_TOKEN\)/);
  assert.doesNotMatch(world.output(), /detail/);
  assertNoSecrets(world);

  const otherUser = createWorld({
    decoded: { [SECRETS.idToken]: { uid: 'other', firebase: { sign_in_provider: 'custom' } } },
  });
  assert.equal(await otherUser.run(), 1);
  assert.match(otherUser.output(), /initial ID token UID does not match the expected viewer/);
  assert.equal(otherUser.count('favorites'), 0);
});

test('signInWithCustomToken accepts required tokens without localId when verified ID token matches expected UID', async () => {
  const world = createWorld({
    routes: {
      signIn: () => json(200, { idToken: SECRETS.idToken, refreshToken: SECRETS.refreshToken }),
    },
  });
  assert.equal(await world.run(), 0, world.output());
  assert.match(world.output(), /initial ID token UID matches expected viewer/);
  assert.match(world.output(), /refreshed ID token UID matches expected viewer/);
  assertNoSecrets(world);
  assertVaultWiped(world);
});

test('Firebase custom-token sign-in rejects malformed or incomplete token responses', async () => {
  const invalidResponses = [
    undefined,
    null,
    {},
    { refreshToken: SECRETS.refreshToken },
    { idToken: SECRETS.idToken },
    { idToken: '', refreshToken: SECRETS.refreshToken },
    { idToken: SECRETS.idToken, refreshToken: '' },
  ];
  for (const response of invalidResponses) {
    const world = createWorld({
      routes: { signIn: () => json(200, response) },
    });
    assert.equal(await world.run(), 1);
    assert.match(world.output(), /signInWithCustomToken (?:returned an unreadable response|did not return a complete session)/);
    assert.equal(world.count('favorites'), 0);
    assertNoSecrets(world);
    assertVaultWiped(world);
  }
});

test('initial token assertions enforce UID, custom provider and no admin claim', async () => {
  const cases = [
    [{ uid: 'other', firebase: { sign_in_provider: 'custom' } }, /initial ID token UID does not match/],
    [{ uid: EXPECTED_UID, firebase: { sign_in_provider: 'password' } }, /initial sign_in_provider is "password"/],
    [{ uid: EXPECTED_UID, admin: true, firebase: { sign_in_provider: 'custom' } }, /initial ID token unexpectedly carries an admin claim/],
  ];
  for (const [claims, pattern] of cases) {
    const world = createWorld({ decoded: { [SECRETS.idToken]: claims } });
    assert.equal(await world.run(), 1);
    assert.match(world.output(), pattern);
    assert.equal(world.count('favorites'), 0);
    assertNoSecrets(world);
  }
  const unverifiable = createWorld({ decoded: { [SECRETS.idToken]: undefined } });
  assert.equal(await unverifiable.run(), 1);
  assert.match(unverifiable.output(), /initial ID token verification failed \(auth\/argument-error\)/);
  assertNoSecrets(unverifiable);
});

test('refreshed token assertions enforce UID, provider, admin and refresh user ID', async () => {
  const cases = [
    [{ decoded: { [SECRETS.refreshedIdToken]: { uid: 'other', firebase: { sign_in_provider: 'custom' } } } }, /refreshed ID token UID/],
    [{ decoded: { [SECRETS.refreshedIdToken]: { uid: EXPECTED_UID, firebase: { sign_in_provider: 'google.com' } } } }, /refreshed sign_in_provider is "google\.com"/],
    [{ decoded: { [SECRETS.refreshedIdToken]: { uid: EXPECTED_UID, admin: false, firebase: { sign_in_provider: 'custom' } } } }, /refreshed ID token unexpectedly carries an admin claim/],
    [{ routes: { refresh: () => json(200, { id_token: SECRETS.refreshedIdToken, user_id: 'other' }) } }, /refresh returned a different user/],
    [{ routes: { refresh: () => json(400, { error: { message: 'TOKEN_EXPIRED' } }) } }, /Firebase token refresh rejected \(HTTP 400, TOKEN_EXPIRED\)/],
    [{ routes: { refresh: () => json(200, {}) } }, /did not return an ID token/],
  ];
  for (const [overrides, pattern] of cases) {
    const world = createWorld(overrides);
    assert.equal(await world.run(), 1);
    assert.match(world.output(), pattern);
    assert.equal(world.count('favorites'), 1);
    assertNoSecrets(world);
  }

  const withoutUserId = createWorld({
    routes: { refresh: () => json(200, { id_token: SECRETS.refreshedIdToken }) },
  });
  assert.equal(await withoutUserId.run(), 0, withoutUserId.output());
  assert.match(withoutUserId.output(), /refreshed ID token UID matches expected viewer/);
  assertNoSecrets(withoutUserId);
  assertVaultWiped(withoutUserId);
});

test('viewer endpoint failures before and after refresh fail closed with status only', async () => {
  const initial = createWorld({ routes: { favorites: () => json(401, { error: 'Invalid token' }) } });
  assert.equal(await initial.run(), 1);
  assert.match(initial.output(), /initial My List request failed \(HTTP 401\)/);
  assert.equal(initial.count('refresh'), 0);

  let progressCalls = 0;
  const refreshed = createWorld({
    routes: { progress: () => (progressCalls++ === 0 ? json(200, {}) : json(200, ['not', 'an', 'object'])) },
  });
  assert.equal(await refreshed.run(), 1);
  assert.match(refreshed.output(), /initial progress readable \(0 entries\)/);
  assert.match(refreshed.output(), /refreshed progress request failed \(HTTP 200\)/);
  assertNoSecrets(refreshed);
});

test('interruption while waiting for approval stops immediately and wipes credentials', async () => {
  const world = createWorld({
    pollResponses: [() => json(200, { status: 'pending' })],
    onSleep: ({ controller, sleeps }) => { if (sleeps.length === 2) controller.abort(); },
  });
  assert.equal(await world.run(), 130);
  assert.match(world.output(), /INTERRUPTED: harness stopped; in-memory credentials discarded/);
  assert.equal(world.count('poll'), 1);
  assert.equal(world.count('exchange'), 0);
  assertNoSecrets(world);
  assertVaultWiped(world);

  const aborting = createWorld({
    routes: {
      signIn: () => {
        aborting.controller.abort();
        throw new DOMException('aborted', 'AbortError');
      },
    },
  });
  assert.equal(await aborting.run(), 130);
  assert.equal(aborting.count('favorites'), 0);
  assertNoSecrets(aborting);
  assertVaultWiped(aborting);
});

test('unexpected errors are suppressed and credentials never reach stdout or stderr', async () => {
  const world = createWorld({
    routes: { favorites: () => { throw new TypeError(`boom ${SECRETS.idToken}`); } },
  });
  assert.equal(await world.run(), 1);
  assert.match(world.output(), /initial My List request failed \(network error\)/);
  assertNoSecrets(world);

  const crashing = createWorld({ decoded: {} });
  crashing.auth.verifyIdToken = async () => { throw new Error(`raw ${SECRETS.idToken}`); };
  assert.equal(await crashing.run(), 1);
  assert.match(crashing.output(), /verification failed \(unrecognized-error\)/);
  assertNoSecrets(crashing);
});

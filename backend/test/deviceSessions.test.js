const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const express = require('express');

const {
  createDeviceSessionService,
  createDeviceSessionRouter,
  normalizeActivationCode,
  SESSION_TTL_MS,
  ISSUANCE_LEASE_MS,
} = require('../src/auth/deviceSessions');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const CODE_BYTES = { A: Buffer.alloc(8, 0), B: Buffer.alloc(8, 1), C: Buffer.alloc(8, 2) };

// Minimal Firestore double with optimistic transaction semantics: reads are
// versioned, and a transaction whose reads changed before commit is retried.
function createFakeFirestore() {
  const store = new Map();
  let version = 0;
  const snapshot = (path) => {
    const entry = store.get(path);
    return { exists: Boolean(entry), data: () => (entry ? structuredClone(entry.data) : undefined) };
  };
  const apply = ([kind, path, data]) => {
    if (kind === 'delete') return store.delete(path);
    if (kind === 'update') {
      if (!store.has(path)) throw new Error(`NOT_FOUND: ${path}`);
      data = { ...store.get(path).data, ...data };
    }
    version += 1;
    store.set(path, { data: structuredClone(data), version });
  };
  const ref = (collection, id) => {
    const path = `${collection}/${id}`;
    return {
      path,
      id,
      get: async () => {
        await tick();
        return snapshot(path);
      },
    };
  };
  return {
    store,
    dump: () => Object.fromEntries([...store].map(([path, entry]) => [path, entry.data])),
    data: (path) => structuredClone(store.get(path)?.data),
    patch: (path, fields) => apply(['update', path, fields]),
    collection: (name) => ({ doc: (id) => ref(name, id) }),
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const reads = new Map();
        const writes = [];
        const transaction = {
          async get(target) {
            await tick();
            reads.set(target.path, store.get(target.path)?.version ?? 0);
            return snapshot(target.path);
          },
          set(target, data) { writes.push(['set', target.path, data]); return transaction; },
          update(target, data) { writes.push(['update', target.path, data]); return transaction; },
          delete(target) { writes.push(['delete', target.path]); return transaction; },
        };
        const result = await fn(transaction);
        const conflicted = [...reads].some(([path, seen]) => (store.get(path)?.version ?? 0) !== seen);
        if (conflicted) continue;
        writes.forEach(apply);
        return result;
      }
      throw new Error('Transaction contention');
    },
  };
}

const identities = {
  password: { uid: 'viewer-uid', email: 'viewer@example.test', admin: true, firebase: { sign_in_provider: 'password' } },
  google: { uid: 'google-uid', email: 'google@example.test', firebase: { sign_in_provider: 'google.com' } },
  other: { uid: 'other-uid', email: 'other@example.test', firebase: { sign_in_provider: 'password' } },
  custom: { uid: 'viewer-uid', email: 'viewer@example.test', admin: true, firebase: { sign_in_provider: 'custom' } },
  missing: { uid: 'viewer-uid', email: 'viewer@example.test' },
  unsupported: { uid: 'viewer-uid', email: 'viewer@example.test', firebase: { sign_in_provider: 'github.com' } },
};

function installFirebaseDoubles(context, db, harness) {
  const firebase = require('../src/firebase');
  const previous = { auth: firebase.auth, db: firebase.db };
  const fakeAuth = {
    verifyIdToken: async (token) => {
      if (!Object.hasOwn(identities, token)) throw new Error('Invalid token');
      return structuredClone(identities[token]);
    },
    createCustomToken: async (...args) => {
      harness.minted.push(args);
      return harness.mint(...args);
    },
  };
  firebase.auth = fakeAuth;
  firebase.db = db;
  const modules = ['../src/middleware/auth', '../src/routes/auth'];
  for (const modulePath of modules) delete require.cache[require.resolve(modulePath)];
  context.after(() => {
    for (const modulePath of modules) delete require.cache[require.resolve(modulePath)];
    firebase.auth = previous.auth;
    firebase.db = previous.db;
  });
  return fakeAuth;
}

async function listen(context, app) {
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (method, path, { token, secret, body } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(secret !== undefined ? { 'X-Device-Secret': secret } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
}

async function startHarness(context, serviceOptions = {}) {
  const db = createFakeFirestore();
  const harness = {
    db,
    clock: 1_800_000_000_000,
    codeQueue: [],
    minted: [],
    mint: () => `custom-token-${harness.minted.length}`,
    dbAvailable: true,
    authAvailable: true,
  };
  const fakeAuth = installFirebaseDoubles(context, db, harness);
  const { verifyToken, requireInteractiveUserSession } = require('../src/middleware/auth');
  const service = createDeviceSessionService({
    getDb: () => (harness.dbAvailable ? db : null),
    getAuth: () => (harness.authAvailable ? fakeAuth : null),
    now: () => harness.clock,
    randomBytes: (size) => (size === 8 && harness.codeQueue.length ? harness.codeQueue.shift() : crypto.randomBytes(size)),
    verificationUrl: 'https://watchprotv.example/activate',
    ...serviceOptions,
  });
  const app = express();
  app.use(express.json());
  app.use('/auth/device-sessions', createDeviceSessionRouter({ service, verifyToken, requireInteractiveUserSession }));
  harness.request = await listen(context, app);
  harness.create = async () => {
    const result = await harness.request('POST', '/auth/device-sessions');
    assert.equal(result.status, 201);
    return result.body;
  };
  harness.approve = (token, code, extra = {}) => harness.request('POST', '/auth/device-sessions/approve', {
    token, body: { code, ...extra },
  });
  harness.poll = (sessionId, secret) => harness.request('GET', `/auth/device-sessions/${sessionId}`, { secret });
  harness.exchange = (sessionId, secret) => harness.request('POST', `/auth/device-sessions/${sessionId}/exchange`, { secret });
  harness.session = (sessionId) => db.data(`deviceSessions/${sessionId}`);
  return harness;
}

test('activation codes normalize to the unambiguous alphabet only', () => {
  assert.equal(normalizeActivationCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizeActivationCode(' abcd efgh '), 'ABCDEFGH');
  for (const invalid of ['ABCD-EFG', 'ABCD-EFGHJ', 'ABCD-EFG0', 'ABCD-EFGO', 'ABCD-EFG1', 'ABCD-EFGI', '', null, 12345678]) {
    assert.equal(normalizeActivationCode(invalid), null, String(invalid));
  }
});

test('creating a device session returns only TV-facing data and stores only the secret hash', async (context) => {
  const harness = await startHarness(context);
  const result = await harness.request('POST', '/auth/device-sessions');
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const created = result.body;
  assert.deepEqual(Object.keys(created).sort(), ['deviceSecret', 'expiresAt', 'interval', 'sessionId', 'userCode', 'verificationUrl']);
  assert.match(created.sessionId, /^[A-Za-z0-9_-]{43}$/);
  assert.match(created.deviceSecret, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(created.sessionId, created.deviceSecret);
  assert.match(created.userCode, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(created.verificationUrl, 'https://watchprotv.example/activate');
  assert.equal(created.verificationUrl.includes(created.deviceSecret), false);
  assert.equal(created.expiresAt, new Date(harness.clock + SESSION_TTL_MS).toISOString());
  assert.equal(created.interval, 5);

  const code = created.userCode.replace('-', '');
  const session = harness.session(created.sessionId);
  assert.equal(session.secretHash, sha256(created.deviceSecret));
  assert.equal(session.status, 'pending');
  assert.equal(session.userCode, code);
  assert.equal(session.approvedByUid, null);
  assert.deepEqual(harness.db.data(`deviceActivationCodes/${code}`), {
    sessionId: created.sessionId, expiresAt: new Date(harness.clock + SESSION_TTL_MS),
  });
  assert.equal(JSON.stringify(harness.db.dump()).includes(created.deviceSecret), false, 'raw secret must never be stored');
});

test('activation code collisions retry live codes, reuse expired codes and fail closed when exhausted', async (context) => {
  const harness = await startHarness(context);
  harness.codeQueue.push(CODE_BYTES.A);
  const first = await harness.create();
  assert.equal(first.userCode, 'AAAA-AAAA');

  harness.codeQueue.push(CODE_BYTES.A, CODE_BYTES.B);
  const second = await harness.create();
  assert.equal(second.userCode, 'BBBB-BBBB');
  assert.equal(harness.db.data('deviceActivationCodes/AAAAAAAA').sessionId, first.sessionId);

  harness.clock += SESSION_TTL_MS + 1000;
  harness.codeQueue.push(CODE_BYTES.A);
  const third = await harness.create();
  assert.equal(third.userCode, 'AAAA-AAAA');
  assert.equal(harness.db.data('deviceActivationCodes/AAAAAAAA').sessionId, third.sessionId);
  assert.equal((await harness.approve('password', 'aaaa aaaa')).status, 200);
  assert.deepEqual((await harness.poll(third.sessionId, third.deviceSecret)).body, { status: 'approved' });
  assert.deepEqual((await harness.poll(first.sessionId, first.deviceSecret)).body, { status: 'expired' });

  harness.codeQueue.push(CODE_BYTES.C);
  await harness.create();
  harness.codeQueue.push(CODE_BYTES.C, CODE_BYTES.C, CODE_BYTES.C, CODE_BYTES.C, CODE_BYTES.C);
  const before = harness.db.store.size;
  const exhausted = await harness.request('POST', '/auth/device-sessions');
  assert.equal(exhausted.status, 503);
  assert.equal(exhausted.body.deviceSecret, undefined);
  assert.equal(harness.db.store.size, before, 'no session or code documents are written');
});

test('polling requires the device secret header and discloses only safe status', async (context) => {
  const harness = await startHarness(context);
  const created = await harness.create();
  const unknownId = crypto.randomBytes(32).toString('base64url');
  const failures = [
    await harness.poll(created.sessionId),
    await harness.poll(created.sessionId, 'wrong-secret'),
    await harness.poll(created.sessionId, ''),
    await harness.request('GET', `/auth/device-sessions/${created.sessionId}?deviceSecret=${created.deviceSecret}`),
    await harness.poll(unknownId, created.deviceSecret),
    await harness.poll('malformed', created.deviceSecret),
  ];
  for (const failure of failures) assert.deepEqual([failure.status, failure.body], [404, { error: 'Device session not found.' }]);

  const pending = await harness.poll(created.sessionId, created.deviceSecret);
  assert.deepEqual([pending.status, pending.body], [200, { status: 'pending' }]);
  assert.equal(pending.headers.get('cache-control'), 'no-store');

  assert.equal((await harness.approve('password', created.userCode)).status, 200);
  const approved = await harness.poll(created.sessionId, created.deviceSecret);
  assert.deepEqual(approved.body, { status: 'approved' });
  const serialized = JSON.stringify(approved.body);
  for (const secret of ['viewer-uid', 'viewer@example.test', 'admin', 'password', 'Token']) {
    assert.equal(serialized.includes(secret), false, secret);
  }

  harness.clock += SESSION_TTL_MS;
  assert.deepEqual((await harness.poll(created.sessionId, created.deviceSecret)).body, { status: 'expired' });
});

test('approval requires an interactive session and binds only the verified UID', async (context) => {
  const harness = await startHarness(context);
  const passwordSession = await harness.create();
  const result = await harness.approve('password', passwordSession.userCode, { uid: 'attacker-uid', approvedByUid: 'attacker-uid' });
  assert.deepEqual([result.status, result.body], [200, { status: 'approved' }]);
  const stored = harness.session(passwordSession.sessionId);
  assert.equal(stored.approvedByUid, 'viewer-uid');
  assert.equal(stored.approvedProvider, 'password');
  assert.equal(stored.approvedAt.getTime(), harness.clock);
  assert.equal(harness.db.data(`deviceActivationCodes/${passwordSession.userCode.replace('-', '')}`), undefined);

  const googleSession = await harness.create();
  assert.equal((await harness.approve('google', googleSession.userCode.toLowerCase())).status, 200);
  assert.equal(harness.session(googleSession.sessionId).approvedByUid, 'google-uid');
  assert.equal(harness.session(googleSession.sessionId).approvedProvider, 'google.com');

  const guarded = await harness.create();
  for (const token of ['custom', 'missing', 'unsupported']) {
    assert.equal((await harness.approve(token, guarded.userCode)).status, 403, token);
  }
  assert.equal((await harness.approve(undefined, guarded.userCode)).status, 401);
  assert.equal((await harness.approve('invalid-token', guarded.userCode)).status, 401);
  assert.equal(harness.session(guarded.sessionId).status, 'pending');

  const reused = await harness.approve('other', passwordSession.userCode);
  assert.deepEqual([reused.status, reused.body], [404, { error: 'This activation code is invalid or has expired.' }]);
  assert.equal(harness.session(passwordSession.sessionId).approvedByUid, 'viewer-uid');
  assert.equal((await harness.approve('password', 'ZZZZ-ZZZZ')).status, 404);
  assert.equal((await harness.approve('password', 'not-a-code')).status, 400);

  harness.clock += SESSION_TTL_MS;
  assert.equal((await harness.approve('password', guarded.userCode)).status, 404);
  assert.equal(harness.session(guarded.sessionId).status, 'pending');
});

test('approval attempts are limited per UID without storing the raw UID', async (context) => {
  const harness = await startHarness(context, { approveAttemptLimit: 3 });
  const created = await harness.create();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal((await harness.approve('other', 'ZZZZ-ZZZZ')).status, 404);
  }
  const limited = await harness.approve('other', created.userCode);
  assert.equal(limited.status, 429);
  assert.equal(harness.session(created.sessionId).status, 'pending');
  assert.equal((await harness.approve('password', created.userCode)).status, 200, 'other accounts are unaffected');
  const limiterKeys = [...harness.db.store.keys()].filter((key) => key.startsWith('deviceRateLimits/approve_'));
  assert.equal(limiterKeys.length, 2);
  assert.equal(limiterKeys.some((key) => key.includes('uid')), false);
});

test('device-session creation is limited by a Firestore-backed global window', async (context) => {
  const harness = await startHarness(context, { createLimitPerMinute: 2 });
  await harness.create();
  await harness.create();
  const limited = await harness.request('POST', '/auth/device-sessions');
  assert.equal(limited.status, 429);
  assert.equal(limited.body.deviceSecret, undefined);
  harness.clock += 60 * 1000;
  await harness.create();
});

test('exchange enforces secret, approval and expiry, then issues exactly one plain custom token', async (context) => {
  const harness = await startHarness(context);
  const created = await harness.create();
  assert.deepEqual((await harness.exchange(created.sessionId, created.deviceSecret)).body.status, 'pending');
  assert.equal((await harness.exchange(created.sessionId, created.deviceSecret)).status, 409);
  assert.equal((await harness.exchange(created.sessionId, 'wrong-secret')).status, 404);
  assert.equal((await harness.exchange(created.sessionId)).status, 404);
  assert.equal(harness.minted.length, 0);

  assert.equal((await harness.approve('password', created.userCode, { uid: 'attacker-uid' })).status, 200);
  assert.equal((await harness.exchange(created.sessionId, 'wrong-secret')).status, 404);
  const exchanged = await harness.exchange(created.sessionId, created.deviceSecret);
  assert.deepEqual([exchanged.status, exchanged.body], [200, { customToken: 'custom-token-1' }]);
  assert.equal(exchanged.headers.get('cache-control'), 'no-store');
  assert.deepEqual(harness.minted, [['viewer-uid']], 'exact approved UID and no developer claims');
  assert.equal(harness.session(created.sessionId).status, 'consumed');
  assert.deepEqual((await harness.poll(created.sessionId, created.deviceSecret)).body, { status: 'consumed' });

  const replay = await harness.exchange(created.sessionId, created.deviceSecret);
  assert.deepEqual([replay.status, replay.body.status, replay.body.customToken], [409, 'consumed', undefined]);
  assert.equal(harness.minted.length, 1);

  const expiring = await harness.create();
  assert.equal((await harness.approve('password', expiring.userCode)).status, 200);
  harness.clock += SESSION_TTL_MS;
  const expired = await harness.exchange(expiring.sessionId, expiring.deviceSecret);
  assert.deepEqual([expired.status, expired.body.status], [410, 'expired']);
  assert.equal(harness.minted.length, 1);
});

test('concurrent exchanges deliver credentials at most once', async (context) => {
  const harness = await startHarness(context);
  harness.mint = () => new Promise((resolve) => setTimeout(() => resolve('concurrent-token'), 25));
  const created = await harness.create();
  assert.equal((await harness.approve('password', created.userCode)).status, 200);
  const results = await Promise.all(Array.from({ length: 6 }, () => harness.exchange(created.sessionId, created.deviceSecret)));
  const successes = results.filter((result) => result.status === 200);
  assert.equal(successes.length, 1);
  assert.deepEqual(successes[0].body, { customToken: 'concurrent-token' });
  for (const result of results.filter((entry) => entry.status !== 200)) {
    assert.equal(result.status, 409);
    assert.equal(result.body.customToken, undefined);
  }
  assert.equal(harness.minted.length, 1);
  assert.equal(harness.session(created.sessionId).status, 'consumed');
});

test('token-mint failure releases issuance for safe retry and stale leases cannot both deliver', async (context) => {
  const harness = await startHarness(context);
  const created = await harness.create();
  assert.equal((await harness.approve('password', created.userCode)).status, 200);

  harness.mint = () => { throw new Error('transient signing failure'); };
  const failed = await harness.exchange(created.sessionId, created.deviceSecret);
  assert.deepEqual([failed.status, failed.body.status, failed.body.retryable, failed.body.customToken], [503, 'approved', true, undefined]);
  const released = harness.session(created.sessionId);
  assert.deepEqual([released.status, released.issuanceId, released.issuanceLeaseUntil], ['approved', null, null]);
  assert.deepEqual((await harness.poll(created.sessionId, created.deviceSecret)).body, { status: 'approved' });

  harness.mint = () => 'retry-token';
  const retried = await harness.exchange(created.sessionId, created.deviceSecret);
  assert.deepEqual([retried.status, retried.body], [200, { customToken: 'retry-token' }]);
  assert.equal((await harness.exchange(created.sessionId, created.deviceSecret)).status, 409);
  assert.deepEqual(harness.minted, [['viewer-uid'], ['viewer-uid']]);

  const stale = await harness.create();
  assert.equal((await harness.approve('google', stale.userCode)).status, 200);
  let releaseSlowMint;
  harness.mint = () => new Promise((resolve) => { releaseSlowMint = () => resolve('slow-token'); });
  const slowExchange = harness.exchange(stale.sessionId, stale.deviceSecret);
  while (!releaseSlowMint) await tick();
  assert.equal(harness.session(stale.sessionId).status, 'issuing');

  const blocked = await harness.exchange(stale.sessionId, stale.deviceSecret);
  assert.deepEqual([blocked.status, blocked.body.status], [409, 'issuing']);

  harness.clock += ISSUANCE_LEASE_MS;
  harness.mint = () => 'takeover-token';
  const takeover = await harness.exchange(stale.sessionId, stale.deviceSecret);
  assert.deepEqual([takeover.status, takeover.body], [200, { customToken: 'takeover-token' }]);
  releaseSlowMint();
  const lateHolder = await slowExchange;
  assert.equal(lateHolder.status, 409);
  assert.equal(lateHolder.body.customToken, undefined);
  assert.equal(harness.session(stale.sessionId).status, 'consumed');
  assert.deepEqual(harness.minted.slice(2), [['google-uid'], ['google-uid']]);
});

test('device activation fails closed when Firebase Admin is unavailable', async (context) => {
  const harness = await startHarness(context);
  const created = await harness.create();
  assert.equal((await harness.approve('password', created.userCode)).status, 200);

  harness.authAvailable = false;
  assert.equal((await harness.exchange(created.sessionId, created.deviceSecret)).status, 503);
  assert.equal(harness.session(created.sessionId).status, 'approved');
  harness.authAvailable = true;

  harness.dbAvailable = false;
  assert.equal((await harness.request('POST', '/auth/device-sessions')).status, 503);
  assert.equal((await harness.poll(created.sessionId, created.deviceSecret)).status, 503);
  assert.equal((await harness.approve('password', 'ABCD-EFGH')).status, 503);
  assert.equal((await harness.exchange(created.sessionId, created.deviceSecret)).status, 503);
  assert.equal(harness.minted.length, 0);
});

test('the /auth router exposes the device protocol through the real Firebase wiring', async (context) => {
  const previousUrl = process.env.DEVICE_ACTIVATION_URL;
  delete process.env.DEVICE_ACTIVATION_URL;
  context.after(() => {
    if (previousUrl === undefined) delete process.env.DEVICE_ACTIVATION_URL;
    else process.env.DEVICE_ACTIVATION_URL = previousUrl;
  });
  const db = createFakeFirestore();
  const harness = { minted: [], mint: () => 'wired-token' };
  installFirebaseDoubles(context, db, harness);
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../src/routes/auth'));
  const request = await listen(context, app);

  const created = await request('POST', '/auth/device-sessions');
  assert.equal(created.status, 201);
  assert.equal(created.body.verificationUrl, 'https://watchprotv.com/activate');
  const { sessionId, deviceSecret, userCode } = created.body;
  assert.equal((await request('POST', '/auth/device-sessions/approve', { token: 'custom', body: { code: userCode } })).status, 403);
  assert.equal((await request('POST', '/auth/device-sessions/approve', { token: 'password', body: { code: userCode } })).status, 200);
  assert.deepEqual((await request('GET', `/auth/device-sessions/${sessionId}`, { secret: deviceSecret })).body, { status: 'approved' });
  const exchanged = await request('POST', `/auth/device-sessions/${sessionId}/exchange`, { secret: deviceSecret });
  assert.deepEqual([exchanged.status, exchanged.body], [200, { customToken: 'wired-token' }]);
  assert.deepEqual(harness.minted, [['viewer-uid']]);
});

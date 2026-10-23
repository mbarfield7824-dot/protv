const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createTvAuthService, createTvAuthRouter } = require('../src/auth/tvAuth');

const PASSWORD = 'correct horse battery';
const EMAIL = 'Viewer@Example.test';

// Firestore double with the transaction surface the rate limiter uses.
function createFakeDb() {
  const store = new Map();
  return {
    store,
    collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
    async runTransaction(fn) {
      const writes = [];
      const result = await fn({
        get: async (ref) => ({ exists: store.has(ref.path), data: () => store.get(ref.path) }),
        set: (ref, data) => writes.push([ref.path, data]),
      });
      for (const [path, data] of writes) store.set(path, data);
      return result;
    },
  };
}

// Firebase Identity Toolkit double: one password user, one Google-only user.
function createFakeIdentity() {
  const calls = [];
  const users = {
    'viewer@example.test': { uid: 'viewer-uid', password: PASSWORD },
    'google@example.test': { uid: 'google-uid', password: null },
    'disabled@example.test': { uid: 'disabled-uid', password: PASSWORD, disabled: true },
  };
  const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
  const fail = (code) => reply(400, { error: { message: code } });
  const fetchImpl = async (url, init) => {
    const method = /accounts:(\w+)\?key=/.exec(url)[1];
    const body = JSON.parse(init.body);
    calls.push({ method, url, body });
    const user = users[String(body.email || '').toLowerCase()];
    if (method === 'signInWithPassword') {
      if (!user || !user.password || user.password !== body.password) return fail('INVALID_LOGIN_CREDENTIALS');
      if (user.disabled) return fail('USER_DISABLED');
      return reply(200, { localId: user.uid, idToken: 'firebase-id-token', refreshToken: 'firebase-refresh-token', expiresIn: '3600' });
    }
    if (method === 'signUp') {
      if (user) return fail('EMAIL_EXISTS');
      if (body.password.length < 6) return fail('WEAK_PASSWORD : Password should be at least 6 characters');
      users[body.email.toLowerCase()] = { uid: 'new-uid', password: body.password };
      return reply(200, { localId: 'new-uid', idToken: 'new-id-token', refreshToken: 'new-refresh-token', expiresIn: '3600' });
    }
    if (method === 'sendOobCode') {
      if (body.requestType === 'PASSWORD_RESET' && !user) return fail('EMAIL_NOT_FOUND');
      return reply(200, { email: body.email });
    }
    return fail('UNKNOWN');
  };
  return { calls, users, fetchImpl };
}

async function startHarness(context, overrides = {}) {
  const db = createFakeDb();
  const identity = createFakeIdentity();
  const minted = [];
  const auth = { createCustomToken: async (...args) => { minted.push(args); return `custom-token-${minted.length}`; } };
  let clock = 1_800_000_000_000;
  const service = createTvAuthService({ getDb: () => db, getAuth: () => auth, apiKey: 'public-web-key', fetchImpl: identity.fetchImpl, now: () => clock, ...overrides });
  let client = '203.0.113.7';
  const app = express();
  app.use(express.json());
  app.use('/auth/tv', createTvAuthRouter({ service, clientAddress: () => (typeof client === 'function' ? client() : client) }));
  // Mirrors app.js: client errors (including malformed JSON) are answered, not logged.
  app.use((err, req, res, next) => res.status(Number(err.status) || 500).json({ error: 'Invalid request.' }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const logs = [];
  for (const level of ['log', 'error', 'warn', 'info']) {
    const original = console[level];
    console[level] = (...args) => { logs.push(args.map(String).join(' ')); };
    context.after(() => { console[level] = original; });
  }
  const post = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/tv/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  };
  return { db, identity, minted, logs, post, setClient: (value) => { client = value; }, advance: (ms) => { clock += ms; } };
}

test('TV sign-in returns a claim-free custom token for the same Firebase user', async (context) => {
  const h = await startHarness(context);
  const result = await h.post('sign-in', { email: EMAIL, password: PASSWORD });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { customToken: 'custom-token-1' });
  assert.equal(result.cache, 'no-store');
  assert.deepEqual(h.minted, [['viewer-uid']], 'same UID, no developer claims');
  assert.equal(h.identity.calls[0].method, 'signInWithPassword');
  assert.equal(h.identity.calls[0].body.returnSecureToken, true);
  assert.doesNotMatch(JSON.stringify(result.body), /firebase-id-token|firebase-refresh-token/, 'Firebase tokens never reach the TV');
});

test('wrong passwords and unknown emails get the same answer', async (context) => {
  const h = await startHarness(context);
  const wrong = await h.post('sign-in', { email: EMAIL, password: 'not it' });
  const unknown = await h.post('sign-in', { email: 'nobody@example.test', password: PASSWORD });
  const googleOnly = await h.post('sign-in', { email: 'google@example.test', password: PASSWORD });
  for (const result of [wrong, unknown, googleOnly]) {
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { error: "That email and password don't match a PROtv account.", code: 'invalid_credentials' });
  }
  assert.equal((await h.post('sign-in', { email: 'disabled@example.test', password: PASSWORD })).body.code, 'account_disabled');
  assert.equal(h.minted.length, 0);
});

test('malformed requests are refused before Firebase is called', async (context) => {
  const h = await startHarness(context);
  for (const body of [{}, { email: 'not-an-email', password: PASSWORD }, { email: EMAIL }, { email: EMAIL, password: '' }, { email: [EMAIL], password: PASSWORD }, [], 'x'.repeat(10)]) {
    const result = await h.post('sign-in', body);
    assert.ok([400].includes(result.status), JSON.stringify(body));
  }
  assert.equal((await h.post('sign-in', { email: EMAIL, password: 'p'.repeat(129) })).status, 400);
  assert.equal(h.identity.calls.length, 0);
});

test('sign-in attempts are rate limited per TV address and per email, without storing either', async (context) => {
  const h = await startHarness(context);
  for (let attempt = 0; attempt < 8; attempt += 1) await h.post('sign-in', { email: EMAIL, password: 'wrong' });
  assert.equal((await h.post('sign-in', { email: EMAIL, password: PASSWORD })).status, 429, 'eight tries per email per 15 minutes');
  h.setClient('198.51.100.9');
  assert.equal((await h.post('sign-in', { email: EMAIL, password: PASSWORD })).status, 429, 'the email limit follows the account');
  assert.equal((await h.post('sign-in', { email: 'other@example.test', password: 'x' })).status, 401, 'another email from another TV is fine');
  h.setClient('203.0.113.7');
  await h.post('sign-in', { email: 'a@example.test', password: 'x' });
  await h.post('sign-in', { email: 'b@example.test', password: 'x' });
  assert.equal((await h.post('sign-in', { email: 'c@example.test', password: 'x' })).status, 429, 'ten tries per TV address per 15 minutes');
  h.advance(15 * 60 * 1000);
  assert.equal((await h.post('sign-in', { email: EMAIL, password: PASSWORD })).status, 200, 'limits reset after the window');
  const stored = JSON.stringify([...h.db.store]);
  assert.doesNotMatch(stored, /example\.test|203\.0\.113|198\.51\.100/i, 'only hashes are stored');
});

test('TV sign-up creates the account, sends verification like the website, and signs in', async (context) => {
  const h = await startHarness(context);
  const result = await h.post('sign-up', { email: 'new@example.test', password: 'brand new password' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { customToken: 'custom-token-1', verificationEmailSent: true });
  assert.deepEqual(h.minted, [['new-uid']]);
  const verification = h.identity.calls.find((call) => call.method === 'sendOobCode');
  assert.deepEqual(verification.body, { requestType: 'VERIFY_EMAIL', idToken: 'new-id-token' });
  assert.equal((await h.post('sign-up', { email: EMAIL, password: 'another password' })).body.code, 'email_exists');
  const weak = await h.post('sign-up', { email: 'short@example.test', password: '12345' });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, 'weak_password');
  assert.equal(h.identity.calls.filter((call) => call.body.email === 'short@example.test').length, 0, 'the minimum is checked before Firebase');
});

test('sign-up is rate limited per TV address', async (context) => {
  const h = await startHarness(context);
  for (let index = 0; index < 5; index += 1) await h.post('sign-up', { email: `n${index}@example.test`, password: 'long enough' });
  assert.equal((await h.post('sign-up', { email: 'n6@example.test', password: 'long enough' })).status, 429);
});

test('password reset answers the same for known, unknown and Google-only emails', async (context) => {
  const h = await startHarness(context);
  const known = await h.post('password-reset', { email: EMAIL });
  const unknown = await h.post('password-reset', { email: 'nobody@example.test' });
  const googleOnly = await h.post('password-reset', { email: 'google@example.test' });
  for (const result of [known, unknown, googleOnly]) assert.deepEqual([result.status, result.body], [200, { status: 'sent' }]);
  assert.deepEqual(h.identity.calls.filter((call) => call.method === 'sendOobCode').map((call) => call.body.requestType), ['PASSWORD_RESET', 'PASSWORD_RESET', 'PASSWORD_RESET']);
  await h.post('password-reset', { email: EMAIL });
  await h.post('password-reset', { email: EMAIL });
  assert.equal((await h.post('password-reset', { email: EMAIL })).status, 429, 'three reset emails per account per hour');
  assert.equal(h.minted.length, 0, 'a reset request never signs anyone in');
});

test('outages fail closed with a generic message', async (context) => {
  const down = await startHarness(context, { fetchImpl: async () => { throw new Error(`connect ECONNREFUSED ${PASSWORD}`); } });
  const result = await down.post('sign-in', { email: EMAIL, password: PASSWORD });
  assert.deepEqual([result.status, result.body.code], [503, 'unavailable']);
  const noKey = await startHarness(context, { apiKey: '' });
  assert.equal((await noKey.post('sign-in', { email: EMAIL, password: PASSWORD })).status, 503);
  const noDb = await startHarness(context, { getDb: () => null });
  assert.equal((await noDb.post('sign-up', { email: 'x@example.test', password: 'long enough' })).status, 503);
  const throwing = await startHarness(context, { getAuth: () => ({ createCustomToken: async () => { throw new Error(`mint failed for ${EMAIL}`); } }) });
  assert.equal((await throwing.post('sign-in', { email: EMAIL, password: PASSWORD })).status, 503);
  for (const h of [down, noKey, noDb, throwing]) {
    assert.doesNotMatch(h.logs.join('\n'), new RegExp(`${PASSWORD}|${EMAIL}|example\\.test`, 'i'), 'no credential or email in logs');
  }
});

test('nothing logged across every flow contains a credential, email or token', async (context) => {
  const h = await startHarness(context);
  await h.post('sign-in', { email: EMAIL, password: PASSWORD });
  await h.post('sign-in', { email: EMAIL, password: 'wrong secret value' });
  await h.post('sign-up', { email: 'log@example.test', password: 'sign up secret' });
  await h.post('password-reset', { email: EMAIL });
  await h.post('sign-in', '{"email": broken json');
  assert.doesNotMatch(h.logs.join('\n'), /correct horse|wrong secret|sign up secret|example\.test|custom-token|id-token|refresh-token/i);
});

// Optimistic-transaction Firestore double (as in deviceSessions.test.js):
// reads are versioned and a transaction whose reads changed is retried, the
// way Firestore serializes concurrent transactions across server instances.
function createConcurrentDb() {
  const store = new Map();
  let version = 0;
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  return {
    store,
    collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const reads = new Map();
        const writes = [];
        const result = await fn({
          get: async (ref) => {
            await tick();
            reads.set(ref.path, store.get(ref.path)?.version ?? 0);
            const entry = store.get(ref.path);
            return { exists: Boolean(entry), data: () => (entry ? structuredClone(entry.data) : undefined) };
          },
          set: (ref, data) => writes.push([ref.path, data]),
        });
        await tick();
        if ([...reads].some(([path, seen]) => (store.get(path)?.version ?? 0) !== seen)) continue;
        for (const [path, data] of writes) { version += 1; store.set(path, { data: structuredClone(data), version }); }
        return result;
      }
      throw new Error('Transaction contention');
    },
  };
}

test('rate limits stay exact when many requests arrive at once', async (context) => {
  const db = createConcurrentDb();
  const h = await startHarness(context, { getDb: () => db });
  // 30 simultaneous sign-ins from one TV address with different emails: the
  // per-address limit (10) admits exactly 10.
  const burst = await Promise.all(Array.from({ length: 30 }, (_, index) => h.post('sign-in', { email: `burst${index}@example.test`, password: 'x' })));
  assert.equal(burst.filter((result) => result.status !== 429).length, 10);
  assert.equal(h.identity.calls.length, 10, 'only admitted requests reach Firebase');
  // 20 simultaneous sign-ins for one email from different addresses: the
  // per-email limit (8) admits exactly 8.
  let address = 0;
  h.setClient(() => `198.51.100.${address += 1}`);
  const spread = await Promise.all(Array.from({ length: 20 }, () => h.post('sign-in', { email: EMAIL, password: 'wrong' })));
  assert.equal(spread.filter((result) => result.status !== 429).length, 8);
});

test('rate-limit storage is one expiring document per key', async (context) => {
  const h = await startHarness(context);
  for (let window = 0; window < 4; window += 1) {
    await h.post('sign-in', { email: EMAIL, password: 'wrong' });
    h.advance(15 * 60 * 1000);
  }
  const docs = [...h.db.store.entries()];
  assert.equal(docs.length, 2, 'one per-address and one per-email document, reused across windows');
  for (const [, data] of docs) {
    assert.ok(data.expiresAt instanceof Date && data.expiresAt.getTime() > data.windowStart.getTime(), 'expiresAt feeds the Firestore TTL policy');
    assert.equal(data.count, 1, 'the counter restarts in each new window');
  }
});

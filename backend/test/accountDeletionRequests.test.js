const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAccountDeletionRequestService } = require('../src/accountDeletionRequests');
const { createAccountDeletionRequestRouter } = require('../src/routes/accountDeletionRequests');
const { requireInteractiveUserSession } = require('../src/middleware/auth');
const { createRecentAuthenticationMiddleware } = require('../src/middleware/recentAuthentication');
const {
  accountDeletionAvailable,
  requireAccountDeletionEnvironment,
} = require('../src/accountDeletionEnvironment');

const allowEnvironment = (req, res, next) => next();

test('deletion routes run only on Vercel Production or the Firebase emulator', () => {
  const emulator = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };
  assert.equal(accountDeletionAvailable({ VERCEL: '1', VERCEL_ENV: 'production' }), true);
  assert.equal(accountDeletionAvailable({ VERCEL: '1', VERCEL_ENV: 'preview' }), false);
  assert.equal(accountDeletionAvailable({ VERCEL: '1', VERCEL_ENV: 'development' }), false);
  assert.equal(accountDeletionAvailable({ VERCEL: '1' }), false, 'missing VERCEL_ENV fails closed');
  assert.equal(accountDeletionAvailable({ VERCEL: '1', VERCEL_ENV: 'preview', ...emulator }), false, 'emulator vars cannot unlock a Vercel deployment');
  assert.equal(accountDeletionAvailable({}), false, 'a local backend with real credentials is refused');
  assert.equal(accountDeletionAvailable({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), false, 'both emulators are required');
  assert.equal(accountDeletionAvailable(emulator), true);
});

test('a closed environment refuses requests before any token or database work', async (context) => {
  let touched = false;
  const app = express();
  app.use('/users/me/deletion-request', createAccountDeletionRequestRouter({
    service: { getRequest: async () => { touched = true; }, submitRequest: async () => { touched = true; } },
    verifyToken: (req, res, next) => { touched = true; next(); },
    requireInteractiveUserSession: (req, res, next) => next(),
    requireRecentAuthentication: (req, res, next) => next(),
    environment: requireAccountDeletionEnvironment({ isAvailable: () => false }),
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/users/me/deletion-request`;
  for (const method of ['GET', 'POST']) {
    const response = await fetch(url, { method, headers: { Authorization: 'Bearer token' } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).code, 'deletion_unavailable_in_environment');
  }
  assert.equal(touched, false);
});

test('account deletion requests require recent interactive auth and are idempotent per account', async (context) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const identities = {
    recent: { uid: 'viewer-1', auth_time: nowSeconds, firebase: { sign_in_provider: 'password' } },
    stale: { uid: 'viewer-1', auth_time: nowSeconds - 301, firebase: { sign_in_provider: 'password' } },
    future: { uid: 'viewer-1', auth_time: nowSeconds + 61, firebase: { sign_in_provider: 'password' } },
    missingTime: { uid: 'viewer-1', firebase: { sign_in_provider: 'password' } },
    tvSession: { uid: 'viewer-1', auth_time: nowSeconds, firebase: { sign_in_provider: 'custom' } },
    revoked: { uid: 'viewer-1', auth_time: nowSeconds, firebase: { sign_in_provider: 'password' } },
    otherViewer: { uid: 'viewer-2', auth_time: nowSeconds, firebase: { sign_in_provider: 'google.com' } },
  };
  const revokedTokens = new Set(['revoked']);
  const verifiedTokens = [];
  const tokenAuth = {
    verifyIdToken: async (token, checkRevoked = false) => {
      verifiedTokens.push({ token, checkRevoked });
      if (!identities[token] || (checkRevoked && revokedTokens.has(token))) throw new Error('invalid or revoked token');
      return identities[token];
    },
  };
  const records = new Map();
  const writes = [];
  const database = {
    collection: (name) => {
      assert.equal(name, 'accountDeletionRequests');
      return {
        doc: (uid) => ({
          uid,
          collection: (subcollection) => {
            assert.equal(subcollection, 'decisionHistory');
            return { doc: (id) => ({ uid, id, subcollection }) };
          },
          get: async () => {
            const record = records.get(uid);
            return { exists: Boolean(record), data: () => record };
          },
        }),
      };
    },
    runTransaction: async (callback) => callback({
      get: async (reference) => {
        const record = records.get(reference.uid);
        return { exists: Boolean(record), data: () => record };
      },
      create: (reference, record) => {
        if (!reference.subcollection) records.set(reference.uid, record);
        writes.push({ reference, record });
      },
    }),
  };
  const service = createAccountDeletionRequestService({
    getDb: () => database,
    now: () => nowSeconds * 1000,
  });
  const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split('Bearer ')[1];
    try {
      req.user = await tokenAuth.verifyIdToken(token);
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
  const requireRecentAuthentication = createRecentAuthenticationMiddleware({
    getAuth: () => tokenAuth,
    now: () => nowSeconds * 1000,
  });
  const app = express();
  app.use('/users/me/deletion-request', createAccountDeletionRequestRouter({
    service,
    verifyToken,
    requireInteractiveUserSession,
    requireRecentAuthentication,
    environment: allowEnvironment,
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/users/me/deletion-request`;
  async function request(token, method = 'GET') {
    const response = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + token },
    });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  }

  for (const token of ['stale', 'future', 'missingTime', 'tvSession']) {
    assert.equal((await request(token, 'POST')).status, 403, token);
  }
  assert.equal((await request('stale', 'POST')).body.code, 'recent_sign_in_required');
  assert.equal((await request('revoked', 'POST')).status, 401);
  assert.equal((await request('unknown', 'POST')).status, 401);
  assert.equal((await request('unknown')).status, 401);
  assert.equal(records.size, 0, 'rejected requests do not create records');

  const created = await request('recent', 'POST');
  assert.equal(created.status, 201);
  assert.ok(verifiedTokens.some(({ token, checkRevoked }) => token === 'recent' && checkRevoked));
  assert.equal(created.cache, 'no-store');
  assert.equal(created.body.request.status, 'pending_review');
  assert.equal(Number.isNaN(Date.parse(created.body.request.requestedAt)), false);
  assert.equal(records.get('viewer-1').uid, 'viewer-1');
  assert.equal(records.get('viewer-1').channel, 'web');
  assert.equal(Object.hasOwn(records.get('viewer-1'), 'email'), false, 'no email address is stored');
  assert.equal(writes.filter((write) => write.reference.subcollection).length, 1, 'submission is audited');

  const repeated = await request('recent', 'POST');
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.body, created.body);
  assert.equal(writes.filter((write) => !write.reference.subcollection).length, 1, 'repeat submissions reuse the single request');
  assert.deepEqual((await request('stale')).body, { request: created.body.request }, 'status can be viewed without a recent sign-in');
  assert.deepEqual((await request('otherViewer')).body, { request: null }, 'viewers only see their own request');
});

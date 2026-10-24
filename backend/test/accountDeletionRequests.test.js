const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAccountDeletionRequestService } = require('../src/accountDeletionRequests');
const { createAccountDeletionRequestRouter } = require('../src/routes/accountDeletionRequests');
const {
  createRecentAuthenticationMiddleware,
  requireInteractiveUserSession,
} = require('../src/middleware/auth');

test('account deletion requests require recent interactive auth and remain non-destructive', async (context) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const identities = {
    recent: { uid: 'viewer-1', auth_time: nowSeconds, firebase: { sign_in_provider: 'password' } },
    stale: { uid: 'viewer-1', auth_time: nowSeconds - 301, firebase: { sign_in_provider: 'password' } },
    future: { uid: 'viewer-1', auth_time: nowSeconds + 61, firebase: { sign_in_provider: 'password' } },
    missingTime: { uid: 'viewer-1', firebase: { sign_in_provider: 'password' } },
    custom: { uid: 'viewer-1', auth_time: nowSeconds, firebase: { sign_in_provider: 'custom' } },
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
        records.set(reference.uid, record);
        writes.push(record);
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

  for (const token of ['stale', 'future', 'missingTime', 'custom']) {
    assert.equal((await request(token, 'POST')).status, 403, token);
  }
  assert.equal((await request('revoked', 'POST')).status, 401);
  assert.equal((await request('unknown', 'POST')).status, 401);
  assert.equal(records.size, 0, 'rejected requests do not create records');

  const created = await request('recent', 'POST');
  assert.equal(created.status, 201);
  assert.ok(verifiedTokens.some(({ token, checkRevoked }) => token === 'recent' && checkRevoked));
  assert.equal(created.cache, 'no-store');
  assert.equal(created.body.request.status, 'received');
  assert.equal(Number.isNaN(Date.parse(created.body.request.requestedAt)), false);
  assert.equal(records.get('viewer-1').uid, 'viewer-1');
  assert.equal(records.get('viewer-1').status, 'received');
  assert.equal(Object.hasOwn(records.get('viewer-1'), 'email'), false);
  assert.equal(writes.length, 1);

  const repeated = await request('recent', 'POST');
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.body, created.body);
  assert.equal(writes.length, 1, 'repeat submissions reuse the single request');
  assert.deepEqual((await request('stale')).body, { request: created.body.request });
  assert.deepEqual((await request('otherViewer')).body, { request: null });
  assert.equal(records.size, 1);
  assert.equal(records.get('viewer-1').status, 'received');
});

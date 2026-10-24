const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const express = require('express');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const { createAccountDeletionAdminService } = require('../src/accountDeletionAdmin');
const { createAccountDeletionAdminRouter } = require('../src/routes/accountDeletionAdmin');

function testStore() {
  const requests = new Map();
  const histories = new Map();
  function reference(id, kind = 'request') {
    return {
      id,
      kind,
      get: async () => {
        const data = requests.get(id);
        return { exists: Boolean(data), data: () => data };
      },
      collection: (name) => {
        assert.equal(name, 'decisionHistory');
        return {
          get: async () => ({
            docs: (histories.get(id) || []).map((entry) => ({
              id: entry.id,
              data: () => entry.data,
            })),
          }),
          doc: (entryId) => ({ id: entryId, parentId: id, kind: 'history' }),
        };
      },
    };
  }
  const db = {
    collection: (name) => {
      if (name === 'accountDeletionRequests') {
        return {
          doc: (id) => reference(id),
          get: async () => ({
            docs: [...requests.entries()].map(([id, data]) => ({
              id,
              ref: reference(id),
              data: () => data,
            })),
          }),
        };
      }
      assert.fail(`Unexpected collection: ${name}`);
    },
    runTransaction: async (callback) => callback({
      get: async (ref) => {
        const data = requests.get(ref.id);
        return { exists: Boolean(data), data: () => data };
      },
      update: (ref, update) => requests.set(ref.id, { ...requests.get(ref.id), ...update }),
      create: (ref, data) => {
        if (ref.kind === 'history') {
          const existing = histories.get(ref.parentId) || [];
          existing.push({ id: ref.id, data });
          histories.set(ref.parentId, existing);
        }
      },
    }),
  };
  return { db, requests, histories };
}

function seedRequest(store, { id = 'viewer-1', status = 'pending_review', uid = id } = {}) {
  const requestedAt = new Date('2026-10-24T18:00:00.000Z');
  store.requests.set(id, { uid, status, requestedAt, updatedAt: requestedAt });
  store.histories.set(id, [{
    id: 'submitted',
    data: { action: 'request_submitted', toStatus: status, actorUid: uid, createdAt: requestedAt },
  }]);
}

function serviceFor(store, { now = () => Date.parse('2026-10-24T19:00:00.000Z'), verifyFulfillment } = {}) {
  return createAccountDeletionAdminService({
    getDb: () => store.db,
    getAuth: () => ({
      getUser: async (uid) => {
        if (uid === 'missing-user') throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
        return {
          email: `${uid}@example.test`,
          emailVerified: true,
          customClaims: { accountType: 'creator' },
        };
      },
    }),
    now,
    createId: () => 'audit-id',
    ...(verifyFulfillment ? { verifyFulfillment } : {}),
  });
}

function realVerifyAdmin() {
  const filename = require.resolve('../src/middleware/auth');
  const module = { exports: {} };
  const nativeRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    require: (name) => name === '../firebase'
      ? {
        auth: {
          verifyIdToken: async (token) => {
            if (token === 'invalid') throw new Error('Invalid token');
            return {
              uid: `uid-${token}`,
              admin: token === 'admin' || token === 'custom-admin',
              firebase: { sign_in_provider: token === 'custom-admin' ? 'custom' : 'password' },
            };
          },
        },
      }
      : nativeRequire(name),
  }, { filename });
  return module.exports.verifyAdmin;
}

test('admin list exposes only verified account type and flags creator records for verification', async () => {
  const store = testStore();
  seedRequest(store);
  const service = serviceFor(store);
  const result = await service.listRequests();

  assert.equal(result.pendingCount, 1);
  assert.equal(result.requests[0].account.email, 'viewer-1@example.test');
  assert.equal(result.requests[0].account.accountType.value, 'creator');
  assert.equal(result.requests[0].account.accountType.status, 'verified');
  assert.deepEqual(result.requests[0].creatorLinkage, {
    status: 'verification_required',
    projects: [],
    publishedContent: [],
    contracts: [],
  });
  assert.equal(result.requests[0].fulfillmentPlan.statutoryDeadline.dueAt, null);
  assert.equal(result.requests[0].fulfillmentPlan.completionEvidence.status, 'not_started');
});

test('admin status changes are validated and appended to the review history', async () => {
  const store = testStore();
  seedRequest(store);
  const service = serviceFor(store);
  const saved = await service.reviewRequest(
    'viewer-1',
    { status: 'approved_for_processing', reason: 'Reviewed; fulfillment plan still required.' },
    'admin-1',
  );

  assert.equal(saved.status, 'approved_for_processing');
  assert.equal(store.requests.get('viewer-1').decidedBy, 'admin-1');
  assert.equal(store.requests.get('viewer-1').adminDecision, 'Reviewed; fulfillment plan still required.');
  const decision = store.histories.get('viewer-1').find((entry) => entry.id === 'audit-id').data;
  assert.equal(decision.fromStatus, 'pending_review');
  assert.equal(decision.toStatus, 'approved_for_processing');
  assert.equal(decision.actorUid, 'admin-1');
  assert.equal((await service.getRequest('viewer-1')).decisionHistory.length, 2);

  await assert.rejects(
    service.reviewRequest('viewer-1', { status: 'completed', reason: 'Done.' }, 'admin-1'),
    { status: 409 },
  );
  await assert.rejects(
    service.reviewRequest('viewer-1', { status: 'pending_review', reason: 'Invalid reverse transition.' }, 'admin-1'),
    { status: 409 },
  );
  await assert.rejects(
    service.reviewRequest('viewer-1', { status: 'on_hold', reason: '   ' }, 'admin-1'),
    { status: 400 },
  );
  assert.equal(store.requests.get('viewer-1').status, 'approved_for_processing');
  assert.equal(store.histories.get('viewer-1').length, 2);
});

test('completion is blocked until a fulfillment verifier confirms evidence', async () => {
  const store = testStore();
  seedRequest(store, { status: 'approved_for_processing' });
  const blocked = serviceFor(store);
  await assert.rejects(
    blocked.reviewRequest('viewer-1', { status: 'completed', reason: 'Evidence checked.' }, 'admin-1'),
    { status: 409 },
  );
  assert.equal(store.requests.get('viewer-1').status, 'approved_for_processing');

  const verified = serviceFor(store, { verifyFulfillment: async () => true });
  const completed = await verified.reviewRequest(
    'viewer-1',
    { status: 'completed', reason: 'Authorized fulfillment evidence verified.' },
    'admin-1',
  );
  assert.equal(completed.status, 'completed');
});

test('legacy received requests normalize without deleting creator-linked content', async () => {
  const store = testStore();
  seedRequest(store, { status: 'received' });
  const before = JSON.stringify([...store.requests]);
  const result = await serviceFor(store).getRequest('viewer-1');

  assert.equal(result.status, 'pending_review');
  assert.equal(result.creatorLinkage.status, 'verification_required');
  assert.equal(JSON.stringify([...store.requests]), before);
  assert.equal(await serviceFor(store).getRequest('another-user'), null);
});

test('admin router rejects unauthenticated and non-admin requests before reading deletion data', async (context) => {
  const store = testStore();
  seedRequest(store);
  const calls = { list: 0 };
  const service = serviceFor(store);
  const originalList = service.listRequests;
  service.listRequests = async () => {
    calls.list += 1;
    return originalList();
  };
  const app = express();
  app.use('/admin/account-deletion-requests', createAccountDeletionAdminRouter({
    service,
    authorize: realVerifyAdmin(),
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/admin/account-deletion-requests`;

  for (const [authorization, status] of [
    [undefined, 401],
    ['Bearer viewer', 403],
    ['Bearer custom-admin', 403],
    ['Bearer invalid', 401],
  ]) {
    const response = await fetch(url, { headers: authorization ? { Authorization: authorization } : {} });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls.list, 0);
  const adminResponse = await fetch(url, { headers: { Authorization: 'Bearer admin' } });
  assert.equal(adminResponse.status, 200);
  assert.equal(calls.list, 1);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAccountDeletionAdminService } = require('../src/accountDeletionAdmin');
const { createAccountDeletionAdminRouter } = require('../src/routes/accountDeletionAdmin');

function testStore() {
  const requests = new Map();
  const histories = new Map();
  const profiles = new Set(['viewer-1']);
  const deviceSessions = [{ approvedByUid: 'viewer-1' }, { approvedByUid: 'viewer-2' }];
  const safetyReports = [{ contactEmail: 'viewer@example.com' }];
  const accounts = new Map([
    ['viewer-1', { email: 'viewer@example.com', emailVerified: true, providerData: [{ providerId: 'password' }] }],
    ['viewer-3', { email: 'roku@example.com', emailVerified: true, providerData: [{ providerId: 'password' }] }],
  ]);

  function requestReference(id) {
    return {
      id,
      kind: 'request',
      get: async () => {
        const data = requests.get(id);
        return { exists: Boolean(data), data: () => data };
      },
      collection: (name) => {
        assert.equal(name, 'decisionHistory');
        return {
          get: async () => ({
            docs: (histories.get(id) || []).map((entry) => ({ id: entry.id, data: () => entry.data })),
          }),
          doc: (entryId) => ({ id: entryId, parentId: id, kind: 'history' }),
        };
      },
    };
  }
  function whereQuery(rows, field) {
    return {
      where: (queryField, operator, value) => {
        assert.equal(queryField, field);
        assert.equal(operator, '==');
        return { get: async () => ({ size: rows.filter((row) => row[field] === value).length }) };
      },
    };
  }
  const db = {
    collection: (name) => {
      if (name === 'accountDeletionRequests') {
        return {
          doc: (id) => requestReference(id),
          get: async () => ({
            docs: [...requests.entries()].map(([id, data]) => ({ id, ref: requestReference(id), data: () => data })),
          }),
        };
      }
      if (name === 'users') {
        return { doc: (uid) => ({ get: async () => ({ exists: profiles.has(uid) }) }) };
      }
      if (name === 'deviceSessions') return whereQuery(deviceSessions, 'approvedByUid');
      if (name === 'safetyReports') return whereQuery(safetyReports, 'contactEmail');
      return assert.fail(`Unexpected collection: ${name}`);
    },
    runTransaction: async (callback) => callback({
      get: async (ref) => {
        const data = requests.get(ref.id);
        return { exists: Boolean(data), data: () => data };
      },
      update: (ref, update) => requests.set(ref.id, { ...requests.get(ref.id), ...update }),
      create: (ref, data) => {
        if (ref.kind === 'history') {
          histories.set(ref.parentId, [...(histories.get(ref.parentId) || []), { id: ref.id, data }]);
        } else {
          requests.set(ref.id, data);
        }
      },
    }),
  };
  const auth = {
    getUser: async (uid) => {
      if (!accounts.has(uid)) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
      return accounts.get(uid);
    },
  };
  return { db, auth, requests, histories, profiles, deviceSessions, accounts };
}

function seedRequest(store, { id = 'viewer-1', status = 'pending_review' } = {}) {
  const requestedAt = new Date('2026-10-24T18:00:00.000Z');
  store.requests.set(id, { uid: id, channel: 'web', status, requestedAt, updatedAt: requestedAt });
  store.histories.set(id, [{
    id: 'submitted',
    data: { action: 'request_submitted', toStatus: status, actorUid: id, createdAt: requestedAt },
  }]);
}

function serviceFor(store) {
  let counter = 0;
  return createAccountDeletionAdminService({
    getDb: () => store.db,
    getAuth: () => store.auth,
    now: () => Date.parse('2026-10-25T12:00:00.000Z'),
    createId: () => `history-${++counter}`,
  });
}

test('admin list reports live, read-only fulfillment checks for each request', async () => {
  const store = testStore();
  seedRequest(store);
  const { pendingCount, requests } = await serviceFor(store).listRequests();
  assert.equal(pendingCount, 1);
  const [request] = requests;
  assert.equal(request.account.email, 'viewer@example.com');
  assert.deepEqual(request.account.providers, ['password']);
  assert.equal(request.fulfillment.authAccount, 'present');
  assert.equal(request.fulfillment.profile, 'present');
  assert.equal(request.fulfillment.deviceSessions, 1);
  assert.equal(request.fulfillment.complete, false);
  assert.equal(request.safetyReportsFromAccountEmail, 1);
  assert.equal(request.decisionHistory.length, 1);
});

test('completion is refused until the runbook deletions are verified, then records evidence', async () => {
  const store = testStore();
  seedRequest(store);
  const service = serviceFor(store);

  await assert.rejects(
    service.reviewRequest('viewer-1', { status: 'completed', reason: 'done' }, 'admin-1'),
    (error) => error.status === 409,
    'pending requests must be approved before completion',
  );
  await service.reviewRequest('viewer-1', { status: 'approved_for_processing', reason: 'Verified by sign-in.' }, 'admin-1');

  await assert.rejects(
    service.reviewRequest('viewer-1', { status: 'completed', reason: 'done' }, 'admin-1'),
    (error) => error.status === 409
      && /users profile/.test(error.message)
      && /TV sign-in link/.test(error.message)
      && /Firebase sign-in account/.test(error.message),
  );
  assert.equal(store.requests.get('viewer-1').status, 'approved_for_processing');

  // The admin follows the manual runbook in the Firebase console.
  store.profiles.delete('viewer-1');
  store.deviceSessions.splice(0, 1);
  store.accounts.delete('viewer-1');

  const completed = await service.reviewRequest('viewer-1', { status: 'completed', reason: 'Runbook steps 1-4 done.' }, 'admin-1');
  assert.equal(completed.status, 'completed');
  const record = store.requests.get('viewer-1');
  assert.deepEqual(
    { ...record.fulfillmentEvidence, verifiedAt: record.fulfillmentEvidence.verifiedAt.toISOString() },
    { authAccount: 'deleted', profile: 'deleted', deviceSessions: 0, verifiedAt: '2026-10-25T12:00:00.000Z', verifiedBy: 'admin-1' },
  );
  const history = store.histories.get('viewer-1');
  assert.equal(history.at(-1).data.toStatus, 'completed');
  assert.equal(history.at(-1).data.fromStatus, 'approved_for_processing');

  const detail = await service.getRequest('viewer-1');
  assert.equal(detail.fulfillment.complete, true);
  assert.equal(detail.account.exists, false);
  await assert.rejects(
    service.reviewRequest('viewer-1', { status: 'on_hold', reason: 'reopen' }, 'admin-1'),
    (error) => error.status === 409,
    'completed requests are final',
  );
});

test('email requests are recorded once for an existing account', async () => {
  const store = testStore();
  const service = serviceFor(store);
  const recorded = await service.recordEmailRequest(
    { uid: 'viewer-3', reason: 'Email came from the account address.' },
    'admin-1',
  );
  assert.equal(recorded.channel, 'email');
  assert.equal(recorded.status, 'pending_review');
  assert.equal(Object.hasOwn(store.requests.get('viewer-3'), 'email'), false);
  assert.equal(store.histories.get('viewer-3')[0].data.action, 'request_recorded_from_email');

  await assert.rejects(
    service.recordEmailRequest({ uid: 'viewer-3', reason: 'again' }, 'admin-1'),
    (error) => error.status === 409,
  );
  await assert.rejects(
    service.recordEmailRequest({ uid: 'nobody', reason: 'unknown sender' }, 'admin-1'),
    (error) => error.status === 404,
  );
  await assert.rejects(
    service.recordEmailRequest({ uid: 'viewer-1', reason: ' ' }, 'admin-1'),
    (error) => error.status === 400,
  );
});

test('admin router requires administrator authorization and accepts only known fields', async (context) => {
  const store = testStore();
  seedRequest(store);
  let allow = false;
  const app = express();
  app.use('/admin/account-deletion-requests', createAccountDeletionAdminRouter({
    service: serviceFor(store),
    authorize: (req, res, next) => {
      if (!allow) return res.status(403).json({ error: 'Admin access required' });
      req.user = { uid: 'admin-1' };
      return next();
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/admin/account-deletion-requests`;
  const call = async (path = '', options = {}) => {
    const response = await fetch(base + path, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
    });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  };

  const denied = await call();
  assert.equal(denied.status, 403);
  assert.equal(denied.cache, 'no-store');

  allow = true;
  assert.equal((await call()).body.requests.length, 1);
  assert.equal((await call('/bad id')).status, 400);
  assert.equal((await call('/missing')).status, 404);
  assert.equal((await call('/viewer-1', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'on_hold', reason: 'x', uid: 'other' }),
  })).status, 400);
  const held = await call('/viewer-1', { method: 'PATCH', body: JSON.stringify({ status: 'on_hold', reason: 'Legal hold check.' }) });
  assert.equal(held.status, 200);
  assert.equal(held.body.request.status, 'on_hold');
  const recorded = await call('', { method: 'POST', body: JSON.stringify({ uid: 'viewer-3', reason: 'Verified sender.' }) });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.body.request.channel, 'email');
});

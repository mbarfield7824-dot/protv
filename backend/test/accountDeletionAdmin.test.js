const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAccountDeletionAdminService, TOKEN_EXPIRY_WAIT_MS } = require('../src/accountDeletionAdmin');
const { createAccountDeletionAdminRouter } = require('../src/routes/accountDeletionAdmin');
const { requireAccountDeletionEnvironment } = require('../src/accountDeletionEnvironment');

const START = Date.parse('2026-10-25T12:00:00.000Z');
const MINUTE = 60 * 1000;

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
  const transactionReads = [];

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
  function whereQuery(name, rows, field) {
    return {
      where: (queryField, operator, value) => {
        assert.equal(queryField, field);
        assert.equal(operator, '==');
        return { name, get: async () => ({ size: rows.filter((row) => row[field] === value).length }) };
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
        return { doc: (uid) => ({ name: 'users', get: async () => ({ exists: profiles.has(uid) }) }) };
      }
      if (name === 'deviceSessions') return whereQuery('deviceSessions', deviceSessions, 'approvedByUid');
      if (name === 'safetyReports') return whereQuery('safetyReports', safetyReports, 'contactEmail');
      return assert.fail(`Unexpected collection: ${name}`);
    },
    runTransaction: async (callback) => callback({
      get: async (refOrQuery) => {
        transactionReads.push(refOrQuery.name || refOrQuery.kind);
        return refOrQuery.get();
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
  return { db, auth, requests, histories, profiles, deviceSessions, accounts, transactionReads };
}

function seedRequest(store, { id = 'viewer-1', status = 'pending_review' } = {}) {
  const requestedAt = new Date('2026-10-24T18:00:00.000Z');
  store.requests.set(id, { uid: id, channel: 'web', status, requestedAt, updatedAt: requestedAt });
  store.histories.set(id, [{
    id: 'submitted',
    data: { action: 'request_submitted', toStatus: status, actorUid: id, createdAt: requestedAt },
  }]);
}

function serviceFor(store, clock = { now: START }) {
  let counter = 0;
  return createAccountDeletionAdminService({
    getDb: () => store.db,
    getAuth: () => store.auth,
    now: () => clock.now,
    createId: () => `history-${++counter}`,
  });
}

const rejectsWith = (promise, status, pattern) => assert.rejects(promise, (error) => (
  error.status === status && (!pattern || pattern.test(error.message))
));

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
  assert.equal(request.completionAvailableAt, null);
});

test('the sign-in step requires the TV links and Auth account gone, then starts the waiting period', async () => {
  const store = testStore();
  seedRequest(store, { status: 'approved_for_processing' });
  const clock = { now: START };
  const service = serviceFor(store, clock);
  const step = () => service.reviewRequest('viewer-1', { status: 'sign_in_deleted', reason: 'Auth deleted.' }, 'admin-1');

  await rejectsWith(step(), 409, /TV sign-in link/);
  store.deviceSessions.splice(0, 1);
  await rejectsWith(step(), 409, /sign-in account still exists/);
  assert.equal(store.requests.get('viewer-1').status, 'approved_for_processing');

  store.accounts.delete('viewer-1');
  assert.equal((await step()).status, 'sign_in_deleted');
  assert.equal(store.requests.get('viewer-1').signInDeletedVerifiedAt.toISOString(), '2026-10-25T12:00:00.000Z');
  const detail = await service.getRequest('viewer-1');
  assert.equal(detail.completionAvailableAt, new Date(START + TOKEN_EXPIRY_WAIT_MS).toISOString());
});

test('completion waits for issued tokens to expire and rechecks the data in the same transaction', async () => {
  const store = testStore();
  seedRequest(store, { status: 'approved_for_processing' });
  const clock = { now: START };
  const service = serviceFor(store, clock);
  const complete = (body = {}) => service.reviewRequest(
    'viewer-1',
    { status: 'completed', reason: 'Runbook done; confirmation emailed.', creatorPortalReviewed: true, ...body },
    'admin-1',
  );

  await rejectsWith(complete(), 409, /approved_for_processing to completed is not allowed/);

  store.deviceSessions.splice(0, 1);
  store.accounts.delete('viewer-1');
  store.profiles.delete('viewer-1');
  await service.reviewRequest('viewer-1', { status: 'sign_in_deleted', reason: 'Auth deleted.' }, 'admin-1');

  await rejectsWith(complete({ creatorPortalReviewed: undefined }), 400, /Creator Portal/);
  clock.now = START + 64 * MINUTE;
  await rejectsWith(complete(), 409, /waiting period .* ends at 2026-10-25T13:05:00.000Z \(1 min\)/);

  // A TV whose token was still valid wrote watch progress during the wait.
  store.profiles.add('viewer-1');
  clock.now = START + TOKEN_EXPIRY_WAIT_MS;
  store.transactionReads.length = 0;
  await rejectsWith(complete(), 409, /users profile document still exists/);
  assert.deepEqual(store.transactionReads.sort(), ['deviceSessions', 'request', 'users']);
  assert.equal(store.requests.get('viewer-1').status, 'sign_in_deleted');

  store.profiles.delete('viewer-1');
  const completed = await complete();
  assert.equal(completed.status, 'completed');
  const evidence = store.requests.get('viewer-1').fulfillmentEvidence;
  assert.deepEqual({
    ...evidence,
    signInDeletedVerifiedAt: evidence.signInDeletedVerifiedAt.toISOString(),
    verifiedAt: evidence.verifiedAt.toISOString(),
  }, {
    authAccount: 'deleted',
    profile: 'deleted',
    deviceSessions: 0,
    creatorPortalReviewed: true,
    signInDeletedVerifiedAt: '2026-10-25T12:00:00.000Z',
    verifiedAt: '2026-10-25T13:05:00.000Z',
    verifiedBy: 'admin-1',
  });
  const history = store.histories.get('viewer-1');
  assert.equal(history.at(-1).data.fromStatus, 'sign_in_deleted');
  assert.equal(history.at(-1).data.toStatus, 'completed');
  await rejectsWith(
    service.reviewRequest('viewer-1', { status: 'on_hold', reason: 'reopen' }, 'admin-1'),
    409,
  );
});

test('a recreated sign-in account during the wait blocks completion', async () => {
  const store = testStore();
  seedRequest(store, { status: 'approved_for_processing' });
  const clock = { now: START };
  const service = serviceFor(store, clock);
  store.deviceSessions.splice(0, 1);
  store.accounts.delete('viewer-1');
  store.profiles.delete('viewer-1');
  await service.reviewRequest('viewer-1', { status: 'sign_in_deleted', reason: 'Auth deleted.' }, 'admin-1');
  store.accounts.set('viewer-1', { email: 'viewer@example.com', providerData: [] });
  clock.now = START + TOKEN_EXPIRY_WAIT_MS;
  await rejectsWith(
    service.reviewRequest('viewer-1', { status: 'completed', reason: 'done', creatorPortalReviewed: true }, 'admin-1'),
    409,
    /Firebase sign-in account still exists/,
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

  await rejectsWith(service.recordEmailRequest({ uid: 'viewer-3', reason: 'again' }, 'admin-1'), 409);
  await rejectsWith(service.recordEmailRequest({ uid: 'nobody', reason: 'unknown sender' }, 'admin-1'), 404);
  await rejectsWith(service.recordEmailRequest({ uid: 'viewer-1', reason: ' ' }, 'admin-1'), 400);
});

async function listen(context, app) {
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}/admin/account-deletion-requests`;
}

test('admin router requires administrator authorization and accepts only known fields', async (context) => {
  const store = testStore();
  seedRequest(store);
  let allow = false;
  const app = express();
  app.use('/admin/account-deletion-requests', createAccountDeletionAdminRouter({
    service: serviceFor(store),
    environment: (req, res, next) => next(),
    authorize: (req, res, next) => {
      if (!allow) return res.status(403).json({ error: 'Admin access required' });
      req.user = { uid: 'admin-1' };
      return next();
    },
  }));
  const base = await listen(context, app);
  const call = async (path = '', options = {}) => {
    const response = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json' } });
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

test('a closed environment refuses admin calls before authorization or data access', async (context) => {
  let authorized = false;
  const app = express();
  app.use('/admin/account-deletion-requests', createAccountDeletionAdminRouter({
    service: { listRequests: async () => assert.fail('no data access') },
    environment: requireAccountDeletionEnvironment({ isAvailable: () => false }),
    authorize: (req, res, next) => { authorized = true; next(); },
  }));
  const base = await listen(context, app);
  for (const [path, method] of [['', 'GET'], ['', 'POST'], ['/viewer-1', 'PATCH']]) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
    assert.equal(response.status, 503, `${method} ${path}`);
  }
  assert.equal(authorized, false);
});

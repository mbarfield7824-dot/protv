const assert = require('node:assert/strict');
const test = require('node:test');
const { createAccountDeletionHandler } = require('../src/auth/accountDeletion');

async function invoke(options = {}, token = 'Bearer test-token') {
  const calls = [];
  const user = { uid: 'viewer', auth_time: 1000, firebase: { sign_in_provider: 'password' } };
  const auth = {
    verifyIdToken: async (value, revoked) => { calls.push(['verify', value, revoked]); return user; },
    revokeRefreshTokens: async (uid) => calls.push(['revoke', uid]),
    deleteUser: async (uid) => calls.push(['auth-delete', uid]),
  };
  const db = {
    collection: (name) => ({
      doc: (uid) => `${name}/${uid}`,
      where: (field, comparison, uid) => {
        calls.push(['query', name, field, comparison, uid]);
        return { limit: () => ({ get: async () => ({ size: 0, docs: [] }) }) };
      },
    }),
    recursiveDelete: async (ref) => calls.push(['data-delete', ref]),
  };
  let status = 200;
  let body;
  let failure;
  const res = { status: (code) => { status = code; return res; }, json: (payload) => { body = payload; return res; } };
  await createAccountDeletionHandler({ db, auth, enabled: () => true, now: () => 1100000, ...options })(
    { headers: { authorization: token } }, res, (error) => { failure = error; },
  );
  return { status, body, failure, calls };
}

test('deletion is off by default and unavailable without services', async () => {
  assert.equal((await invoke({ enabled: () => false })).status, 503);
  assert.equal((await invoke({ db: null })).status, 503);
});

test('missing, revoked, stale, future, custom-token and elevated sessions cannot delete', async () => {
  assert.equal((await invoke({}, '')).status, 401);
  assert.equal((await invoke({ auth: { verifyIdToken: async () => { throw new Error('revoked'); } } })).status, 401);
  for (const user of [
    { uid: 'viewer', auth_time: 1, firebase: { sign_in_provider: 'password' } },
    { uid: 'viewer', auth_time: 2000, firebase: { sign_in_provider: 'password' } },
    { uid: 'viewer', auth_time: 1000, firebase: { sign_in_provider: 'custom' } },
    { uid: 'viewer', auth_time: 1000, admin: true, firebase: { sign_in_provider: 'password' } },
  ]) {
    const result = await invoke({ auth: { verifyIdToken: async () => user } });
    assert.ok([403, 409].includes(result.status));
  }
});

test('deletes only the authenticated viewer after revocation and data cleanup', async () => {
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { deleted: true });
  assert.deepEqual(result.calls, [
    ['verify', 'test-token', true], ['revoke', 'viewer'],
    ['query', 'deviceSessions', 'approvedByUid', '==', 'viewer'],
    ['data-delete', 'users/viewer'], ['auth-delete', 'viewer'],
  ]);
});

test('cleanup failure is surfaced and authentication deletion is not attempted', async () => {
  const error = new Error('storage unavailable');
  const result = await invoke({ db: {
    collection: () => ({ where: () => ({ limit: () => ({ get: async () => { throw error; } }) }) }),
  } });
  assert.equal(result.failure, error);
  assert.equal(result.calls.some(([action]) => action === 'auth-delete'), false);
});

test('approved device sessions are deleted in bounded batches before viewer removal', async () => {
  const deleted = [];
  let page = 0;
  const pages = [Array.from({ length: 200 }, (_, id) => ({ ref: `session-${id}` })), [{ ref: 'last-session' }]];
  const result = await invoke({ db: {
    collection: () => ({
      doc: (uid) => uid,
      where: () => ({ limit: (size) => {
        assert.equal(size, 200);
        return { get: async () => {
          const docs = pages[page++] || [];
          return { size: docs.length, docs };
        } };
      } }),
    }),
    batch: () => ({ delete: (ref) => deleted.push(ref), commit: async () => {} }),
    recursiveDelete: async (uid) => { assert.equal(uid, 'viewer'); },
  } });
  assert.equal(result.status, 200);
  assert.equal(page, 2);
  assert.equal(deleted.length, 201);
});

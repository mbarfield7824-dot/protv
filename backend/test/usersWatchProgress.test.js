const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const admin = require('firebase-admin');

test('progress routes write nested fields, preserve siblings, recover legacy entries and delete both shapes', async () => {
  const firebasePath = require.resolve('../src/firebase');
  const authPath = require.resolve('../src/middleware/auth');
  const usersPath = require.resolve('../src/routes/users');
  const previous = [firebasePath, authPath, usersPath].map((path) => require.cache[path]);
  const legacy = { positionSeconds: 30, durationSeconds: 100, progressPercent: 30, updatedAt: 1 };
  let profile = {
    'watchProgress.legacy': legacy, watchProgress: { sibling: legacy },
    favoriteVideoIds: ['sibling'], displayName: 'Viewer',
  };
  const writes = [];
  const ref = {
    get: async () => ({ exists: true, data: () => profile }),
    set: async (data, options) => {
      writes.push({ data, options });
      const nested = { ...profile.watchProgress };
      for (const [id, entry] of Object.entries(data.watchProgress || {})) {
        if (admin.firestore.FieldValue.delete().isEqual(entry)) delete nested[id];
        else nested[id] = entry;
      }
      profile = { ...profile, watchProgress: nested };
      for (const key of Object.keys(data)) {
        if (key.startsWith('watchProgress.')) delete profile[key];
      }
    },
  };
  require.cache[firebasePath] = { exports: { db: { collection: () => ({ doc: () => ref }) } } };
  require.cache[authPath] = { exports: { verifyToken: (req, res, next) => { req.user = { uid: 'test-viewer' }; next(); } } };
  delete require.cache[usersPath];
  const app = express();
  app.use(express.json());
  app.use('/users', require('../src/routes/users'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/users/me/progress`;
  try {
    assert.deepEqual(await (await fetch(origin)).json(), { sibling: legacy, legacy });
    const response = await fetch(`${origin}/legacy`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionSeconds: 40, durationSeconds: 100 }),
    });
    assert.equal(response.status, 200);
    assert.equal(writes[0].data.watchProgress.legacy.positionSeconds, 40);
    assert.deepEqual(writes[0].options, { merge: true });
    const restored = await (await fetch(origin)).json();
    assert.equal(restored.legacy.positionSeconds, 40);
    assert.deepEqual(restored.sibling, legacy);
    const beforeInvalid = writes.length;
    for (const body of [
      { positionSeconds: -1, durationSeconds: 100 },
      { positionSeconds: 10, durationSeconds: 0 },
      { positionSeconds: '10', durationSeconds: 100 },
    ]) {
      assert.equal((await fetch(`${origin}/sibling`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })).status, 400);
    }
    assert.equal(writes.length, beforeInvalid);
    assert.deepEqual((await (await fetch(origin)).json()).sibling, legacy);
    assert.equal((await fetch(`${origin}/legacy`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(await (await fetch(origin)).json(), { sibling: legacy });
    assert.equal((await fetch(`${origin}/dotted.title`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionSeconds: 5, durationSeconds: 100 }),
    })).status, 200);
    assert.equal(profile.watchProgress['dotted.title'].positionSeconds, 5);
    assert.equal(profile.watchProgress.dotted, undefined);
    assert.deepEqual(profile.watchProgress.sibling, legacy);
    assert.deepEqual(profile.favoriteVideoIds, ['sibling']);
    assert.equal(profile.displayName, 'Viewer');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    [firebasePath, authPath, usersPath].forEach((path, index) => {
      if (previous[index]) require.cache[path] = previous[index];
      else delete require.cache[path];
    });
  }
});

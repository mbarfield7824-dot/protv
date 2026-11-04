const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

test('scheduled movie uploads stay private drafts while ordinary uploads retain existing behavior', async (context) => {
  const firebase = require('../src/firebase');
  const mux = require('../src/mux');
  const previousAuth = firebase.auth;
  const records = [];
  const policies = [];
  firebase.auth = {
    verifyIdToken: async () => ({
      uid: 'admin-user',
      firebase: { sign_in_provider: 'password' },
      admin: true,
    }),
  };
  context.mock.method(firebase, 'addVideo', async (record) => {
    records.push(record);
    return `title-${records.length}`;
  });
  context.mock.method(mux, 'createDirectUpload', async (_origin, options) => {
    policies.push(options?.playbackPolicy || 'public');
    return { id: `upload-${policies.length}`, url: 'https://mux.example/upload' };
  });

  const middlewarePath = require.resolve('../src/middleware/auth');
  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[middlewarePath];
  delete require.cache[routePath];
  const app = express();
  app.use(express.json());
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    delete require.cache[routePath];
    delete require.cache[middlewarePath];
    firebase.auth = previousAuth;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/videos/upload-url`;
  const submit = (body) => fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test title', category: 'Drama', ...body }),
  });

  const scheduled = await submit({
    releaseAtLocal: '2099-01-01T20:00',
    releaseTimeZone: 'America/New_York',
    rightsHolder: 'Verified distributor',
    rightsVerificationNotes: 'Written license covers the intended PROtv release.',
  });
  assert.equal(scheduled.status, 201);
  assert.equal((await scheduled.json()).releaseStatus, 'scheduled');
  assert.equal(records[0].approvalStatus, 'draft');
  assert.equal(records[0].muxPlaybackPolicy, 'signed');
  assert.equal(records[0].rightsHolder, 'Verified distributor');
  assert.equal(records[0].releaseAt, '2099-01-02T01:00:00.000Z');
  assert.deepEqual(policies, ['signed']);

  const missingRights = await submit({
    releaseAtLocal: '2099-01-01T20:00',
    releaseTimeZone: 'America/New_York',
  });
  assert.equal(missingRights.status, 400);
  assert.equal(records.length, 1);
  assert.deepEqual(policies, ['signed']);

  const ordinary = await submit({});
  assert.equal(ordinary.status, 201);
  assert.equal(records[1].approvalStatus, 'approved');
  assert.equal(records[1].muxPlaybackPolicy, undefined);
  assert.equal(records[1].releaseStatus, undefined);
  assert.deepEqual(policies, ['signed', 'public']);
});

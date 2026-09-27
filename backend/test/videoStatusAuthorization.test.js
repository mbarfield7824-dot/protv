const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

test('Admin status polling requires an interactive admin and preserves Mux reconciliation', async (context) => {
  const firebase = require('../src/firebase');
  const mux = require('../src/mux');
  const omdb = require('../src/omdb');
  const previousAuth = firebase.auth;
  const records = new Map([
    ['upload-ready', {
      id: 'upload-ready', title: 'Uploaded movie', status: 'processing',
      muxUploadId: 'upload-1', duration: 12, approvalStatus: 'approved',
      adminSourceFilePath: 'private-path',
    }],
    ['asset-error', {
      id: 'asset-error', title: 'URL movie', status: 'processing',
      muxAssetId: 'asset-2', duration: 40,
    }],
    ['still-processing', {
      id: 'still-processing', title: 'Waiting', status: 'processing',
      muxUploadId: 'upload-2',
    }],
    ['already-ready', {
      id: 'already-ready', title: 'Completed', status: 'ready',
      muxPlaybackId: 'existing-playback',
    }],
  ]);
  const reads = [];
  const writes = [];
  const uploads = [];
  const assets = [];
  const ratings = [];

  firebase.auth = {
    verifyIdToken: async (token) => {
      if (token === 'invalid') throw new Error('Invalid token');
      const identities = {
        password: { firebase: { sign_in_provider: 'password' }, admin: true },
        google: { firebase: { sign_in_provider: 'google.com' }, admin: true },
        nonadmin: { firebase: { sign_in_provider: 'password' }, admin: false },
        custom: { firebase: { sign_in_provider: 'custom' }, admin: true },
        missing: { admin: true },
        unsupported: { firebase: { sign_in_provider: 'github.com' }, admin: true },
      };
      if (!Object.hasOwn(identities, token)) throw new Error('Invalid token');
      return { uid: 'admin-uid', ...identities[token] };
    },
  };
  context.mock.method(firebase, 'getVideoById', async (id) => {
    reads.push(id);
    const record = records.get(id);
    if (!record) throw new Error('Video not found');
    return { ...record };
  });
  context.mock.method(firebase, 'updateVideo', async (id, changes) => {
    writes.push({ id, changes });
    records.set(id, { ...records.get(id), ...changes });
  });
  context.mock.method(mux, 'getUpload', async (id) => {
    uploads.push(id);
    return { asset_id: id === 'upload-1' ? 'asset-1' : null };
  });
  context.mock.method(mux, 'getAsset', async (id) => {
    assets.push(id);
    if (id === 'asset-1') {
      return {
        id, status: 'ready', duration: 94.6,
        playback_ids: [{ policy: 'public', id: 'playback-1' }],
      };
    }
    return { id, status: 'errored' };
  });
  context.mock.method(omdb, 'getImdbRating', async (video) => {
    ratings.push(video.id);
    return { imdbRating: 7.5 };
  });

  const middlewarePath = require.resolve('../src/middleware/auth');
  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[middlewarePath];
  delete require.cache[routePath];
  const app = express();
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    delete require.cache[routePath];
    delete require.cache[middlewarePath];
    firebase.auth = previousAuth;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function status(id, token) {
    const response = await fetch(`${base}/videos/${id}/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { code: response.status, body: await response.json() };
  }

  for (const [token, expected] of [
    [null, 401], ['invalid', 401], ['nonadmin', 403], ['custom', 403],
    ['missing', 403], ['unsupported', 403],
  ]) {
    assert.equal((await status('upload-ready', token)).code, expected, String(token));
  }
  assert.deepEqual(reads, [], 'unauthorized requests must not inspect catalog records');
  assert.deepEqual(uploads, []);
  assert.deepEqual(assets, []);
  assert.deepEqual(writes, []);

  const pending = await status('still-processing', 'google');
  assert.equal(pending.code, 200);
  assert.equal(pending.body.status, 'processing');
  assert.deepEqual(uploads, ['upload-2']);
  assert.deepEqual(assets, []);

  const ready = await status('upload-ready', 'password');
  assert.equal(ready.code, 200);
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.muxAssetId, 'asset-1');
  assert.equal(ready.body.muxPlaybackId, 'playback-1');
  assert.equal(ready.body.duration, 95);
  assert.equal(ready.body.imdbRating, 7.5);
  assert.equal(ready.body.adminSourceFilePath, undefined);
  assert.deepEqual(uploads, ['upload-2', 'upload-1']);
  assert.deepEqual(assets, ['asset-1']);
  assert.deepEqual(ratings, ['upload-ready']);
  assert.deepEqual(writes.filter(({ id }) => id === 'upload-ready'), [
    {
      id: 'upload-ready',
      changes: { status: 'ready', muxPlaybackId: 'playback-1', muxAssetId: 'asset-1', duration: 95 },
    },
    { id: 'upload-ready', changes: { imdbRating: 7.5 } },
  ]);

  const errored = await status('asset-error', 'google');
  assert.equal(errored.code, 200);
  assert.equal(errored.body.status, 'errored');
  assert.deepEqual(assets, ['asset-1', 'asset-2']);
  assert.deepEqual(writes.filter(({ id }) => id === 'asset-error'), [
    { id: 'asset-error', changes: { status: 'errored' } },
  ]);

  const completed = await status('already-ready', 'password');
  assert.equal(completed.code, 200);
  assert.equal(completed.body.muxPlaybackId, 'existing-playback');
  assert.equal(writes.length, 3);
});

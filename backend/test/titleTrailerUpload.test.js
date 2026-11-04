const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const { createTitleTrailerRouter } = require('../src/integrations/titleTrailerRouter');
const { playableCatalog } = require('../src/catalog/readModel');

async function serve(context, app) {
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('direct trailer uploads stay signed, replace atomically after readiness, and support admin preview/removal', async (context) => {
  const records = new Map([['title1', {
    id: 'title1', contentType: 'MOVIE', title: 'Test title', approvalStatus: 'approved',
    trailerStatus: 'ready', trailerAssetId: 'old-asset', trailerPlaybackId: 'old-playback',
  }]]);
  let uploaded = false;
  const removedAssets = [];
  const cancelledUploads = [];
  const policies = [];
  const app = express();
  app.use('/admin/title-trailers', createTitleTrailerRouter({
    verifyAdmin: (req, res, next) => req.header('x-admin') === 'yes'
      ? next() : res.status(403).json({ error: 'Admin required.' }),
    getVideoById: async (id) => {
      const video = records.get(id);
      if (!video) throw new Error('Video not found');
      return { ...video };
    },
    updateVideo: async (id, updates) => records.set(id, { ...records.get(id), ...updates }),
    createDirectUpload: async (_origin, options) => {
      policies.push(options.playbackPolicy);
      return { id: 'upload-1', url: 'https://mux.example/upload' };
    },
    getUpload: async () => ({ id: 'upload-1', status: uploaded ? 'asset_created' : 'waiting', asset_id: uploaded ? 'new-asset' : null }),
    getAsset: async () => ({
      id: 'new-asset', status: 'ready', duration: 45.4,
      playback_ids: [{ policy: 'signed', id: 'new-playback' }],
    }),
    getPlaybackId: (asset, policy) => asset.playback_ids.find((item) => item.policy === policy)?.id,
    signPlayback: async (id) => `token-${id}`,
    cancelUpload: async (id) => cancelledUploads.push(id),
    deleteAsset: async (id) => removedAssets.push(id),
    logError: () => {},
  }));
  const base = await serve(context, app);
  const request = (path, options = {}) => fetch(`${base}/admin/title-trailers${path}`, {
    ...options,
    headers: { 'x-admin': 'yes', ...(options.headers || {}) },
  });

  assert.equal((await fetch(`${base}/admin/title-trailers/title1/status`)).status, 403);
  const created = await request('/title1/upload-url', { method: 'POST' });
  assert.equal(created.status, 201);
  assert.deepEqual(policies, ['signed']);
  assert.equal((await request('/title1/upload-url', { method: 'POST' })).status, 409);
  assert.deepEqual(policies, ['signed']);
  assert.equal(records.get('title1').trailerPlaybackId, 'old-playback');
  assert.equal((await (await request('/title1/status')).json()).status, 'processing');

  uploaded = true;
  const ready = await (await request('/title1/status')).json();
  assert.equal(ready.status, 'ready');
  assert.equal(ready.available, true);
  assert.equal(records.get('title1').trailerPlaybackId, 'new-playback');
  assert.equal(records.get('title1').trailerDuration, 45);
  assert.deepEqual(removedAssets, ['old-asset']);

  const preview = await (await request('/title1/preview')).json();
  assert.deepEqual(preview, {
    id: 'title1', muxPlaybackId: 'new-playback', playbackToken: 'token-new-playback',
  });
  assert.equal((await request('/title1', { method: 'DELETE' })).status, 204);
  assert.equal(records.get('title1').trailerPlaybackId, null);
  assert.deepEqual(removedAssets, ['old-asset', 'new-asset']);
  assert.deepEqual(cancelledUploads, []);
});

test('public trailer playback requires title approval but remains available before its scheduled feature release', async (context) => {
  const scheduled = {
    id: 'movie1', contentType: 'MOVIE', title: 'Premiere', approvalStatus: 'approved',
    status: 'ready', muxPlaybackId: 'full-film', releaseStatus: 'scheduled',
    releaseAt: '2099-01-01T00:00:00.000Z', trailerStatus: 'ready',
    trailerPlaybackId: 'signed-trailer', trailerDuration: 30, trailerAssetId: 'private-asset',
    trailerUploadId: 'private-upload',
  };
  let signingCalls = 0;
  const app = express();
  app.use('/catalog', createCatalogRouter({
    loadApproved: async () => [scheduled],
    signPlaybackToken: async (id, duration) => {
      signingCalls += 1;
      assert.equal(id, 'signed-trailer');
      assert.equal(duration, 30);
      return 'short-lived-token';
    },
  }));
  const base = await serve(context, app);
  const response = await fetch(`${base}/catalog/titles/movie1/trailer/playback`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 'movie1', muxPlaybackId: 'signed-trailer', playbackToken: 'short-lived-token',
  });
  assert.equal(signingCalls, 1);
  const publicMovie = playableCatalog([{ ...scheduled, releaseStatus: 'published' }])[0];
  assert.equal(publicMovie.trailerAvailable, true);
  assert.equal('trailerPlaybackId' in publicMovie, false);

  scheduled.approvalStatus = 'draft';
  assert.equal((await fetch(`${base}/catalog/titles/movie1/trailer/playback`)).status, 404);
  assert.equal(signingCalls, 1);
});

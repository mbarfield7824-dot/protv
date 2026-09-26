const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const express = require('express');

test('Mux webhook verifies raw signed events and only reconciles the pending asset', async (context) => {
  const firebase = require('../src/firebase');
  const omdb = require('../src/omdb');
  const candidateStore = require('../src/adminBot/candidateStore');
  const secret = 'isolated-mux-webhook-secret';
  const previousSecret = process.env.MUX_WEBHOOK_SECRET;
  process.env.MUX_WEBHOOK_SECRET = secret;
  context.after(() => {
    if (previousSecret === undefined) delete process.env.MUX_WEBHOOK_SECRET;
    else process.env.MUX_WEBHOOK_SECRET = previousSecret;
  });

  const videos = new Map([
    ['upload-1', {
      id: 'upload-1', title: 'Uploaded', status: 'processing',
      approvalStatus: 'approved', muxUploadId: 'mux-upload-1',
    }],
    ['pd-1', {
      id: 'pd-1', title: 'Public Domain', status: 'processing',
      approvalStatus: 'draft', muxAssetId: 'asset-pd',
      publicDomainCandidateId: 'candidate-1', publicDomainConfirmedBy: 'admin-1',
    }],
  ]);
  const decisions = [];
  const approvals = [];
  const updates = [];
  const candidate = { decision: 'processing', catalogId: 'pd-1' };

  context.mock.method(firebase, 'getVideoByUploadId', async (id) =>
    [...videos.values()].find((video) => video.muxUploadId === id) || null);
  context.mock.method(firebase, 'getVideoByAssetId', async (id) =>
    [...videos.values()].find((video) => video.muxAssetId === id) || null);
  context.mock.method(firebase, 'updateVideo', async (id, changes) => {
    updates.push({ id, changes });
    videos.set(id, { ...videos.get(id), ...changes });
  });
  context.mock.method(firebase, 'updateVideoApproval', async (id, changes) => {
    approvals.push({ id, changes });
    videos.set(id, { ...videos.get(id), ...changes });
  });
  context.mock.method(candidateStore, 'createCandidateStore', () => ({
    get: async () => candidate,
    setDecision: async (id, decision) => decisions.push({ id, decision }),
  }));
  context.mock.method(omdb, 'getImdbRating', async () => null);

  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const app = express();
  app.use(express.json({
    verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); },
  }));
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    delete require.cache[routePath];
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/videos/webhook`;

  async function send(event, {
    signed = true, timestamp = Math.floor(Date.now() / 1000), body, signedBody,
  } = {}) {
    const raw = body || JSON.stringify(event);
    const signature = crypto.createHmac('sha256', secret)
      .update(`${timestamp}.${signedBody || raw}`).digest('hex');
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signed ? { 'mux-signature': `t=${timestamp},v1=${signature}` } : {}),
      },
      body: raw,
    });
  }

  const ready = {
    id: 'event-ready', type: 'video.asset.ready',
    data: {
      id: 'asset-upload-1', upload_id: 'mux-upload-1', status: 'ready',
      duration: 91.2, playback_ids: [{ policy: 'public', id: 'playback-1' }],
    },
  };
  assert.equal((await send(ready, { signed: false })).status, 401);
  assert.equal((await send(ready, {
    body: `${JSON.stringify(ready)} `, signedBody: JSON.stringify(ready),
  })).status, 401);
  assert.equal((await send(ready, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status, 401);
  assert.equal(updates.length, 0);

  delete process.env.MUX_WEBHOOK_SECRET;
  assert.equal((await send(ready)).status, 503);
  assert.equal(updates.length, 0);
  process.env.MUX_WEBHOOK_SECRET = secret;

  assert.equal((await send({ type: 'unrecognized.event', data: ready.data })).status, 200);
  assert.equal(updates.length, 0);
  assert.equal((await send(ready)).status, 200);
  assert.equal(videos.get('upload-1').muxPlaybackId, 'playback-1');
  assert.equal(videos.get('upload-1').duration, 91);
  const firstDeliveryWrites = updates.length;
  assert.equal((await send(ready)).status, 200);
  assert.equal(updates.length, firstDeliveryWrites, 'duplicate event must not write again');
  assert.equal((await send({
    type: 'video.asset.errored',
    data: { id: 'asset-upload-1', upload_id: 'mux-upload-1' },
  })).status, 200);
  assert.equal(videos.get('upload-1').status, 'ready', 'late error must not undo readiness');

  const missingPlayback = {
    type: 'video.asset.ready',
    data: { id: 'asset-pd', status: 'ready', playback_ids: [] },
  };
  assert.equal((await send(missingPlayback)).status, 409);
  assert.equal(videos.get('pd-1').status, 'processing');
  assert.equal((await send({
    type: 'video.asset.errored',
    data: { id: 'old-asset', upload_id: 'mux-upload-1' },
  })).status, 200);
  assert.equal(videos.get('upload-1').status, 'ready');

  const pdReady = {
    type: 'video.asset.ready',
    data: {
      id: 'asset-pd', status: 'ready',
      playback_ids: [{ policy: 'public', id: 'playback-pd' }],
    },
  };
  candidate.decision = 'rejected';
  assert.equal((await send(pdReady)).status, 409);
  assert.equal(approvals.length, 0);
  candidate.decision = 'processing';
  videos.get('pd-1').publicDomainConfirmedBy = '';
  assert.equal((await send(pdReady)).status, 409);
  videos.get('pd-1').publicDomainConfirmedBy = 'admin-1';
  assert.equal((await send(pdReady)).status, 200);
  assert.equal(approvals.length, 1);
  assert.deepEqual(decisions, [{ id: 'candidate-1', decision: 'approved' }]);
  assert.equal((await send(pdReady)).status, 200);
  assert.equal(approvals.length, 1);
});

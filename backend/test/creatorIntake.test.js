const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { CreatorPublishingService, validateCreatorActionRequest } = require('../src/integrations/creatorPublishingService');

const ORIGIN = 'https://creators.example.test';
const SECRET = 'intake-test-secret';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = uuid(1); const sessionId = uuid(2); const episodeId = uuid(3);

function fakeMux() {
  const uploads = new Map(); const assets = new Map(); const calls = [];
  let n = 0;
  return {
    uploads, assets, calls,
    async createIntakeUpload(origin, options) {
      calls.push(['create', origin, options]);
      const id = `up${++n}`;
      const upload = { id, url: `https://storage.googleapis.example/${id}`, status: 'waiting', timeout: options.timeoutSeconds, new_asset_settings: { passthrough: options.passthrough } };
      uploads.set(id, upload);
      return upload;
    },
    async getUpload(id) { return uploads.get(id) || null; },
    async cancelUpload(id) { calls.push(['cancel', id]); uploads.get(id).status = 'cancelled'; },
    async getAsset(id) { return assets.get(id) || null; },
    async addSignedPlaybackId(id) { const playback = { id: `signed-${id}`, policy: 'signed' }; assets.get(id).playback_ids.push(playback); return playback; },
    async addPublicPlaybackId(id) { const playback = { id: `public-${id}`, policy: 'public' }; assets.get(id).playback_ids.push(playback); calls.push(['public', id]); return playback; },
    getPlaybackId(asset, policy = 'public') { return (asset.playback_ids || []).find((item) => item.policy === policy)?.id || null; },
    async signPlayback(id) { return `token-for-${id}`; },
    async deleteAsset(id) { calls.push(['delete', id]); assets.delete(id); },
    async getVideoByAssetId(id) { return id === 'linked' ? { id: 'catalog-1' } : null; },
    async logAdminEvent() {},
    finish(uploadId, change = {}) {
      const upload = uploads.get(uploadId);
      const asset = { id: `asset${uploadId}`, status: 'ready', duration: 5400.5, passthrough: upload.new_asset_settings.passthrough,
        resolution_tier: '1080p', aspect_ratio: '16:9', playback_ids: [],
        tracks: [{ type: 'video', max_width: 1920, max_height: 1080, max_frame_rate: 24 }, { type: 'audio' }], ...change };
      assets.set(asset.id, asset);
      upload.status = 'asset_created'; upload.asset_id = asset.id;
      return asset;
    },
  };
}
const intake = (action, change = {}) => ({ action, requestId: `intake:${sessionId}:${action}`, timestamp: Date.now(),
  intake: { projectId, slot: 'movie', sessionId, ...change } });
const signed = (body) => {
  const raw = JSON.stringify(body);
  return [raw, crypto.createHmac('sha256', SECRET).update(raw).digest('hex')];
};

test('intake actions require the signed channel and an exact project, slot and session identity', () => {
  const [raw, signature] = signed(intake('intake_upload_create'));
  assert.equal(validateCreatorActionRequest(raw, signature, SECRET).action, 'intake_upload_create');
  assert.throws(() => validateCreatorActionRequest(raw, 'bad', SECRET));
  for (const bad of [{ slot: 'trailer' }, { projectId: 'x' }, { sessionId: '../x' }]) {
    const [r, s] = signed(intake('intake_upload_create', bad));
    assert.throws(() => validateCreatorActionRequest(r, s, SECRET), /valid intake/);
  }
  const [r, s] = signed({ ...intake('intake_upload_status'), requestId: 'wrong' });
  assert.throws(() => validateCreatorActionRequest(r, s, SECRET), /requestId/);
});

test('a private intake upload is created, bound to its session, and never given a public playback ID', async () => {
  const mux = fakeMux();
  const service = new CreatorPublishingService({ creatorAgentOrigin: ORIGIN, dependencies: mux });
  const created = await service.execute(intake('intake_upload_create', { timeoutSeconds: 86400 }));
  assert.equal(mux.calls[0][1], ORIGIN);
  assert.equal(mux.calls[0][2].passthrough, `intake:${projectId}:movie:${sessionId}`);
  assert.match(created.url, /^https:\/\//);
  assert.equal((await service.execute(intake('intake_upload_status', { uploadId: created.uploadId }))).assetId, null);
  mux.finish(created.uploadId);
  const status = await service.execute(intake('intake_upload_status', { uploadId: created.uploadId }));
  assert.deepEqual([status.assetStatus, status.durationSeconds, status.maxHeight, status.hasAudio, status.playbackPolicies],
    ['ready', 5400.5, 1080, true, []]);

  // Another project's or slot's session cannot read, play or delete it.
  await assert.rejects(service.execute(intake('intake_upload_status', { uploadId: created.uploadId, projectId: uuid(9) })), /does not belong/);
  await assert.rejects(service.execute(intake('intake_upload_status', { uploadId: created.uploadId, slot: `episode:${episodeId}` })), /does not belong/);

  const review = await service.execute(intake('intake_review_playback', { uploadId: created.uploadId, assetId: status.assetId }));
  assert.equal(review.token, `token-for-signed-${status.assetId}`);
  assert.deepEqual(mux.assets.get(status.assetId).playback_ids.map((item) => item.policy), ['signed']);
});

test('intake deletion refuses catalog-linked or publicly playable assets and cancels only waiting uploads', async () => {
  const mux = fakeMux();
  const service = new CreatorPublishingService({ creatorAgentOrigin: ORIGIN, dependencies: mux });
  const created = await service.execute(intake('intake_upload_create'));
  assert.equal((await service.execute(intake('intake_upload_cancel', { uploadId: created.uploadId }))).uploadStatus, 'cancelled');
  const second = await service.execute(intake('intake_upload_create'));
  const asset = mux.finish(second.uploadId);
  asset.playback_ids.push({ id: 'p', policy: 'public' });
  await assert.rejects(service.execute(intake('intake_asset_delete', { uploadId: second.uploadId, assetId: asset.id })), /public playback/);
  asset.playback_ids = [];
  assert.deepEqual(await service.execute(intake('intake_asset_delete', { uploadId: second.uploadId, assetId: asset.id })), { assetId: asset.id, deleted: true });
  const third = await service.execute(intake('intake_upload_create'));
  mux.finish(third.uploadId, { id: "linked" });
  mux.uploads.get(third.uploadId).asset_id = 'linked';
  await assert.rejects(service.execute(intake('intake_asset_delete', { uploadId: third.uploadId, assetId: 'linked' })), /catalog title/);
});

test('movie release reuses the verified intake asset instead of encoding a second copy', async () => {
  const mux = fakeMux();
  const service = new CreatorPublishingService({ creatorAgentOrigin: ORIGIN, dependencies: { ...mux,
    createAssetFromUrl: async () => { throw new Error('must not re-ingest'); },
    updateVideo: async (id, updates) => { mux.calls.push(['update', id, updates]); },
  } });
  const created = await service.execute(intake('intake_upload_create'));
  const asset = mux.finish(created.uploadId);
  const project = { id: projectId, media: { storage: 'mux', muxAssetId: asset.id, intakeSessionId: sessionId } };
  const result = await service.startMovieIngestion(project, 'catalog-1');
  assert.equal(result.status, 'processing');
  assert.deepEqual(mux.calls.find((call) => call[0] === 'public'), ['public', asset.id]);
  assert.equal(mux.calls.find((call) => call[0] === 'update')[2].muxAssetId, asset.id);

  // A different project's asset, or a Mux test-mode asset, is refused.
  await assert.rejects(service.startMovieIngestion({ id: uuid(8), media: project.media }, 'catalog-2'), /does not match/);
  asset.test = true;
  await assert.rejects(service.startMovieIngestion(project, 'catalog-3'), /test-mode/);
});

test('an intake episode is prepared from its verified private asset, with no playback ID until release', async () => {
  const { CreatorEpisodeService, claimEpisode } = require('../src/integrations/creatorEpisodes');
  const mux = fakeMux();
  const intakeService = new CreatorPublishingService({ creatorAgentOrigin: ORIGIN, dependencies: mux });
  const created = await intakeService.execute({ ...intake('intake_upload_create', { slot: `episode:${episodeId}` }) });
  const asset = mux.finish(created.uploadId);
  const stored = new Map();
  const service = new CreatorEpisodeService({ creatorAgentOrigin: ORIGIN, dependencies: { ...mux,
    createPrivateAssetFromUrl: async () => { throw new Error('must not re-ingest'); },
    claimCreatorEpisode: async (id, data, now, token) => { const claim = claimEpisode(stored.get(id), data, now, token); stored.set(id, claim.video); return claim; },
    updateCreatorEpisode: async (id, expected, updates) => { const key = id.replace('creator_episode_', ''); stored.set(key, { ...stored.get(key), ...updates }); return true; },
    getCreatorEpisode: async (id) => stored.get(id),
  } });
  const submissionId = uuid(4);
  const payload = { action: 'episode_publishing', requestId: `episode:${projectId}:${submissionId}:${episodeId}`,
    project: { id: projectId, title: 'Series', contentType: 'Series', ownership: { status: 'verified', copyrightHolderName: 'Holder' },
      contract: { status: 'signed', signedAt: '2026-01-01T00:00:00.000Z', reference: 'ref', seriesSubmissionId: submissionId, contentType: 'Series' }, contractApproval: 'approved' },
    submission: { id: submissionId, revision: 1, status: 'approved' }, authorization: { actorId: uuid(5), role: 'admin', authorizedAt: '2026-01-02T00:00:00.000Z' },
    episode: { id: episodeId, title: 'Pilot', synopsis: 'S', number: 1, seasonId: uuid(6), seasonNumber: 1, seasonTitle: 'One',
      media: { assetId: sessionId, mimeType: 'video/mp4', bytes: 10, sha256: 'b'.repeat(64), storage: 'mux', muxAssetId: asset.id, intakeSessionId: sessionId } } };
  const result = await service.execute(payload);
  assert.equal(result.releaseStatus, 'held');
  assert.equal(stored.get(episodeId).muxAssetId, asset.id);
  assert.deepEqual(asset.playback_ids, []);
  await assert.rejects(service.execute({ ...payload, episode: { ...payload.episode, id: uuid(7) }, requestId: `episode:${projectId}:${submissionId}:${uuid(7)}` }), /does not match/);
});

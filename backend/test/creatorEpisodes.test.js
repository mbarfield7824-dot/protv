const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { CreatorEpisodeService, validateEpisodeRequest, claimEpisode, episodeUpdateMatches } = require('../src/integrations/creatorEpisodes');
const { validateCreatorActionRequest } = require('../src/integrations/creatorPublishingService');
const { playableCatalog, seriesCatalog } = require('../src/catalog/readModel');

function payload() {
  const [projectId, submissionId, episodeId, seasonId, mediaId, actorId] = Array.from({ length: 6 }, () => crypto.randomUUID());
  return {
    action: 'episode_publishing', timestamp: Date.now(), requestId: `episode:${projectId}:${submissionId}:${episodeId}`,
    project: {
      id: projectId, title: 'Same Series Title', contentType: 'Series', genre: 'Drama',
      ownership: { status: 'verified', copyrightHolderName: 'Synthetic Creator' }, contractApproval: 'approved',
      contract: { status: 'signed', signedAt: new Date().toISOString(), seriesSubmissionId: submissionId,
        contentType: 'Series', reference: 'synthetic-signed-envelope', revokedAt: null },
    },
    submission: { id: submissionId, revision: 1, status: 'approved' },
    authorization: { actorId, role: 'admin', authorizedAt: new Date().toISOString() },
    episode: {
      id: episodeId, seasonId, seasonNumber: 2, seasonTitle: 'Second Season', number: 3, title: 'Episode Three', synopsis: 'Synthetic synopsis.',
      media: { assetId: mediaId, bytes: 15, mimeType: 'video/mp4', sha256: 'a'.repeat(64),
        sourceUrl: `https://creator.example/api/integrations/protv/series-media/${projectId}/${submissionId}/${episodeId}/${mediaId}?expires=123&signature=synthetic` },
    },
  };
}

function harness(overrides = {}) {
  const videos = new Map();
  const calls = [];
  let asset = { id: 'asset-1', status: 'preparing' };
  const dependencies = {
    getCreatorEpisode: async (episodeId) => videos.get(`creator_episode_${episodeId}`) || null,
    claimCreatorEpisode: async (episodeId, data, now, token) => {
      const claim = claimEpisode(videos.get(`creator_episode_${episodeId}`), data, now, token);
      if (claim.claimed) videos.set(claim.video.id, claim.video);
      return claim;
    },
    updateCreatorEpisode: async (id, expected, updates) => {
      const current = videos.get(id);
      if (!episodeUpdateMatches(current, expected)) return false;
      videos.set(id, { ...current, ...updates });
      return true;
    },
    createAssetFromUrl: async (url, options) => { calls.push({ url, options }); return asset; },
    getAsset: async () => asset,
    getPlaybackId: (value, policy = 'public') => value.playback_ids?.find((item) => item.policy === policy)?.id || null,
    getSeriesReleaseContext: async () => [],
    requirePlaybackSigning: () => {},
    ...overrides,
  };
  return {
    videos, calls, dependencies,
    setAsset: (value) => { asset = value; },
    service: new CreatorEpisodeService({ creatorAgentOrigin: 'https://creator.example', dependencies }),
  };
}

test('signed episode requests require exact agreement coverage and explicit Administrator authorization', () => {
  const original = payload();
  const signed = (value) => {
    const body = JSON.stringify(value);
    return [body, crypto.createHmac('sha256', 'synthetic-secret').update(body).digest('hex'), 'synthetic-secret'];
  };
  assert.deepEqual(validateCreatorActionRequest(...signed(original)), original);
  assert.throws(() => validateCreatorActionRequest(`${signed(original)[0]} `, signed(original)[1], 'synthetic-secret'), /signature/);
  const invalid = [
    (p) => { p.authorization.role = 'creator'; },
    (p) => { delete p.authorization; },
    (p) => { p.submission.status = 'in_review'; },
    (p) => { p.project.contract.seriesSubmissionId = crypto.randomUUID(); },
    (p) => { p.project.contract.status = 'link_issued'; },
    (p) => { p.project.contract.signedAt = 'invalid'; },
    (p) => { p.project.contract.revokedAt = new Date().toISOString(); },
    (p) => { p.project.ownership.status = 'pending'; },
    (p) => { p.project.contractApproval = 'rejected'; },
    (p) => { p.episode.media.sha256 = 'changed'; },
    (p) => { p.episode.number = 0; },
    (p) => { p.timestamp -= 6 * 60 * 1000; },
  ];
  for (const mutate of invalid) {
    const value = structuredClone(original);
    mutate(value);
    assert.throws(() => validateCreatorActionRequest(...signed(value)));
  }
});

test('authorized EPISODE stays private after processing until explicitly released in its stable series and season', async () => {
  const value = payload();
  const h = harness();
  const started = await h.service.execute(value);
  assert.equal(started.status, 'processing');
  const video = h.videos.get(started.externalId);
  assert.equal(video.contentType, 'EPISODE');
  assert.equal(video.seriesId, value.project.id);
  assert.equal(video.seasonId, value.episode.seasonId);
  assert.equal(video.episodeId, value.episode.id);
  assert.equal(playableCatalog([...h.videos.values()]).length, 0);
  const retry = await h.service.execute(value);
  assert.equal(retry.externalId, started.externalId);
  assert.equal(h.calls.length, 1);
  assert.equal(video.releaseStatus, 'held');
  assert.equal(h.calls[0].options.playbackPolicy, 'signed');
  h.setAsset({ id: 'asset-1', status: 'ready', duration: 92, playback_ids: [{ id: 'playback', policy: 'signed' }] });
  const ready = await h.service.execute({ ...value, action: 'episode_status' });
  assert.equal(ready.status, 'processing');
  assert.equal(ready.releaseStatus, 'held');
  assert.match(ready.message, /ready and held privately/);
  assert.equal(h.calls.length, 1, 'status must never start ingestion');
  assert.equal(seriesCatalog([...h.videos.values()]).length, 0);
  h.videos.set(video.id, { ...h.videos.get(video.id), releaseStatus: 'published' });
  assert.equal((await h.service.execute({ ...value, action: 'episode_status' })).status, 'published');
  const series = seriesCatalog([...h.videos.values()]);
  assert.equal(series[0].id, value.project.id);
  assert.equal(series[0].seasons[0].id, value.episode.seasonId);
  assert.equal(series[0].seasons[0].number, 2);
  assert.equal(series[0].seasons[0].episodes[0].episodeNumber, 3);
  assert.equal(playableCatalog([...h.videos.values()])[0].muxPlaybackId, 'playback');
  assert.equal(JSON.stringify(playableCatalog([...h.videos.values()])).includes('sourceUrl'), false);
  const published = h.videos.get(started.externalId);
  await h.service.reconcile(published, { id: 'asset-1', status: 'errored' });
  assert.equal(h.videos.get(started.externalId).status, 'ready');
});

test('concurrent requests and process restart retry share one durable catalog reservation and Mux attempt', async () => {
  const h = harness();
  const value = payload();
  const results = await Promise.all([h.service.execute(value), h.service.execute(value)]);
  assert.equal(results[0].externalId, results[1].externalId);
  assert.equal(h.calls.length, 1);
  const restarted = new CreatorEpisodeService({ creatorAgentOrigin: 'https://creator.example', dependencies: h.dependencies });
  await restarted.execute(value);
  assert.equal(h.calls.length, 1);
});

test('an administrator hold saved during Mux polling survives reconciliation and is reported as private', async () => {
  const h = harness();
  const value = payload();
  const started = await h.service.execute(value);
  h.videos.set(started.externalId, { ...h.videos.get(started.externalId), releaseStatus: 'published' });
  h.dependencies.getAsset = async () => {
    h.videos.set(started.externalId, { ...h.videos.get(started.externalId), releaseStatus: 'held' });
    return { id: 'asset-1', status: 'ready', playback_ids: [{ id: 'protected', policy: 'signed' }] };
  };
  const result = await h.service.execute({ ...value, action: 'episode_status' });
  assert.equal(result.status, 'processing');
  assert.equal(result.releaseStatus, 'held');
  assert.equal(h.videos.get(started.externalId).status, 'ready');
  assert.equal(h.videos.get(started.externalId).releaseStatus, 'held');
  assert.equal(playableCatalog([...h.videos.values()]).length, 0);
});

test('Creator Agent status respects a held or scheduled series gate after the episode is released', async () => {
  const value = payload();
  const gate = { id: `series_release_${value.project.id}`, releaseStatus: 'held' };
  const h = harness({ getSeriesReleaseContext: async () => [gate] });
  const started = await h.service.execute(value);
  h.videos.set(started.externalId, { ...h.videos.get(started.externalId), releaseStatus: 'published' });
  h.setAsset({ id: 'asset-1', status: 'ready', playback_ids: [{ id: 'protected', policy: 'signed' }] });
  let result = await h.service.execute({ ...value, action: 'episode_status' });
  assert.equal(result.status, 'processing');
  assert.equal(result.releaseStatus, 'held');
  gate.releaseStatus = 'scheduled';
  gate.releaseAt = '2099-01-01T00:00:00Z';
  result = await h.service.execute({ ...value, action: 'episode_status' });
  assert.equal(result.releaseStatus, 'scheduled');
  assert.match(result.message, /2099-01-01/);
  gate.releaseStatus = 'published';
  assert.equal((await h.service.execute({ ...value, action: 'episode_status' })).status, 'published');
});

test('signing configuration is checked before any new episode reservation or Mux attempt', async () => {
  const h = harness({ requirePlaybackSigning: () => { throw new Error('Signing is not configured.'); } });
  await assert.rejects(h.service.execute(payload()), /Signing is not configured/);
  assert.equal(h.videos.size, 0);
  assert.equal(h.calls.length, 0);
});

test('uncertain transport retry fails closed without submitting a second Mux request', async () => {
  const calls = [];
  const h = harness({ createAssetFromUrl: async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) throw new Error('Connection lost after request.');
    return { id: 'recovered', status: 'preparing' };
  } });
  const value = payload();
  await assert.rejects(h.service.execute(value), /Connection lost/);
  value.episode.media.sourceUrl += '&newSignature=true';
  await assert.rejects(h.service.execute(value), /manual reconciliation/);
  assert.equal(calls.length, 1);
  const video = [...h.videos.values()][0];
  h.videos.set(video.id, { ...video, status: 'failed', muxAssetId: null, ingestionStartedAt: Date.now() - 61 * 60 * 1000 });
  await assert.rejects(h.service.execute(value), /manual reconciliation/);
  assert.equal(calls.length, 1);
});

test('verified Mux failure permits an explicit new attempt and ignores stale events from the previous asset', async () => {
  const h = harness();
  const value = payload();
  const result = await h.service.execute(value);
  await h.service.reconcile(h.videos.get(result.externalId), { id: 'asset-1', status: 'errored' });
  assert.equal(h.videos.get(result.externalId).status, 'failed');
  h.setAsset({ id: 'asset-2', status: 'preparing' });
  await h.service.execute(value);
  assert.notEqual(h.calls[0].options.passthrough, h.calls[1].options.passthrough);
  await h.service.reconcile(h.videos.get(result.externalId), {
    id: 'asset-1', status: 'ready', playback_ids: [{ id: 'old', policy: 'public' }],
  });
  assert.equal(h.videos.get(result.externalId).status, 'processing');
  assert.equal(h.videos.get(result.externalId).muxAssetId, 'asset-2');
});

test('missing public playback and wrong revision/media/origin never expose or replace an episode', async () => {
  const h = harness();
  const value = payload();
  const result = await h.service.execute(value);
  h.setAsset({ id: 'asset-1', status: 'ready', playback_ids: [] });
  await assert.rejects(h.service.execute({ ...value, action: 'episode_status' }), /playback/);
  assert.equal(playableCatalog([...h.videos.values()]).length, 0);
  const changed = structuredClone(value);
  changed.episode.media.sha256 = 'b'.repeat(64);
  await assert.rejects(h.service.execute(changed), /different approved/);
  const wrong = payload();
  wrong.episode.media.sourceUrl = 'https://untrusted.example/master.mp4';
  await assert.rejects(h.service.execute(wrong), /protected/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.videos.get(result.externalId).status, 'processing');
});

test('lost Mux response is reconciled by exact passthrough without accepting another attempt', async () => {
  const h = harness({ createAssetFromUrl: async () => { throw new Error('Response lost.'); } });
  const value = payload();
  await assert.rejects(h.service.execute(value));
  const video = [...h.videos.values()][0];
  const ready = { id: 'lost-asset', status: 'ready', passthrough: `${video.id}:${video.ingestionAttempt}`,
    playback_ids: [{ id: 'recovered', policy: 'signed' }] };
  await h.service.reconcile(video, { ...ready, passthrough: `${video.id}:99` });
  assert.equal(h.videos.get(video.id).status, 'failed');
  await h.service.reconcile(video, ready);
  assert.equal(h.videos.get(video.id).status, 'ready');
});

test('same-title creator series are grouped by stable identity without changing manual legacy grouping', async () => {
  const h = harness();
  for (const value of [payload(), payload()]) {
    const result = await h.service.execute(value);
    await h.service.reconcile(h.videos.get(result.externalId), {
      id: 'asset-1', status: 'ready', playback_ids: [{ id: 'signed', policy: 'signed' }],
    });
    h.videos.set(result.externalId, { ...h.videos.get(result.externalId), releaseStatus: 'published' });
  }
  assert.equal(seriesCatalog([...h.videos.values()]).length, 2);
  const legacy = { id: 'manual', contentType: 'EPISODE', seriesTitle: 'Same Series Title', seasonNumber: 1,
    episodeNumber: 1, approvalStatus: 'approved', status: 'ready', muxPlaybackId: 'manual' };
  assert.equal(seriesCatalog([...h.videos.values(), legacy]).length, 3);
  assert.equal(validateEpisodeRequest(payload()).action, 'episode_publishing');
});

test('episode Mux creation uses the existing public-ingestion pipeline with SDK retries disabled', async (context) => {
  const { mux, createAssetFromUrl } = require('../src/mux');
  const calls = [];
  context.mock.method(mux.video.assets, 'create', async (...args) => { calls.push(args); return { id: 'synthetic' }; });
  await createAssetFromUrl('https://creator.example/synthetic', { passthrough: 'creator_episode_synthetic:1' });
  assert.deepEqual(calls[0], [{
    inputs: [{ url: 'https://creator.example/synthetic' }],
    playback_policies: ['public'], video_quality: 'basic', passthrough: 'creator_episode_synthetic:1',
  }, { maxRetries: 0, timeout: 25_000 }]);
  await createAssetFromUrl('https://example.invalid/manual.mp4');
  assert.deepEqual(calls[1], [{
    inputs: [{ url: 'https://example.invalid/manual.mp4' }], playback_policies: ['public'], video_quality: 'basic',
  }, undefined]);
});

test('withdrawn PROtv approval and expired unfinished claims stay nonpublic and cannot restart ingestion', async () => {
  const h = harness();
  const value = payload();
  const result = await h.service.execute(value);
  const video = h.videos.get(result.externalId);
  h.videos.set(video.id, { ...video, approvalStatus: 'rejected' });
  await assert.rejects(h.service.execute(value), /withdrawn/);
  assert.equal(playableCatalog([...h.videos.values()]).length, 0);
  h.videos.set(video.id, { ...video, status: 'ingesting', muxAssetId: null, ingestionLeaseUntil: Date.now() - 1 });
  assert.equal((await h.service.execute({ ...value, action: 'episode_status' })).status, 'failed');
  await assert.rejects(h.service.execute(value), /manual reconciliation/);
  assert.equal(h.calls.length, 1);
});

test('a readiness webhook arriving before the asset-create response cannot regress publication', async () => {
  const h = harness();
  h.dependencies.createAssetFromUrl = async (_url, options) => {
    const video = [...h.videos.values()][0];
    const asset = { id: 'fast-asset', status: 'ready', passthrough: options.passthrough,
      playback_ids: [{ id: 'fast-playback', policy: 'signed' }] };
    await h.service.reconcile(video, asset);
    return asset;
  };
  const result = await h.service.execute(payload());
  assert.equal(result.status, 'processing');
  assert.equal(result.releaseStatus, 'held');
  assert.equal([...h.videos.values()][0].status, 'ready');
});

test('the legacy movie bridge rejects Series payloads before Mux or database operations', () => {
  const value = payload();
  value.action = 'publishing';
  value.requestId = `${value.project.id}:publishing`;
  const body = JSON.stringify(value);
  const signature = crypto.createHmac('sha256', 'synthetic-secret').update(body).digest('hex');
  assert.throws(() => validateCreatorActionRequest(body, signature, 'synthetic-secret'), /not the movie bridge/);
});

test('Firestore episode reservations and updates use transactions and propagate database failures without local writes', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const filename = require.resolve('../src/firebase');
  const rows = new Map();
  let transactions = 0;
  let fail = false;
  let serial = Promise.resolve();
  const snapshot = (id) => ({ exists: rows.has(id), data: () => rows.get(id) });
  const db = {
    collection: () => ({ doc: (id) => ({ id, get: async () => snapshot(id) }) }),
    runTransaction: (operation) => {
      transactions += 1;
      if (fail) return Promise.reject(new Error('Synthetic Firestore unavailable.'));
      const result = serial.then(() => operation({
        get: async (ref) => snapshot(ref.id),
        set: (ref, data) => rows.set(ref.id, data),
        update: (ref, updates) => rows.set(ref.id, { ...rows.get(ref.id), ...updates }),
      }));
      serial = result.catch(() => {});
      return result;
    },
  };
  const admin = { initializeApp() {}, credential: { cert: () => ({}) }, firestore: () => db, auth: () => ({}) };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process: { env: { FIREBASE_SERVICE_ACCOUNT_JSON: '{}' } },
    console: { log() {}, warn() {} },
    require: (name) => {
      if (name === 'firebase-admin') return admin;
      if (name === './storage') throw new Error('Unexpected local storage fallback.');
      return require(name.startsWith('.') ? `../src/${name.slice(2)}` : name);
    },
  }, { filename });
  const store = module.exports;
  const value = payload();
  const data = {
    creatorProjectId: value.project.id, creatorSubmissionId: value.submission.id, creatorEpisodeId: value.episode.id,
    creatorMediaId: value.episode.media.assetId, creatorMediaSha256: value.episode.media.sha256,
    creatorContractReference: value.project.contract.reference, seriesId: value.project.id, seasonId: value.episode.seasonId,
    episodeNumber: value.episode.number, seasonNumber: value.episode.seasonNumber, contentType: 'EPISODE',
    creatorEpisodeAuthorization: value.authorization, approvalStatus: 'approved',
  };
  const claims = await Promise.all([
    store.claimCreatorEpisode(value.episode.id, data, Date.now(), 'first'),
    store.claimCreatorEpisode(value.episode.id, data, Date.now(), 'second'),
  ]);
  assert.equal(claims.filter((claim) => claim.claimed).length, 1);
  assert.equal(rows.size, 1);
  const video = await store.getCreatorEpisode(value.episode.id);
  assert.equal(await store.updateCreatorEpisode(video.id, video, { status: 'processing', muxAssetId: 'asset' }), true);
  assert.equal(await store.updateCreatorEpisode(video.id, video, { status: 'failed' }), false);
  assert.equal(transactions, 4);
  fail = true;
  await assert.rejects(store.claimCreatorEpisode(value.episode.id, data, Date.now(), 'third'), /Firestore unavailable/);
  assert.equal(rows.get(video.id).status, 'processing');
});

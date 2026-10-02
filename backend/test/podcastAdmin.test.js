const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAdminPodcastRouter } = require('../src/catalog/adminPodcastRouter');
const { browse, podcastCatalog, seriesCatalog } = require('../src/catalog/readModel');
const { podcastIngestionMatches } = require('../src/catalog/podcasts');

test('Podcast Admin authors draft Shows and Episodes, enforces references and rights before Mux or writes', async (context) => {
  const records = new Map([
    ['movie', { id: 'movie', title: 'Movie', contentType: 'MOVIE', status: 'ready', muxPlaybackId: 'movie-id', approvalStatus: 'approved' }],
    ['music', { id: 'music', title: 'Music', contentType: 'MUSIC', musicFormat: 'music_video', status: 'ready', muxPlaybackId: 'music-id', approvalStatus: 'approved' }],
    ['tv', { id: 'tv', title: 'TV', contentType: 'EPISODE', seriesTitle: 'TV', seasonNumber: 1, episodeNumber: 1, status: 'ready', muxPlaybackId: 'tv-id', approvalStatus: 'approved' }],
  ]);
  const writes = [];
  const muxCalls = [];
  const store = {
    async addVideo(data) {
      const id = `podcast-${records.size}`;
      records.set(id, { ...data, id, approvedAt: null, approvedBy: null });
      writes.push({ id, data });
      return id;
    },
    async getVideoById(id) {
      if (!records.has(id)) throw new Error('Video not found');
      return { ...records.get(id) };
    },
    async updateVideo(id, changes) {
      writes.push({ id, changes });
      records.set(id, { ...records.get(id), ...changes });
    },
    async updateVideoApproval(id, changes) {
      writes.push({ id, changes });
      records.set(id, { ...records.get(id), ...changes, approvedAt: 'approved-time' });
    },
    async updatePodcastIngestion(id, expected, changes) {
      if (!podcastIngestionMatches(records.get(id), expected)) return false;
      writes.push({ id, changes });
      records.set(id, { ...records.get(id), ...changes });
      return true;
    },
  };
  const media = {
    async createDirectUpload() {
      muxCalls.push('direct');
      return { id: 'mux-upload', url: 'https://mux.example/direct' };
    },
    async createAssetFromUrl(url) {
      muxCalls.push(url);
      return { id: 'mux-asset' };
    },
  };
  const authorize = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer admin') return res.status(403).json({ error: 'Admin access is required.' });
    req.user = { uid: 'admin-1' };
    return next();
  };
  const app = express();
  app.use(express.json());
  app.use('/admin/podcasts', createAdminPodcastRouter({ store, media, authorize }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/admin/podcasts`;
  async function request(path, body, method = 'POST', token = 'Bearer admin') {
    const response = await fetch(base + path, {
      method,
      headers: { authorization: token, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      data: response.headers.get('content-type')?.includes('application/json')
        ? await response.json() : await response.text(),
    };
  }

  assert.equal((await request('/shows', { title: 'Unauthorized' }, 'POST', 'Bearer viewer')).status, 403);
  assert.equal(writes.length, 0);
  assert.equal((await request('/shows', { title: 'Bad', videoUrl: 'https://example.com/video.mp4' })).status, 400);
  assert.equal((await request('/shows', { title: 'Bad', muxPlaybackId: 'injected' })).status, 400);
  const show = await request('/shows', { title: 'Culture', approvalStatus: 'approved' });
  assert.equal(show.status, 201);
  const showId = show.data.id;
  assert.equal(records.get(showId).approvalStatus, 'draft');
  assert.equal((await request(`/shows/${showId}/approve`, {})).status, 400);
  assert.equal((await request(`/shows/${showId}`, { contentType: 'MOVIE' }, 'PATCH')).status, 400);
  assert.equal((await request(`/shows/${showId}`, {
    title: 'Culture Renamed', description: 'Stories', artworkUrl: 'https://example.com/show.jpg',
    host: 'Host', category: 'Culture',
  }, 'PATCH')).status, 200);
  assert.equal(records.get(showId).id, showId);
  assert.equal((await request(`/shows/${showId}/approve`, {})).status, 200);
  assert.equal(records.get(showId).approvalStatus, 'approved');
  assert.equal((await request(`/shows/${showId}`, { artworkUrl: '' }, 'PATCH')).status, 400);
  assert.equal((await request(`/shows/${showId}/upload-url`, {})).status, 404);

  const episodeBody = {
    title: 'Pilot', podcastShowId: showId, episodeNumber: 1,
    rightsHolder: 'Producer', rightsVerificationNotes: 'Review license separately',
    category: 'Documentary', thumbnailUrl: 'https://example.com/episode.jpg',
  };
  for (const invalid of [
    { podcastShowId: 'missing-show' }, { podcastShowId: 'movie' },
    { episodeNumber: 0 }, { episodeNumber: 1.5 },
    { rightsHolder: '' }, { rightsVerificationNotes: '' }, { contentType: 'EPISODE' },
    { muxAssetId: 'injected' },
  ]) {
    assert.equal((await request('/episodes', { ...episodeBody, ...invalid })).status, 400);
  }
  assert.equal(muxCalls.length, 0);
  assert.equal(writes.filter((item) => item.data).length, 1);

  const episode = await request('/episodes', { ...episodeBody, approvalStatus: 'approved' });
  assert.equal(episode.status, 201);
  const episodeId = episode.data.id;
  assert.equal(records.get(episodeId).approvalStatus, 'draft');
  assert.equal(records.get(episodeId).podcastShowId, showId);
  assert.equal((await request(`/episodes/${episodeId}/approve`, {})).status, 400);
  assert.equal((await request(`/episodes/${episodeId}`, { rightsHolder: '' }, 'PATCH')).status, 400);
  assert.equal((await request(`/episodes/${episodeId}`, { approvalStatus: 'approved' }, 'PATCH')).status, 400);
  assert.equal((await request(`/episodes/${episodeId}`, { podcastShowId: 'missing-show' }, 'PATCH')).status, 400);
  assert.equal((await request(`/episodes/${episodeId}/from-url`, { sourceUrl: 'file:///tmp/video.mp4' })).status, 400);
  assert.equal(muxCalls.length, 0);
  records.set(episodeId, { ...records.get(episodeId), rightsVerificationNotes: '' });
  assert.equal((await request(`/episodes/${episodeId}/upload-url`, {})).status, 400);
  assert.equal((await request(`/episodes/${episodeId}/from-url`, { sourceUrl: 'https://example.com/video.mp4' })).status, 400);
  assert.equal(muxCalls.length, 0);
  records.set(episodeId, { ...records.get(episodeId), rightsVerificationNotes: episodeBody.rightsVerificationNotes });
  records.set(episodeId, {
    ...records.get(episodeId), status: 'errored', muxAssetId: 'previous-asset',
    muxPlaybackId: 'previous-playback', duration: 97,
  });
  const upload = await request(`/episodes/${episodeId}/upload-url`, {});
  assert.equal(upload.status, 201);
  assert.equal(upload.data.uploadId, 'mux-upload');
  assert.equal(records.get(episodeId).rightsHolder, 'Producer');
  assert.equal(records.get(episodeId).podcastShowId, showId);
  assert.equal(records.get(episodeId).status, 'processing');
  assert.equal(records.get(episodeId).muxPlaybackId, null);
  assert.equal(records.get(episodeId).duration, 0);
  assert.equal(records.get(episodeId).muxAssetId, null);
  assert.equal((await request(`/episodes/${episodeId}/upload-url`, {})).status, 409);
  records.set(episodeId, { ...records.get(episodeId), status: 'ready', muxPlaybackId: 'playback-id' });
  assert.equal((await request(`/episodes/${episodeId}/approve`, { approvalNotes: 'Reviewed' })).status, 200);
  assert.equal(records.get(episodeId).approvalStatus, 'approved');
  assert.equal((await request(`/episodes/${episodeId}`, { rightsHolder: ' Producer ' }, 'PATCH')).status, 200);
  assert.equal(records.get(episodeId).approvalStatus, 'approved');
  assert.equal((await request(`/episodes/${episodeId}`, { podcastShowId: showId }, 'PATCH')).status, 200);
  assert.equal(records.get(episodeId).approvalStatus, 'approved');
  assert.equal((await request(`/episodes/${episodeId}`, { rightsVerificationNotes: 'New evidence pending review' }, 'PATCH')).status, 200);
  assert.equal(records.get(episodeId).approvalStatus, 'draft');
  assert.equal(records.get(episodeId).approvedAt, null);
  assert.equal(records.get(episodeId).approvedBy, null);
  assert.equal((await request(`/episodes/${episodeId}/approve`, {})).status, 200);
  assert.equal((await request(`/episodes/${episodeId}/from-url`, { sourceUrl: 'https://example.com/video.mp4' })).status, 409);

  const catalog = () => [...records.values()];
  assert.equal(podcastCatalog(catalog())[0].episodes.length, 1);
  assert.equal(browse(catalog(), { view: 'documentaries' }).some((item) => item.id === episodeId), true);
  assert.equal(browse(catalog(), { view: 'movies' }).some((item) => item.id === episodeId), false);
  assert.equal(seriesCatalog(catalog()).some((item) => item.title === 'Culture Renamed'), false);
  assert.equal(browse(catalog()).some((item) => item.id === showId), false);
  assert.equal(browse(catalog(), { view: 'movies' }).some((item) => item.id === 'movie'), true);
  assert.equal(browse(catalog()).some((item) => item.id === 'music'), true);
  assert.equal(seriesCatalog(catalog()).some((item) => item.title === 'TV'), true);
  assert.equal('rightsHolder' in podcastCatalog(catalog())[0].episodes[0], false);
  assert.equal('rightsVerificationNotes' in podcastCatalog(catalog())[0].episodes[0], false);

  assert.equal((await request(`/shows/${showId}/unpublish`, {})).status, 200);
  assert.equal(podcastCatalog(catalog()).length, 0);
  assert.equal(records.get(episodeId).approvalStatus, 'approved');
  assert.equal((await request(`/shows/${showId}/approve`, {})).status, 200);
  assert.equal(podcastCatalog(catalog())[0].episodes.length, 1);
  assert.equal((await request(`/episodes/${episodeId}/unpublish`, {})).status, 200);
  assert.equal(podcastCatalog(catalog())[0].episodes.length, 0);
  assert.equal(records.get(episodeId).approvedAt, null);

  const draftShow = await request('/shows', { title: 'Another Show' });
  assert.equal(draftShow.status, 201);
  assert.equal((await request(`/episodes/${episodeId}/approve`, {})).status, 200);
  assert.equal((await request(`/episodes/${episodeId}`, { podcastShowId: draftShow.data.id }, 'PATCH')).status, 200);
  assert.equal(records.get(episodeId).approvalStatus, 'draft');
  assert.equal(records.get(episodeId).approvedBy, null);
  assert.equal(records.get(episodeId).podcastShowId, draftShow.data.id);
  assert.equal(podcastCatalog(catalog())[0].episodes.length, 0);

  const second = await request('/episodes', { ...episodeBody, episodeNumber: 2 });
  assert.equal(second.status, 201);
  const secondId = second.data.id;
  records.set(secondId, {
    ...records.get(secondId), status: 'errored', muxUploadId: 'previous-upload',
    muxAssetId: 'previous-asset', muxPlaybackId: 'previous-playback', duration: 222,
  });
  const fromUrl = await request(`/episodes/${secondId}/from-url`, { sourceUrl: 'https://example.com/video.mp4' });
  assert.equal(fromUrl.status, 201);
  assert.equal(records.get(secondId).muxAssetId, 'mux-asset');
  assert.equal(records.get(secondId).contentType, 'PODCAST_EPISODE');
  assert.equal(records.get(secondId).approvalStatus, 'draft');
  assert.equal(records.get(secondId).muxPlaybackId, null);
  assert.equal(records.get(secondId).duration, 0);
  assert.equal(records.get(secondId).muxUploadId, null);
  assert.deepEqual(muxCalls, ['direct', 'https://example.com/video.mp4']);
});

test('existing Mux status and generic write routes preserve Podcast guards and Episode metadata', async (context) => {
  const firebase = require('../src/firebase');
  const auth = require('../src/middleware/auth');
  const mux = require('../src/mux');
  const records = new Map([
    ['show', { id: 'show', title: 'Show', contentType: 'PODCAST_SHOW', approvalStatus: 'approved' }],
    ['episode', {
      id: 'episode', title: 'Episode', contentType: 'PODCAST_EPISODE',
      podcastShowId: 'show', episodeNumber: 2, rightsHolder: 'Producer',
      rightsVerificationNotes: 'Review pending', approvalStatus: 'draft',
      muxUploadId: 'upload-1', status: 'processing',
    }],
  ]);
  const changes = [];
  context.mock.method(firebase, 'getVideoById', async (id) => {
    if (!records.has(id)) throw new Error('Video not found');
    return { ...records.get(id) };
  });
  context.mock.method(firebase, 'updateVideo', async (id, data) => {
    changes.push({ id, data });
    records.set(id, { ...records.get(id), ...data });
  });
  context.mock.method(firebase, 'updatePodcastIngestion', async (id, expected, data) => {
    if (!podcastIngestionMatches(records.get(id), expected)) return false;
    changes.push({ id, data });
    records.set(id, { ...records.get(id), ...data });
    return true;
  });
  context.mock.method(firebase, 'updateVideoApproval', async () => {
    throw new Error('Generic Podcast approval must not be called');
  });
  context.mock.method(auth, 'verifyAdmin', (req, res, next) => {
    req.user = { uid: 'admin-1' };
    next();
  });
  context.mock.method(mux, 'getUpload', async () => ({ asset_id: 'asset-1' }));
  context.mock.method(mux, 'getAsset', async () => ({
    id: 'asset-1', status: 'ready', duration: 61.4,
    playback_ids: [{ policy: 'public', id: 'playback-1' }],
  }));
  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const router = require('../src/routes/videos');
  context.after(() => { delete require.cache[routePath]; });
  const app = express();
  app.use(express.json());
  app.use('/videos', router);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/videos`;
  const status = await fetch(`${base}/episode/status`);
  assert.equal(status.status, 200);
  const result = await status.json();
  assert.equal(result.muxPlaybackId, 'playback-1');
  assert.equal(result.contentType, 'PODCAST_EPISODE');
  assert.equal(result.podcastShowId, 'show');
  assert.equal(result.episodeNumber, 2);
  assert.equal('rightsHolder' in result, false);
  assert.equal('rightsVerificationNotes' in result, false);
  assert.equal(records.get('episode').rightsHolder, 'Producer');
  assert.equal(records.get('episode').approvalStatus, 'draft');
  assert.equal(records.get('episode').podcastShowId, 'show');
  assert.deepEqual(changes.map(({ data }) => Object.keys(data).sort()), [[
    'duration', 'muxAssetId', 'muxPlaybackId', 'status',
  ]]);
  for (const [path, method] of [
    ['/admin/show/approve', 'PATCH'], ['/admin/episode/reject', 'PATCH'],
    ['/admin/episode/verify', 'PATCH'], ['/admin/episode/ingest', 'POST'],
    ['/show', 'DELETE'], ['/episode', 'DELETE'], ['/episode', 'PATCH'],
  ]) {
    const response = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Changed' }),
    });
    assert.equal(response.status, 400, `${method} ${path}`);
  }
  assert.equal(changes.length, 1);
});

test('local storage conditionally claims retries and clears stale media without touching Podcast metadata', (context) => {
  const fs = require('fs');
  const storage = require('../src/storage');
  const file = require('path').resolve(__dirname, '../.data/videos.json');
  let records = {};
  const exists = fs.existsSync;
  const read = fs.readFileSync;
  context.mock.method(fs, 'existsSync', (path) => path === file ? true : exists(path));
  context.mock.method(fs, 'readFileSync', (path, ...args) => {
    if (path === file) return JSON.stringify(records);
    return read(path, ...args);
  });
  context.mock.method(fs, 'writeFileSync', (path, data) => {
    if (path !== file) throw new Error('Unexpected local storage write');
    records = JSON.parse(data);
  });
  const id = storage.addVideo({
    contentType: 'PODCAST_EPISODE', title: 'Pilot', podcastShowId: 'show-id',
    episodeNumber: 3, rightsHolder: 'Owner', rightsVerificationNotes: 'For review',
    approvalStatus: 'draft', status: 'errored', muxAssetId: 'old-asset',
    muxPlaybackId: 'old-playback', duration: 123,
  });
  const expected = { status: 'errored', muxUploadId: null, muxAssetId: 'old-asset' };
  const next = { muxUploadId: 'new-upload', muxAssetId: null, muxPlaybackId: null, duration: 0, status: 'processing' };
  assert.equal(storage.updatePodcastIngestion(id, expected, next), true);
  assert.equal(storage.updatePodcastIngestion(id, expected, { muxAssetId: 'other' }), false);
  assert.equal(storage.updatePodcastIngestion(id, { status: 'processing', muxUploadId: 'old-upload' }, { status: 'ready' }), false);
  const record = storage.getVideoById(id);
  assert.equal(record.muxPlaybackId, null);
  assert.equal(record.duration, 0);
  assert.equal(record.muxUploadId, 'new-upload');
  assert.equal(record.podcastShowId, 'show-id');
  assert.equal(record.rightsHolder, 'Owner');
  assert.equal(record.rightsVerificationNotes, 'For review');
  assert.equal(record.approvalStatus, 'draft');
});

test('Podcast retry claims are exclusive and old poll and webhook results cannot overwrite a replacement', async (context) => {
  const firebase = require('../src/firebase');
  const auth = require('../src/middleware/auth');
  const mux = require('../src/mux');
  const records = new Map([
    ['show', { id: 'show', contentType: 'PODCAST_SHOW', title: 'Show' }],
    ['episode', {
      id: 'episode', contentType: 'PODCAST_EPISODE', title: 'Pilot',
      podcastShowId: 'show', episodeNumber: 1, rightsHolder: 'Producer',
      rightsVerificationNotes: 'Reviewed separately', approvalStatus: 'draft',
      status: 'errored', muxUploadId: 'old-upload', muxAssetId: 'old-asset',
      muxPlaybackId: 'old-playback', duration: 95,
    }],
  ]);
  let calls = 0;
  let pauseOldWebhook = false;
  let releaseOldWebhook;
  let oldWebhookReached;
  let oldWebhookStarted = new Promise((resolve) => { oldWebhookReached = resolve; });
  let releaseStarts;
  const startsReady = new Promise((resolve) => { releaseStarts = resolve; });
  const waitForBothStarts = async () => {
    calls += 1;
    if (calls === 2) releaseStarts();
    await startsReady;
  };
  const conditional = async (id, expected, changes) => {
    if (pauseOldWebhook && expected.muxUploadId === 'old-upload') {
      oldWebhookReached();
      await new Promise((resolve) => { releaseOldWebhook = resolve; });
    }
    if (!podcastIngestionMatches(records.get(id), expected)) return false;
    records.set(id, { ...records.get(id), ...changes });
    return true;
  };
  const get = async (id) => ({ ...records.get(id) });
  context.mock.method(firebase, 'getVideoById', get);
  context.mock.method(firebase, 'updatePodcastIngestion', conditional);
  context.mock.method(firebase, 'getVideoByUploadId', async (uploadId) => {
    const video = records.get('episode');
    return video.muxUploadId === uploadId ? { ...video } : null;
  });
  context.mock.method(firebase, 'getVideoByAssetId', async (assetId) => {
    const video = records.get('episode');
    return video.muxAssetId === assetId ? { ...video } : null;
  });
  context.mock.method(auth, 'verifyAdmin', (req, res, next) => {
    req.user = { uid: 'admin' };
    next();
  });
  context.mock.method(mux, 'createDirectUpload', async () => {
    await waitForBothStarts();
    return { id: 'upload-1', url: 'https://mux.example/upload' };
  });
  context.mock.method(mux, 'createAssetFromUrl', async () => {
    await waitForBothStarts();
    return { id: 'asset-2' };
  });
  context.mock.method(mux, 'getUpload', async (id) => ({ asset_id: id === 'old-upload' ? 'old-asset' : 'new-asset' }));
  let releaseAsset;
  let assetRequested;
  const assetStarted = new Promise((resolve) => { assetRequested = resolve; });
  context.mock.method(mux, 'getAsset', async () => {
    assetRequested();
    await new Promise((resolve) => { releaseAsset = resolve; });
    return { id: 'old-asset', status: 'ready', playback_ids: [{ policy: 'public', id: 'old-playback' }] };
  });
  context.mock.method(mux, 'verifyWebhook', async () => {});
  const oldSecret = process.env.MUX_WEBHOOK_SECRET;
  process.env.MUX_WEBHOOK_SECRET = 'local-test-secret';
  context.after(() => {
    if (oldSecret === undefined) delete process.env.MUX_WEBHOOK_SECRET;
    else process.env.MUX_WEBHOOK_SECRET = oldSecret;
  });
  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const videos = require('../src/routes/videos');
  context.after(() => { delete require.cache[routePath]; });
  const app = express();
  app.use(express.json());
  app.use('/videos', videos);
  app.use('/admin/podcasts', createAdminPodcastRouter({
    store: {
      getVideoById: get, updatePodcastIngestion: conditional,
    },
    media: { createDirectUpload: mux.createDirectUpload, createAssetFromUrl: mux.createAssetFromUrl },
    authorize: (req, res, next) => { req.user = { uid: 'admin' }; next(); },
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body = {}) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  // Both requests read the same errored record before their Mux calls finish.
  const starts = await Promise.all([
    post('/admin/podcasts/episodes/episode/upload-url'),
    post('/admin/podcasts/episodes/episode/from-url', { sourceUrl: 'https://example.com/video.mp4' }),
  ]);
  assert.deepEqual(starts.map((result) => result.status).sort(), [201, 409]);
  assert.equal(calls, 2);
  assert.equal(records.get('episode').muxPlaybackId, null);
  assert.equal(records.get('episode').duration, 0);
  assert.equal(records.get('episode').approvalStatus, 'draft');
  assert.equal(records.get('episode').podcastShowId, 'show');
  assert.equal(records.get('episode').rightsVerificationNotes, 'Reviewed separately');

  // A poll has already read the prior attempt when a replacement is claimed.
  records.set('episode', {
    ...records.get('episode'), status: 'processing', muxUploadId: 'old-upload', muxAssetId: null,
  });
  const oldPoll = fetch(`${base}/videos/episode/status`);
  await assetStarted;
  records.set('episode', {
    ...records.get('episode'), muxUploadId: 'new-upload', muxAssetId: null, status: 'processing',
  });
  releaseAsset();
  assert.equal((await oldPoll).status, 409);
  assert.equal(records.get('episode').status, 'processing');

  const webhook = (type, upload, asset, duration) => post('/videos/webhook', {
    type, data: { id: asset, upload_id: upload, duration,
      playback_ids: [{ policy: 'public', id: 'playback-new' }] },
  });
  assert.equal((await webhook('video.asset.ready', 'old-upload', 'old-asset', 95)).status, 200);
  assert.equal((await webhook('video.asset.errored', 'old-upload', 'old-asset')).status, 200);
  assert.equal(records.get('episode').status, 'processing');
  for (const type of ['video.asset.ready', 'video.asset.errored']) {
    records.set('episode', {
      ...records.get('episode'), status: 'processing', muxUploadId: 'old-upload', muxAssetId: null,
    });
    pauseOldWebhook = true;
    oldWebhookStarted = new Promise((resolve) => { oldWebhookReached = resolve; });
    const staleWebhook = webhook(type, 'old-upload', 'old-asset', 95);
    await oldWebhookStarted;
    records.set('episode', {
      ...records.get('episode'), status: 'processing', muxUploadId: 'new-upload', muxAssetId: null,
    });
    releaseOldWebhook();
    assert.equal((await staleWebhook).status, 200);
    assert.equal(records.get('episode').status, 'processing');
    pauseOldWebhook = false;
  }
  assert.equal((await webhook('video.asset.ready', 'new-upload', 'new-asset')).status, 200);
  assert.equal(records.get('episode').status, 'ready');
  assert.equal(records.get('episode').duration, 0);
  assert.equal(records.get('episode').muxPlaybackId, 'playback-new');
  assert.equal(records.get('episode').approvalStatus, 'draft');
  assert.equal(records.get('episode').rightsHolder, 'Producer');
  records.set('episode', { ...records.get('episode'), status: 'processing', muxUploadId: 'new-upload' });
  assert.equal((await webhook('video.asset.errored', 'new-upload', 'new-asset')).status, 200);
  assert.equal(records.get('episode').status, 'errored');
});

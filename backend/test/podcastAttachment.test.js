const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAdminPodcastRouter } = require('../src/catalog/adminPodcastRouter');
const { manualPodcastAttachment } = require('../src/catalog/podcasts');
const { podcastCatalog } = require('../src/catalog/readModel');

test('attaching manual uploads preserves media and licensing and requires separate publication', async (context) => {
  const show = { id: 'show', title: 'Me and My White Friend', contentType: 'PODCAST_SHOW', approvalStatus: 'draft' };
  const upload = {
    id: 'upload', title: 'Actual title', contentType: 'EPISODE', status: 'ready',
    muxPlaybackId: 'playback', muxAssetId: 'asset', muxUploadId: 'upload-id', duration: 123,
    rightsHolder: 'Actual producer', rightsVerificationNotes: 'Actual evidence', approvalStatus: 'approved',
    licenseType: 'Licensed', rightsEndAt: '2027-01-01', revenueShare: 0.6, releaseStatus: 'held',
  };
  const records = new Map([[show.id, show], [upload.id, upload]]);
  let writes = 0;
  const store = {
    async getVideoById(id) {
      if (!records.has(id)) throw new Error('Video not found');
      return { ...records.get(id) };
    },
    async attachManualPodcastUpload(id, metadata, actor) {
      const current = await this.getVideoById(id);
      const changes = manualPodcastAttachment(current, records.get(metadata.podcastShowId), metadata, actor);
      records.set(id, { ...current, ...changes });
      writes += 1;
      return records.get(id);
    },
  };
  const app = express();
  app.use(express.json());
  app.use(createAdminPodcastRouter({
    store,
    authorize(req, res, next) {
      if (req.headers['x-test-admin'] !== 'yes') return res.status(403).json({ error: 'Admin required.' });
      req.user = { uid: 'admin' };
      return next();
    },
    media: {
      async createDirectUpload() { assert.fail('Must not reupload media'); },
      async createAssetFromUrl() { assert.fail('Must not reupload media'); },
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const metadata = {
    title: upload.title, podcastShowId: show.id, episodeNumber: 1,
    rightsHolder: upload.rightsHolder, rightsVerificationNotes: upload.rightsVerificationNotes,
    confirmed: true,
  };
  async function attach(body = metadata, admin = true, id = upload.id) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/episodes/${id}/attach-upload`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-admin': admin ? 'yes' : 'no' },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await attach(metadata, false)).status, 403);
  for (const changes of [
    { confirmed: false }, { rightsHolder: '' }, { rightsVerificationNotes: '' },
    { podcastShowId: 'missing' }, { podcastShowId: upload.id }, { episodeNumber: 0 },
    { episodeNumber: 1.5 }, { approvalStatus: 'approved' }, { muxPlaybackId: 'injected' },
  ]) assert.equal((await attach({ ...metadata, ...changes })).status, 400);
  for (const changes of [
    { status: 'processing' }, { muxPlaybackId: '' }, { contentType: 'MUSIC' },
    { creatorProjectId: 'project' }, { creatorEpisodeId: 'episode' },
    { creatorContractSignedAt: 'signed' }, { muxPlaybackPolicy: 'signed' },
  ]) {
    records.set(upload.id, { ...upload, ...changes });
    assert.equal((await attach()).status, 400);
  }
  records.set(upload.id, upload);
  assert.equal((await attach(metadata, true, 'missing')).status, 404);
  assert.equal(writes, 0);
  const result = await attach();
  assert.equal(result.status, 200);
  assert.equal(result.data.id, upload.id);
  assert.equal(result.data.approvalStatus, 'draft');
  assert.equal(result.data.podcastShowId, show.id);
  assert.equal(result.data.podcastAttachedBy, 'admin');
  assert.equal(result.data.podcastPreviousContentType, 'EPISODE');
  for (const key of ['muxPlaybackId', 'muxAssetId', 'muxUploadId', 'duration', 'licenseType', 'rightsEndAt', 'revenueShare', 'releaseStatus']) {
    assert.equal(result.data[key], upload[key], `${key} must remain unchanged`);
  }
  assert.equal((await attach()).status, 400, 'A stale retry cannot reclassify an already attached record');
  assert.equal(writes, 1);
  assert.deepEqual(podcastCatalog([...records.values()]), []);
  records.set(show.id, { ...show, approvalStatus: 'approved' });
  assert.equal(podcastCatalog([...records.values()])[0].episodes.length, 0);
  records.set(upload.id, { ...result.data, approvalStatus: 'approved' });
  assert.equal(podcastCatalog([...records.values()])[0].episodes.length, 0, 'Held releases stay hidden after approval');
  records.set(upload.id, { ...records.get(upload.id), releaseStatus: 'published' });
  assert.equal(podcastCatalog([...records.values()])[0].episodes[0].id, upload.id);
});

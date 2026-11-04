const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const { CreatorPublishingService, validateCreatorActionRequest } = require('../src/integrations/creatorPublishingService');
const { claimEpisode, episodeUpdateMatches } = require('../src/integrations/creatorEpisodes');
const { createCatalogRouter } = require('../src/catalog/router');
const { browse, isViewerEligible, seriesCatalog } = require('../src/catalog/readModel');
const { eligibleForPlatform } = require('../src/catalog/platformEligibility');
const { releaseAllowed } = require('../src/catalog/releases');
const { checkPremiereReadiness } = require('../src/integrations/premiereReadiness');

const ORIGIN = 'https://creators.example.test';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = uuid(1); const submissionId = uuid(2); const seasonId = uuid(3); const actorId = uuid(4);

function payload(action, number = 1, extra = {}) {
  const episodeId = uuid(100 + number); const assetId = uuid(200 + number);
  return {
    action, timestamp: Date.now(), requestId: `episode:${projectId}:${submissionId}:${episodeId}`,
    project: {
      id: projectId, title: 'Test Series', contentType: 'Series', genre: 'Drama',
      ownership: { status: 'verified', copyrightHolderName: 'Holder' },
      contract: { status: 'signed', signedAt: '2026-01-01T00:00:00.000Z', revokedAt: null, reference: 'ref-1', seriesSubmissionId: submissionId, contentType: 'Series' },
      contractApproval: 'approved',
    },
    submission: { id: submissionId, revision: 1, status: 'approved' },
    authorization: { actorId, role: 'admin', authorizedAt: '2026-01-02T00:00:00.000Z' },
    episode: {
      id: episodeId, title: `Episode ${number}`, synopsis: 'Synopsis', number, seasonId, seasonNumber: 1, seasonTitle: 'One',
      media: {
        assetId, mimeType: 'video/mp4', bytes: 10, sha256: 'a'.repeat(64),
        sourceUrl: `${ORIGIN}/api/integrations/protv/series-media/${projectId}/${submissionId}/${episodeId}/${assetId}?expires=1&signature=x`,
      },
    },
    ...extra,
  };
}

const past = () => ({ kind: 'scheduled', releaseAt: new Date(Date.now() - 1000).toISOString(), timeZone: 'America/New_York', firetvCleared: true });

// Mirrors the Firestore transactions and Mux behaviour used by the service.
function harness() {
  const docs = new Map(); const assets = new Map(); const calls = { created: 0, playbackAdded: 0, deleted: 0 };
  const dependencies = {
    getCreatorEpisode: async (id) => { const doc = docs.get(`creator_episode_${id}`); return doc ? { ...doc } : null; },
    claimCreatorEpisode: async (id, data, now, token) => {
      const claim = claimEpisode(docs.get(`creator_episode_${id}`) || null, data, now, token);
      if (claim.claimed) docs.set(claim.video.id, { ...claim.video });
      return claim;
    },
    updateCreatorEpisode: async (id, expected, updates) => {
      if (!episodeUpdateMatches(docs.get(id), expected)) return false;
      docs.set(id, { ...docs.get(id), ...updates });
      return true;
    },
    createPrivateAssetFromUrl: async (url, options) => {
      calls.created += 1;
      const id = `asset-${calls.created}`;
      assets.set(id, { id, status: 'preparing', duration: 100, playback_ids: [], passthrough: options.passthrough });
      return assets.get(id);
    },
    getAsset: async (id) => ({ ...assets.get(id) }),
    getPlaybackId: (asset) => asset.playback_ids.find((item) => item.policy === 'public')?.id || null,
    addPublicPlaybackId: async (id) => {
      calls.playbackAdded += 1;
      const item = { id: `pb${calls.playbackAdded}`, policy: 'public' };
      assets.get(id).playback_ids.push(item);
      return item;
    },
    deletePlaybackId: async (id, playbackId) => {
      calls.deleted += 1;
      assets.get(id).playback_ids = assets.get(id).playback_ids.filter((item) => item.id !== playbackId);
    },
    logAdminEvent: async () => {},
  };
  return { docs, assets, calls, service: new CreatorPublishingService({ creatorAgentOrigin: ORIGIN, publishingSecret: 'secret', dependencies }) };
}

const finishProcessing = (h) => { for (const asset of h.assets.values()) asset.status = 'ready'; };

test('preparing an episode creates a Mux asset with no playback address', async () => {
  const h = harness();
  const result = await h.service.execute(payload('episode_publishing'));
  assert.deepEqual([result.status, result.releaseStatus, result.mediaReady], ['processing', 'held', false]);
  const doc = h.docs.get(`creator_episode_${uuid(101)}`);
  assert.equal(doc.muxPlaybackId, null);
  assert.equal(doc.approvalStatus, 'draft');
  assert.equal(h.assets.get('asset-1').playback_ids.length, 0);
  assert.equal(isViewerEligible(doc), false);
});

test('preparing twice never creates a second asset', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  await h.service.execute(payload('episode_publishing'));
  assert.equal(h.calls.created, 1);
});

test('a finished video stays private until it is released', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  finishProcessing(h);
  const status = await h.service.execute(payload('episode_status'));
  assert.deepEqual([status.status, status.mediaReady], ['processing', true]);
  const doc = h.docs.get(`creator_episode_${uuid(101)}`);
  assert.equal(doc.status, 'held');
  assert.equal(doc.muxPlaybackId, null);
  assert.equal(browse([doc], { view: 'all' }).length, 0);
});

test('release creates one public ID, is idempotent, and makes the episode visible with artwork', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  finishProcessing(h);
  const first = await h.service.execute(payload('episode_release', 1, { release: past() }));
  const second = await h.service.execute(payload('episode_release', 1, { release: past() }));
  assert.equal(first.status, 'published');
  assert.equal(second.status, 'published');
  assert.equal(h.calls.playbackAdded, 1);
  const doc = h.docs.get(`creator_episode_${uuid(101)}`);
  assert.equal(doc.muxPlaybackId, 'pb1');
  assert.match(doc.thumbnailUrl, /^https:\/\/image\.mux\.com\/pb1\/thumbnail\.jpg/);
  assert.equal(browse([doc], { view: 'all' }).length, 1);
});

test('a retry after an interrupted release reuses the playback ID already created', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  finishProcessing(h);
  await h.service.execute(payload('episode_status'));
  h.assets.get('asset-1').playback_ids.push({ id: 'left-behind', policy: 'public' });
  await h.service.execute(payload('episode_release', 1, { release: past() }));
  assert.equal(h.calls.playbackAdded, 0);
  assert.equal(h.docs.get(`creator_episode_${uuid(101)}`).muxPlaybackId, 'left-behind');
});

test('release while processing reports waiting and creates no playback address', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  const result = await h.service.execute(payload('episode_release', 1, { release: past() }));
  assert.deepEqual([result.status, result.mediaReady], ['processing', false]);
  assert.equal(h.calls.playbackAdded, 0);
});

test('a Mux processing failure is reported and can be retried', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  h.assets.get('asset-1').status = 'errored';
  assert.equal((await h.service.execute(payload('episode_status'))).status, 'failed');
  await h.service.execute(payload('episode_publishing'));
  assert.equal(h.calls.created, 2);
});

test('unpublishing hides the episode and deletes its playback address, and it can return', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  finishProcessing(h);
  await h.service.execute(payload('episode_release', 1, { release: past() }));
  const result = await h.service.execute(payload('episode_unpublish'));
  assert.equal(result.releaseStatus, 'held');
  const doc = h.docs.get(`creator_episode_${uuid(101)}`);
  assert.equal(doc.muxPlaybackId, null);
  assert.equal(h.assets.get('asset-1').playback_ids.length, 0);
  assert.equal(browse([doc], { view: 'all' }).length, 0);
  assert.equal((await h.service.execute(payload('episode_release', 1, { release: past() }))).status, 'published');
  assert.equal(h.calls.created, 1);
});

test('a released episode cannot be silently replaced by a different revision', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  finishProcessing(h);
  await h.service.execute(payload('episode_release', 1, { release: past() }));
  const changed = payload('episode_publishing');
  changed.episode.media.sha256 = 'b'.repeat(64);
  await assert.rejects(() => h.service.execute(changed), /already released/);
});

function signed(body) {
  const raw = JSON.stringify(body);
  return [raw, crypto.createHmac('sha256', 'secret').update(raw).digest('hex'), 'secret'];
}

test('the bridge refuses a scheduled release before its time', () => {
  const release = { kind: 'scheduled', releaseAt: new Date(Date.now() + 600_000).toISOString() };
  assert.throws(() => validateCreatorActionRequest(...signed(payload('episode_release', 1, { release }))), /before its scheduled time/);
});

test('an authorized manual release may go early, and every release needs a time', () => {
  const release = { kind: 'manual', releaseAt: new Date(Date.now() + 600_000).toISOString() };
  assert.doesNotThrow(() => validateCreatorActionRequest(...signed(payload('episode_release', 1, { release }))));
  assert.throws(() => validateCreatorActionRequest(...signed(payload('episode_release'))), /requires a release time/);
});

test('the bridge rejects a bad signature, an expired request and any missing safeguard', () => {
  const [raw] = signed(payload('episode_status'));
  assert.throws(() => validateCreatorActionRequest(raw, 'bad', 'secret'));
  assert.throws(() => validateCreatorActionRequest(...signed({ ...payload('episode_status'), timestamp: Date.now() - 3_600_000 })), /expired/);
  const mutations = [
    (p) => { p.project.contract.status = 'sent'; },
    (p) => { p.project.contract.revokedAt = '2026-01-03T00:00:00.000Z'; },
    (p) => { p.project.contract.seriesSubmissionId = uuid(9); },
    (p) => { p.project.ownership.status = 'pending'; },
    (p) => { p.project.contractApproval = 'pending'; },
    (p) => { p.submission.status = 'draft'; },
    (p) => { p.authorization.role = 'creator'; },
  ];
  for (const mutate of mutations) {
    const body = payload('episode_status');
    mutate(body);
    assert.throws(() => validateCreatorActionRequest(...signed(body)), /Approved exact revision/);
  }
});

test('unpublishing still works after an agreement is revoked, but releasing does not', () => {
  const revoked = (action, extra) => {
    const body = payload(action, 1, extra);
    body.project.contract.revokedAt = '2026-01-03T00:00:00.000Z';
    return body;
  };
  assert.doesNotThrow(() => validateCreatorActionRequest(...signed(revoked('episode_unpublish'))));
  assert.throws(() => validateCreatorActionRequest(...signed(revoked('episode_release', { release: past() }))), /Approved exact revision/);
});

test('the readiness check is signed and carries no project', () => {
  const body = { action: 'premiere_readiness', requestId: 'premiere_readiness', timestamp: Date.now() };
  assert.doesNotThrow(() => validateCreatorActionRequest(...signed(body)));
  assert.throws(() => validateCreatorActionRequest(JSON.stringify(body), 'bad', 'secret'));
  assert.throws(() => validateCreatorActionRequest(...signed({ ...body, requestId: 'other' })));
});

test('a Series cannot be sent through the title publishing bridge', () => {
  const project = { id: projectId, title: 'S', contentType: 'Series', ownership: { status: 'verified' }, approval: { status: 'approved' }, contract: { status: 'signed', signedAt: 'x' }, promotional: { credits: 'c' } };
  const body = { action: 'publishing', timestamp: Date.now(), requestId: `${projectId}:publishing`, project };
  assert.throws(() => validateCreatorActionRequest(...signed(body)));
});

test('the media source must be the exact protected revision on the Creator Portal', async () => {
  const h = harness();
  const body = payload('episode_publishing');
  body.episode.media.sourceUrl = 'https://evil.example.test/video.mp4';
  await assert.rejects(() => h.service.execute(body), /does not match/);
  assert.equal(h.calls.created, 0);
});

test('the release gate keeps future records out and leaves existing records alone', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z');
  assert.equal(releaseAllowed({}, now), true);
  assert.equal(releaseAllowed({ releaseStatus: 'published' }, now), true);
  assert.equal(releaseAllowed({ releaseStatus: 'held' }, now), false);
  assert.equal(releaseAllowed({ releaseStatus: 'scheduled', releaseAt: '2026-06-01T00:00:01.000Z' }, now), false);
  assert.equal(releaseAllowed({ releaseStatus: 'scheduled', releaseAt: '2026-06-01T00:00:00.000Z' }, now), true);
  assert.equal(releaseAllowed({ releaseStatus: 'scheduled', releaseAt: 'nonsense' }, now), false);
});

test('the readiness check proves the mechanism and always cleans up', async () => {
  const log = []; let ids = [];
  const client = { video: { assets: {
    create: async (input) => { log.push(['create', input.test]); return { id: 'a', status: 'preparing', playback_ids: [] }; },
    retrieve: async () => ({ id: 'a', status: 'ready', playback_ids: ids }),
    createPlaybackId: async () => { ids = [{ id: 'p', policy: 'public' }]; return ids[0]; },
    deletePlaybackId: async () => { ids = []; },
    delete: async () => log.push(['delete']),
  } } };
  const fetcher = async (url) => ({ status: url.includes('image.mux.com') || ids.length ? 200 : 404, headers: new Map([['content-type', 'image/jpeg']]) });
  const report = await checkPremiereReadiness({ client, firestore: { runTransaction() {} }, fetcher, pauseMs: 0 });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual(log, [['create', true], ['delete']]);
  const failing = { video: { assets: { ...client.video.assets, retrieve: async () => { throw new Error('Mux unavailable'); } } } };
  const failed = await checkPremiereReadiness({ client: failing, firestore: { runTransaction() {} }, fetcher, pauseMs: 0 });
  assert.equal(failed.ok, false);
  assert.equal(log.filter(([name]) => name === 'delete').length, 2);
});

function episode(number, overrides = {}) {
  return {
    id: `creator_episode_${number}`, creatorEpisodeId: String(number), contentType: 'EPISODE', title: `E${number}`, status: 'ready',
    approvalStatus: 'approved', releaseStatus: 'published', muxPlaybackId: `pb${number}`, seriesTitle: 'Test Series',
    seasonNumber: 1, episodeNumber: number, thumbnailUrl: 'https://image.mux.com/x/thumbnail.jpg', category: 'Drama', ...overrides,
  };
}

test('series pages order episodes, and earlier episodes stay after each premiere and when a season ends', () => {
  const week1 = [episode(2), episode(1)];
  const week2 = [...week1, episode(3)];
  assert.deepEqual(seriesCatalog(week1)[0].seasons[0].episodes.map((item) => item.episodeNumber), [1, 2]);
  assert.deepEqual(seriesCatalog(week2)[0].seasons[0].episodes.map((item) => item.episodeNumber), [1, 2, 3]);
  const next = [...week2, episode(4, { seasonNumber: 2, episodeNumber: 1 })];
  assert.equal(seriesCatalog(next)[0].seasonCount, 2);
  assert.equal(seriesCatalog(next)[0].episodeCount, 4);
});

test('Fire TV only sees an episode an Administrator cleared; other clients are unchanged', () => {
  const cleared = episode(1, { firetvCleared: true });
  const uncleared = episode(2, { firetvCleared: false });
  const lookalike = { ...episode(3, { firetvCleared: true }), creatorEpisodeId: undefined };
  assert.deepEqual(eligibleForPlatform([cleared, uncleared, lookalike], 'firetv').map((item) => item.id), [cleared.id]);
  assert.equal(eligibleForPlatform([cleared, uncleared], 'default').length, 2);
  assert.equal(eligibleForPlatform([cleared, uncleared], 'roku').length, 0);
  assert.equal(eligibleForPlatform([{ ...uncleared, rokuCleared: true }], 'roku').length, 1);
});

test('playback catalogs hide unreleased episodes while approved premieres expose only safe details', async () => {
  const held = episode(1, { status: 'held', approvalStatus: 'approved', releaseStatus: 'held', muxPlaybackId: null, title: 'Secret' });
  const heldWithAddress = episode(2, { releaseStatus: 'held', title: 'Secret' });
  const future = episode(3, { releaseStatus: 'scheduled', releaseAt: new Date(Date.now() + 3_600_000).toISOString(), title: 'Secret' });
  const live = episode(4);
  const app = express();
  app.use('/c', createCatalogRouter({ loadApproved: async () => [held, heldWithAddress, future, live],
    loadHtmlTemplate: async () => '<html><head><title>PROtv</title></head><body><div id="root"></div></body></html>' }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}/c`;
  try {
    for (const path of ['', '?view=all', '?q=secret', '/series', '/sitemap.xml']) {
      const text = await (await fetch(base + path)).text();
      assert.doesNotMatch(text, /Secret|pb2|pb3|creator_episode_1|creator_episode_2|creator_episode_3/, path);
    }
    assert.equal((await (await fetch(`${base}?q=secret`)).json()).items.length, 0);
    for (const video of [held, heldWithAddress, future]) {
      for (const suffix of ['', '/playback', ...(video === future ? [] : ['/html'])]) {
        assert.equal((await fetch(`${base}/titles/${video.id}${suffix}`)).status, 404, video.id + suffix);
      }
      const futureHtml = await fetch(`${base}/titles/${future.id}/html`);
      assert.equal(futureHtml.status, 200);
      assert.doesNotMatch(await futureHtml.text(), /pb3|stream\.mux|playbackToken/);
    }
    assert.equal((await (await fetch(`${base}/titles/${live.id}/playback`)).json()).muxPlaybackId, 'pb4');
  } finally {
    server.close();
  }
});

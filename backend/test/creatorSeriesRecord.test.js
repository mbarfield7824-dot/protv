const assert = require('node:assert/strict');
const test = require('node:test');
const { CreatorPublishingService } = require('../src/integrations/creatorPublishingService');
const crypto = require('node:crypto');
const { claimEpisode, episodeUpdateMatches, validateEpisodeRequest } = require('../src/integrations/creatorEpisodes');
const { seriesDetails } = require('../src/catalog/details');
const { eligibleForPlatform } = require('../src/catalog/platformEligibility');

const ORIGIN = 'https://creators.example.test';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = uuid(1); const submissionId = uuid(2); const seasonId = uuid(3); const actorId = uuid(4);
const DESCRIPTION = "In a world where loyalty is tested, betrayal is deadly, and respect is earned through bloodshed, the streets have their own rules. But every decision comes with a price, and sooner or later, everybody must answer for the choices they've made.";
const release = () => ({ kind: 'manual', releaseAt: new Date(Date.now() - 1000).toISOString(), timeZone: 'America/New_York', firetvCleared: true });

function payload(action, number = 1, extra = {}) {
  const episodeId = uuid(100 + number); const assetId = uuid(200 + number);
  return {
    action, timestamp: Date.now(), requestId: `episode:${projectId}:${submissionId}:${episodeId}`,
    project: {
      id: projectId, title: '2212', contentType: 'Series', genre: '',
      ownership: { status: 'verified', copyrightHolderName: 'Carlos Clark' },
      contract: { status: 'signed', signedAt: '2026-11-20T00:00:00.000Z', revokedAt: null, reference: 'ref-1', seriesSubmissionId: submissionId, contentType: 'Series', rokuCleared: true },
      contractApproval: 'approved',
    },
    submission: { id: submissionId, revision: 1, status: 'approved' },
    authorization: { actorId, role: 'admin', authorizedAt: '2026-11-20T00:00:00.000Z' },
    episode: {
      id: episodeId, title: number === 1 ? 'Concrete' : 'Death Before Dishonor', synopsis: number === 1 ? "Unity is all we have. It's the key to our freedom." : 'Betrayal comes to every great leader, but do you stand or do you break?',
      number, seasonId, seasonNumber: 1, seasonTitle: 'Season 1',
      media: { assetId, mimeType: 'video/mp4', bytes: 10, sha256: 'a'.repeat(64),
        sourceUrl: `${ORIGIN}/api/integrations/protv/series-media/${projectId}/${submissionId}/${episodeId}/${assetId}?expires=1&signature=x` },
    },
    seriesProfile: { description: DESCRIPTION, poster: null },
    ...extra,
  };
}

// The episode fakes of creatorEpisodes.test.js plus a catalog store with the Firestore transaction semantics.
function harness(initial = []) {
  const docs = new Map(initial.map((record) => [record.id, { ...record }])); const assets = new Map(); let created = 0;
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
    createPrivateAssetFromUrl: async () => { created += 1; const id = `asset-${created}`; assets.set(id, { id, status: 'ready', duration: 1800, playback_ids: [] }); return assets.get(id); },
    getAsset: async (id) => ({ ...assets.get(id) }),
    getPlaybackId: (asset) => asset.playback_ids.find((item) => item.policy === 'public')?.id || null,
    addPublicPlaybackId: async (id) => { const item = { id: `pb-${id}`, policy: 'public' }; assets.get(id).playback_ids.push(item); return item; },
    deletePlaybackId: async (id, playbackId) => { assets.get(id).playback_ids = assets.get(id).playback_ids.filter((item) => item.id !== playbackId); },
    getAllVideos: async () => [...docs.values()].map((doc) => ({ ...doc })),
    transactSeries: async (id, mutate) => {
      const { write, result } = mutate(docs.has(id) ? { ...docs.get(id), id } : null);
      if (write) docs.set(id, { ...write, id });
      return result;
    },
    transferPoster: async () => 'https://watchprotv.com/api/posters/series-2212.jpg',
    logAdminEvent: async () => {},
  };
  return { docs, service: new CreatorPublishingService({ creatorAgentOrigin: ORIGIN, publishingSecret: 'secret', dependencies }) };
}

async function publish(h, number, extra) {
  await h.service.execute(payload('episode_publishing', number, extra));
  await h.service.execute(payload('episode_status', number, extra));
  return h.service.execute(payload('episode_release', number, { release: release(), ...extra }));
}

test('nothing about the show is public before an episode is released', async () => {
  const h = harness();
  await h.service.execute(payload('episode_publishing'));
  await h.service.execute(payload('episode_status'));
  assert.equal(h.docs.has(`creator_series_${projectId}`), false);
  assert.equal(seriesDetails([...h.docs.values()]).length, 0);
});

test('releasing the first episode creates one show record with the official description, artwork and TV clearances', async () => {
  const h = harness();
  const result = await publish(h, 1);
  assert.equal(result.status, 'published');
  assert.match(result.message, /show page details are published/);
  const show = h.docs.get(`creator_series_${projectId}`);
  assert.equal(show.contentType, 'SERIES');
  assert.equal(show.description, DESCRIPTION);
  assert.equal(show.creatorSeriesProjectId, projectId);
  assert.equal(show.rokuCleared, true);
  assert.equal(show.firetvCleared, true);
  assert.ok(show.posterUrl.startsWith('https://image.mux.com/'), 'falls back to the released episode frame without a poster');
  const [series] = seriesDetails([...h.docs.values()]);
  assert.equal(series.title, '2212');
  assert.equal(series.description, DESCRIPTION);
  assert.equal(series.comingSoon, false);
  assert.deepEqual(series.episodes.map((episode) => [episode.episodeNumber, episode.title, episode.description]),
    [[1, 'Concrete', "Unity is all we have. It's the key to our freedom."]]);
});

test('a second release updates the same record, keeps episode order, and adds no duplicate', async () => {
  const h = harness();
  await publish(h, 2);
  await publish(h, 1);
  const shows = [...h.docs.values()].filter((record) => record.contentType === 'SERIES');
  assert.equal(shows.length, 1);
  const [series] = seriesDetails([...h.docs.values()]);
  assert.deepEqual(series.episodes.map((episode) => episode.episodeNumber), [1, 2]);
  assert.equal(series.description, DESCRIPTION);
});

test('the official poster replaces the frame and is copied once', async () => {
  const h = harness();
  let transfers = 0;
  const expires = Date.now() + 3_600_000;
  const signature = crypto.createHmac('sha256', 'secret').update(`${projectId}:${uuid(300)}:poster:${expires}`).digest('hex');
  const poster = { assetId: uuid(300), mimeType: 'image/jpeg', bytes: 1000, sourceUrl: `${ORIGIN}/api/integrations/protv/promotional/${projectId}/${uuid(300)}?expires=${expires}&signature=${signature}` };
  const original = h.service.dependencies.transferPoster;
  h.service.dependencies.transferPoster = async (...args) => { transfers += 1; return original(...args); };
  await publish(h, 1, { seriesProfile: { description: DESCRIPTION, poster } });
  await publish(h, 2, { seriesProfile: { description: DESCRIPTION, poster } });
  const show = h.docs.get(`creator_series_${projectId}`);
  assert.equal(show.posterUrl, 'https://watchprotv.com/api/posters/series-2212.jpg');
  assert.equal(show.creatorSeriesPosterAssetId, uuid(300));
  assert.equal(transfers, 1);
});

test('the show record follows the platforms its episodes are cleared for', async () => {
  const h = harness();
  await publish(h, 1);
  const records = [...h.docs.values()];
  for (const platform of ['roku', 'firetv']) {
    const visible = eligibleForPlatform(records, platform);
    assert.ok(visible.some((record) => record.id === `creator_series_${projectId}`), `${platform} sees the show record`);
    assert.equal(seriesDetails(visible)[0].description, DESCRIPTION);
  }
  // Samsung keeps its hand-reviewed allowlist: nothing new appears there automatically.
  assert.equal(eligibleForPlatform(records, 'samsung').length, 0);
});

test('an existing Coming Soon listing for the project is reused, not duplicated', async () => {
  const comingSoon = { id: `coming_soon_${projectId}`, contentType: 'SERIES', title: '2212', seriesTitle: '2212', description: 'Old', comingSoonProjectId: projectId,
    status: 'ready', approvalStatus: 'approved', visibility: 'public', trailerAssetId: 'trailer-1', posterUrl: 'https://watchprotv.com/api/posters/cs.jpg' };
  const h = harness([comingSoon]);
  await publish(h, 1);
  assert.equal(h.docs.has(`creator_series_${projectId}`), false);
  const show = h.docs.get(`coming_soon_${projectId}`);
  assert.equal(show.description, DESCRIPTION);
  assert.equal(show.trailerAssetId, 'trailer-1');
  assert.equal(show.comingSoonProjectId, projectId);
  assert.equal(show.posterUrl, 'https://watchprotv.com/api/posters/cs.jpg');
});

test('a show with the same title that belongs to something else is never claimed; the episode still releases', async () => {
  const other = { id: 'manual-2212', contentType: 'SERIES', title: '2212', seriesTitle: '2212', description: 'Someone else', status: 'ready', approvalStatus: 'approved' };
  const h = harness([other]);
  const result = await publish(h, 1);
  assert.equal(result.status, 'published');
  assert.match(result.message, /already uses this title/);
  assert.equal(h.docs.has(`creator_series_${projectId}`), false);
  assert.equal(h.docs.get('manual-2212').description, 'Someone else');
});

test('existing series without an official description are unchanged', async () => {
  const h = harness();
  await publish(h, 1, { seriesProfile: undefined });
  assert.equal(h.docs.has(`creator_series_${projectId}`), false);
});

test('unpublishing the last released episode hides the show again; releasing restores it', async () => {
  const h = harness();
  await publish(h, 1);
  await publish(h, 2);
  await h.service.execute(payload('episode_unpublish', 1));
  assert.equal(h.docs.get(`creator_series_${projectId}`).approvalStatus, 'approved');
  const last = await h.service.execute(payload('episode_unpublish', 2));
  assert.match(last.message, /show page is hidden/);
  assert.equal(h.docs.get(`creator_series_${projectId}`).approvalStatus, 'draft');
  assert.equal(seriesDetails([...h.docs.values()]).length, 0);
  await h.service.execute(payload('episode_release', 1, { release: release() }));
  assert.equal(h.docs.get(`creator_series_${projectId}`).approvalStatus, 'approved');
});

test('a malformed series description is refused by the request check before anything runs', () => {
  assert.throws(() => validateEpisodeRequest(payload('episode_status', 1, { seriesProfile: { description: 'short', poster: null } })), /10 to 5000/);
  assert.throws(() => validateEpisodeRequest(payload('episode_status', 1, { seriesProfile: { description: DESCRIPTION, poster: { assetId: 'x' } } })), /Promotional poster/);
  assert.doesNotThrow(() => validateEpisodeRequest(payload('episode_status')));
  // Taking an episode down never depends on the show details.
  assert.doesNotThrow(() => validateEpisodeRequest(payload('episode_unpublish', 1, { seriesProfile: { description: 'short' } })));
});

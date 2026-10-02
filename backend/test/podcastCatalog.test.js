const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const firebase = require('../src/firebase');
const auth = require('../src/middleware/auth');
const { createCatalogRouter } = require('../src/catalog/router');
const { browse, isViewerEligible, podcastCatalog, seriesCatalog } = require('../src/catalog/readModel');
const { validatePodcastEpisodeReference } = require('../src/catalog/podcasts');

const show = {
  id: 'podcast-show-1', contentType: 'PODCAST_SHOW', title: 'Independent Voices',
  description: 'Conversations', host: 'Presenter', artworkUrl: 'show-art',
  category: 'Culture', approvalStatus: 'approved', status: 'processing',
  muxPlaybackId: 'accidental-show-playback', rightsHolder: 'Private rights',
};
const episode = {
  id: 'podcast-episode-1', contentType: 'PODCAST_EPISODE',
  podcastShowId: show.id, title: 'An Episode', episodeNumber: 2,
  approvalStatus: 'approved', status: 'ready', muxPlaybackId: 'episode-playback',
  thumbnailUrl: 'episode-art', rightsHolder: 'Private episode rights',
  rightsVerificationNotes: 'Internal evidence',
};
const movie = {
  id: 'movie', title: 'Film', contentType: 'MOVIE',
  approvalStatus: 'approved', status: 'ready', muxPlaybackId: 'movie-playback',
};
const tv = {
  ...movie, id: 'tv', contentType: 'EPISODE', seriesTitle: 'A TV Series',
  seasonNumber: 1, episodeNumber: 1,
};
const music = {
  ...movie, id: 'music', contentType: 'MUSIC', musicFormat: 'music_video',
};

test('Podcast episodes reference stable show IDs, never titles or another content type', () => {
  assert.equal(validatePodcastEpisodeReference(episode, show), show.id);
  assert.equal(validatePodcastEpisodeReference(episode, { ...show, title: 'Renamed' }), show.id);
  for (const [invalid, parent] of [
    [{ ...episode, podcastShowId: undefined }, show],
    [{ ...episode, podcastShowId: show.title }, show],
    [{ ...episode, podcastShowId: '../invalid' }, show],
    [{ ...episode, podcastShowId: 'another-show' }, show],
    [episode, undefined],
    [episode, { ...show, contentType: 'MOVIE' }],
    [{ ...episode, episodeNumber: 0 }, show],
  ]) {
    assert.throws(() => validatePodcastEpisodeReference(invalid, parent), /podcastShowId|episodeNumber/);
  }
});

test('Show publication is independent of readiness, but episodes need both gates', () => {
  assert.equal(isViewerEligible(show, [show]), false);
  assert.equal(isViewerEligible(episode, [show]), true);
  assert.equal(isViewerEligible(episode, [{ ...show, status: 'errored', muxPlaybackId: '' }]), true);
  for (const approvalStatus of ['draft', 'pending', 'rejected']) {
    assert.equal(isViewerEligible(episode, [{ ...show, approvalStatus }]), false);
  }
  for (const change of [
    { approvalStatus: 'draft' }, { status: 'processing' },
    { muxPlaybackId: '' }, { podcastShowId: 'missing' },
    { podcastShowId: undefined }, { episodeNumber: null },
  ]) {
    assert.equal(isViewerEligible({ ...episode, ...change }, [show]), false);
  }
  assert.equal(isViewerEligible(episode, []), false);
  assert.equal(isViewerEligible(episode, [movie]), false);
});

test('Podcast projections keep private metadata out; Movies, TV Series and Music retain their behavior', () => {
  const records = [{ ...show, category: 'Music' }, episode, movie, tv, music];
  const items = browse(records);
  assert.deepEqual(items.map(({ id }) => id), ['movie', 'music', 'podcast-episode-1', 'tv']);
  assert.equal(items.find(({ id }) => id === episode.id).podcastShowId, show.id);
  assert.equal(items.find(({ id }) => id === episode.id).rightsHolder, undefined);
  assert.deepEqual(browse(records, { view: 'movies' }).map(({ id }) => id), ['movie']);
  assert.deepEqual(browse(records, { view: 'music' }).map(({ id }) => id), ['music']);
  assert.equal(seriesCatalog(records).length, 1);
  assert.equal(seriesCatalog(records)[0].title, 'A TV Series');
  const podcasts = podcastCatalog(records);
  assert.equal(podcasts.length, 1);
  assert.equal(podcasts[0].id, show.id);
  assert.equal(podcasts[0].artworkUrl, 'show-art');
  assert.equal(podcasts[0].rightsHolder, undefined);
  assert.equal(podcasts[0].muxPlaybackId, undefined);
  assert.deepEqual(podcasts[0].episodes.map(({ id }) => id), [episode.id]);
  assert.equal(podcastCatalog([{ ...show, approvalStatus: 'draft' }, episode]).length, 0);
  const twoShows = podcastCatalog([
    show, { ...show, id: 'podcast-show-2' }, episode,
  ]);
  assert.deepEqual(twoShows.map(({ id }) => id), ['podcast-show-1', 'podcast-show-2']);
  assert.deepEqual(twoShows[1].episodes, []);
  const ordered = podcastCatalog([
    show, episode, { ...episode, id: 'podcast-episode-0', episodeNumber: 1 },
  ]);
  assert.deepEqual(ordered[0].episodes.map(({ id }) => id), ['podcast-episode-0', 'podcast-episode-1']);
});

test('filtered Podcast discovery keeps the full catalog as Show context', () => {
  const documentaryEpisode = { ...episode, category: 'Documentary', genres: ['Documentary'] };
  const musicEpisode = { ...episode, id: 'podcast-music-episode', category: 'Culture', genre: 'Music' };
  const records = [show, documentaryEpisode, musicEpisode];

  assert.deepEqual(browse(records, { view: 'documentaries' }).map(({ id }) => id), [episode.id]);
  assert.deepEqual(browse(records, { view: 'documentaries', q: 'episode documentary' }).map(({ id }) => id), [episode.id]);
  assert.deepEqual(browse(records, { view: 'music' }).map(({ id }) => id), [musicEpisode.id]);
  assert.equal(browse(records).some(({ id }) => id === show.id), false);
  for (const parent of [null, { ...show, approvalStatus: 'draft' }]) {
    const fixture = parent ? [parent, documentaryEpisode, musicEpisode] : [documentaryEpisode, musicEpisode];
    assert.deepEqual(browse(fixture, { view: 'documentaries' }), []);
    assert.deepEqual(browse(fixture, { view: 'music' }), []);
  }
});

test('versioned and legacy public detail/playback fail closed for an unpublished or missing parent', async (context) => {
  let fixtures = [show, episode, movie, tv, music];
  let writes = 0;
  context.mock.method(firebase, 'getApprovedVideos', async () => fixtures.filter((item) => item.approvalStatus === 'approved'));
  context.mock.method(firebase, 'getVideoById', async (id) => {
    const item = fixtures.find((candidate) => candidate.id === id);
    if (!item) throw new firebase.VideoNotFoundError('Video not found');
    return item;
  });
  context.mock.method(firebase, 'updateVideo', async () => { writes += 1; });
  context.mock.method(firebase, 'updateVideoApproval', async () => { writes += 1; });
  context.mock.method(auth, 'verifyAdmin', (req, res, next) => {
    req.user = { uid: 'admin-test' };
    next();
  });
  const path = require.resolve('../src/routes/videos');
  delete require.cache[path];
  const app = express();
  app.use(express.json());
  app.use('/videos', require(path));
  app.use('/v1/catalog', createCatalogRouter({
    loadApproved: async () => fixtures.filter((item) => item.approvalStatus === 'approved'),
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => { server.close(); delete require.cache[path]; });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function get(url) {
    const response = await fetch(`${base}${url}`);
    return { status: response.status, body: await response.json() };
  }

  assert.equal((await get('/videos')).body.some(({ id }) => id === show.id), false);
  const legacy = await get(`/videos/${episode.id}`);
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.muxPlaybackId, episode.muxPlaybackId);
  assert.equal(legacy.body.rightsHolder, undefined);
  assert.equal((await get('/v1/catalog/podcasts')).body.items[0].id, show.id);
  const showDetail = await get(`/v1/catalog/podcasts/${show.id}`);
  assert.deepEqual(showDetail.body.episodes.map(({ id }) => id), [episode.id]);
  assert.equal(showDetail.body.rightsHolder, undefined);
  assert.equal((await get(`/v1/catalog/titles/${episode.id}/playback`)).body.muxPlaybackId, episode.muxPlaybackId);
  assert.equal((await get(`/v1/catalog/titles/${show.id}`)).status, 404);
  assert.equal((await get(`/videos/${show.id}`)).status, 404);
  for (const id of [show.id, episode.id]) {
    for (const [method, route, body] of [
      ['PATCH', `/videos/${id}`, { contentType: 'MOVIE', title: 'Retyped' }],
      ['PATCH', `/videos/admin/${id}/approve`, {}],
      ['POST', `/videos/admin/${id}/ingest`, {}],
    ]) {
      const response = await fetch(`${base}${route}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, `${method} ${route}`);
      assert.match((await response.json()).error, /Podcast/);
    }
  }
  assert.equal(writes, 0);

  fixtures = [show, { ...episode, category: 'Documentary', genres: ['Documentary'] }, movie, tv, music];
  assert.deepEqual(
    (await get('/v1/catalog?view=documentaries')).body.items.map(({ id }) => id),
    [episode.id],
  );
  fixtures = [{ ...show, approvalStatus: 'draft' }, { ...episode, category: 'Documentary' }];
  assert.deepEqual((await get('/v1/catalog?view=documentaries')).body.items, []);

  for (const changes of [
    { approvalStatus: 'draft' }, { status: 'processing' }, { muxPlaybackId: '' },
    { episodeNumber: 0 }, { podcastShowId: undefined },
  ]) {
    fixtures = [show, { ...episode, ...changes }, movie, tv, music];
    assert.equal((await get(`/videos/${episode.id}`)).status, 404);
    assert.equal((await get(`/v1/catalog/titles/${episode.id}`)).status, 404);
    assert.equal((await get(`/v1/catalog/titles/${episode.id}/playback`)).status, 404);
  }
  for (const parent of [{ ...show, approvalStatus: 'draft' }, null, { ...show, contentType: 'MOVIE' }]) {
    fixtures = parent ? [parent, episode, movie, tv, music] : [episode, movie, tv, music];
    assert.equal((await get('/videos')).body.some(({ id }) => id === episode.id), false);
    assert.equal((await get(`/videos/${episode.id}`)).status, 404);
    assert.equal((await get(`/v1/catalog/titles/${episode.id}`)).status, 404);
    assert.equal((await get(`/v1/catalog/titles/${episode.id}/playback`)).status, 404);
    assert.equal((await get(`/v1/catalog/podcasts/${show.id}`)).status, 404);
  }
});

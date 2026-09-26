const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { browse, seriesCatalog, seriesKey } = require('../src/catalog/readModel');
const { createCatalogRouter } = require('../src/catalog/router');

function title(id, overrides = {}) {
  return {
    id,
    title: `Title ${id}`,
    contentType: 'MOVIE',
    approvalStatus: 'approved',
    status: 'ready',
    muxPlaybackId: `playback-${id}`,
    category: 'Drama',
    rightsHolder: 'Private holder',
    rightsVerificationNotes: 'Internal evidence',
    creatorProjectId: 'private-project',
    ...overrides,
  };
}

const records = [
  title('movie', { title: 'Classic Film', category: 'Black Cinema' }),
  title('lowercase-movie', { contentType: 'movie' }),
  title('category-doc', { category: 'Documentary' }),
  title('subgenre-doc', { subgenre: 'Documentary' }),
  title('genres-doc', { genres: ['Drama', 'DOCUMENTARY'] }),
  title('genre-only-doc', { category: '', genre: 'Documentary' }),
  title('episode-doc', {
    contentType: 'EPISODE', category: 'Documentary', seriesTitle: '  One Step Beyond  ',
    seasonNumber: 10, episodeNumber: 2, episodeTitle: 'The Storm',
    thumbnailUrl: 'https://images.example/storm.jpg',
  }),
  title('episode-1', { contentType: 'EPISODE', seriesTitle: 'One  Step Beyond', seasonNumber: 2, episodeNumber: 10 }),
  title('episode-2', { contentType: 'EPISODE', seriesTitle: 'one step beyond', seasonNumber: 2, episodeNumber: 2 }),
  title('episode-2b', { contentType: 'EPISODE', seriesTitle: 'ONE STEP BEYOND', seasonNumber: 2, episodeNumber: 2 }),
  title('blank-series', { contentType: 'EPISODE', seriesTitle: '  ', seasonNumber: 1, episodeNumber: 1 }),
  title('season-zero', { contentType: 'EPISODE', seriesTitle: 'Bad Season', seasonNumber: 0, episodeNumber: 1 }),
  title('episode-zero', { contentType: 'EPISODE', seriesTitle: 'Bad Episode', seasonNumber: 1, episodeNumber: 0 }),
  title('decimal-season', { contentType: 'EPISODE', seriesTitle: 'Decimal', seasonNumber: 1.5, episodeNumber: 1 }),
  title('decimal-episode', { contentType: 'EPISODE', seriesTitle: 'Decimal', seasonNumber: 1, episodeNumber: 2.5 }),
  title('inferred', { contentType: 'EPISODE', title: 'Show S1 E1', seasonNumber: 1, episodeNumber: 1 }),
  title('string-season', { contentType: 'EPISODE', seriesTitle: 'Legacy', seasonNumber: '1', episodeNumber: 1 }),
  title('draft', { approvalStatus: 'draft', title: 'Hidden Documentary' }),
  title('pending', { approvalStatus: 'pending' }),
  title('rejected', { approvalStatus: 'rejected' }),
  title('rights', { approvalStatus: 'rights-verification-required' }),
  title('processing', { status: 'processing', category: 'Documentary', title: 'Hidden Documentary' }),
  title('errored', { status: 'errored' }),
  title('missing-id', { muxPlaybackId: '' }),
  title('blank-id', { muxPlaybackId: '   ' }),
  title('nonstring-id', { muxPlaybackId: 42 }),
];

test('browse projects only approved ready playable titles and excludes private fields', () => {
  const items = browse(records);
  assert.equal(items.length, 17);
  assert.deepEqual(items.map((item) => item.id), [...items.map((item) => item.id)].sort());
  assert.equal(items.some((item) => item.id === 'draft' || item.id === 'processing'), false);
  assert.equal(items.some((item) => item.id === 'missing-id' || item.id === 'blank-id'), false);
  assert.equal(items[0].rightsHolder, undefined);
  assert.equal(items[0].rightsVerificationNotes, undefined);
  assert.equal(items[0].creatorProjectId, undefined);
  assert.equal(items[0].approvalStatus, undefined);
});

test('movies and documentary views preserve current web filtering', () => {
  assert.deepEqual(browse(records, { view: 'movies' }).map((item) => item.id), [
    'category-doc', 'genre-only-doc', 'genres-doc', 'lowercase-movie', 'movie', 'subgenre-doc',
  ]);
  assert.deepEqual(browse(records, { view: 'documentaries' }).map((item) => item.id), [
    'category-doc', 'episode-doc', 'genres-doc', 'subgenre-doc',
  ]);
});

test('search matches every whitespace term across title, category, subgenre and genres', () => {
  assert.deepEqual(browse(records, { q: '  CLASSIC   black  ' }).map((item) => item.id), ['movie']);
  assert.deepEqual(browse(records, { q: 'docuMENtary DRAMA' }).map((item) => item.id), [
    'genres-doc', 'subgenre-doc',
  ]);
  assert.deepEqual(browse(records, { q: 'documentary' }).map((item) => item.id), [
    'category-doc', 'episode-doc', 'genre-only-doc', 'genres-doc', 'subgenre-doc',
  ]);
  assert.deepEqual(browse(records, { view: 'movies', q: 'storm' }), []);
  assert.deepEqual(browse(records, { q: 'hidden documentary' }), []);
  assert.deepEqual(browse(records, { q: 'nomatch' }), []);
});

test('series grouping is strict, ordered and stable regardless of input order', () => {
  const series = seriesCatalog(records);
  assert.equal(series.length, 1);
  const [group] = series;
  assert.equal(group.key, 'b25lIHN0ZXAgYmV5b25k');
  assert.equal(group.key, seriesKey(' ONE  STEP BEYOND '));
  assert.equal(group.title, 'One  Step Beyond');
  assert.equal(group.episodeCount, 4);
  assert.equal(group.seasonCount, 2);
  assert.deepEqual(group.seasons.map((season) => season.number), [2, 10]);
  assert.deepEqual(group.seasons.map((season) => season.episodes.map((episode) => episode.id)), [
    ['episode-2', 'episode-2b', 'episode-1'],
    ['episode-doc'],
  ]);
  assert.equal(group.category, '');
  assert.equal(group.artwork, 'https://images.example/storm.jpg');
  assert.deepEqual(seriesCatalog([...records].reverse()), series);
  assert.equal(seriesKey('Été'), 'w6l0w6k');
});

test('versioned router returns viewer-safe browse, summaries, details, errors and no writes', async (context) => {
  let reads = 0;
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({
    loadApproved: async () => {
      reads += 1;
      return records;
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;
  const get = async (suffix = '') => {
    const response = await fetch(`${base}${suffix}`);
    return { status: response.status, body: await response.json() };
  };

  assert.equal((await get()).body.items.length, 17);
  assert.equal((await get('?view=movies')).body.items.length, 6);
  assert.equal((await get('?view=documentaries')).body.items.length, 4);
  assert.deepEqual((await get('?q=ClAsSiC%20black')).body.items.map((item) => item.id), ['movie']);
  const summary = await get('/series');
  assert.equal(summary.status, 200);
  assert.equal(summary.body.items.length, 1);
  assert.equal(summary.body.items[0].seasons, undefined);
  const detail = await get(`/series/${summary.body.items[0].key}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.seasons.map((season) => season.number), [2, 10]);
  assert.equal(detail.body.seasons[0].episodes[0].rightsHolder, undefined);
  assert.equal((await get('/series/unknown')).status, 404);
  assert.equal((await get('/series/%21')).status, 404);
  assert.equal((await get('?view=unknown')).status, 400);
  assert.equal((await get('?q=a&q=b')).status, 400);
  assert.equal((await get(`?q=${'a'.repeat(201)}`)).status, 400);
  assert.ok(reads >= 6);
});

test('catalog backend failures return 500 rather than an empty successful catalog', async (context) => {
  context.mock.method(console, 'error', () => {});
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({
    loadApproved: async () => { throw new Error('storage unavailable'); },
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/catalog`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'The catalog is temporarily unavailable.' });
});

test('Vercel bridge preserves catalog view and search without changing legacy videos routing', () => {
  const appPath = require.resolve('../src/app');
  const bridgePath = require.resolve('../../api/index');
  const previousApp = require.cache[appPath];
  const previousBridge = require.cache[bridgePath];
  try {
    require.cache[appPath] = {
      id: appPath,
      filename: appPath,
      loaded: true,
      exports: (request) => request.url,
    };
    delete require.cache[bridgePath];
    const bridge = require(bridgePath);
    const catalog = { query: { path: 'v1/catalog', view: 'movies', q: 'Black Cinema' } };
    assert.equal(bridge(catalog, {}), '/api/v1/catalog?view=movies&q=Black+Cinema');
    const legacy = { query: { path: 'videos', view: 'movies' } };
    assert.equal(bridge(legacy, {}), '/api/videos');
  } finally {
    delete require.cache[bridgePath];
    if (previousBridge) require.cache[bridgePath] = previousBridge;
    if (previousApp) require.cache[appPath] = previousApp;
    else delete require.cache[appPath];
  }
});

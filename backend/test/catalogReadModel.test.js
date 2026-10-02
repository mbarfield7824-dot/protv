const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { browse, seriesCatalog, seriesKey } = require('../src/catalog/readModel');
const { MUSIC_FORMATS, validateMusicFormat } = require('../src/catalog/music');
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

test('Music formats are explicit, validated values', () => {
  assert.deepEqual(MUSIC_FORMATS, [
    'music_video',
    'live_performance',
    'artist_showcase',
    'interview',
    'music_documentary',
    'premiere_special',
  ]);
  for (const format of MUSIC_FORMATS) {
    assert.equal(validateMusicFormat(format), format);
  }
  for (const invalid of ['', 'Music Video', 'music-video', 'podcast', null, 42]) {
    assert.throws(() => validateMusicFormat(invalid), /musicFormat must be one of/);
  }
});

test('Music browse safely projects typed records and preserves legacy Music categories', () => {
  const music = MUSIC_FORMATS.map((musicFormat) => title(`music-${musicFormat}`, {
    contentType: 'MUSIC',
    musicFormat,
    category: musicFormat === 'music_documentary' ? 'Documentary' : 'Music',
    subgenre: 'Hip-Hop',
    genres: musicFormat === 'music_documentary' ? ['Documentary', 'Hip-Hop'] : ['Hip-Hop'],
  }));
  const legacyCategory = title('legacy-category-music', { category: 'Music' });
  const legacyGenre = title('legacy-genre-music', { category: '', genre: 'Music' });
  const invalidFormat = title('music-invalid-format', { contentType: 'MUSIC', musicFormat: 'podcast' });
  const missingFormat = title('music-missing-format', { contentType: 'MUSIC' });
  const draftMusic = title('music-draft', {
    contentType: 'MUSIC', musicFormat: 'music_video', approvalStatus: 'draft',
  });
  const processingMusic = title('music-processing', {
    contentType: 'MUSIC', musicFormat: 'music_video', status: 'processing',
  });
  const fixture = [
    ...music, legacyCategory, legacyGenre, invalidFormat, missingFormat, draftMusic, processingMusic,
  ];

  const projected = browse(fixture);
  const typedMusic = projected.filter((item) => item.contentType === 'MUSIC');
  assert.deepEqual(typedMusic.map((item) => item.musicFormat).sort(), [...MUSIC_FORMATS].sort());
  assert.equal(projected.some((item) => ['music-invalid-format', 'music-missing-format'].includes(item.id)), false);
  assert.equal(projected.some((item) => ['music-draft', 'music-processing'].includes(item.id)), false);
  assert.equal(projected.find((item) => item.id === 'music-music_documentary').category, 'Documentary');
  assert.equal(projected.find((item) => item.id === 'music-music_video').subgenre, 'Hip-Hop');
  assert.equal(projected.find((item) => item.id === 'music-music_video').contentType, 'MUSIC');

  const musicView = browse(fixture, { view: 'music' });
  assert.deepEqual(musicView.map((item) => item.id), [
    'legacy-category-music',
    'legacy-genre-music',
    ...MUSIC_FORMATS.map((format) => `music-${format}`).sort(),
  ].sort());
  assert.equal(musicView.some((item) => ['music-invalid-format', 'music-missing-format', 'music-draft', 'music-processing'].includes(item.id)), false);

  const movies = browse(fixture, { view: 'movies' });
  assert.equal(movies.some((item) => item.contentType === 'MUSIC'), false);
  assert.ok(movies.some((item) => item.id === 'legacy-category-music'));
  const documentaries = browse(fixture, { view: 'documentaries' });
  assert.ok(documentaries.some((item) => item.id === 'music-music_documentary'));
  assert.equal(documentaries.find((item) => item.id === 'music-music_documentary').contentType, 'MUSIC');
  assert.deepEqual(seriesCatalog(fixture), []);
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

test('versioned catalog adds a Music view without changing the default viewer contract', async (context) => {
  const fixture = [
    title('music-video', {
      contentType: 'MUSIC',
      musicFormat: 'music_video',
      category: 'Music',
      subgenre: 'Jazz',
    }),
    title('music-documentary', {
      contentType: 'MUSIC',
      musicFormat: 'music_documentary',
      category: 'Documentary',
      genres: ['Documentary'],
    }),
    title('legacy-music', { category: 'Music' }),
    title('draft-music', {
      contentType: 'MUSIC', musicFormat: 'live_performance', approvalStatus: 'draft',
    }),
    title('unready-music', {
      contentType: 'MUSIC', musicFormat: 'live_performance', status: 'processing',
    }),
    title('invalid-music', { contentType: 'MUSIC', musicFormat: 'invalid' }),
  ];
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => fixture }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;

  const allResponse = await fetch(base);
  assert.equal(allResponse.status, 200);
  const all = await allResponse.json();
  assert.deepEqual(all.items.map((item) => item.id), ['legacy-music', 'music-documentary', 'music-video']);
  assert.equal(all.items.find((item) => item.id === 'music-video').musicFormat, 'music_video');
  assert.equal(all.items.find((item) => item.id === 'legacy-music').musicFormat, undefined);

  const musicResponse = await fetch(`${base}?view=music`);
  assert.equal(musicResponse.status, 200);
  assert.deepEqual((await musicResponse.json()).items.map((item) => item.id), [
    'legacy-music', 'music-documentary', 'music-video',
  ]);
  const moviesResponse = await fetch(`${base}?view=movies`);
  assert.deepEqual((await moviesResponse.json()).items.map((item) => item.id), ['legacy-music']);
  const documentariesResponse = await fetch(`${base}?view=documentaries`);
  const documentaries = (await documentariesResponse.json()).items;
  assert.deepEqual(documentaries.map((item) => item.id), ['music-documentary']);
  assert.equal(documentaries[0].contentType, 'MUSIC');
});

test('title detail and playback use the Phase 2A playable catalog projection', async (context) => {
  const fixture = [
    title('detail', {
      title: 'A Viewer Title',
      description: 'A public description',
      contentType: 'EPISODE',
      category: 'Documentary',
      subgenre: 'Nature',
      genres: ['Documentary', 'Nature'],
      year: 2026,
      duration: 1300,
      runtime: 22,
      maturityRating: 'PG',
      thumbnailUrl: 'https://images.example/thumbnail.jpg',
      posterUrl: 'https://images.example/poster.jpg',
      heroImageUrl: 'https://images.example/hero.jpg',
      seriesTitle: 'Nature Series',
      seasonNumber: 1,
      episodeNumber: 2,
      episodeTitle: 'A Viewer Episode',
      muxPlaybackId: '  playback-detail  ',
      muxAssetId: 'internal-asset',
      muxUploadId: 'internal-upload',
      videoUrl: 'https://private.example/source',
      approvalNotes: 'Internal notes',
      apiKey: 'secret',
    }),
    title('draft', { approvalStatus: 'draft' }),
    title('pending', { approvalStatus: 'pending-review' }),
    title('rejected', { approvalStatus: 'rejected' }),
    title('rights', { approvalStatus: 'rights-verification-required' }),
    title('processing', { status: 'processing' }),
    title('errored', { status: 'errored' }),
    title('no-playback', { muxPlaybackId: null }),
    title('blank-playback', { muxPlaybackId: '   ' }),
  ];
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => fixture }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;

  const detailResponse = await fetch(`${base}/titles/detail`);
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.deepEqual(detail, browse(fixture)[0]);
  assert.deepEqual(detail, {
    id: 'detail',
    title: 'A Viewer Title',
    description: 'A public description',
    contentType: 'EPISODE',
    category: 'Documentary',
    subgenre: 'Nature',
    genres: ['Documentary', 'Nature'],
    year: 2026,
    duration: 1300,
    runtime: 22,
    maturityRating: 'PG',
    thumbnailUrl: 'https://images.example/thumbnail.jpg',
    posterUrl: 'https://images.example/poster.jpg',
    heroImageUrl: 'https://images.example/hero.jpg',
    muxPlaybackId: 'playback-detail',
    seriesTitle: 'Nature Series',
    seasonNumber: 1,
    episodeNumber: 2,
    episodeTitle: 'A Viewer Episode',
  });

  const playbackResponse = await fetch(`${base}/titles/detail/playback`);
  assert.equal(playbackResponse.status, 200);
  assert.deepEqual(await playbackResponse.json(), {
    id: 'detail',
    streamType: 'on-demand',
    muxPlaybackId: 'playback-detail',
  });

  for (const id of ['not-found', 'draft', 'pending', 'rejected', 'rights', 'processing', 'errored', 'no-playback', 'blank-playback']) {
    for (const suffix of ['', '/playback']) {
      const response = await fetch(`${base}/titles/${id}${suffix}`);
      assert.equal(response.status, 404, `${id}${suffix}`);
      assert.deepEqual(await response.json(), { error: 'Title not found.' });
    }
  }
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
  for (const suffix of ['/titles/detail', '/titles/detail/playback']) {
    const titleResponse = await fetch(`http://127.0.0.1:${server.address().port}/v1/catalog${suffix}`);
    assert.equal(titleResponse.status, 500);
    assert.deepEqual(await titleResponse.json(), { error: 'The catalog is temporarily unavailable.' });
  }
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

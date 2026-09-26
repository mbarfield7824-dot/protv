const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

test('video write routes enforce episode metadata before Mux or catalog writes', async (context) => {
  const firebase = require('../src/firebase');
  const mux = require('../src/mux');
  const auth = require('../src/middleware/auth');
  const writes = [];
  const muxCalls = [];

  context.mock.method(auth, 'verifyAdmin', (req, res, next) => {
    req.user = { uid: 'test-admin' };
    next();
  });
  context.mock.method(firebase, 'addVideo', async (video) => {
    writes.push({ route: 'create', video });
    return 'episode-1';
  });
  context.mock.method(firebase, 'updateVideo', async (id, video) => {
    writes.push({ route: 'update', video });
  });
  context.mock.method(firebase, 'getVideoById', async () => ({ id: 'episode-1' }));
  context.mock.method(mux, 'createDirectUpload', async () => {
    muxCalls.push('upload');
    return { id: 'upload-1', url: 'https://mux.example/upload' };
  });
  context.mock.method(mux, 'createAssetFromUrl', async () => {
    muxCalls.push('asset');
    return { id: 'asset-1' };
  });

  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const app = express();
  app.use(express.json());
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    delete require.cache[routePath];
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, method, metadata) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Episode',
        category: 'Drama',
        sourceUrl: 'https://example.com/episode.mp4',
        contentType: 'EPISODE',
        seriesTitle: 'The Series',
        seasonNumber: 1,
        episodeNumber: 2,
        ...metadata,
      }),
    });
    return { status: response.status, body: await response.json() };
  }

  const paths = [
    { path: '/videos/upload-url', method: 'POST', success: 201 },
    { path: '/videos/from-url', method: 'POST', success: 201 },
    { path: '/videos/episode-1', method: 'PATCH', success: 200 },
  ];
  const invalid = [
    ['blank series', { seriesTitle: '' }, /Series title/],
    ['whitespace series', { seriesTitle: '   ' }, /Series title/],
    ['non-string series', { seriesTitle: 10 }, /Series title/],
    ['season zero', { seasonNumber: 0 }, /Season number/],
    ['negative season', { seasonNumber: -1 }, /Season number/],
    ['decimal season', { seasonNumber: 1.5 }, /Season number/],
    ['nonnumeric season', { seasonNumber: 'abc' }, /Season number/],
    ['missing season', { seasonNumber: null }, /Season number/],
    ['episode zero', { episodeNumber: 0 }, /Episode number/],
    ['negative episode', { episodeNumber: -2 }, /Episode number/],
    ['decimal episode', { episodeNumber: 2.5 }, /Episode number/],
    ['nonnumeric episode', { episodeNumber: 'abc' }, /Episode number/],
    ['unsafe episode', { episodeNumber: '9007199254740992' }, /Episode number/],
  ];

  for (const { path, method, success } of paths) {
    for (const [name, metadata, message] of invalid) {
      const beforeWrites = writes.length;
      const beforeMux = muxCalls.length;
      const result = await request(path, method, metadata);
      assert.equal(result.status, 400, `${path}: ${name}`);
      assert.match(result.body.error, message, `${path}: ${name}`);
      assert.equal(writes.length, beforeWrites, `${path}: ${name} wrote catalog data`);
      assert.equal(muxCalls.length, beforeMux, `${path}: ${name} started Mux`);
    }

    const valid = await request(path, method, {
      seriesTitle: '  The Series  ',
      seasonNumber: ' 01 ',
      episodeNumber: '2',
    });
    assert.equal(valid.status, success, `${path}: valid episode`);
    assert.equal(writes.at(-1).video.contentType, 'EPISODE');
    assert.equal(writes.at(-1).video.seriesTitle, 'The Series');
    assert.equal(writes.at(-1).video.seasonNumber, 1);
    assert.equal(writes.at(-1).video.episodeNumber, 2);

    const movie = await request(path, method, {
      contentType: 'MOVIE',
      seriesTitle: '',
      seasonNumber: 0,
      episodeNumber: 'invalid',
    });
    assert.equal(movie.status, success, `${path}: movie`);
    assert.equal(writes.at(-1).video.contentType, 'MOVIE');
    assert.equal(writes.at(-1).video.seriesTitle, '');
    assert.equal(writes.at(-1).video.seasonNumber, null);
    assert.equal(writes.at(-1).video.episodeNumber, null);
  }
});

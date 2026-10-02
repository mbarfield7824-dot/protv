const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const firebase = require('../src/firebase');
const { createCatalogRouter } = require('../src/catalog/router');

const validMusic = {
  id: 'music-valid',
  title: 'Valid Music',
  contentType: 'MUSIC',
  musicFormat: 'music_video',
  category: 'Music',
  approvalStatus: 'approved',
  status: 'ready',
  muxPlaybackId: 'music-playback',
};

function eligible(title, overrides = {}) {
  return {
    id: title,
    title,
    approvalStatus: 'approved',
    status: 'ready',
    muxPlaybackId: `${title}-playback`,
    ...overrides,
  };
}

test('legacy public video detail enforces viewer eligibility and preserves eligible response shape', async (context) => {
  const fixtures = new Map([
    [validMusic.id, validMusic],
    ['draft-music', {
      ...validMusic,
      id: 'draft-music',
      approvalStatus: 'draft',
    }],
    ['unapproved-music', {
      ...validMusic,
      id: 'unapproved-music',
      approvalStatus: 'pending-review',
    }],
    ['processing-music', {
      ...validMusic,
      id: 'processing-music',
      status: 'processing',
    }],
    ['missing-mux-music', {
      ...validMusic,
      id: 'missing-mux-music',
      muxPlaybackId: '',
    }],
    ['invalid-format-music', {
      ...validMusic,
      id: 'invalid-format-music',
      musicFormat: 'podcast',
    }],
    ['missing-format-music', {
      ...validMusic,
      id: 'missing-format-music',
      musicFormat: undefined,
    }],
    ['eligible-movie', eligible('eligible-movie', {
      contentType: 'MOVIE',
      category: 'Drama',
      year: 2024,
    })],
    ['eligible-episode', eligible('eligible-episode', {
      contentType: 'EPISODE',
      seriesTitle: 'A Series',
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: 'Episode Three',
    })],
  ]);
  context.mock.method(firebase, 'getVideoById', async (id) => {
    const video = fixtures.get(id);
    if (!video) throw new firebase.VideoNotFoundError('Video not found');
    return video;
  });

  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const videoRouter = require(routePath);
  const app = express();
  app.use('/videos', videoRouter);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    delete require.cache[routePath];
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/videos`;

  const get = async (id) => {
    const response = await fetch(`${base}/${id}`);
    return { status: response.status, body: await response.json() };
  };

  const musicResponse = await get(validMusic.id);
  assert.equal(musicResponse.status, 200);
  assert.deepEqual(musicResponse.body, validMusic);

  for (const id of [
    'draft-music',
    'unapproved-music',
    'processing-music',
    'missing-mux-music',
    'invalid-format-music',
    'missing-format-music',
  ]) {
    const response = await get(id);
    assert.equal(response.status, 404, id);
    assert.deepEqual(response.body, { error: 'Video not found' }, id);
  }

  const movieResponse = await get('eligible-movie');
  assert.equal(movieResponse.status, 200);
  assert.deepEqual(movieResponse.body, fixtures.get('eligible-movie'));

  const episodeResponse = await get('eligible-episode');
  assert.equal(episodeResponse.status, 200);
  assert.deepEqual(episodeResponse.body, fixtures.get('eligible-episode'));
});

test('versioned catalog title and playback reject invalid Music formats and accept valid Music', async (context) => {
  const fixture = [
    validMusic,
    { ...validMusic, id: 'invalid-format', musicFormat: 'podcast' },
    { ...validMusic, id: 'missing-format', musicFormat: undefined },
  ];
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => fixture }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog/titles`;

  const acceptedDetail = await fetch(`${base}/${validMusic.id}`);
  assert.equal(acceptedDetail.status, 200);
  const detail = await acceptedDetail.json();
  assert.equal(detail.id, validMusic.id);
  assert.equal(detail.contentType, 'MUSIC');
  assert.equal(detail.musicFormat, 'music_video');
  assert.equal(detail.muxPlaybackId, 'music-playback');

  const acceptedPlayback = await fetch(`${base}/${validMusic.id}/playback`);
  assert.equal(acceptedPlayback.status, 200);
  assert.deepEqual(await acceptedPlayback.json(), {
    id: validMusic.id,
    streamType: 'on-demand',
    muxPlaybackId: 'music-playback',
  });

  for (const id of ['invalid-format', 'missing-format']) {
    for (const suffix of ['', '/playback']) {
      const response = await fetch(`${base}/${id}${suffix}`);
      assert.equal(response.status, 404, `${id}${suffix}`);
      assert.deepEqual(await response.json(), { error: 'Title not found.' });
    }
  }
});

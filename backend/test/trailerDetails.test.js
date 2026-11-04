const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const { createTitleTrailerRouter } = require('../src/integrations/titleTrailerRouter');
const { previewContent } = require('../src/catalog/socialMetadata');
const { titleStructuredData } = require('../src/catalog/structuredData');
const { seriesKey } = require('../src/catalog/readModel');

const film = {
  id: 'film', title: 'Authorized fixture', description: 'Synopsis', contentType: 'MOVIE',
  status: 'ready', approvalStatus: 'approved', muxPlaybackPolicy: 'signed',
  muxPlaybackId: 'private-full', trailerStatus: 'ready', trailerPlaybackId: 'private-trailer',
  rightsHolder: 'PRIVATE HOLDER', rightsVerificationNotes: 'PRIVATE EVIDENCE',
  releaseStatus: 'scheduled', releaseAt: '2099-01-01T00:00:00.000Z',
};

test('approved premiere details are public without full media; release enables playback but retains trailer', async t => {
  const record = { ...film };
  const app = express();
  app.use(createCatalogRouter({
    loadApproved: async () => [record], signPlaybackToken: async id => `token-${id}`,
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let detail = await (await fetch(`${base}/titles/film/details`)).json();
  assert.equal(detail.watchAvailable, false);
  assert.equal(detail.trailerAvailable, true);
  assert.equal(detail.releaseAt, film.releaseAt);
  assert.doesNotMatch(JSON.stringify(detail), /private-full|private-trailer|PRIVATE|playbackToken|muxPlayback/);
  assert.equal((await fetch(`${base}/titles/film/playback`)).status, 404);
  assert.equal((await fetch(`${base}/titles/film`)).status, 404);
  assert.equal((await fetch(`${base}/titles/film/trailer/playback`)).status, 200);
  const before = previewContent([record], 'title', record.id);
  assert.equal(before.watchAvailable, false);
  assert.doesNotMatch(JSON.stringify(titleStructuredData(before, 'https://watchprotv.com/title/film')), /stream.mux|private-full|undefined/);
  record.releaseAt = '2020-01-01T00:00:00.000Z';
  detail = await (await fetch(`${base}/titles/film/details`)).json();
  assert.equal(detail.watchAvailable, true);
  assert.equal((await fetch(`${base}/titles/film/playback`)).status, 200);
  assert.equal((await fetch(`${base}/titles/film/trailer/playback`)).status, 200);
  assert.ok(previewContent([record], 'title', record.id), 'released signed title has HTML details');
  for (const override of [
    { approvalStatus: 'draft' }, { private: true }, { rightsHold: true },
    { releaseStatus: 'unpublished' }, { rightsEndAt: '2000-01-01T00:00:00Z' },
  ]) {
    Object.assign(record, film, override);
    assert.equal((await fetch(`${base}/titles/film/details`)).status, 404);
    assert.equal((await fetch(`${base}/titles/film/trailer/playback`)).status, 404);
    for (const field of Object.keys(override)) delete record[field];
  }
  Object.assign(record, film, { rokuCleared: false });
  assert.equal((await fetch(`${base}/titles/film/details`, { headers: { 'X-PROtv-Platform': 'roku' } })).status, 404);
});

test('show trailers use separate approved records and preserve seasons, episodes, and no-trailer shows', async t => {
  const episode = { ...film, id: 'episode', contentType: 'EPISODE', seriesTitle: 'Fixture show',
    seasonNumber: 2, episodeNumber: 3, releaseStatus: 'published' };
  const show = { ...film, id: 'show', contentType: 'SERIES', seriesTitle: 'Fixture show',
    releaseStatus: 'published', muxPlaybackId: undefined };
  const records = [episode, show];
  const original = JSON.stringify(records);
  const app = express();
  app.use(createCatalogRouter({ loadApproved: async () => records, signPlaybackToken: async () => 'trailer-token' }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let series = (await (await fetch(`${base}/series-details`)).json()).items[0];
  assert.equal(series.key, seriesKey('Fixture show'));
  assert.equal(series.trailerTitleId, 'show');
  assert.deepEqual(series.seasons, [2]);
  assert.equal(series.episodes[0].episodeNumber, 3);
  assert.equal(series.episodes[0].watchAvailable, true);
  assert.equal((await fetch(`${base}/titles/show/playback`)).status, 404);
  assert.equal((await fetch(`${base}/titles/show/trailer/playback`)).status, 200);
  assert.equal(JSON.stringify(records), original);
  show.approvalStatus = 'draft';
  series = (await (await fetch(`${base}/series-details`)).json()).items[0];
  assert.equal(series.trailerAvailable, undefined, 'episode trailer is not silently promoted to show trailer');
  assert.equal(series.episodes.length, 1);
});

test('admin show creation makes a separate draft and requires evidence without editing episodes', async t => {
  let stored;
  const app = express();
  app.use(express.json());
  app.use(createTitleTrailerRouter({
    verifyAdmin: (_req, _res, next) => next(),
    getAllVideos: async () => [],
    addVideo: async record => { stored = record; return 'new-show'; },
    getVideoById: async id => ({ id, ...stored }),
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/series-record`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ seriesTitle: 'Show' })).status, 400);
  assert.equal((await post({ seriesTitle: 'Show', description: 'Synopsis',
    rightsHolder: 'Holder', rightsVerificationNotes: 'Authorized trailer license' })).status, 201);
  assert.equal(stored.contentType, 'SERIES');
  assert.equal(stored.approvalStatus, 'draft');
  assert.equal(stored.muxPlaybackId, undefined);
  assert.equal(stored.rokuCleared, undefined);
});

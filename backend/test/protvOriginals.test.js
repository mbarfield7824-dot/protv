const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { comingSoonCatalog, originalsCatalog, seriesDetails, titleDetails } = require('../src/catalog/details');
const { eligibleForPlatform } = require('../src/catalog/platformEligibility');
const { createCatalogRouter } = require('../src/catalog/router');

// Synthetic fixtures only.
const PROJECT = 'fbe83ec7-0000-4000-8000-0000000000aa';
const FILM_PROJECT = 'fbe83ec7-0000-4000-8000-0000000000bb';
const comingSoonShow = {
  id: `coming_soon_${PROJECT}`, contentType: 'SERIES', title: 'Synthetic Original Show', seriesTitle: '', comingSoonProjectId: PROJECT,
  status: 'ready', approvalStatus: 'approved', trailerStatus: 'ready', trailerPlaybackId: 'signed-trailer', protvOriginal: true,
  category: 'Black Cinema', categories: ['Black Cinema', 'Drama'], posterUrl: 'https://watchprotv.com/api/posters/a.jpg',
};
const heldEpisode = {
  id: 'creator_episode_1', contentType: 'EPISODE', title: 'Pilot', seriesTitle: 'Synthetic Original Show', seasonNumber: 1, episodeNumber: 1,
  creatorProjectId: PROJECT, status: 'held', approvalStatus: 'draft', releaseStatus: 'held', muxPlaybackId: null,
};
const playable = (extra) => ({ status: 'ready', approvalStatus: 'approved', muxPlaybackId: 'public-id', ...extra });
const ordinaryFilm = playable({ id: 'ordinary', contentType: 'MOVIE', title: 'Ordinary Film', category: 'Black Cinema' });
const comingSoonFilm = {
  id: `coming_soon_${FILM_PROJECT}`, contentType: 'MOVIE', title: 'Synthetic Original Film', comingSoonProjectId: FILM_PROJECT,
  status: 'ready', approvalStatus: 'approved', trailerStatus: 'ready', trailerPlaybackId: 'film-trailer', protvOriginal: true,
};

test('the designation is independent of genre: only flagged titles are Originals', () => {
  const items = originalsCatalog([comingSoonShow, heldEpisode, ordinaryFilm]);
  assert.deepEqual(items.map(item => item.title), ['Synthetic Original Show']);
  assert.deepEqual(items[0].categories, ['Black Cinema', 'Drama']);
  assert.equal(titleDetails(ordinaryFilm, [ordinaryFilm]).protvOriginal, false);
});

test('a Coming Soon Original appears in both rows from the same record, trailer-only, with no episodes', () => {
  const records = [comingSoonShow, heldEpisode];
  const [original] = originalsCatalog(records);
  const [upcoming] = comingSoonCatalog(records);
  assert.equal(original.id, upcoming.id);
  assert.equal(original.href, upcoming.href);
  assert.equal(original.comingSoon, true);
  assert.equal(original.protvOriginal, true);
  assert.equal(upcoming.protvOriginal, true);
  assert.equal(original.episodeCount, 0);
  assert.equal(original.trailerAvailable, true);
  assert.doesNotMatch(JSON.stringify([original, upcoming]), /signed-trailer|Pilot|muxPlayback/);
  assert.equal(titleDetails(heldEpisode, records), null);
});

test('after premiere the show stays an Original and lists its released episodes', () => {
  const episode = playable({ id: 'ep1', contentType: 'EPISODE', title: 'Pilot', seriesTitle: 'Synthetic Original Show', seasonNumber: 1, episodeNumber: 1, creatorProjectId: PROJECT });
  const [original] = originalsCatalog([comingSoonShow, episode]);
  assert.equal(original.comingSoon, false);
  assert.equal(original.episodeCount, 1);
  assert.equal(seriesDetails([comingSoonShow, episode])[0].episodes[0].watchAvailable, true);
});

test('a released Original film inherits the designation from its Coming Soon listing, without duplicates', () => {
  const upcoming = originalsCatalog([comingSoonFilm]);
  assert.deepEqual(upcoming.map(item => [item.id, item.comingSoon, item.watchAvailable]), [[comingSoonFilm.id, true, false]]);
  const released = playable({ id: `creator_${FILM_PROJECT}`, contentType: 'MOVIE', title: 'Synthetic Original Film', creatorProjectId: FILM_PROJECT });
  const after = originalsCatalog([comingSoonFilm, released]);
  assert.deepEqual(after.map(item => [item.id, item.comingSoon, item.watchAvailable, item.protvOriginal]), [[released.id, false, true, true]]);
});

test('unpublished Originals stay private and TV catalogs are unchanged by the designation', () => {
  assert.deepEqual(originalsCatalog([{ ...comingSoonShow, approvalStatus: 'draft' }]), []);
  const roku = playable({ id: 'roku-title', contentType: 'MOVIE', title: 'Roku Title', rokuCleared: true });
  for (const platform of ['roku', 'firetv']) {
    const plain = eligibleForPlatform([roku, comingSoonShow, comingSoonFilm], platform).map(item => item.id);
    const flagged = eligibleForPlatform([{ ...roku, protvOriginal: true }, comingSoonShow, comingSoonFilm], platform).map(item => item.id);
    assert.deepEqual(flagged, plain, platform);
  }
});

test('the public Originals endpoint serves designated titles and an empty list otherwise', async (t) => {
  let records = [comingSoonShow, ordinaryFilm];
  const app = express();
  app.use(createCatalogRouter({ loadApproved: async () => records }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/originals`;
  assert.deepEqual((await (await fetch(url)).json()).items.map(item => item.title), ['Synthetic Original Show']);
  assert.equal((await (await fetch(url, { headers: { 'X-PROtv-Platform': 'firetv' } })).json()).items.length, 0);
  records = [ordinaryFilm];
  assert.deepEqual(await (await fetch(url)).json(), { items: [] });
});

test('Admin can set and remove the designation; it persists and changes nothing else', async (context) => {
  const firebase = require('../src/firebase');
  const auth = require('../src/middleware/auth');
  const records = new Map([
    ['show', { ...comingSoonShow, protvOriginal: undefined, seriesTitle: 'Synthetic Original Show', rightsHolder: 'Holder' }],
    ['film', playable({ id: 'film', title: 'Indie', contentType: 'MOVIE', category: 'Independent', categories: ['Independent', 'Black Cinema'], rokuCleared: true })],
    ['ep', playable({ id: 'ep', title: 'Episode', contentType: 'EPISODE', seriesTitle: 'X', seasonNumber: 1, episodeNumber: 1 })],
  ]);
  const writes = [];
  context.mock.method(auth, 'verifyAdmin', (req, res, next) => { req.user = { uid: 'test-admin' }; next(); });
  context.mock.method(firebase, 'getVideoById', async (id) => ({ ...records.get(id) }));
  context.mock.method(firebase, 'updateVideo', async (id, changes) => { writes.push(changes); records.set(id, { ...records.get(id), ...changes }); });
  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const app = express();
  app.use(express.json());
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => { server.close(); delete require.cache[routePath]; });
  await new Promise((resolve) => server.once('listening', resolve));
  const patch = (id, body) => fetch(`http://127.0.0.1:${server.address().port}/videos/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  const before = { ...records.get('show') };
  let response = await patch('show', { title: before.title, contentType: 'SERIES', category: 'Black Cinema', categories: ['Drama'], protvOriginal: true });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.protvOriginal, true);
  assert.equal(saved.protvOriginalUpdatedBy, 'test-admin');
  assert.deepEqual(saved.categories, ['Black Cinema', 'Drama'], 'categories still edit alongside the designation');
  for (const field of ['approvalStatus', 'status', 'comingSoonProjectId', 'trailerPlaybackId', 'rightsHolder', 'seriesTitle']) {
    assert.equal(saved[field], before[field], field);
  }
  assert.equal(originalsCatalog([saved]).length, 1);

  response = await patch('film', { protvOriginal: true });
  assert.equal((await response.json()).rokuCleared, true);
  response = await patch('film', { protvOriginal: false });
  assert.equal((await response.json()).protvOriginal, false);
  assert.equal(originalsCatalog([records.get('film')]).length, 0);

  assert.equal((await patch('ep', { protvOriginal: true })).status, 400);
  assert.equal((await patch('film', { protvOriginal: 'yes' })).status, 400);
  const count = writes.length;
  assert.equal((await patch('show', { protvOriginal: true })).status, 400, 'an unchanged designation is not a change');
  assert.equal(writes.length, count, 'and writes nothing');
});

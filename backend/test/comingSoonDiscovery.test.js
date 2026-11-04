const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { comingSoonCatalog, seriesDetails, titleDetails } = require('../src/catalog/details');
const { catalogCategories } = require('../src/catalog/categories');
const { eligibleForPlatform } = require('../src/catalog/platformEligibility');
const { createCatalogRouter } = require('../src/catalog/router');

// Synthetic fixtures only.
const PROJECT = 'fbe83ec7-0000-4000-8000-000000000001';
const FILM_PROJECT = 'fbe83ec7-0000-4000-8000-000000000002';
// The shape a website catalog edit left on the real Dread Head listing: seriesTitle blank, title edited.
const show = {
  id: `coming_soon_${PROJECT}`, contentType: 'SERIES', title: 'Synthetic Show', seriesTitle: '', description: 'Synopsis',
  category: 'Independent', categories: ['Independent'], comingSoonProjectId: PROJECT, status: 'ready', approvalStatus: 'approved',
  visibility: 'public', trailerStatus: 'ready', trailerPlaybackId: 'signed-trailer', posterUrl: 'https://watchprotv.com/api/posters/a.jpg',
  thumbnailUrl: 'https://watchprotv.com/api/posters/a.jpg', rightsVerificationNotes: 'PRIVATE NOTE', premiereAt: null,
};
const film = {
  id: `coming_soon_${FILM_PROJECT}`, contentType: 'MOVIE', title: 'Synthetic Film', description: 'Film synopsis', category: 'Drama',
  comingSoonProjectId: FILM_PROJECT, status: 'ready', approvalStatus: 'approved', trailerStatus: 'ready', trailerPlaybackId: 'film-trailer',
  posterUrl: 'https://watchprotv.com/api/posters/b.jpg', premiereAt: '2099-02-01T01:00:00.000Z',
};
const heldEpisode = {
  id: 'creator_episode_x', contentType: 'EPISODE', title: 'Pilot', seriesTitle: 'Synthetic Show', seasonNumber: 1, episodeNumber: 1,
  creatorProjectId: PROJECT, status: 'held', approvalStatus: 'draft', releaseStatus: 'held', muxPlaybackId: null,
};
const playable = (extra) => ({ status: 'ready', approvalStatus: 'approved', muxPlaybackId: 'public-id', ...extra });

test('a published show whose seriesTitle was blanked by an edit is still listed, by its title', () => {
  const [series] = seriesDetails([show]);
  assert.equal(series.title, 'Synthetic Show');
  assert.equal(series.comingSoon, true);
  assert.equal(series.trailerAvailable, true);
});

test('Coming Soon lists published shows and films only, soonest premiere first, with no playable or private data', () => {
  const items = comingSoonCatalog([show, film, heldEpisode]);
  assert.deepEqual(items.map(item => [item.kind, item.title, item.premiereAt || null]), [
    ['title', 'Synthetic Film', '2099-02-01T01:00:00.000Z'], ['series', 'Synthetic Show', null],
  ]);
  assert.equal(items[1].href, `/series/${encodeURIComponent(items[1].id.slice('series-'.length))}`);
  assert.equal(items[0].href, `/title/${encodeURIComponent(film.id)}`);
  assert.doesNotMatch(JSON.stringify(items), /PRIVATE|signed-trailer|film-trailer|muxPlayback|Pilot/);
  assert.equal(titleDetails(heldEpisode, [show, heldEpisode]), null);
});

test('unpublished listings stay private', () => {
  assert.deepEqual(comingSoonCatalog([{ ...show, approvalStatus: 'draft' }, { ...film, approvalStatus: 'draft' }]), []);
});

test('a title leaves Coming Soon when it is actually released, without its listing being deleted', () => {
  const episode = playable({ id: 'ep1', contentType: 'EPISODE', title: 'Pilot', seriesTitle: 'Synthetic Show', seasonNumber: 1, episodeNumber: 1 });
  const released = playable({ id: `creator_${FILM_PROJECT}`, contentType: 'MOVIE', title: 'Synthetic Film', creatorProjectId: FILM_PROJECT });
  const records = [show, film, episode, released];
  assert.deepEqual(comingSoonCatalog(records), []);
  const [series] = seriesDetails(records);
  assert.equal(series.comingSoon, false);
  assert.equal(series.trailerAvailable, true, 'the show keeps its trailer after release');
  assert.equal(titleDetails(released, records).watchAvailable, true);
  assert.ok(records.includes(film), 'the Coming Soon record itself is untouched');
});

test('Roku and Fire TV never receive Coming Soon listings', () => {
  for (const platform of ['roku', 'firetv']) assert.deepEqual(comingSoonCatalog(eligibleForPlatform([show, film], platform)), []);
});

test('the public endpoint serves Coming Soon titles and an empty list when there are none', async (t) => {
  let records = [show, film];
  const app = express();
  app.use(createCatalogRouter({ loadApproved: async () => records }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/coming-soon`;
  assert.equal((await (await fetch(url)).json()).items.length, 2);
  assert.equal((await (await fetch(url, { headers: { 'X-PROtv-Platform': 'firetv' } })).json()).items.length, 0);
  records = [];
  assert.deepEqual(await (await fetch(url)).json(), { items: [] });
});

test('categories keep the primary genre first, drop duplicates and never lose others on a primary-only edit', () => {
  assert.deepEqual(catalogCategories({ primary: 'Black Cinema', categories: ['independent', 'Black cinema', ' Drama '] }), ['Black Cinema', 'independent', 'Drama']);
  assert.deepEqual(catalogCategories({ primary: 'Black Cinema', existing: { category: 'Independent', categories: ['Independent', 'Drama'] } }), ['Black Cinema', 'Drama']);
  assert.deepEqual(catalogCategories({ primary: 'Drama', existing: { genre: 'Comedy' } }), ['Drama']);
  assert.deepEqual(catalogCategories({ primary: '', categories: [] }), ['General']);
  assert.throws(() => catalogCategories({ primary: 'A', categories: 'B' }), /list/);
  assert.throws(() => catalogCategories({ primary: 'A', categories: ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] }), /at most 8/);
});

test('admin edits persist multiple categories, keep a show listed and preserve approval and rights', async (context) => {
  const firebase = require('../src/firebase');
  const auth = require('../src/middleware/auth');
  const records = new Map([
    ['film', playable({ id: 'film', title: 'Indie Film', contentType: 'MOVIE', category: 'Independent', genre: 'Independent', categories: ['Independent'], rokuCleared: true, rightsHolder: 'Holder', approvedBy: 'owner' })],
    ['show', { ...show, seriesTitle: 'Synthetic Show' }],
  ]);
  context.mock.method(auth, 'verifyAdmin', (req, res, next) => { req.user = { uid: 'test-admin' }; next(); });
  context.mock.method(firebase, 'getVideoById', async (id) => ({ ...records.get(id) }));
  context.mock.method(firebase, 'updateVideo', async (id, changes) => { records.set(id, { ...records.get(id), ...changes }); });
  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const app = express();
  app.use(express.json());
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => { server.close(); delete require.cache[routePath]; });
  await new Promise((resolve) => server.once('listening', resolve));
  const patch = async (id, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/videos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };

  const saved = await patch('film', { title: 'Indie Film', contentType: 'MOVIE', category: 'Black Cinema', categories: ['Independent', 'Black Cinema'] });
  assert.deepEqual([saved.category, saved.genre, saved.categories], ['Black Cinema', 'Black Cinema', ['Black Cinema', 'Independent']]);
  for (const field of ['approvalStatus', 'approvedBy', 'muxPlaybackId', 'rokuCleared', 'rightsHolder']) {
    assert.equal(saved[field], playable({ rokuCleared: true, rightsHolder: 'Holder', approvedBy: 'owner' })[field], field);
  }
  // An older client that sends only the primary genre keeps the other categories.
  assert.deepEqual((await patch('film', { category: 'Drama' })).categories, ['Drama', 'Independent']);

  // Saving a show from the catalog editor (which always sends contentType) no longer blanks its seriesTitle.
  const savedShow = await patch('show', { title: 'Synthetic Show', contentType: 'SERIES', category: 'Black Cinema', categories: ['Independent'] });
  assert.equal(savedShow.seriesTitle, 'Synthetic Show');
  assert.equal(savedShow.approvalStatus, 'approved');
  assert.equal(seriesDetails([savedShow])[0].categories.join(), 'Black Cinema,Independent');
});

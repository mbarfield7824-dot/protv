const assert = require('node:assert/strict');
const test = require('node:test');
process.env.EXPO_PUBLIC_API_URL = 'https://watchprotv.com/api/';
process.env.EXPO_PUBLIC_DEMO_MODE = 'false';
const api = require('../.test-build/lib/api');
const {
  buildHomeRails, collectionByKey, creatorsFirst, featuredTitles, isCreatorTitle, NO_ORIGINALS,
} = require('../.test-build/data/catalog');

const title = (id, extra = {}) => ({
  id, title: id, description: '', category: '', contentType: 'MOVIE', year: 0, duration: 0,
  maturityRating: '', genres: [], posterUrl: `https://img.test/${id}.jpg`, ...extra,
});
// Shaped like the live device catalog: public-domain films sort first, no hero art, no genres.
const publicDomain = title('3NAU6BldsmCNs9wjM08a', { category: 'Horror', year: 1960 });
const blackCinema = title('6h3blkiA6LTeLv66jj1v', { category: 'Black Cinema', year: 1935 });
const creatorFilm = title('creator_2bf9e385', { category: 'Drama' });
const creatorFilm2 = title('creator_7451a32b', { category: 'Urban Drama' });
const originalFilm = title('orig-film', { category: 'Drama' });
const noArtCreator = title('creator_noart', { posterUrl: undefined });
const originalEpisode = title('ep1', { contentType: 'EPISODE', seriesTitle: 'Dread Head', seasonNumber: 1, episodeNumber: 1 });
const catalog = [publicDomain, blackCinema, creatorFilm, creatorFilm2, noArtCreator];

test('the hero never leads with public-domain titles while creator titles exist', () => {
  const featured = featuredTitles(catalog, NO_ORIGINALS).map((item) => item.id);
  assert.deepEqual(featured, ['creator_2bf9e385', 'creator_7451a32b']);
});

test('released PROtv Originals lead the hero, then creators; Originals series show once, by name', () => {
  const originals = { titleIds: ['orig-film'], seriesTitles: ['dread  head'] };
  const featured = featuredTitles([...catalog, originalFilm, originalEpisode], originals);
  assert.deepEqual(featured.map((item) => item.id), ['orig-film', 'ep1', 'creator_2bf9e385', 'creator_7451a32b']);
  assert.equal(featured[1].title, 'Dread Head');
});

test('the hero falls back to one catalog title only when no Original or creator title exists', () => {
  assert.deepEqual(featuredTitles([publicDomain, blackCinema]).map((item) => item.id), ['3NAU6BldsmCNs9wjM08a']);
  assert.deepEqual(featuredTitles([]), []);
});

test('creator titles are recognized by their published creator_ IDs and lead lists', () => {
  assert.equal(isCreatorTitle(creatorFilm), true);
  assert.equal(isCreatorTitle(publicDomain), false);
  assert.deepEqual(creatorsFirst([publicDomain, creatorFilm]).map((item) => item.id), ['creator_2bf9e385', '3NAU6BldsmCNs9wjM08a']);
});

test('Home rails open real collections; Black Cinema and creators are filled from live fields', () => {
  const rails = buildHomeRails(catalog, [], {});
  const keys = rails.map((rail) => rail.key);
  assert.ok(keys.includes('creators'));
  assert.ok(keys.includes('black-cinema'));
  assert.ok(!keys.includes('category-Black Cinema'), 'Black Cinema is not listed twice');
  assert.ok(!keys.includes('independent'), 'an empty collection is hidden, not shown as a dead link');
  for (const rail of rails) {
    assert.deepEqual(collectionByKey(rail.key, catalog, [], {}).items, rail.items, `${rail.key} opens the same titles`);
  }
  assert.deepEqual(collectionByKey('black-cinema', catalog, [], {}).items.map((item) => item.id), ['6h3blkiA6LTeLv66jj1v']);
});

test('an empty or unknown collection keeps a name and returns no titles', () => {
  assert.deepEqual(collectionByKey('independent', catalog, [], {}), { key: 'independent', title: 'Independent Films', items: [] });
  assert.equal(collectionByKey('nonsense', catalog, [], {}).title, 'Collection');
  assert.deepEqual(collectionByKey('category-Horror', catalog, [], {}).items.map((item) => item.id), ['3NAU6BldsmCNs9wjM08a']);
});

test('Originals exclude Coming Soon and unreleased entries', async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ items: [
    { id: 'series-x', kind: 'series', title: 'Dread Head', comingSoon: true },
    { id: 'film-a', kind: 'title', title: 'A', comingSoon: false, watchAvailable: true },
    { id: 'film-b', kind: 'title', title: 'B', comingSoon: false, watchAvailable: false },
    { id: 'series-y', kind: 'series', title: 'Released Show', comingSoon: false },
  ] }));
  try {
    assert.deepEqual(await api.fetchOriginals(), { titleIds: ['film-a'], seriesTitles: ['Released Show'] });
  } finally {
    global.fetch = original;
  }
});

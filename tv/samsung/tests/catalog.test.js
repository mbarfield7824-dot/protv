const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/js/catalog.js');

function movie(id, extra) {
  return Object.assign({ id, title: `Movie ${id}`, contentType: 'MOVIE', muxPlaybackId: `pb${id}xxxxxxxxxx`, category: 'Drama', genres: [] }, extra);
}
function episode(id, series, season, number, extra) {
  return Object.assign({ id, title: `${series} ${number}`, episodeTitle: `Ep ${number}`, contentType: 'EPISODE', seriesTitle: series,
    seasonNumber: season, episodeNumber: number, muxPlaybackId: `pb${id}xxxxxxxxxx` }, extra);
}

test('a catalog without the Samsung policy marker is refused (fail closed)', () => {
  const result = C.normalizeCatalog({ items: [movie('a')] });
  assert.equal(result.error, 'policy');
  assert.deepEqual(result.items, []);
});

test('a policy-marked catalog is accepted and keeps only playable movies and episodes', () => {
  const result = C.normalizeCatalog({
    platformPolicy: 'samsung-rights-v1',
    items: [movie('a'), episode('e1', 'Show', 1, 1), { id: 'p', title: 'Pod', contentType: 'PODCAST_EPISODE', muxPlaybackId: 'x' }, movie('nomux', { muxPlaybackId: '' })],
  });
  assert.equal(result.error, '');
  assert.deepEqual(result.items.map((i) => i.id), ['a', 'e1']);
});

test('a preview build intersects an unmarked catalog with its allowlist', () => {
  const result = C.normalizeCatalog({ items: [movie('a'), movie('b'), movie('c')] }, { previewAllowlist: ['b'] });
  assert.equal(result.policy, 'preview-allowlist');
  assert.deepEqual(result.items.map((i) => i.id), ['b']);
});

test('duplicate or missing IDs reject the whole payload', () => {
  assert.equal(C.normalizeCatalog({ platformPolicy: C.POLICY, items: [movie('a'), movie('a')] }).error, 'invalid');
  assert.equal(C.normalizeCatalog({ platformPolicy: C.POLICY, items: [{ title: 'x' }] }).error, 'invalid');
  assert.equal(C.normalizeCatalog(null).error, 'invalid');
});

test('artwork is HTTPS only and held replacements show the branded panel', () => {
  assert.equal(C.artworkSource(movie('a', { posterUrl: 'http://insecure/p.jpg' })), '');
  assert.equal(C.artworkSource(movie('a', { posterUrl: 'https://cdn/p.jpg' })), 'https://cdn/p.jpg');
  assert.equal(C.artworkSource(movie('MZ6Q6DI2S62pP8laH9Ku', { posterUrl: 'https://cdn/p.jpg' })), '');
  assert.equal(C.artworkSource(episode('e', 'S', 1, 1, { thumbnailUrl: 'https://cdn/t.jpg', posterUrl: 'https://cdn/p.jpg' })), 'https://cdn/t.jpg');
});

test('synopsis hides the internal rights note but the credit line keeps attribution', () => {
  const item = movie('a', { description: 'A short film. Rights: CC BY 3.0, Blender Foundation.' });
  assert.equal(C.synopsis(item), 'A short film.');
  assert.equal(C.rightsLine(item), 'Rights: CC BY 3.0, Blender Foundation.');
  assert.equal(C.synopsis(movie('b', { description: '' })), 'Synopsis coming soon.');
});

test('search requires every term and orders creator titles first', () => {
  const items = [movie('x', { title: 'Night Train', category: 'Horror' }), movie('creator_1', { title: 'Night Shift', category: 'Horror' }), movie('y', { title: 'Day Off' })];
  const found = C.search(items, '  night  horror ');
  assert.deepEqual(found.movies.map((i) => i.id), ['creator_1', 'x']);
  assert.equal(C.search(items, 'night comedy').total, 0);
  assert.equal(C.search(items, '').total, 0);
});

test('series group by title, seasons come only from real numbers, episodes are ordered', () => {
  const items = [episode('e3', 'Show', 2, 1), episode('e2', 'Show', 1, 2), episode('e1', 'Show', 1, 1), episode('ex', 'Show', null, null)];
  const [series] = C.seriesList(items);
  assert.equal(series.title, 'Show');
  assert.deepEqual(series.episodes.map((e) => e.id), ['e1', 'e2', 'e3', 'ex']);
  assert.deepEqual(series.seasons.map((s) => s.title), ['Season 1', 'Season 2', 'More episodes']);
});

test('categories include populated collections (AI Cinema, Music) and hide empty ones', () => {
  const items = [movie('a', { category: 'AI Cinema' }), movie('b', { category: 'Comedy', genres: ['Music'] }), movie('c', { category: 'Comedy' })];
  const titles = C.categories(items).map((c) => c.title);
  assert.ok(titles.includes('AI Cinema'));
  assert.ok(titles.includes('Music'));
  assert.ok(titles.includes('Comedy'));
  assert.ok(!titles.includes('Black Cinema'));
});

test('home rows: continue watching and my list lead, empty rows are dropped', () => {
  const items = [movie('a'), movie('creator_b')];
  const rows = C.homeRows(items, { continueWatching: [items[0]], favorites: [] });
  assert.deepEqual(rows.map((r) => r.id).slice(0, 2), ['continue', 'creators']);
  assert.ok(!rows.some((r) => r.id === 'my-list'));
  assert.ok(!rows.some((r) => r.id === 'series'));
});

test('runtime and metadata formatting', () => {
  assert.equal(C.formatRuntime(734), '12m');
  assert.equal(C.formatRuntime(4513), '1h 15m');
  assert.equal(C.formatRuntime(0), '');
  assert.equal(C.metadataLine(movie('a', { year: 2012, duration: 734, maturityRating: 'PG' })), '2012  •  12m  •  PG  •  Drama');
});

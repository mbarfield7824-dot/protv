const assert = require('node:assert/strict');
const test = require('node:test');
process.env.EXPO_PUBLIC_API_URL = 'https://watchprotv.com/api/';
process.env.EXPO_PUBLIC_DEMO_MODE = 'false';
process.env.EXPO_PUBLIC_CREATOR_PORTAL_ORIGIN = 'https://creators.watchprotv.com';
const api = require('../.test-build/lib/api');
const { seriesEpisodes, titleMatchesQuery } = require('../.test-build/data/catalog');
const originalFetch = global.fetch;
test.after(() => { global.fetch = originalFetch; });
function reply(payload, status = 200) {
  global.fetch = async () => new Response(JSON.stringify(payload), { status });
}
test('normalizes real artwork and does not invent fixture titles', async () => {
  reply({ items: [{ id: 'real', title: 'Real movie', duration: 1354, posterUrl: 'https://example.com/poster.jpg', thumbnailUrl: 'http://unsafe.test/image' }] });
  const [title] = await api.fetchCatalog();
  assert.equal(title.posterUrl, 'https://example.com/poster.jpg');
  assert.equal(title.thumbnailUrl, undefined);
  assert.equal(title.duration, 23);
  reply({ items: [] });
  assert.deepEqual(await api.fetchCatalog(), []);
  reply({ items: [{ title: 'missing id' }] });
  await assert.rejects(api.fetchCatalog(), /invalid title/);
});
test('live catalog failures remain visible and never return demo content', async () => {
  reply({ error: 'Temporarily unavailable' }, 503);
  await assert.rejects(api.fetchCatalog(), /Temporarily unavailable/);
  global.fetch = async () => new Response('<html>not an API</html>');
  await assert.rejects(api.fetchCatalog(), /invalid response/);
});
test('Mux playback validates identifiers and signed tokens', async () => {
  reply({ id: 'real', streamType: 'on-demand', muxPlaybackId: 'abc123', playbackToken: 'signed.token-value' });
  assert.equal(await api.fetchPlaybackUrl('real'), 'https://stream.mux.com/abc123.m3u8?token=signed.token-value');
  reply({ id: 'other', streamType: 'on-demand', muxPlaybackId: 'abc123' });
  await assert.rejects(api.fetchPlaybackUrl('real'), /invalid/);
  reply({ id: 'real', streamType: 'on-demand', muxPlaybackId: '../bad' });
  await assert.rejects(api.fetchPlaybackUrl('real'), /invalid/);
});
test('Creator SSO accepts only the approved origin, rejecting credentials and lookalikes', async () => {
  for (const url of ['http://creators.watchprotv.com/', 'https://creators.watchprotv.com.evil.test/', 'https://user:pass@creators.watchprotv.com/']) {
    reply({ url });
    await assert.rejects(api.fetchCreatorPortalUrl('test'), /unapproved/);
  }
  reply({ url: 'https://creators.watchprotv.com/#sso=test' });
  assert.equal(await api.fetchCreatorPortalUrl('test'), 'https://creators.watchprotv.com/#sso=test');
});
test('My List and progress use existing authenticated API contracts', async () => {
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify(url.endsWith('/favorites') ? ['real'] : {
      real: { positionSeconds: 30, durationSeconds: 120, progressPercent: 25, updatedAt: 1 },
    }));
  };
  const account = await api.fetchViewerAccount('test-token');
  assert.deepEqual(account.favorites, ['real']);
  assert.equal(account.progress.real.positionSeconds, 30);
  assert.ok(requests.every(({ init }) => init.headers.Authorization === 'Bearer test-token'));
});
test('episodes are ordered by season then episode with legacy series-title support', () => {
  const items = [
    { id: 's2', contentType: 'EPISODE', seriesTitle: 'Series', seasonNumber: 2, episodeNumber: 1 },
    { id: 's1e2', contentType: 'EPISODE', seriesTitle: 'Series', seasonNumber: 1, episodeNumber: 2 },
    { id: 's1e1', contentType: 'EPISODE', seriesTitle: 'Series', seasonNumber: 1, episodeNumber: 1 },
  ];
  assert.deepEqual(seriesEpisodes(items[0], items).map(({ id }) => id), ['s1e1', 's1e2', 's2']);
  assert.equal(titleMatchesQuery({ title: 'Real movie', description: '', genres: ['Drama'] }, 'drama'), true);
});
test('home rails use real fields only and omit empty sections', () => {
  const { buildHomeRails, seriesCards, relatedTitles, continueWatching, watchHistory } = require('../.test-build/data/catalog');
  const base = { description: '', genres: [], year: 2020, duration: 90, maturityRating: '' };
  const items = [
    { ...base, id: 'old', title: 'Old', category: 'Drama', contentType: 'MOVIE', year: 1938 },
    { ...base, id: 'ai', title: 'AI', category: 'AI Cinema', contentType: 'MOVIE' },
    { ...base, id: 'e2', title: 'Two', category: 'Horror', contentType: 'EPISODE', seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 2 },
    { ...base, id: 'e1', title: 'One', category: 'Horror', contentType: 'EPISODE', seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 1 },
  ];
  const keys = buildHomeRails(items, [], {}).map(({ key }) => key);
  assert.deepEqual(keys, ['movies', 'series', 'classic', 'ai', 'category-Horror']);
  assert.deepEqual(seriesCards(items).map(({ id, title }) => [id, title]), [['e1', 'Show']]);
  assert.deepEqual(relatedTitles(items[2], items), []);
  const progress = { old: { progressPercent: 100, updatedAt: 5 }, ai: { progressPercent: 40, updatedAt: 1 } };
  assert.deepEqual(continueWatching(items, progress).map(({ id }) => id), ['ai']);
  assert.deepEqual(watchHistory(items, progress).map(({ id }) => id), ['old', 'ai']);
  const rails = buildHomeRails(items, ['ai'], progress).map(({ key }) => key);
  assert.ok(rails.includes('continue') && rails.includes('my-list'));
});
test('deletion requests use the reviewed contract and validate responses', async () => {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push([url, init.method]);
    return new Response(JSON.stringify({ request: init.method === 'POST' ? { status: 'pending_review', adminMessage: '' } : null }));
  };
  assert.equal(await api.fetchDeletionRequest('t'), null);
  assert.equal((await api.submitDeletionRequest('t')).status, 'pending_review');
  assert.deepEqual(calls, [
    ['https://watchprotv.com/api/users/me/deletion-request', undefined],
    ['https://watchprotv.com/api/users/me/deletion-request', 'POST'],
  ]);
  reply({ request: { status: 7 } });
  await assert.rejects(api.fetchDeletionRequest('t'), /invalid/);
  reply({ error: 'Sign in again' }, 403);
  await assert.rejects(api.submitDeletionRequest('t'), /Sign in again/);
});
test('Firebase errors become safe messages', () => {
  const { authErrorMessage } = require('../.test-build/lib/authErrors');
  assert.match(authErrorMessage({ code: 'auth/invalid-credential' }), /incorrect/);
  assert.equal(authErrorMessage({ code: 'auth/internal-secret' }, 'Failed'), 'Failed');
});
test('chunked secure storage round-trips, clears, and ignores a keychain left by a past install', async () => {
  const { createChunkedStorage } = require('../.test-build/lib/chunkedStorage');
  const memory = () => {
    const map = new Map();
    return { map, getItem: async (k) => map.get(k) ?? null, setItem: async (k, v) => { map.set(k, v); }, removeItem: async (k) => { map.delete(k); } };
  };
  const secure = memory();
  const marker = memory();
  const store = createChunkedStorage(secure, marker);
  const value = 'x'.repeat(4000);
  await store.setItem('firebase:authUser:key:[DEFAULT]', value);
  assert.equal(await store.getItem('firebase:authUser:key:[DEFAULT]'), value);
  assert.ok([...secure.map.keys()].every((k) => /^[A-Za-z0-9._-]+$/.test(k)));
  assert.ok([...secure.map.values()].every((v) => v.length <= 1800));
  await store.setItem('firebase:authUser:key:[DEFAULT]', 'short');
  assert.equal(await store.getItem('firebase:authUser:key:[DEFAULT]'), 'short');
  assert.equal(secure.map.size, 2);
  marker.map.clear();
  assert.equal(await store.getItem('firebase:authUser:key:[DEFAULT]'), null);
  assert.equal(secure.map.size, 0);
});

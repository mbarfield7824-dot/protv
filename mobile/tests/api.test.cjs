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

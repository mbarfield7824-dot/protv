const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const { createCatalogRouter } = require('../src/catalog/router');
const { createSocialArtworkRouter, renderArtwork, renderFallback, downloadArtwork } = require('../src/catalog/socialArtwork');
const { previewContent, contentMetadata, publicArtworkUrl } = require('../src/catalog/socialMetadata');
const { destinationMetadata } = require('../src/shortLinks/metadata');
const { shareHtml } = require('../src/shortLinks/html');
const { seriesKey } = require('../src/catalog/readModel');

const film = {
  id: 'film', title: 'Approved Film', description: 'Approved synopsis.',
  contentType: 'MOVIE', status: 'ready', approvalStatus: 'approved', muxPlaybackId: 'public-playback',
  thumbnailUrl: 'https://images.example.test/approved.png', rightsHolder: 'PRIVATE OWNER',
  creatorContractReference: 'PRIVATE CONTRACT', sourceUrl: 'https://private.example/master?token=SECRET',
};
const show = { id: 'show', title: 'Approved Podcast', description: 'Approved show description.',
  contentType: 'PODCAST_SHOW', approvalStatus: 'approved', artworkUrl: film.thumbnailUrl };
const episode = { ...film, id: 'episode', title: 'Approved Episode', contentType: 'EPISODE',
  seriesTitle: 'Approved Series', seasonNumber: 1, episodeNumber: 1 };
const podcastEpisode = { ...film, id: 'podcast-episode', title: 'Podcast Episode', contentType: 'PODCAST_EPISODE',
  podcastShowId: 'show', episodeNumber: 1, thumbnailUrl: '', posterUrl: '' };
const music = { ...film, id: 'music', title: 'Approved Music Video', contentType: 'MUSIC', musicFormat: 'music_video' };
const template = '<!doctype html><html><head><title>Generic PROtv</title><meta property="og:title" content="Generic"><meta name="twitter:card" content="summary"></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';
const agents = ['WhatsApp/2.26.1', 'facebookexternalhit/1.1', 'Twitterbot/1.0', 'Mozilla/5.0'];

async function serve(context, { records, download, readFeatured } = {}) {
  const app = express();
  const loadApproved = typeof records === 'function' ? records : async () => records || [film, episode, show, podcastEpisode, music];
  app.use('/catalog', createCatalogRouter({ loadApproved, loadHtmlTemplate: async () => template }));
  app.use('/social', createSocialArtworkRouter({ loadApproved, download, readFeatured }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('all direct content routes provide exact initial metadata to every crawler without changing playback', async context => {
  const base = await serve(context);
  for (const [route, title, canonical, type] of [
    ['titles/film/html', film.title, '/title/film', 'video.movie'],
    ['titles/film/player-html', film.title, '/title/film', 'video.movie'],
    ['titles/episode/player-html', episode.title, '/title/episode', 'video.episode'],
    ['titles/podcast-episode/player-html', podcastEpisode.title, '/title/podcast-episode', 'video.episode'],
    ['titles/music/player-html', music.title, '/title/music', 'video.other'],
    [`series/${seriesKey(episode.seriesTitle)}/html`, episode.seriesTitle, `/series/${seriesKey(episode.seriesTitle)}`, 'video.tv_show'],
    ['podcasts/show/html', show.title, '/podcasts/show', 'website'],
  ]) {
    for (const agent of agents) {
      const response = await fetch(`${base}/catalog/${route}`, { headers: { 'User-Agent': agent } });
      assert.equal(response.status, 200, `${route} ${agent}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const html = await response.text();
      assert.ok(html.includes(`<meta property="og:title" content="${title} | PROtv">`));
      assert.ok(html.includes(`<meta property="og:url" content="https://watchprotv.com${canonical}">`));
      assert.ok(html.includes(`<meta property="og:type" content="${type}">`));
      assert.match(html, /twitter:card" content="summary_large_image"/);
      assert.match(html, /og:image:width" content="1200"/);
      assert.match(html, /og:image:height" content="630"/);
      assert.match(html, /og:image" content="https:\/\/watchprotv.com\/api\/social\/artwork\//);
      assert.match(html, /<script src="\/assets\/app.js"><\/script>/);
      assert.doesNotMatch(html, /PRIVATE|SECRET|sourceUrl|creatorContractReference|rightsHolder|Generic/);
      assert.equal((html.match(/property="og:title"/g) || []).length, 1);
      if (route.endsWith('/player-html')) assert.doesNotMatch(html, /protv-initial-title|public-playback/);
    }
  }
  assert.equal((await fetch(`${base}/catalog/titles/film/playback`)).status, 200);
  assert.equal((await (await fetch(`${base}/catalog/titles/film/playback`)).json()).muxPlaybackId, film.muxPlaybackId);
});

test('inactive, held, private and orphaned content fails closed in HTML, images and short links', async context => {
  const overrides = [
    { approvalStatus: 'draft' }, { approvalStatus: 'pending' }, { approvalStatus: 'rejected' },
    { status: 'processing' }, { muxPlaybackId: '' }, { releaseStatus: 'unpublished' }, { releaseStatus: 'held' },
    { visibility: 'private' }, { private: true }, { restricted: true }, { rightsHold: true },
    { rightsStartAt: '2099-01-01T00:00:00Z' }, { rightsEndAt: '2000-01-01T00:00:00Z' },
    { contentType: 'PODCAST_EPISODE', podcastShowId: 'missing', episodeNumber: 1 },
  ];
  for (const override of overrides) {
    const record = { ...film, title: 'PRIVATE TITLE', ...override };
    const base = await serve(context, { records: [record], download: () => { throw new Error('Must not read artwork'); } });
    for (const route of ['/catalog/titles/film/player-html', '/catalog/titles/film/html', '/social/artwork/title/film?v=old']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404, JSON.stringify(override));
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.doesNotMatch(await response.text(), /PRIVATE TITLE|og:title/);
    }
    await assert.rejects(destinationMetadata({ slug: 'Creator', destination: '/player/film', kind: 'creator', active: true },
      async () => [record]), /not currently approved/);
  }
  for (const parent of [{ ...show, approvalStatus: 'draft' }, { ...show, releaseStatus: 'held' }]) {
    assert.equal(previewContent([parent, podcastEpisode], 'title', podcastEpisode.id), null);
    assert.equal(previewContent([parent], 'podcast', show.id), null);
  }
});

test('approved art URLs reject credentials, media, non-HTTPS and protected website paths', async () => {
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,x', 'http://example.test/a.jpg',
    'https://user:pass@example.test/a.jpg', 'https://example.test/a.jpg?token=secret',
    'https://example.test/a.jpg?X-Goog-Signature=secret', 'https://example.test/a.jpg?key=secret',
    'https://watchprotv.com/api/private/poster', 'https://watchprotv.com/api/social/artwork/title/film',
    'https://example.test/master.mp4', 'https://example.test/a.jpg#secret']) {
    assert.equal(publicArtworkUrl(value), null, value);
  }
  assert.equal(publicArtworkUrl('/api/posters/approved.png'), 'https://watchprotv.com/api/posters/approved.png');
  await assert.rejects(downloadArtwork('https://127.0.0.1/art.png'), /public/);
  await assert.rejects(downloadArtwork('https://[::1]/art.png'), /public/);
});

test('preview image is a decoded 1200x630 JPEG retaining portrait artwork without cropping', async () => {
  const poster = await sharp({ create: { width: 400, height: 800, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const bytes = await renderArtwork(poster, 'image/png');
  const info = await sharp(bytes).metadata();
  assert.equal(info.format, 'jpeg'); assert.equal(info.width, 1200); assert.equal(info.height, 630);
  assert.ok(bytes.length < 4 * 1024 * 1024);
  const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  for (const [x, y] of [[600, 32], [600, 598]]) {
    assert.ok(data[(y * 1200 + x) * 3] > 240, 'Top and bottom of approved portrait remain visible');
  }
  await assert.rejects(renderArtwork(poster, 'image/jpeg'), /declared type/);
  await assert.rejects(renderArtwork(Buffer.from('not an image'), 'image/png'));
});

test('font-independent branded fallback is legible, sized correctly and used for broken/missing art', async context => {
  context.mock.method(console, 'warn', () => {});
  const bytes = await renderFallback();
  const info = await sharp(bytes).metadata();
  assert.equal(info.width, 1200); assert.equal(info.height, 630); assert.equal(info.format, 'jpeg');
  const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  let whitePixels = 0;
  for (let i = 0; i < data.length; i += 3) if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) whitePixels += 1;
  assert.ok(whitePixels > 30000, 'Outlined wordmark is rendered, not missing-font glyphs');
  let downloads = 0;
  const base = await serve(context, { download: async () => { downloads += 1; throw new Error('HTTP 404'); } });
  const response = await fetch(`${base}/social/artwork/title/film?url=https://private.test&v=old`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('x-protv-artwork'), 'branded-fallback');
  assert.equal(downloads, 1, 'Query cannot supply arbitrary artwork');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test('new publications, metadata and artwork updates appear automatically; withdrawn images stop resolving', async context => {
  let catalog = [];
  const poster = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#30a060' } }).png().toBuffer();
  const base = await serve(context, { records: async () => catalog, download: async () => ({ bytes: poster, type: 'image/png' }) });
  assert.equal((await fetch(`${base}/catalog/titles/film/player-html`)).status, 404);
  catalog = [film];
  const first = await (await fetch(`${base}/catalog/titles/film/player-html`)).text();
  const firstImage = contentMetadata(previewContent(catalog, 'title', 'film')).image;
  catalog = [{ ...film, title: 'Updated Film', thumbnailUrl: 'https://images.example.test/replacement.png' }];
  const second = await (await fetch(`${base}/catalog/titles/film/player-html`)).text();
  assert.match(second, /Updated Film \| PROtv/);
  assert.notEqual(second, first);
  assert.notEqual(contentMetadata(previewContent(catalog, 'title', 'film')).image, firstImage);
  const image = await fetch(`${base}/social/artwork/title/film`);
  assert.equal(image.status, 200); assert.equal(image.headers.get('x-protv-artwork'), 'approved');
  catalog = [{ ...film, releaseStatus: 'unpublished' }];
  assert.equal((await fetch(`${base}/social/artwork/title/film?${new URL(firstImage).searchParams}`)).status, 404);
});

test('podcast episodes inherit approved show artwork and every short-link kind gets current content metadata', async () => {
  const records = [film, episode, show, podcastEpisode, music];
  assert.deepEqual(previewContent(records, 'title', podcastEpisode.id).parentArtwork, [show.artworkUrl]);
  for (const [kind, destination] of [
    ['film', '/title/film'], ['creator', '/player/film'], ['music', '/title/music'],
    ['podcast', '/title/podcast-episode'], ['podcast', '/podcasts/show'],
    ['series', `/series/${seriesKey(episode.seriesTitle)}`],
  ]) {
    const record = { slug: 'Share', kind, destination, active: true };
    const metadata = await destinationMetadata(record, async () => records);
    const html = shareHtml(record, metadata).html;
    assert.match(html, /og:image:width" content="1200"/);
    assert.ok(html.includes(`${metadata.title} | PROtv`));
    assert.doesNotMatch(html, /PRIVATE|SECRET|public-playback/);
  }
});

test('featured artwork and branded defaults are JPEG social images; original supplied art stays unchanged', async context => {
  const base = await serve(context);
  for (const route of ['featured', 'brand']) {
    const response = await fetch(`${base}/social/artwork/${route}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/jpeg');
    const info = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(info.width, 1200); assert.equal(info.height, 630);
  }
});

test('Vercel rewrites send all shared content routes to HTML before the generic SPA fallback', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8'));
  for (const source of ['/title/:id', '/player/:id', '/series/:id', '/podcasts/:id']) {
    const index = config.rewrites.findIndex(rule => rule.source === source);
    assert.ok(index >= 0 && index < config.rewrites.length - 1, source);
    assert.match(config.rewrites[index].destination, /(?:\/html|\/player-html)$/);
  }
});

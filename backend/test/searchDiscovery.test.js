// Search discovery: one canonical public page per show, readable without JavaScript, listed in the sitemap.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const { catalogSitemap } = require('../src/catalog/sitemap');
const { seriesKey } = require('../src/catalog/readModel');
const { createShortLinkRouters } = require('../src/shortLinks/router');
const { ShortLinkStore } = require('../src/shortLinks/store');
const { seedFlagship } = require('../scripts/seed-short-links');
const featured = require('../../shared/featuredPodcast.json');

const ready = { status: 'ready', approvalStatus: 'approved' };
const mmwf = { id: 'mmwf-show', contentType: 'PODCAST_SHOW', title: 'Me and My White Friend', description: 'Show text.',
  host: 'Reggie Reg and Marv', approvalStatus: 'approved', artworkUrl: 'https://images.example.test/mmwf.png' };
const mmwfEpisode = { ...ready, id: 'mmwf-ep', contentType: 'PODCAST_EPISODE', podcastShowId: 'mmwf-show', episodeNumber: 2,
  title: 'Does Voting Cause Division?', description: 'Politics episode.', muxPlaybackId: 'public-a' };
const otherShow = { id: 'other-show', contentType: 'PODCAST_SHOW', title: 'Other Talk', description: 'First paragraph.\n\nSecond paragraph.',
  host: 'Host Name', approvalStatus: 'approved', artworkUrl: 'https://images.example.test/other.png' };
const otherEpisode = { ...ready, id: 'other-ep', contentType: 'PODCAST_EPISODE', podcastShowId: 'other-show', episodeNumber: 1,
  title: 'Pilot Talk', muxPlaybackId: 'public-b' };
const seriesEpisode = { ...ready, id: 'series-ep', contentType: 'EPISODE', seriesTitle: 'Night Stories', seasonNumber: 1,
  episodeNumber: 3, title: 'Night Stories - The Storm', muxPlaybackId: 'public-c', thumbnailUrl: 'https://images.example.test/ns.png' };
const film = { ...ready, id: 'film', contentType: 'MOVIE', title: 'A Film', description: 'Synopsis.', muxPlaybackId: 'public-d' };
const held = { ...otherEpisode, id: 'held-ep', title: 'Held Talk', releaseStatus: 'held', episodeNumber: 2 };
const records = [mmwf, mmwfEpisode, otherShow, otherEpisode, seriesEpisode, film, held];
const template = '<!doctype html><html><head><title>PROtv</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';

async function listen(context, app) {
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const catalogApp = (loadApproved = async () => records) => express()
  .use('/catalog', createCatalogRouter({ loadApproved, loadHtmlTemplate: async () => template }));
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
const canonicalOf = (html) => html.match(/<link rel="canonical" href="([^"]+)">/)[1];

test('the sitemap lists the featured Podcast at its one public page and every other show at its own', () => {
  const xml = catalogSitemap(records);
  assert.ok(xml.includes(`<loc>https://watchprotv.com${featured.path}</loc>`));
  assert.ok(!xml.includes('/podcasts/mmwf-show'), 'the redirected catalog address is never listed');
  assert.ok(xml.includes('<loc>https://watchprotv.com/podcasts/other-show</loc>'));
  assert.ok(xml.includes('<loc>https://watchprotv.com/title/mmwf-ep</loc>'));
  assert.ok(!xml.includes('held-ep'));
});

test('the featured Podcast catalog address permanently redirects to its public page', async (context) => {
  const base = await listen(context, catalogApp());
  const response = await fetch(`${base}/catalog/podcasts/mmwf-show/html`, { redirect: 'manual' });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), featured.path);
  assert.equal((await fetch(`${base}/catalog/podcasts/missing/html`, { redirect: 'manual' })).status, 404);
});

test('Podcast and series pages carry their real title, synopsis, artwork and episode links before JavaScript', async (context) => {
  const base = await listen(context, catalogApp());
  const podcast = await (await fetch(`${base}/catalog/podcasts/other-show/html`)).text();
  assert.equal(canonicalOf(podcast), 'https://watchprotv.com/podcasts/other-show');
  assert.match(podcast, /<h1>Other Talk<\/h1>/);
  assert.match(podcast, /With Host Name/);
  assert.match(podcast, /<p>First paragraph\.<\/p><p>Second paragraph\.<\/p>/);
  assert.match(podcast, /<img src="https:\/\/images.example.test\/other.png" alt="Other Talk">/);
  assert.match(podcast, /<a href="https:\/\/watchprotv.com\/title\/other-ep">Episode 1: Pilot Talk<\/a>/);
  assert.doesNotMatch(podcast, /Held Talk/);
  assert.match(podcast, /<script src="\/assets\/app.js"><\/script>/, 'the app still starts and replaces the summary');
  const show = jsonLd(podcast);
  assert.equal(show['@type'], 'PodcastSeries');
  assert.equal(show.name, 'Other Talk');
  assert.equal(show.url, 'https://watchprotv.com/podcasts/other-show');
  assert.equal(show.description, 'First paragraph. Second paragraph.');
  assert.deepEqual(show.episode, [{ '@type': 'PodcastEpisode', name: 'Pilot Talk', url: 'https://watchprotv.com/title/other-ep', episodeNumber: 1 }]);

  const key = seriesKey('Night Stories');
  const series = await (await fetch(`${base}/catalog/series/${key}/html`)).text();
  assert.equal(canonicalOf(series), `https://watchprotv.com/series/${key}`);
  assert.match(series, /<h1>Night Stories<\/h1>/);
  assert.match(series, /<a href="https:\/\/watchprotv.com\/title\/series-ep">Season 1, Episode 3: Night Stories - The Storm<\/a>/);
  const seriesData = jsonLd(series);
  assert.equal(seriesData['@type'], 'TVSeries');
  assert.equal(seriesData.episode[0].url, 'https://watchprotv.com/title/series-ep');
  assert.deepEqual(seriesData.episode[0].partOfSeason, { '@type': 'TVSeason', seasonNumber: 1 });
});

test('episode pages link to their show by catalog relationship and declare it in structured data', async (context) => {
  const base = await listen(context, catalogApp());
  const podcastEpisode = await (await fetch(`${base}/catalog/titles/mmwf-ep/html`)).text();
  assert.match(podcastEpisode, /Part of <a href="https:\/\/watchprotv.com\/podcast\/me-and-my-white-friend">Me and My White Friend<\/a>/);
  const episodeData = jsonLd(podcastEpisode)['@graph'][0];
  assert.equal(episodeData['@type'], 'PodcastEpisode');
  assert.deepEqual(episodeData.partOfSeries, { '@type': 'PodcastSeries', name: 'Me and My White Friend',
    url: 'https://watchprotv.com/podcast/me-and-my-white-friend' });
  const tvEpisode = await (await fetch(`${base}/catalog/titles/series-ep/html`)).text();
  const key = seriesKey('Night Stories');
  assert.match(tvEpisode, new RegExp(`Part of <a href="https://watchprotv.com/series/${key}">Night Stories</a>`));
  assert.equal(jsonLd(tvEpisode)['@graph'][0].partOfSeries.url, `https://watchprotv.com/series/${key}`);
  const movie = await (await fetch(`${base}/catalog/titles/film/html`)).text();
  assert.doesNotMatch(movie, /Part of/);
  const player = await (await fetch(`${base}/catalog/titles/series-ep/player-html`)).text();
  assert.equal(canonicalOf(player), 'https://watchprotv.com/title/series-ep');
  assert.doesNotMatch(player, /Part of|application\/ld\+json/);
});

async function shortLinkApp(context, loadApproved, slugRegistry) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protv-seo-links-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ShortLinkStore({ db: null, filePath: path.join(directory, 'links.json'), production: false });
  await seedFlagship(store);
  await store.save({ slug: 'Watch', destination: '/player/film', kind: 'film', active: true }, 'admin');
  const { publicRouter } = createShortLinkRouters({
    store, loadApproved, loadTemplate: async () => template, authorize: (_q, _s, next) => next(), ...(slugRegistry ? { slugRegistry } : {}),
  });
  return listen(context, express().use('/links', publicRouter));
}

test('short links point search engines at their destination page while keeping their own share address', async (context) => {
  const base = await shortLinkApp(context, async () => records);
  const mmwfLink = await (await fetch(`${base}/links/resolve/MMWF`)).text();
  assert.equal(canonicalOf(mmwfLink), `https://watchprotv.com${featured.path}`);
  assert.match(mmwfLink, /og:url" content="https:\/\/watchprotv.com\/MMWF"/);
  const playerLink = await (await fetch(`${base}/links/resolve/Watch`)).text();
  assert.equal(canonicalOf(playerLink), 'https://watchprotv.com/title/film', '/player is not indexed, so the title page is canonical');
  assert.match(playerLink, /location.replace\("\/player\/film"\)/);
});

test('with readable addresses, short links and the featured Podcast page point at them', async (context) => {
  const { createSlugRegistry, memorySlugStore } = require('../src/catalog/slugs');
  const base = await shortLinkApp(context, async () => records, createSlugRegistry({ store: memorySlugStore() }));
  const playerLink = await (await fetch(`${base}/links/resolve/Watch`)).text();
  assert.match(canonicalOf(playerLink), /^https:\/\/watchprotv.com\/title\/[a-z0-9-]+$/);
  assert.notEqual(canonicalOf(playerLink), 'https://watchprotv.com/title/film');
  assert.match(playerLink, /location.replace\("\/player\/film"\)/, 'playback keeps the internal ID');
  const featuredPage = await (await fetch(`${base}/links/featured-page`)).text();
  assert.equal(canonicalOf(featuredPage), `https://watchprotv.com${featured.path}`);
  assert.doesNotMatch(featuredPage, /title\/mmwf-ep"/);
  assert.match(featuredPage, /<a href="https:\/\/watchprotv.com\/title\/[a-z0-9-]+">Episode 2: Does Voting Cause Division\?<\/a>/);
});

test('the featured Podcast page is its own canonical, with its real summary, episodes and structured data', async (context) => {
  const base = await shortLinkApp(context, async () => records);
  const html = await (await fetch(`${base}/links/featured-page`)).text();
  assert.equal(canonicalOf(html), `https://watchprotv.com${featured.path}`);
  assert.match(html, /<h1>Me and My White Friend<\/h1>/);
  assert.match(html, /A podcast with Reggie Reg and Marv/);
  for (const paragraph of featured.description) assert.ok(html.includes(paragraph.replace(/'/g, '&#39;')));
  assert.match(html, /<a href="https:\/\/watchprotv.com\/title\/mmwf-ep">Episode 2: Does Voting Cause Division\?<\/a>/);
  assert.doesNotMatch(html, /Pilot Talk/, 'only the featured show’s own episodes');
  const data = jsonLd(html);
  assert.equal(data['@type'], 'PodcastSeries');
  assert.equal(data.url, `https://watchprotv.com${featured.path}`);
  assert.equal(data.episode.length, 1);

  // Before publication, or with the catalog down, the page still serves its summary without episodes.
  const offline = await shortLinkApp(context, async () => { throw new Error('catalog offline'); });
  const fallback = await fetch(`${offline}/links/featured-page`);
  assert.equal(fallback.status, 200);
  const fallbackHtml = await fallback.text();
  assert.match(fallbackHtml, /<h1>Me and My White Friend<\/h1>/);
  assert.doesNotMatch(fallbackHtml, /seo-episodes/);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const {
  slugify, publicSlugEntries, createSlugRegistry, memorySlugStore, publicPathsFor, setDefaultSlugRegistry, NO_SLUGS,
} = require('../src/catalog/slugs');
const { createCatalogRouter } = require('../src/catalog/router');
const { catalogSitemap } = require('../src/catalog/sitemap');
const { seriesKey } = require('../src/catalog/readModel');

const template = '<html><head><title>PROtv</title><link rel="canonical" href="https://watchprotv.com/"></head><body><div id="root"></div></body></html>';
const ready = { approvalStatus: 'approved', status: 'ready' };
const movie = (id, title, extra = {}) => ({ id, title, contentType: 'MOVIE', muxPlaybackId: `${id}-play`, description: `${title} story.`, ...ready, ...extra });
const episode = (id, title, season, number, extra = {}) => ({
  id, title, contentType: 'EPISODE', seriesTitle: 'Night Shift', seasonNumber: season, episodeNumber: number,
  muxPlaybackId: `${id}-play`, ...ready, ...extra,
});

const catalog = () => [
  movie('creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8', 'It’s a Double Date a Classic', { year: 2026 }),
  movie('dupe-a', 'Dead Air', { year: 2019 }),
  movie('dupe-b', 'Dead Air', { year: 2024 }),
  movie('yoruba', 'ARÍỌRÍ (REINCARNATION)'),
  movie('draft', 'Secret Draft Film', { approvalStatus: 'draft' }),
  movie('private', 'Private Film', { private: true }),
  movie('restricted', 'Restricted Film', { restricted: true }),
  movie('processing', 'Unfinished Film', { status: 'processing' }),
  movie('future-rights', 'Future Rights Film', { rightsStartAt: '2999-01-01T00:00:00Z' }),
  movie('withdrawn', 'Withdrawn Film', { releaseStatus: 'withdrawn' }),
  episode('ep1', 'Night Shift', 1, 1),
  episode('ep2', 'Night Shift - The Long Night', 1, 2),
  { id: 'show', title: 'Night Shift', seriesTitle: 'Night Shift', contentType: 'SERIES', description: 'Hospital drama.', thumbnailUrl: 'https://images.example/show.jpg', ...ready },
  { id: 'pod-show', title: 'Talk Back', contentType: 'PODCAST_SHOW', approvalStatus: 'approved' },
  { id: 'pod-ep', title: 'Opening Night', contentType: 'PODCAST_EPISODE', podcastShowId: 'pod-show', episodeNumber: 1, muxPlaybackId: 'pod-play', ...ready },
];

function registry(store = memorySlugStore(), options = {}) {
  return { store, registry: createSlugRegistry({ store, logger: { error() {} }, ...options }) };
}

async function serve(context, records, slugRegistry) {
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({
    loadApproved: typeof records === 'function' ? records : async () => records,
    loadHtmlTemplate: async () => template,
    slugRegistry,
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // The public routes exactly as vercel.json rewrites them.
  const internal = (path) => {
    const [pathname, query = ''] = path.split('?');
    const [, route, segment] = pathname.split('/');
    const target = { title: 'titles/%/html', player: 'titles/%/player-html', series: 'series/%/html', podcasts: 'podcasts/%/html' }[route];
    return `${origin}/v1/catalog/${target.replace('%', segment)}${query ? `?${query}` : ''}`;
  };
  const get = (path, headers = {}) => fetch(internal(path), { redirect: 'manual', headers });
  // Follows public redirects the way a browser would; returns the final response and every hop.
  const visit = async (path) => {
    const hops = [path];
    for (let index = 0; index < 5; index++) {
      const response = await get(hops.at(-1));
      if (response.status !== 301) return { response, hops };
      hops.push(response.headers.get('location'));
    }
    throw new Error(`Redirect loop: ${hops.join(' -> ')}`);
  };
  return { origin, get, visit, json: async (path, headers = {}) => (await fetch(`${origin}/v1/catalog${path}`, { headers })).json() };
}

const tag = (html, pattern) => html.match(pattern)?.[1];
const jsonLd = (html) => JSON.parse(tag(html, /<script type="application\/ld\+json">([^]*?)<\/script>/));

test('slugs are clean, readable and accent-free', () => {
  assert.equal(slugify('It’s a Double Date a Classic'), 'its-a-double-date-a-classic');
  assert.equal(slugify('ARÍỌRÍ (REINCARNATION)'), 'ariori-reincarnation');
  assert.equal(slugify('Tom & Jerry: The Movie!!'), 'tom-and-jerry-the-movie');
  assert.equal(slugify('  --- '), '');
  assert.equal(slugify('光'), '');
  const long = slugify('word '.repeat(40));
  assert.ok(long.length <= 80 && !long.endsWith('-'), long);
});

test('only public titles and shows receive addresses; drafts, private, restricted and unreleased ones never do', () => {
  const entries = publicSlugEntries(catalog());
  const targets = entries.map((entry) => entry.target);
  for (const hidden of ['draft', 'private', 'restricted', 'processing', 'future-rights', 'withdrawn', 'pod-show', 'show']) {
    assert.equal(targets.includes(hidden), false, hidden);
  }
  assert.deepEqual(entries.find((entry) => entry.kind === 'series'), { kind: 'series', target: seriesKey('Night Shift'), name: 'Night Shift', members: ['ep1', 'ep2', 'show'] });
  assert.equal(entries.find((entry) => entry.target === 'ep2').name, 'night-shift-the-long-night');
  assert.equal(entries.find((entry) => entry.target === 'pod-ep').name, 'talk-back-opening-night');
  const named = (seriesTitle, title) => publicSlugEntries([episode('x', title, 1, 3, { seriesTitle })])[0].name;
  assert.equal(named('Superman (Fleischer Studios)', 'Fleischer Studios’ Superman'), 'fleischer-studios-superman');
  assert.equal(named('One Step Beyond', 'One Step Beyond - The Storm'), 'one-step-beyond-the-storm');
  assert.equal(named('Night Shift', 'Pilot'), 'night-shift-pilot');
});

test('duplicates get stable, readable suffixes and nothing changes when a title is renamed', async () => {
  const { store, registry: slugs } = registry();
  const paths = await publicPathsFor(catalog(), slugs);
  assert.equal(paths.slug('title', 'creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8'), 'its-a-double-date-a-classic');
  assert.equal(paths.slug('title', 'dupe-a'), 'dead-air');
  assert.equal(paths.slug('title', 'dupe-b'), 'dead-air-2024');
  assert.equal(paths.slug('title', 'ep1'), 'night-shift-s1-e1');
  assert.equal(paths.slug('title', 'ep2'), 'night-shift-the-long-night');
  assert.equal(paths.slug('title', 'pod-ep'), 'talk-back-opening-night');
  assert.equal(paths.slug('series', seriesKey('Night Shift')), 'night-shift');
  const assigned = store.documents.size;

  // Renamed, re-read by a fresh server instance, and with a new title taking the old name: every address holds.
  const renamed = catalog().map((record) => (record.id === 'dupe-a' ? { ...record, title: 'Dead Air: Director’s Cut' } : record));
  renamed.push(movie('dupe-c', 'Dead Air'));
  const fresh = createSlugRegistry({ store });
  const again = await publicPathsFor(renamed, fresh);
  assert.equal(again.slug('title', 'dupe-a'), 'dead-air');
  assert.equal(again.slug('title', 'dupe-b'), 'dead-air-2024');
  assert.match(again.slug('title', 'dupe-c'), /^dead-air-[0-9a-z]{6}$/);
  assert.equal(store.documents.size, assigned + 1);
});

test('two servers assigning at the same moment settle on one address per title', async () => {
  const store = memorySlugStore();
  const [left, right] = await Promise.all([
    publicPathsFor(catalog(), createSlugRegistry({ store })),
    publicPathsFor(catalog(), createSlugRegistry({ store })),
  ]);
  for (const id of ['dupe-a', 'dupe-b', 'ep1', 'yoruba']) assert.equal(left.slug('title', id), right.slug('title', id), id);
  const perTarget = new Map();
  for (const document of store.documents.values()) perTarget.set(document.target, (perTarget.get(document.target) || 0) + 1);
  assert.ok([...perTarget.values()].every((count) => count === 1));
});

test('a slug can never shadow an internal ID', async () => {
  const records = [movie('dead-air', 'Some Film'), movie('other', 'Dead Air')];
  const paths = await publicPathsFor(records, registry().registry);
  assert.equal(paths.slug('title', 'other'), 'dead-air-' + paths.slug('title', 'other').split('-').pop());
  assert.notEqual(paths.slug('title', 'other'), 'dead-air');
});

test('old ID links, bookmarks and mixed-case links move permanently to one readable page with matching metadata', async (context) => {
  const { visit, get } = await serve(context, catalog(), registry().registry);
  const id = 'creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8';
  const moved = await get(`/title/${id}?utm_source=share&path=evil`);
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('location'), '/title/its-a-double-date-a-classic?utm_source=share');
  for (const start of [`/title/${id}`, '/title/Its-A-Double-Date-A-Classic', '/title/its-a-double-date-a-classic']) {
    const { response, hops } = await visit(start);
    assert.equal(response.status, 200, start);
    assert.ok(hops.length <= 2, hops.join(' -> '));
    assert.equal(hops.at(-1), '/title/its-a-double-date-a-classic');
    const html = await response.text();
    const canonical = 'https://watchprotv.com/title/its-a-double-date-a-classic';
    assert.equal(tag(html, /<link rel="canonical" href="([^"]+)"/), canonical);
    assert.equal(tag(html, /<meta property="og:url" content="([^"]+)"/), canonical);
    assert.equal(jsonLd(html)['@graph'][1].url, canonical);
    const initial = JSON.parse(tag(html, /id="protv-initial-title" type="application\/json">([^]*?)<\/script>/));
    assert.equal(initial.id, id);
    assert.equal(initial.slug, 'its-a-double-date-a-classic');
    // The share image keeps its internal-ID address.
    assert.match(html, new RegExp(`og:image" content="https://watchprotv.com/api/social/artwork/title/${id}\\?v=`));
  }
});

test('hidden content stays hidden: unknown, private and later-withdrawn addresses return 404 noindex', async (context) => {
  const { store, registry: slugs } = registry();
  const records = catalog();
  const site = await serve(context, async () => records, slugs);
  assert.equal((await site.visit('/title/dead-air')).response.status, 200);
  for (const path of ['/title/secret-draft-film', '/title/private-film', '/title/restricted-film', '/title/draft', '/title/nope']) {
    const response = await site.get(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.equal(await response.text(), 'Title not found.');
  }
  // The film is taken down after its address was published: the address is kept but no longer serves anything.
  records.find((record) => record.id === 'dupe-a').private = true;
  for (const path of ['/title/dead-air', '/title/dupe-a']) assert.equal((await site.get(path)).status, 404, path);
  assert.ok([...store.documents.values()].some((document) => document.slug === 'dead-air'));
});

test('series move from their encoded key to a readable page whose episodes link to readable pages', async (context) => {
  const { visit, get } = await serve(context, catalog(), registry().registry);
  const key = seriesKey('Night Shift');
  const moved = await get(`/series/${key}`);
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('location'), '/series/night-shift');
  const { response } = await visit(`/series/${key}`);
  const html = await response.text();
  assert.equal(tag(html, /<link rel="canonical" href="([^"]+)"/), 'https://watchprotv.com/series/night-shift');
  assert.ok(html.includes('href="https://watchprotv.com/title/night-shift-s1-e1"'));
  assert.ok(html.includes('href="https://watchprotv.com/title/night-shift-the-long-night"'));
  const data = jsonLd(html);
  assert.equal(data.url, 'https://watchprotv.com/series/night-shift');
  assert.deepEqual(data.episode.map((item) => item.url), [
    'https://watchprotv.com/title/night-shift-s1-e1', 'https://watchprotv.com/title/night-shift-the-long-night']);

  const episodePage = await (await visit('/title/ep2')).response.text();
  assert.ok(episodePage.includes('Part of <a href="https://watchprotv.com/series/night-shift">Night Shift</a>'));
  assert.equal(jsonLd(episodePage)['@graph'][0].partOfSeries.url, 'https://watchprotv.com/series/night-shift');
});

test('podcast show pages keep their addresses; podcast episodes get readable ones', async (context) => {
  const { visit, get } = await serve(context, catalog(), registry().registry);
  const show = await get('/podcasts/pod-show');
  assert.equal(show.status, 200);
  const html = await show.text();
  assert.equal(tag(html, /<link rel="canonical" href="([^"]+)"/), 'https://watchprotv.com/podcasts/pod-show');
  assert.ok(html.includes('href="https://watchprotv.com/title/talk-back-opening-night"'));
  const episodePage = await visit('/title/pod-ep');
  assert.deepEqual(episodePage.hops, ['/title/pod-ep', '/title/talk-back-opening-night']);
  assert.equal(episodePage.response.status, 200);
});

test('the player keeps internal IDs for playback and points search engines at the readable page', async (context) => {
  const { get } = await serve(context, catalog(), registry().registry);
  const player = await get('/player/dupe-b');
  assert.equal(player.status, 200);
  assert.equal(tag(await player.text(), /<link rel="canonical" href="([^"]+)"/), 'https://watchprotv.com/title/dead-air-2024');
  const moved = await get('/player/dead-air-2024');
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('location'), '/player/dupe-b');
});

test('website JSON carries addresses; TV and mobile feeds are unchanged and read by internal ID only', async (context) => {
  const records = catalog();
  const site = await serve(context, records, registry().registry);
  const legacy = await serve(context, records, NO_SLUGS);
  const devices = [
    { 'X-PROtv-Platform': 'roku' }, { 'X-PROtv-Platform': 'firetv' }, { 'User-Agent': 'Roku/DVP-14.0 (14.0.4)' }, {},
  ];
  for (const headers of devices) {
    assert.deepEqual(await site.json('/?view=all', headers), await legacy.json('/?view=all', headers));
  }
  for (const headers of devices.slice(0, 3)) assert.deepEqual(await site.json('/', headers), await legacy.json('/', headers));
  assert.equal(JSON.stringify(await site.json('/?view=all')).includes('"slug"'), false);
  assert.equal((await site.json('/titles/dupe-b')).id, 'dupe-b');
  assert.equal((await site.json('/titles/dupe-b/playback')).muxPlaybackId, 'dupe-b-play');
  assert.equal((await fetch(`${site.origin}/v1/catalog/titles/dead-air-2024/playback`)).status, 404);

  const web = (await site.json('/')).items;
  assert.equal(web.find((item) => item.id === 'dupe-b').slug, 'dead-air-2024');
  const detail = await site.json('/titles/dead-air-2024/details');
  assert.deepEqual([detail.id, detail.slug], ['dupe-b', 'dead-air-2024']);
  assert.equal((await site.json('/titles/dupe-b/details')).slug, 'dead-air-2024');
  assert.equal((await fetch(`${site.origin}/v1/catalog/titles/secret-draft-film/details`)).status, 404);
  const series = (await site.json('/series-details')).items[0];
  assert.equal(series.slug, 'night-shift');
  assert.deepEqual(series.episodes.map((item) => item.slug), ['night-shift-s1-e1', 'night-shift-the-long-night']);
  const podcast = await site.json('/podcasts/pod-show');
  assert.equal(podcast.episodes[0].slug, 'talk-back-opening-night');
  assert.equal(JSON.stringify(web).includes('publicSlug'), false);
});

test('Coming Soon and Originals cards link to readable pages', async (context) => {
  const records = [...catalog(), movie('soon', 'Coming Attraction', { comingSoonProjectId: 'p1', protvOriginal: true }),
    episode('later', 'Night Shift', 2, 1, { releaseStatus: 'scheduled', releaseAt: '2999-01-01T00:00:00Z' })];
  const site = await serve(context, records, registry().registry);
  const items = (await site.json('/coming-soon')).items;
  assert.equal(items.find((item) => item.id === 'soon').href, '/title/coming-attraction');
  assert.ok(items.concat((await site.json('/originals')).items).every((item) => !/series\/[A-Za-z0-9_-]{12,}=*$/.test(item.href)));
});

test('the sitemap lists each page once, at its readable address, and never hidden content', async () => {
  const records = catalog();
  const paths = await publicPathsFor(records, registry().registry);
  const xml = catalogSitemap(records, paths);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(urls).size, urls.length);
  for (const expected of ['/title/its-a-double-date-a-classic', '/title/dead-air', '/title/dead-air-2024',
    '/title/night-shift-s1-e1', '/series/night-shift', '/podcasts/pod-show', '/title/talk-back-opening-night']) {
    assert.ok(urls.includes(`https://watchprotv.com${expected}`), expected);
  }
  for (const hidden of ['creator_2bf9', 'dupe-a', 'secret', 'private', 'restricted', 'draft', seriesKey('Night Shift')]) {
    assert.equal(xml.includes(hidden), false, hidden);
  }
});

test('if the address store is down, pages still load at their ID address with no redirect', async (context) => {
  const failing = createSlugRegistry({ store: { async list() { throw new Error('Firestore unavailable'); } }, logger: { error() {} } });
  const { get } = await serve(context, catalog(), failing);
  const response = await get('/title/dupe-b');
  assert.equal(response.status, 200);
  assert.equal(tag(await response.text(), /<link rel="canonical" href="([^"]+)"/), 'https://watchprotv.com/title/dupe-b');
  assert.equal((await get('/title/dead-air-2024')).status, 404);
});

test('addresses are cached briefly and re-read when another server claimed one', async () => {
  const store = memorySlugStore();
  let reads = 0;
  const counting = { list: async () => { reads++; return store.list(); }, create: (document) => store.create(document) };
  let clock = 0;
  const slugs = createSlugRegistry({ store: counting, now: () => clock });
  await publicPathsFor(catalog(), slugs);
  await publicPathsFor(catalog(), slugs);
  assert.equal(reads, 1);
  clock = 61_000;
  await publicPathsFor(catalog(), slugs);
  assert.equal(reads, 2);
});

test('the website video list carries addresses without exposing internal fields', async (context) => {
  const firebase = require('../src/firebase');
  context.mock.method(firebase, 'getApprovedVideos', async () => catalog());
  delete require.cache[require.resolve('../src/routes/videos')];
  const videosRouter = require('../src/routes/videos');
  setDefaultSlugRegistry(registry().registry);
  context.after(() => setDefaultSlugRegistry(null));
  const app = express();
  app.use('/videos', videosRouter);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const items = await (await fetch(`http://127.0.0.1:${server.address().port}/videos`)).json();
  assert.equal(items.find((item) => item.id === 'dupe-b').slug, 'dead-air-2024');
  assert.equal(items.find((item) => item.id === 'pod-ep').slug, 'talk-back-opening-night');
  assert.equal(JSON.stringify(items).match(/publicSlug|publicSeriesSlug/), null);
});

test('a renamed show keeps its address through the records it still shares', async () => {
  const { store, registry: slugs } = registry();
  const before = await publicPathsFor(catalog(), slugs);
  assert.equal(before.slug('series', seriesKey('Night Shift')), 'night-shift');
  const renamed = catalog().map((record) => (['EPISODE', 'SERIES'].includes(record.contentType)
    ? { ...record, seriesTitle: 'Night Shift: Code Blue', ...(record.contentType === 'SERIES' ? { title: 'Night Shift: Code Blue' } : {}) } : record));
  const after = await publicPathsFor(renamed, createSlugRegistry({ store }));
  const newKey = seriesKey('Night Shift: Code Blue');
  assert.equal(after.slug('series', newKey), 'night-shift');
  assert.equal(after.target('series', 'night-shift', () => false), newKey);
  assert.equal([...store.documents.values()].filter((document) => document.kind === 'series').length, 1, 'no second address');
  const decorated = after.decorate(renamed);
  assert.equal(decorated.find((record) => record.id === 'ep1').publicSeriesSlug, 'night-shift');
});

test('an Administrator correction becomes the address and earlier addresses redirect to it; it never reuses another page’s address', async (context) => {
  const { planCorrection } = require('../scripts/public-slugs');
  const { store, registry: slugs } = registry();
  const records = catalog();
  await publicPathsFor(records, slugs);
  const documents = [...store.documents.values()];
  assert.throws(() => planCorrection({ documents, videos: records, kind: 'title', target: 'dupe-b', slug: 'dead-air', reason: 'Typo in the title' }), /other content/);
  assert.throws(() => planCorrection({ documents, videos: records, kind: 'title', target: 'draft', slug: 'secret', reason: 'Typo in the title' }), /not currently public/);
  assert.throws(() => planCorrection({ documents, videos: records, kind: 'title', target: 'dupe-b', slug: 'Bad Slug', reason: 'Typo in the title' }), /lowercase/);
  assert.throws(() => planCorrection({ documents, videos: records, kind: 'title', target: 'dupe-b', slug: 'dead-air-2024', reason: 'Typo in the title' }), /already the page/);
  const correction = planCorrection({ documents, videos: records, kind: 'title', target: 'dupe-b', slug: 'dead-air-remastered', reason: 'Title corrected from catalog source', by: 'admin' });
  assert.equal(correction.primary, true);
  assert.equal(correction.correctedFrom, 'dead-air-2024');
  await store.create(correction);
  const site = await serve(context, records, createSlugRegistry({ store }));
  assert.equal((await site.get('/title/dead-air-remastered')).status, 200);
  for (const old of ['/title/dead-air-2024', '/title/dupe-b']) {
    const moved = await site.get(old);
    assert.equal(moved.status, 301, old);
    assert.equal(moved.headers.get('location'), '/title/dead-air-remastered');
  }
});

test('a title held for a verified correction gets no address until it is corrected, then gets the corrected one', async () => {
  const held = { ...episode('v_1789872561270_i3svw5cbz', 'Merri Melodies shorts', 1, 1), seriesTitle: 'Merrie Melodies' };
  const { registry: slugs } = registry();
  const before = await publicPathsFor([...catalog(), held], slugs);
  assert.equal(before.slug('title', held.id), null);
  assert.equal(before.segment('title', held.id), held.id);
  const after = await publicPathsFor([...catalog(), { ...held, title: 'Merrie Melodies shorts' }], slugs);
  assert.equal(after.slug('title', held.id), 'merrie-melodies-shorts');
});

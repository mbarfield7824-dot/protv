const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { ShortLinkStore } = require('../src/shortLinks/store');
const { slugKey, linkInput, RESERVED } = require('../src/shortLinks/validation');
const { destinationMetadata } = require('../src/shortLinks/metadata');
const { createShortLinkRouters, FLAGSHIP } = require('../src/shortLinks/router');
const { seedFlagship } = require('../scripts/seed-short-links');
const { titleHtml } = require('../src/catalog/titleHtml');
const { publicPodcastShow } = require('../src/catalog/podcasts');

async function localStore(context) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protv-short-links-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new ShortLinkStore({ db: null, filePath: path.join(directory, 'links.json'), production: false });
}
const film = { id: 'public-film', title: 'Actual public title <script>', description: 'Actual description "quoted"',
  contentType: 'MOVIE', status: 'ready', approvalStatus: 'approved', muxPlaybackId: 'actual-playback',
  posterUrl: 'https://images.example.test/approved.png', rightsHolder: 'Private evidence never public' };

test('slug and destination validation protect every active route and reject open redirects', async () => {
  assert.equal(slugKey('MMWF'), 'mmwf');
  for (const slug of ['admin', 'ADMIN', 'api', 'privacy', '../x', 'a/b', 'a.b', 'hello?', '-x', 'x'.repeat(65), '__proto__']) {
    assert.throws(() => slugKey(slug));
  }
  const app = await fs.readFile(path.resolve(__dirname, '../../frontend/src/App.jsx'), 'utf8');
  for (const match of app.matchAll(/path="\/([a-z][a-z-]*)(?:\/[^"]*)?"/g)) {
    assert.equal(RESERVED.has(match[1]), true, `${match[1]} must be reserved`);
  }
  const assets = await fs.readdir(path.resolve(__dirname, '../../frontend/public'), { withFileTypes: true });
  for (const entry of assets.filter(item => item.isDirectory())) assert.equal(RESERVED.has(entry.name.toLowerCase()), true);
  for (const destination of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2f%2fevil', '/admin',
    '/title/a?next=https://evil', '/title/a#x', '/title/../admin', '/title/%61', '/MMWF', '/creators/secret']) {
    assert.throws(() => linkInput({ ...FLAGSHIP, destination }));
  }
  for (const destination of ['/title/public-film', '/series/c2VyaWVz', '/podcasts/public-show', FLAGSHIP.destination]) {
    assert.equal(linkInput({ ...FLAGSHIP, destination }).destination, destination);
  }
});

test('registry persists, serializes case-insensitive claims, keeps inactive slugs, and rejects stale edits', async context => {
  const store = await localStore(context);
  const results = await Promise.allSettled([
    store.save(FLAGSHIP, 'admin-a'), store.save({ ...FLAGSHIP, slug: 'mmwf' }, 'admin-b'),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const reloaded = new ShortLinkStore({ db: null, filePath: store.filePath, production: false });
  const first = await reloaded.get('mMwF');
  assert.equal(first.slug, 'MMWF');
  assert.equal(first.version, 1);
  const inactive = await store.save({ ...FLAGSHIP, active: false }, 'admin-a', { key: 'mmwf', version: 1 });
  assert.equal(inactive.version, 2);
  await assert.rejects(store.save(FLAGSHIP, 'admin-b'), /already assigned/);
  await assert.rejects(store.save(FLAGSHIP, 'admin-b', { key: 'mmwf', version: 1 }), /changed/);
  await assert.rejects(store.save({ ...FLAGSHIP, slug: 'Other' }, 'admin-b', { key: 'mmwf', version: 2 }), /renamed/);
  await assert.rejects(seedFlagship(store), /already assigned differently or inactive/);
  for (let i = 0; i < 4; i += 1) await store.save({ ...FLAGSHIP, slug: `Link${i}` }, 'admin');
  const page = await store.list({ limit: 2 });
  assert.equal(page.items.length, 2);
  assert.ok(page.nextCursor);
  const next = await store.list({ limit: 2, cursor: page.nextCursor });
  assert.equal(next.items.some(item => page.items.some(prior => prior.id === item.id)), false);
  assert.equal(await store.get('constructor'), null);
  await store.save({ ...FLAGSHIP, slug: 'constructor' }, 'admin');
  assert.equal((await store.get('constructor')).slug, 'constructor');
  await assert.rejects(new ShortLinkStore({ filePath: store.filePath, production: true }).get('MMWF'), /require Firestore/);
});

test('Firestore registry uses normalized document IDs and transactional uniqueness/version checks', async () => {
  const data = new Map();
  const ref = id => ({ id, async get() { return { exists: data.has(id), id, data: () => data.get(id) }; } });
  const db = {
    collection(name) { assert.equal(name, 'shortLinks'); return { doc: ref }; },
    async runTransaction(action) {
      return action({ get: r => r.get(), set(r, value) { data.set(r.id, value); } });
    },
  };
  const store = new ShortLinkStore({ db, filePath: path.join(os.tmpdir(), 'unused-links.json'), production: true });
  await store.save(FLAGSHIP, 'admin');
  assert.equal(data.has('mmwf'), true);
  await assert.rejects(store.save({ ...FLAGSHIP, slug: 'mmwf' }, 'admin'), /already assigned/);
  await store.save({ ...FLAGSHIP, slug: 'Mmwf' }, 'admin', { key: 'mmwf', version: 1 });
  assert.equal((await store.get('MMWF')).slug, 'Mmwf');
});

test('destinations use only public content and fresh approved metadata; MMWF works before publication', async () => {
  const mmwf = await destinationMetadata(FLAGSHIP, async () => []);
  assert.equal(mmwf.title, 'Me and My White Friend');
  assert.match(mmwf.description, /Reggie Reg and Marv/);
  assert.equal(mmwf.image, '/api/short-links/artwork/mmwf');
  const link = { slug: 'ActualFilm', destination: '/title/public-film', kind: 'film', active: true };
  const metadata = await destinationMetadata(link, async () => [film]);
  assert.equal(metadata.title, film.title);
  assert.equal(metadata.image, film.posterUrl);
  assert.equal(metadata.rightsHolder, undefined);
  await assert.rejects(destinationMetadata(link, async () => [{ ...film, approvalStatus: 'draft' }]), /not currently approved/);
  await assert.rejects(destinationMetadata({ ...link, kind: 'music' }, async () => [film]), /belongs to film/);
  const musicLink = { ...link, kind: 'music' };
  assert.equal((await destinationMetadata(musicLink, async () => [{ ...film, category: 'Music' }])).title, film.title);
  assert.equal((await destinationMetadata(musicLink, async () => [{ ...film, contentType: 'MUSIC', musicFormat: 'music_video' }])).title, film.title);
  await assert.rejects(destinationMetadata(link, async () => [{ ...film, posterUrl: 'javascript:alert(1)' }]), /HTTPS/);
  const show = { id: 'show', contentType: 'PODCAST_SHOW', title: 'Me and My White Friend', host: 'Reg and Marv', description: 'Reg and Marv talk.', approvalStatus: 'approved' };
  assert.equal(publicPodcastShow(show).host, 'Reggie Reg and Marv');
  assert.equal(publicPodcastShow(show).description, 'Reggie Reg and Marv talk.');
  assert.equal(show.host, 'Reg and Marv', 'Stored approved metadata must not be mutated');
});

test('Admin authorization, activation, crawler HTML, direct loads, errors and existing routes remain safe', async context => {
  const store = await localStore(context);
  await seedFlagship(store);
  await seedFlagship(store);
  let catalog = [film];
  const template = '<!doctype html><html><head><title>PROtv</title><meta property="og:title" content="default"></head><body><div id="root"></div></body></html>';
  const { publicRouter, adminRouter } = createShortLinkRouters({
    store, loadApproved: async () => catalog, loadTemplate: async () => template,
    authorize(req, res, next) {
      if (req.headers['x-test-admin'] !== 'yes') return res.status(403).json({ error: 'Admin required.' });
      req.user = { uid: 'admin' }; return next();
    },
  });
  const app = express(); app.use(express.json());
  app.use('/links', publicRouter); app.use('/admin', adminRouter);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const write = (route, body, method = 'POST', admin = true) => fetch(base + route, {
    method, headers: { 'content-type': 'application/json', 'x-test-admin': admin ? 'yes' : 'no' }, body: JSON.stringify(body),
  });
  assert.equal((await fetch(base + '/admin')).status, 403);
  assert.equal((await write('/admin', FLAGSHIP, 'POST', false)).status, 403);
  assert.equal((await write('/admin', FLAGSHIP)).status, 409);
  assert.equal((await write('/admin', { ...FLAGSHIP, slug: 'Privacy' })).status, 400);
  const publicFilm = { slug: 'Film', destination: '/title/public-film', kind: 'film', active: true };
  assert.equal((await write('/admin', publicFilm)).status, 201);
  for (const slug of ['MMWF', 'mmwf', 'mMwF']) {
    const response = await fetch(`${base}/links/resolve/${slug}`, { headers: { 'user-agent': 'facebookexternalhit/1.1' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /nonce-/);
    const html = await response.text();
    assert.match(html, /og:title" content="Me and My White Friend"/);
    assert.match(html, /og:image" content="https:\/\/watchprotv.com\/api\/short-links\/artwork\/mmwf"/);
    assert.match(html, /location.replace\("\/podcast\/me-and-my-white-friend"\)/);
    assert.match(html, /<noscript>/);
    assert.doesNotMatch(html, /rightsHolder|createdBy/);
  }
  const reserved = await fetch(base + '/links/resolve/privacy');
  assert.equal(await reserved.text(), template);
  assert.equal((await fetch(base + '/links/resolve/Unassigned')).status, 404);
  assert.equal((await fetch(base + '/links/resolve/Dreadheads')).status, 404);
  assert.equal((await fetch(base + '/links/resolve/MrCeasefire')).status, 404);
  assert.equal((await fetch(base + '/links/resolve/TheThirst')).status, 404);
  const payload = await (await fetch(base + '/links/resolve/MMWF?format=json')).json();
  assert.equal(payload.destination, FLAGSHIP.destination);
  assert.equal(payload.createdBy, undefined);
  const filmHtml = await (await fetch(base + '/links/resolve/Film')).text();
  assert.match(filmHtml, /Actual public title &lt;script&gt;/);
  assert.doesNotMatch(filmHtml, /Private evidence/);
  catalog = [{ ...film, approvalStatus: 'draft' }];
  assert.equal((await fetch(base + '/links/resolve/Film')).status, 404);
  assert.equal((await write('/admin/film', { ...publicFilm, active: false, version: 1 }, 'PATCH')).status, 200);
  assert.equal((await fetch(base + '/links/resolve/Film')).status, 404);
  assert.equal((await write('/admin/film', { ...publicFilm, version: 2 }, 'PATCH')).status, 400);
  const artwork = await fetch(base + '/links/artwork/mmwf');
  assert.equal(artwork.status, 200); assert.match(artwork.headers.get('content-type'), /image\/png/);
  assert.ok((await artwork.arrayBuffer()).byteLength > 50000);
  const brandArt = await fetch(base + '/links/artwork/brand');
  assert.equal(brandArt.status, 200); assert.match(brandArt.headers.get('content-type'), /image\/png/);
  const page = await (await fetch(base + '/links/featured-page')).text();
  assert.equal((page.match(/property="og:title"/g) || []).length, 1);
  assert.match(page, /Reggie Reg and Marv/);
  const title = titleHtml(template, film);
  assert.equal((title.match(/property="og:title"/g) || []).length, 1);
});

test('real Admin auth is mandatory and a registry outage fails explicitly without affecting reserved pages', async context => {
  const { publicRouter, adminRouter } = createShortLinkRouters({
    store: { async get() { throw new Error('Deliberate registry outage test'); } },
    loadTemplate: async () => '<title>Existing route shell</title>',
  });
  const app = express(); app.use(express.json()); app.use('/links', publicRouter); app.use('/admin', adminRouter);
  const server = app.listen(0, '127.0.0.1'); context.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/admin')).status, 401);
  assert.equal((await fetch(base + '/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(FLAGSHIP) })).status, 401);
  const response = await fetch(base + '/links/resolve/MMWF');
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /temporarily unavailable/);
  assert.equal((await fetch(base + '/links/resolve/admin')).status, 200);
});

test('Vercel short-link rewrites retain sponsor, API, title and SPA routes', async () => {
  const config = JSON.parse(await fs.readFile(path.resolve(__dirname, '../../vercel.json'), 'utf8'));
  const resolver = config.rewrites.findIndex(r => r.destination.includes('short-links/resolve'));
  for (const source of ['/sponsors', '/title/:id', '/api/:path*', '/sitemap.xml']) {
    assert.ok(config.rewrites.findIndex(r => r.source === source) < resolver);
  }
  assert.equal(config.rewrites.at(-1).destination, '/index.html');
});

const assert = require('node:assert/strict');
const test = require('node:test');
const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const {
  PromotionStore, promotionInput, resolvePromotion, withPromotions, promotionTargets, createAdminPromotionRouter, SEED_MIGRATIONS,
} = require('../src/catalog/comingSoonPromotions');
const { comingSoonCatalog, seriesDetails } = require('../src/catalog/details');
const { createCatalogRouter } = require('../src/catalog/router');
const { seriesKey } = require('../src/catalog/readModel');

// Synthetic records shaped like the live 2212 show: Episodes 1 and 2 released, Episode 3 not in the catalog.
const playable = (extra) => ({ status: 'ready', approvalStatus: 'approved', muxPlaybackId: 'public-id', ...extra });
const ep1 = playable({ id: 'creator_episode_1', contentType: 'EPISODE', title: 'Concrete', seriesTitle: '2212', seasonNumber: 1, episodeNumber: 1, publicSeriesSlug: '2212' });
const show2212 = {
  id: 'creator_series_2212', contentType: 'SERIES', title: '2212', seriesTitle: '2212', status: 'ready', approvalStatus: 'approved', visibility: 'public',
};
const ep2 = playable({ id: 'creator_episode_2', contentType: 'EPISODE', title: 'Death Before Dishonor', seriesTitle: '2212', seasonNumber: 1, episodeNumber: 2 });
const dread = {
  id: 'coming_soon_dread', contentType: 'SERIES', title: 'Dread Head', seriesTitle: '', comingSoonProjectId: 'dread', status: 'ready',
  approvalStatus: 'approved', visibility: 'public', posterUrl: 'https://watchprotv.com/api/posters/d.jpg', thumbnailUrl: 'https://watchprotv.com/api/posters/d.jpg',
};
const upcomingFilm = {
  id: 'coming_soon_film', contentType: 'MOVIE', title: 'Upcoming Film', comingSoonProjectId: 'film-project', status: 'ready', approvalStatus: 'approved',
  posterUrl: 'https://watchprotv.com/api/posters/f.jpg',
};
const seed = SEED_MIGRATIONS[0].promotion;
const tempStore = async (options = {}) => new PromotionStore({
  db: null, production: false, filePath: path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'promo-')), 'p.json'), ...options,
});
const series = (records) => seriesDetails(records);

test('the migrated 2212 Episode 3 card keeps its artwork, TBD date and /series/2212 link, with nothing playable', () => {
  const before = JSON.stringify([show2212, ep1, ep2]);
  const { state, card } = resolvePromotion(seed, [show2212, ep1, ep2], series([show2212, ep1, ep2]));
  assert.equal(state, 'live');
  assert.deepEqual(card, {
    id: 'promo-2212-episode-3-c-fluid', promotionId: '2212-episode-3-c-fluid', kind: 'series', href: '/series/2212', title: '2212 · Episode 3: C-Fluid', description: '',
    artwork: '/coming-soon/2212-episode-3-c-fluid.jpg', categories: [], comingSoon: true, protvOriginal: false, trailerAvailable: false, promotion: true,
  });
  assert.equal(card.premiereAt, undefined, 'no invented date: the website shows "Premiere date TBD"');
  assert.doesNotMatch(JSON.stringify(card), /player|muxPlayback|public-id/);
  assert.equal(JSON.stringify([show2212, ep1, ep2]), before, 'released episodes are never modified');
  // Episodes 1 and 2 stay streaming; the show is not turned back into Coming Soon.
  assert.equal(series([show2212, ep1, ep2])[0].comingSoon, false);
  assert.deepEqual(series([show2212, ep1, ep2])[0].episodes.map((e) => e.watchAvailable), [true, true]);
});

test('an episode promotion retires automatically once that exact episode is streaming', () => {
  const ep3 = playable({ id: 'creator_episode_3', contentType: 'EPISODE', title: 'C-Fluid', seriesTitle: '2212', seasonNumber: 1, episodeNumber: 3 });
  const records = [show2212, ep1, ep2, ep3];
  assert.equal(resolvePromotion(seed, records, series(records)).state, 'released');
  assert.deepEqual(withPromotions([], [seed], records), []);
  const held = { ...ep3, status: 'held', releaseStatus: 'held', approvalStatus: 'draft' };
  assert.equal(resolvePromotion(seed, [show2212, ep1, ep2, held], series([show2212, ep1, ep2, held])).state, 'live', 'an unreleased upload does not retire it');
});

test('promotions lead the row; a whole-show or film promotion replaces its automatic card instead of duplicating it', () => {
  const records = [show2212, ep1, ep2, dread, upcomingFilm];
  const automatic = comingSoonCatalog(records);
  assert.deepEqual(automatic.map((item) => item.title).sort(), ['Dread Head', 'Upcoming Film']);
  const dreadPromo = { id: 'dread', status: 'published', target: { kind: 'series', id: seriesKey('Dread Head') }, title: '', description: 'New synopsis', artworkUrl: '', premiereAt: null };
  const filmPromo = { id: 'film', status: 'published', target: { kind: 'title', id: upcomingFilm.id }, title: '', description: '', artworkUrl: '', premiereAt: '2099-01-01T00:00:00.000Z', sortOrder: 1 };
  const items = withPromotions(automatic, [filmPromo, dreadPromo, seed], records);
  assert.deepEqual(items.map((item) => item.title), ['2212 · Episode 3: C-Fluid', 'Dread Head', 'Upcoming Film']);
  assert.equal(items.filter((item) => item.href === '/series/' + encodeURIComponent(seriesKey('Dread Head'))).length, 1);
  assert.equal(items[1].description, 'New synopsis');
  assert.equal(items[1].artwork, dread.posterUrl, 'blank artwork falls back to the title artwork');
  assert.equal(items[2].premiereAt, '2099-01-01T00:00:00.000Z');
  // Hidden promotions and the automatic listing are independent: hiding a promotion restores the automatic card.
  const hidden = withPromotions(automatic, [{ ...dreadPromo, status: 'hidden' }], records);
  assert.deepEqual(hidden.map((item) => item.title).sort(), ['Dread Head', 'Upcoming Film']);
  assert.equal(hidden.find((item) => item.title === 'Dread Head').description, '');
});

test('non-public targets never appear, and past premiere dates are not shown as upcoming', () => {
  const draft = { ...upcomingFilm, approvalStatus: 'draft' };
  const promo = { id: 'x', status: 'published', target: { kind: 'title', id: draft.id }, premiereAt: null };
  assert.equal(resolvePromotion(promo, [draft], []).state, 'unavailable');
  const missing = { id: 'y', status: 'published', target: { kind: 'series', id: seriesKey('Nope'), seasonNumber: 1, episodeNumber: 1 } };
  assert.equal(resolvePromotion(missing, [ep1], series([ep1])).state, 'unavailable');
  const past = { ...seed, premiereAt: '2001-01-01T00:00:00.000Z' };
  assert.equal(resolvePromotion(past, [show2212, ep1, ep2], series([show2212, ep1, ep2])).card.premiereAt, undefined);
});

test('input validation: TBD, paired season/episode, safe artwork, no unknown status', () => {
  const base = { target: { kind: 'series', id: seriesKey('2212'), seasonNumber: 1, episodeNumber: 3 } };
  assert.equal(promotionInput({ ...base, premiereAt: '' }).premiereAt, null);
  // A bare date is a date-only premiere on that Eastern calendar day (noon ET stands for the day; no time is set).
  const dateOnly = promotionInput({ ...base, premiereAt: '2099-03-01' });
  assert.deepEqual([dateOnly.premiereDate, dateOnly.premiereTime, dateOnly.premiereAt], ['2099-03-01', null, '2099-03-01T17:00:00.000Z']);
  assert.equal(promotionInput(base).status, 'hidden', 'new promotions start hidden unless published');
  assert.throws(() => promotionInput({ target: { kind: 'series', id: 'a', seasonNumber: 1 } }), /both/);
  assert.throws(() => promotionInput({ ...base, artworkUrl: 'javascript:alert(1)' }), /Artwork/);
  assert.throws(() => promotionInput({ ...base, artworkUrl: '//evil.example/x.jpg' }), /Artwork/);
  assert.throws(() => promotionInput({ ...base, status: 'live' }), /Status/);
  assert.throws(() => promotionInput({ target: { kind: 'video', id: 'a' } }), /catalog title or describe a new upcoming title/);
});

test('the one-time migration creates the 2212 card once and never brings it back after removal', async () => {
  const store = await tempStore();
  const first = await store.list();
  assert.deepEqual(first.map((item) => item.id), ['2212-episode-3-c-fluid']);
  await store.remove('2212-episode-3-c-fluid', first[0].version);
  const fresh = new PromotionStore({ db: null, production: false, filePath: store.filePath });
  assert.deepEqual(await fresh.list(), [], 'removal is permanent; the migration does not re-run');
  await assert.rejects(() => fresh.remove('2212-episode-3-c-fluid', 1), /changed/);
});

async function serve(router, mount = '/') {
  const app = express();
  app.use(express.json());
  app.use(mount, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('public Coming Soon shows the migrated card on the website only, and survives a promotion outage', async () => {
  const store = await tempStore();
  const records = [show2212, ep1, ep2, dread];
  const site = await serve(createCatalogRouter({ loadApproved: async () => records, promotionStore: store }));
  try {
    const web = await (await fetch(`${site.url}/coming-soon`)).json();
    assert.deepEqual(web.items.map((item) => item.title), ['2212 · Episode 3: C-Fluid', 'Dread Head']);
    const firetv = await (await fetch(`${site.url}/coming-soon`, { headers: { 'X-PROtv-Platform': 'firetv' } })).json();
    assert.deepEqual(firetv.items.map((item) => item.title), ['2212 · Episode 3: C-Fluid', 'Dread Head']);
    assert.equal(firetv.policy, 'firetv-coming-soon-v1');
    for (const platform of ['samsung', 'android']) {
      const device = await (await fetch(`${site.url}/coming-soon`, { headers: { 'X-PROtv-Platform': platform } })).json();
      assert.equal(device.items.some((item) => item.promotion), false, `${platform} response is unchanged`);
    }
  } finally { await site.close(); }
  const broken = await serve(createCatalogRouter({
    loadApproved: async () => records, promotionStore: { list: async () => { throw new Error('down'); } },
  }));
  try {
    const items = (await (await fetch(`${broken.url}/coming-soon`)).json()).items;
    assert.deepEqual(items.map((item) => item.title), ['Dread Head']);
  } finally { await broken.close(); }
});

test('only Administrators can read or change promotions', async () => {
  const store = await tempStore();
  const real = await serve(createAdminPromotionRouter({ store, loadRecords: async () => [show2212, ep1, ep2] }));
  try {
    for (const [method, body] of [['GET'], ['POST', {}], ['PATCH', {}], ['DELETE', {}]]) {
      const target = method === 'GET' || method === 'POST' ? '/' : '/2212-episode-3-c-fluid';
      const res = await fetch(`${real.url}${target}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      assert.equal(res.status, 401, `${method} without a token is refused`);
    }
    const artwork = await fetch(`${real.url}/artwork`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: Buffer.from([1]) });
    assert.equal(artwork.status, 401);
  } finally { await real.close(); }
  const viewer = await serve(createAdminPromotionRouter({
    store, loadRecords: async () => [show2212, ep1, ep2], authorize: (_req, res) => res.status(403).json({ error: 'Admin access is required.' }),
  }));
  try {
    assert.equal((await fetch(`${viewer.url}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  } finally { await viewer.close(); }
  assert.equal((await store.list()).length, 1, 'refused requests changed nothing');
});

test('Administrators can publish, edit, hide and remove a promotion without touching the title', async () => {
  const store = await tempStore({ seeds: [] });
  const records = [show2212, ep1, ep2, dread, upcomingFilm];
  const snapshot = JSON.stringify(records);
  const events = [];
  const admin = await serve(createAdminPromotionRouter({
    store, loadRecords: async () => records, logAdminEvent: async (event) => events.push(event.type),
    authorize: (req, _res, next) => { req.user = { uid: 'admin-1', admin: true }; next(); },
  }));
  const call = async (method, target, body) => {
    const res = await fetch(`${admin.url}${target}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  try {
    const listed = await call('GET', '/');
    assert.deepEqual(listed.body.targets.titles.map((t) => t.title), ['Upcoming Film'], 'only unreleased films and episodes are offered');
    assert.deepEqual(listed.body.targets.series.map((s) => s.title), ['2212', 'Dread Head']);
    const whole = await call('POST', '/', { target: { kind: 'series', id: seriesKey('2212') }, status: 'published', rightsConfirmed: true });
    assert.equal(whole.status, 400, 'a streaming show cannot be promoted as a whole');
    assert.match(whole.body.error, /already streaming/);
    const unconfirmed = await call('POST', '/', { target: { kind: 'title', id: upcomingFilm.id }, status: 'published' });
    assert.equal(unconfirmed.status, 400, 'publishing requires the promotional rights confirmation');
    assert.match(unconfirmed.body.error, /rights/);
    const created = await call('POST', '/', { target: { kind: 'title', id: upcomingFilm.id }, description: 'Promo copy', premiereAt: '', status: 'published', rightsConfirmed: true });
    assert.equal(created.body.promotionRights.confirmedBy, 'admin-1');
    assert.equal(created.status, 201);
    assert.equal(created.body.premiereAt, null);
    const edited = await call('PATCH', `/${created.body.id}`, { ...created.body, premiereAt: '2099-05-01', status: 'published', rightsConfirmed: true });
    assert.equal(edited.body.version, 2);
    assert.equal((await call('PATCH', `/${created.body.id}`, { ...created.body, status: 'hidden' })).status, 409, 'stale edits are refused');
    const hidden = await call('PATCH', `/${created.body.id}`, { ...edited.body, status: 'hidden' });
    assert.equal((await call('GET', '/')).body.items[0].state, 'hidden');
    assert.equal((await call('DELETE', `/${created.body.id}`, { version: hidden.body.version })).status, 204);
    assert.deepEqual((await call('GET', '/')).body.items, []);
    assert.equal(JSON.stringify(records), snapshot, 'no catalog record changed');
    assert.deepEqual(events, ['coming_soon_promotion_saved', 'coming_soon_promotion_saved', 'coming_soon_promotion_saved', 'coming_soon_promotion_removed']);
  } finally { await admin.close(); }
});

test('admin targets list a whole show only if it has no released episodes, but any public show for one upcoming episode', () => {
  const { series: shows } = promotionTargets([show2212, ep1, ep2, dread]);
  assert.deepEqual(shows.map((s) => [s.title, s.comingSoon]), [['2212', false], ['Dread Head', true]]);
  assert.deepEqual(shows[0].episodes.map((e) => [e.episodeNumber, e.released]), [[1, true], [2, true]]);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const {
  PromotionStore, promotionInput, resolvePromotion, withPromotions, livePromotionTrailer, createAdminPromotionRouter,
} = require('../src/catalog/comingSoonPromotions');
const { comingSoonCatalog, seriesDetails } = require('../src/catalog/details');
const { createCatalogRouter } = require('../src/catalog/router');

// Synthetic records only.
const dread = {
  id: 'coming_soon_dread', contentType: 'SERIES', title: 'Dread Head', seriesTitle: '', comingSoonProjectId: 'dread', status: 'ready',
  approvalStatus: 'approved', visibility: 'public', posterUrl: 'https://watchprotv.com/api/posters/d.jpg',
  trailerStatus: 'ready', trailerPlaybackId: 'dread-trailer', trailerDuration: 90,
};
const fullFilm = {
  id: 'creator_full', contentType: 'MOVIE', title: 'Released Film', status: 'ready', approvalStatus: 'approved', muxPlaybackId: 'FULL-LENGTH-ID',
};
const upcomingInput = (extra = {}) => ({
  target: { kind: 'upcoming', contentType: 'documentary' }, title: 'Brand New Doc', description: 'Coming to PROtv.',
  artworkUrl: 'https://watchprotv.com/api/posters/title-new.jpg', premiereAt: '', status: 'published', rightsConfirmed: true, ...extra,
});
const tempStore = async () => new PromotionStore({
  db: null, production: false, seeds: [], filePath: path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'promo-up-')), 'p.json'),
});
async function serve(router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

// A fake Mux: one upload becomes a ready asset with signed playback when `finish` is called.
function fakeMux() {
  const uploads = new Map();
  const assets = new Map();
  const deleted = [];
  const cancelled = [];
  let n = 0;
  return {
    deleted, cancelled,
    finish(uploadId, { errored = false } = {}) {
      const assetId = `asset-${uploadId}`;
      uploads.get(uploadId).asset_id = assetId;
      assets.set(assetId, { id: assetId, status: errored ? 'errored' : 'ready', duration: 61.4, playback_ids: [{ policy: 'signed', id: `play-${uploadId}` }] });
    },
    deps: {
      createDirectUpload: async (_origin, options) => {
        assert.equal(options.playbackPolicy, 'signed', 'promotional trailers are signed playback');
        n += 1; const upload = { id: `up${n}`, url: `https://storage.mux.test/up${n}`, status: 'waiting' };
        uploads.set(upload.id, upload); return upload;
      },
      getUpload: async (id) => uploads.get(id),
      getAsset: async (id) => assets.get(id),
      getPlaybackId: (asset, policy) => asset.playback_ids.find((p) => p.policy === policy)?.id || null,
      signPlayback: async (playbackId) => `token-for-${playbackId}`,
      cancelUpload: async (id) => { cancelled.push(id); },
      deleteAsset: async (id) => { deleted.push(id); },
    },
  };
}

test('a new upcoming title needs a title and a content type, and creates no catalog content', () => {
  assert.throws(() => promotionInput({ target: { kind: 'upcoming', contentType: 'documentary' } }), /title of the upcoming/);
  assert.throws(() => promotionInput({ target: { kind: 'upcoming', contentType: 'podcast' }, title: 'X' }), /film, series, documentary or episode/);
  const input = promotionInput(upcomingInput());
  assert.deepEqual(input.target, { kind: 'upcoming', contentType: 'documentary' });
  const { state, card } = resolvePromotion({ ...input, id: 'new-doc' }, [], []);
  assert.equal(state, 'live');
  assert.equal(card.href, null, 'no catalog page and nothing playable');
  assert.equal(card.contentType, 'Documentary');
  assert.equal(card.trailerAvailable, false);
  assert.doesNotMatch(JSON.stringify(card), /muxPlayback|player/);
});

test('an unlinked upcoming title retires automatically once its premiere date passes, keeping the record', () => {
  const promotion = { ...promotionInput(upcomingInput({ premiereAt: '2030-01-01T17:00:00.000Z' })), id: 'dated' };
  assert.equal(resolvePromotion(promotion, [], [], Date.parse('2029-12-31T00:00:00Z')).state, 'live');
  // A date-only premiere lasts the whole Eastern day: still up at 7 PM ET (00:00 UTC), retired at midnight ET.
  assert.equal(resolvePromotion(promotion, [], [], Date.parse('2030-01-02T00:00:00Z')).state, 'live');
  assert.equal(resolvePromotion(promotion, [], [], Date.parse('2030-01-02T05:00:00Z')).state, 'premiered');
  assert.deepEqual(withPromotions([], [promotion], [], Date.parse('2030-01-02T05:00:00Z')), []);
  const tbd = { ...promotionInput(upcomingInput()), id: 'tbd' };
  assert.equal(resolvePromotion(tbd, [], [], Date.parse('2099-01-01T00:00:00Z')).state, 'live', 'TBD never retires by date');
});

test('upload, replace, select and remove a promotional trailer; visitors only ever get a signed trailer', async () => {
  const store = await tempStore();
  const mux = fakeMux();
  const records = [dread, fullFilm];
  const admin = await serve(createAdminPromotionRouter({
    store, loadRecords: async () => records, logAdminEvent: async () => {}, ...mux.deps,
    authorize: (req, _res, next) => { req.user = { uid: 'admin-1', admin: true }; next(); },
  }));
  const site = await serve(createCatalogRouter({
    loadApproved: async () => records, promotionStore: store, signPlaybackToken: mux.deps.signPlayback,
  }));
  const call = async (method, url, body) => {
    const res = await fetch(`${admin.url}${url}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const publicTrailer = (id, headers = {}) => fetch(`${site.url}/coming-soon/promotions/${id}/trailer`, { headers });
  try {
    const created = (await call('POST', '/', upcomingInput())).body;
    const id = created.id;
    assert.equal((await publicTrailer(id)).status, 404, 'no trailer yet');

    const started = await call('POST', `/${id}/trailer/upload-url`);
    assert.equal(started.status, 201);
    assert.equal(started.body.uploadUrl, 'https://storage.mux.test/up1');
    assert.equal((await call('POST', `/${id}/trailer/upload-url`)).status, 409, 'one upload at a time');
    assert.equal((await call('GET', `/${id}/trailer/status`)).body.status, 'processing');
    mux.finish('up1');
    assert.deepEqual((await call('GET', `/${id}/trailer/status`)).body, { status: 'ready', source: 'upload', titleId: null, error: '' });

    const played = await (await publicTrailer(id)).json();
    assert.deepEqual(played, { id, muxPlaybackId: 'play-up1', playbackToken: 'token-for-play-up1' });
    const cards = (await (await fetch(`${site.url}/coming-soon`)).json()).items;
    const card = cards.find((item) => item.promotionId === id);
    assert.equal(card.trailerAvailable, true);
    assert.doesNotMatch(JSON.stringify(cards), /FULL-LENGTH-ID|play-up1/, 'cards never carry playback IDs');
    assert.equal((await publicTrailer(id, { 'X-PROtv-Platform': 'roku' })).status, 404, 'TV and mobile apps are unchanged');

    // Editing the details keeps the trailer.
    await call('PATCH', `/${id}`, { ...upcomingInput({ description: 'New copy' }), version: created.version });
    assert.equal((await (await publicTrailer(id)).json()).muxPlaybackId, 'play-up1');

    // Replace: the old trailer keeps playing until the new one is ready, then the promotion's old Mux asset is deleted.
    await call('POST', `/${id}/trailer/upload-url`);
    assert.equal((await (await publicTrailer(id)).json()).muxPlaybackId, 'play-up1');
    mux.finish('up2');
    await call('GET', `/${id}/trailer/status`);
    assert.equal((await (await publicTrailer(id)).json()).muxPlaybackId, 'play-up2');
    assert.deepEqual(mux.deleted, ['asset-up1']);

    // A failed upload is reported and the current trailer stays.
    await call('POST', `/${id}/trailer/upload-url`);
    mux.finish('up3', { errored: true });
    const failed = (await call('GET', `/${id}/trailer/status`)).body;
    assert.equal(failed.status, 'ready');
    assert.match(failed.error, /could not process/);

    // Select an existing catalog trailer instead; the promotion's own asset is removed, the catalog one never is.
    assert.equal((await call('POST', `/${id}/trailer/select`, { titleId: fullFilm.id })).status, 400, 'only titles with a ready trailer');
    const selected = await call('POST', `/${id}/trailer/select`, { titleId: dread.id });
    assert.equal(selected.status, 200);
    assert.equal((await (await publicTrailer(id)).json()).muxPlaybackId, 'dread-trailer');
    assert.deepEqual(mux.deleted, ['asset-up1', 'asset-up2']);
    assert.equal((await call('GET', `/${id}/trailer/preview`)).body.muxPlaybackId, 'dread-trailer');

    assert.equal((await call('DELETE', `/${id}/trailer`)).status, 204);
    assert.equal((await publicTrailer(id)).status, 404);
    assert.deepEqual(mux.deleted, ['asset-up1', 'asset-up2'], 'removing a selected catalog trailer deletes nothing');
    assert.equal(dread.trailerPlaybackId, 'dread-trailer');

    // Hidden promotions never play.
    await call('POST', `/${id}/trailer/select`, { titleId: dread.id });
    const current = (await call('GET', '/')).body.items.find((item) => item.id === id);
    await call('PATCH', `/${id}`, { ...current, status: 'hidden' });
    assert.equal((await publicTrailer(id)).status, 404);
  } finally { await admin.close(); await site.close(); }
});

test('linking a new-title promotion to its catalog record keeps artwork, copy and trailer, with no duplicate card', async () => {
  const store = await tempStore();
  const mux = fakeMux();
  let records = [];
  const admin = await serve(createAdminPromotionRouter({
    store, loadRecords: async () => records, logAdminEvent: async () => {}, ...mux.deps,
    authorize: (req, _res, next) => { req.user = { uid: 'admin-1', admin: true }; next(); },
  }));
  const call = async (method, url, body) => {
    const res = await fetch(`${admin.url}${url}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  try {
    const created = (await call('POST', '/', upcomingInput({ target: { kind: 'upcoming', contentType: 'film' }, title: 'Synthetic Feature' }))).body;
    await call('POST', `/${created.id}/trailer/upload-url`);
    mux.finish('up1');
    await call('GET', `/${created.id}/trailer/status`);

    // The film's Coming Soon record is added to the catalog later (e.g. by the Creator Portal).
    const comingSoonFilm = {
      id: 'coming_soon_feature', contentType: 'MOVIE', title: 'Synthetic Feature', comingSoonProjectId: 'feature', status: 'ready',
      approvalStatus: 'approved', posterUrl: 'https://watchprotv.com/api/posters/catalog.jpg',
    };
    records = [comingSoonFilm];
    assert.equal(comingSoonCatalog(records).length, 1);
    const before = (await call('GET', '/')).body.items[0];
    const linked = await call('PATCH', `/${created.id}`, {
      ...before, target: { kind: 'title', id: comingSoonFilm.id }, status: 'published', rightsConfirmed: true,
    });
    assert.equal(linked.status, 200);
    const stored = await store.get(created.id);
    assert.equal(stored.artworkUrl, 'https://watchprotv.com/api/posters/title-new.jpg');
    assert.equal(stored.description, 'Coming to PROtv.');
    assert.equal(stored.trailer.playbackId, 'play-up1');
    const row = withPromotions(comingSoonCatalog(records), [stored], records);
    assert.deepEqual(row.map((item) => [item.title, item.href]), [['Synthetic Feature', '/title/coming_soon_feature']], 'one card, not two');
    assert.equal(livePromotionTrailer([stored], records, created.id).playbackId, 'play-up1');

    // When the real film is released, the card retires automatically; the promotion record stays.
    records = [comingSoonFilm, { ...fullFilm, id: 'creator_feature', creatorProjectId: 'feature', title: 'Synthetic Feature' }];
    assert.deepEqual(withPromotions(comingSoonCatalog(records), [stored], records), []);
    assert.equal(livePromotionTrailer([stored], records, created.id), null);
    assert.equal((await call('GET', '/')).body.items.length, 1, 'the promotion record is retained');
  } finally { await admin.close(); }
});

test('trailer endpoints require Administrators', async () => {
  const store = await tempStore();
  const real = await serve(createAdminPromotionRouter({ store, loadRecords: async () => [] }));
  try {
    for (const [method, url] of [['POST', '/x/trailer/upload-url'], ['GET', '/x/trailer/status'], ['POST', '/x/trailer/select'], ['DELETE', '/x/trailer'], ['GET', '/x/trailer/preview']]) {
      assert.equal((await fetch(`${real.url}${url}`, { method })).status, 401, `${method} ${url}`);
    }
  } finally { await real.close(); }
});

test('existing behaviour: Dread Head keeps its automatic card and series trailer details', () => {
  const [show] = seriesDetails([dread]);
  assert.equal(show.trailerAvailable, true);
  assert.deepEqual(comingSoonCatalog([dread]).map((item) => [item.title, item.trailerAvailable]), [['Dread Head', true]]);
});

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const express = require('express');
const { releaseAllowed, releaseEligible, releaseUpdate, seriesReleaseId, publicationResult } = require('../src/catalog/releases');
const { browse, seriesCatalog } = require('../src/catalog/readModel');
const { createCatalogRouter } = require('../src/catalog/router');
const { createReleaseRouter } = require('../src/catalog/releaseRouter');
const { claimEpisode } = require('../src/integrations/creatorEpisodes');

function episode(overrides = {}) {
  return {
    id: 'episode1', title: 'First episode', contentType: 'EPISODE', category: 'Drama',
    creatorProjectId: 'series1', seriesId: 'series1', seriesTitle: 'Series One',
    seasonId: 'season1', seasonNumber: 1, episodeNumber: 1,
    approvalStatus: 'approved', status: 'ready', muxPlaybackId: 'signedPlayback',
    muxPlaybackPolicy: 'signed', duration: 120, releaseStatus: 'held',
    ...overrides,
  };
}

function memoryDb(records = []) {
  const rows = new Map(records.map((record) => [`videos:${record.id}`, record]));
  let fail = false;
  const snapshot = (reference) => ({
    id: reference.id, exists: rows.has(reference.key), data: () => rows.get(reference.key),
  });
  const db = {
    collection: (name) => ({
      doc: (id = crypto.randomUUID()) => ({ id, key: `${name}:${id}` }),
      where: (field, operator, value) => ({
        get: async () => ({ docs: [...rows.entries()].filter(([key, row]) => key.startsWith(`${name}:`)
          && row[field] === value).map(([key]) => snapshot({ key, id: key.slice(name.length + 1) })) }),
      }),
    }),
    runTransaction: async (operation) => {
      const writes = [];
      const result = await operation({
        get: async (reference) => snapshot(reference),
        set: (reference, data, options) => writes.push([reference.key, {
          ...(options?.merge ? rows.get(reference.key) : {}), ...data,
        }]),
      });
      if (fail) throw new Error('Synthetic transaction failure.');
      for (const [key, value] of writes) rows.set(key, value);
      return result;
    },
  };
  return { db, rows, fail: () => { fail = true; } };
}

async function serve(context, app) {
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function mockEnv(context, name, value) {
  const previous = process.env[name];
  process.env[name] = value;
  context.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test('release gates preserve legacy visibility and enforce exact schedule boundaries with fail-closed invalid states', () => {
  const at = Date.parse('2026-12-21T01:30:00.000Z');
  assert.equal(releaseAllowed({}, at), true);
  assert.equal(releaseAllowed({ releaseStatus: 'held' }, at), false);
  assert.equal(releaseAllowed({ releaseStatus: 'invalid' }, at), false);
  for (const releaseAt of [null, 'invalid', 123]) {
    assert.equal(releaseAllowed({ releaseStatus: 'scheduled', releaseAt }, at), false);
  }
  const record = { releaseStatus: 'scheduled', releaseAt: new Date(at).toISOString() };
  assert.equal(releaseAllowed(record, at - 1), false);
  assert.equal(releaseAllowed(record, at), true);
  assert.equal(releaseAllowed(record, at + 1), true);
  assert.equal(releaseEligible(episode({ releaseStatus: 'published' }), [
    { id: seriesReleaseId('series1'), releaseStatus: 'held' },
  ], at), false);
});

test('schedule validation requires a future offset-qualified instant and valid IANA time zone; hold clears scheduling', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const valid = releaseUpdate({
    releaseStatus: 'scheduled', releaseAt: '2026-12-20T20:30:00-05:00', releaseTimeZone: 'America/New_York',
  }, 'owner', now);
  assert.equal(valid.releaseAt, '2026-12-21T01:30:00.000Z');
  assert.equal(valid.releaseUpdatedBy, 'owner');
  for (const value of [
    {}, { releaseStatus: 'automatic' },
    { releaseStatus: 'scheduled', releaseAt: '2026-10-18T12:00:00Z', releaseTimeZone: 'UTC' },
    { releaseStatus: 'scheduled', releaseAt: '2026-12-20T20:30:00', releaseTimeZone: 'UTC' },
    { releaseStatus: 'scheduled', releaseAt: '2026-12-20T20:30:00Z', releaseTimeZone: 'Invalid/Zone' },
    { releaseStatus: 'scheduled', releaseAt: '2026-12-20T20:30:00Z' },
    { releaseStatus: 'scheduled', releaseAt: '2027-02-30T20:30:00Z', releaseTimeZone: 'UTC' },
  ]) assert.throws(() => releaseUpdate(value, 'owner', now));
  assert.deepEqual(releaseUpdate({ releaseStatus: 'held', releaseAt: valid.releaseAt }, 'owner', now), {
    releaseStatus: 'held', releaseAt: null, releaseTimeZone: null, releaseUpdatedBy: 'owner',
    releaseUpdatedAt: new Date(now).toISOString(),
  });
});

test('series and title gates compose without overriding approval, readiness, or future uploads', () => {
  const open = episode({ releaseStatus: 'published' });
  const gate = { id: seriesReleaseId(open.seriesId), contentType: 'SERIES_RELEASE', approvalStatus: 'approved', releaseStatus: 'held' };
  assert.equal(browse([open, gate]).length, 0);
  assert.equal(browse([open, gate], { q: 'First' }).length, 0);
  assert.equal(seriesCatalog([open, gate]).length, 0);
  const later = episode({ id: 'later', releaseStatus: 'published', episodeNumber: 2 });
  assert.equal(browse([open, gate, later]).length, 0);
  gate.releaseStatus = 'published';
  assert.equal(browse([open, gate, episode({ id: 'held' })]).length, 1);
  assert.equal(seriesCatalog([open, gate])[0].episodeCount, 1);
  assert.equal(browse([{ ...open, status: 'processing' }, gate]).length, 0);
  assert.equal(browse([{ ...open, approvalStatus: 'rejected' }, gate]).length, 0);
  assert.equal(publicationResult(open, [{ ...gate, releaseStatus: 'held' }]).status, 'processing');
});

test('episode retries preserve admin holds and schedules and never reauthorize release', () => {
  const original = episode({ status: 'failed', muxAssetId: 'failedAsset', creatorEpisodeId: 'ep1',
    releaseStatus: 'scheduled', releaseAt: '2027-01-01T00:00:00Z', releaseTimeZone: 'UTC' });
  const claim = claimEpisode(original, { ...original, releaseStatus: undefined }, Date.now(), 'token');
  assert.equal(claim.video.releaseStatus, 'scheduled');
  assert.equal(claim.video.releaseAt, original.releaseAt);
  assert.equal(claim.video.releaseTimeZone, 'UTC');
});

test('admin release writes are authenticated, durable, audited, and atomic on storage failure', async (context) => {
  const store = memoryDb([episode()]);
  const app = express();
  app.use(express.json());
  const loadVideos = async () => [...store.rows.entries()].filter(([key]) => key.startsWith('videos:'))
    .map(([key, row]) => ({ ...row, id: key.slice('videos:'.length) }));
  app.use('/catalog', createCatalogRouter({
    loadApproved: loadVideos, signPlaybackToken: async () => 'mock-token',
  }));
  app.use('/releases', createReleaseRouter({
    db: store.db,
    loadVideos,
    authenticate: (req, res, next) => {
      if (req.header('x-test-role') !== 'admin') return res.status(403).json({ error: 'Admin required.' });
      req.user = { uid: 'owner' };
      next();
    },
  }));
  const base = await serve(context, app);
  assert.equal((await fetch(`${base}/releases`)).status, 403);
  const request = async (path, body, role = 'admin') => fetch(`${base}/releases${path}`, {
    method: body ? 'PATCH' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-test-role': role },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request('/titles/episode1', { releaseStatus: 'published' }, 'creator')).status, 403);
  assert.equal((await request('/titles/missing', { releaseStatus: 'held' })).status, 404);
  assert.equal((await request('/series/missing', { releaseStatus: 'held' })).status, 404);
  assert.equal((await request('/titles/episode1', { releaseStatus: 'bad' })).status, 400);
  assert.equal((await request('/series/series1', { releaseStatus: 'held' })).status, 200);
  assert.equal((await request('/titles/episode1', { releaseStatus: 'published' })).status, 200);
  let queue = await (await request('')).json();
  assert.equal(queue.titles[0].live, false);
  assert.equal(queue.series[0].releaseStatus, 'held');
  assert.equal((await fetch(`${base}/catalog/titles/episode1/playback`)).status, 404);
  assert.equal((await request('/series/series1', { releaseStatus: 'published' })).status, 200);
  queue = await (await request('')).json();
  assert.equal(queue.titles[0].live, true);
  assert.equal((await fetch(`${base}/catalog/titles/episode1/playback`)).status, 200);
  assert.equal([...store.rows.keys()].filter((key) => key.startsWith('releaseAudit:')).length, 3);
  const previous = JSON.stringify([...store.rows]);
  store.fail();
  assert.equal((await request('/titles/episode1', { releaseStatus: 'held' })).status, 503);
  assert.equal(JSON.stringify([...store.rows]), previous);
});

test('held and scheduled content cannot leak through public catalog, series, HTML, sitemap, or playback tokens', async (context) => {
  let record = episode();
  let gate = null;
  let signed = 0;
  const app = express();
  app.use('/catalog', createCatalogRouter({
    loadApproved: async () => [record, ...(gate ? [gate] : [])],
    loadHtmlTemplate: async () => '<html><head></head><body></body></html>',
    signPlaybackToken: async (id, duration) => {
      assert.equal(id, 'signedPlayback');
      assert.equal(duration, 120);
      signed += 1;
      return 'synthetic-signed-token';
    },
  }));
  const base = `${await serve(context, app)}/catalog`;
  for (const state of ['held', 'scheduled']) {
    record = episode({ releaseStatus: state, releaseAt: '2099-01-01T00:00:00Z' });
    for (const suffix of ['/titles/episode1', '/titles/episode1/playback', '/titles/episode1/html', '/series/creator_series1']) {
      const response = await fetch(`${base}${suffix}`);
      assert.equal(response.status, 404, suffix);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    assert.deepEqual((await (await fetch(`${base}?q=First`)).json()).items, []);
    assert.equal((await (await fetch(`${base}/sitemap.xml`)).text()).includes('episode1'), false);
  }
  assert.equal(signed, 0);
  record = episode({ releaseStatus: 'scheduled', releaseAt: '2020-01-01T00:00:00Z' });
  let response = await fetch(`${base}/titles/episode1/playback`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).playbackToken, 'synthetic-signed-token');
  assert.equal(signed, 1);
  assert.equal((await (await fetch(`${base}/titles/episode1`)).json()).playbackToken, undefined);
  gate = { id: seriesReleaseId('series1'), contentType: 'SERIES_RELEASE', releaseStatus: 'held' };
  response = await fetch(`${base}/titles/episode1/playback`);
  assert.equal(response.status, 404);
  assert.equal(signed, 1);
});

test('new protected creator ingestion fails before creating media if signing is unavailable', async (context) => {
  const { mux, createAssetFromUrl, signPlayback } = require('../src/mux');
  context.mock.method(mux.video.assets, 'create', async () => { throw new Error('Must not call Mux.'); });
  mockEnv(context, 'MUX_SIGNING_KEY_ID', '');
  mockEnv(context, 'MUX_SIGNING_PRIVATE_KEY', '');
  await assert.rejects(createAssetFromUrl('https://example.invalid/video', { playbackPolicy: 'signed' }), /requires MUX_SIGNING/);
  await assert.rejects(signPlayback('signedPlayback'), /requires MUX_SIGNING/);
});

test('new protected assets request signed-only playback; real SDK signs a verifiable video JWT locally', async (context) => {
  const { mux, createAssetFromUrl, getPlaybackId, signPlayback } = require('../src/mux');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  mockEnv(context, 'MUX_SIGNING_KEY_ID', 'synthetic-signing-key');
  mockEnv(context, 'MUX_SIGNING_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString('base64'));
  const calls = [];
  context.mock.method(mux.video.assets, 'create', async (...args) => { calls.push(args); return { id: 'mock' }; });
  await createAssetFromUrl('https://example.invalid/video', { playbackPolicy: 'signed', passthrough: 'bound-revision' });
  assert.deepEqual(calls[0][0].playback_policies, ['signed']);
  assert.equal(calls[0][1].maxRetries, 0);
  assert.equal(getPlaybackId({ playback_ids: [{ policy: 'public', id: 'unsafe' }] }, 'signed'), null);
  const token = await signPlayback('signedPlayback', 7200);
  const [header, body, signature] = token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url'));
  assert.equal(payload.sub, 'signedPlayback');
  assert.equal(payload.aud, 'v');
  assert.ok(payload.exp >= Math.floor(Date.now() / 1000) + 8095);
  assert.equal(payload.kid, 'synthetic-signing-key');
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${body}`), publicKey, Buffer.from(signature, 'base64url')), true);
});

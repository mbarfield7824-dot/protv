const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const {
  AdMeasurementInputError,
  AdMeasurementOrderError,
  AdMeasurementRateLimitError,
  AdMeasurementService,
  SERVED_LIMIT_PER_HOUR,
  automatedAgent,
  measurementKey,
  validateEvent,
} = require('../src/ads/adMeasurement');
const { createAdsRouter } = require('../src/ads/router');
const { MemoryPlacementSettings } = require('../src/ads/placementSettings');

const KEY = 'ad-measurement-test-key-'.padEnd(48, 'x');
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const INCREMENT = Symbol('increment');

class MemoryFirestore {
  constructor() { this.documents = new Map(); this.queue = Promise.resolve(); this.writes = 0; }
  apply(path, value, merge) {
    this.writes += 1;
    const current = merge ? structuredClone(this.documents.get(path) || {}) : {};
    for (const [key, next] of Object.entries(value)) {
      current[key] = next && next[INCREMENT] !== undefined ? (Number(current[key]) || 0) + next[INCREMENT] : structuredClone(next);
    }
    this.documents.set(path, current);
  }
  snapshot(path, id) {
    const value = this.documents.get(path);
    return { id, exists: value !== undefined, data: () => structuredClone(value) };
  }
  collection(name) {
    const docs = () => [...this.documents.entries()].filter(([path]) => path.startsWith(`${name}/`))
      .map(([path]) => this.snapshot(path, path.slice(name.length + 1)));
    const query = (filters) => ({
      where: (field, op, value) => query([...filters, [field, op, value]]),
      get: async () => ({ docs: docs().filter((doc) => filters.every(([field, op, value]) => {
        const actual = doc.data()[field];
        return op === '>=' ? actual >= value : op === '<=' ? actual <= value : actual === value;
      })) }),
    });
    return {
      doc: (id) => ({ path: `${name}/${id}`, id, set: async (value, options = {}) => this.apply(`${name}/${id}`, value, options.merge) }),
      ...query([]),
    };
  }
  async runTransaction(operation) {
    const result = this.queue.then(() => {
      const pending = [];
      return operation({
        get: async (ref) => this.snapshot(ref.path, ref.id),
        set: (ref, value, options = {}) => pending.push([ref.path, value, options.merge]),
      }).then((value) => { for (const write of pending) this.apply(...write); return value; });
    });
    this.queue = result.catch(() => {});
    return result;
  }
  daily() {
    return [...this.documents.entries()].filter(([path]) => path.startsWith('adDailyMetrics/')).map(([, value]) => value);
  }
  total(field) { return this.daily().reduce((sum, row) => sum + (Number(row[field]) || 0), 0); }
}

function harness() {
  let now = Date.UTC(2026, 10, 8, 15, 0, 0);
  const db = new MemoryFirestore();
  const service = new AdMeasurementService({ db, key: KEY, now: () => now, increment: (value) => ({ [INCREMENT]: value }) });
  const context = { userAgent: BROWSER, clientAddress: '203.0.113.7' };
  const display = (extra = {}) => service.startSession({ channel: 'display', placement: 'native_banner', scope: 'home', ...context, ...extra });
  const video = (extra = {}) => service.startSession({ channel: 'video', placement: 'preroll', scope: 'title_abc', ...context, ...extra });
  const send = (token, eventType, extra = {}) => service.recordEvent({
    event: validateEvent({ token, position: 1, eventType, ...extra }), userAgent: BROWSER, clientAddress: '203.0.113.7', ...extra.context && { userAgent: extra.context },
  });
  return { db, service, display, video, send, advance: (ms) => { now += ms; } };
}

const sendRaw = (h, token, body, userAgent = BROWSER, clientAddress = '203.0.113.7') =>
  h.service.recordEvent({ event: validateEvent({ token, ...body }), userAgent, clientAddress });

test('a request is never an impression; a served impression needs the ad to render', async () => {
  const h = harness();
  const { token } = await h.display();
  assert.equal(h.db.total('requests'), 1);
  assert.equal(h.db.total('served'), 0, 'requested only: nothing delivered');
  await h.send(token, 'served', { measurable: true });
  assert.equal(h.db.total('served'), 1);
  assert.equal(h.db.total('measurable'), 1);
});

test('re-renders, retries, refreshes of the same unit and repeated SDK events count once', async () => {
  const h = harness();
  const { token } = await h.display();
  const first = await h.send(token, 'served', { measurable: true });
  const results = await Promise.all([1, 2, 3].map(() => h.send(token, 'served', { measurable: true })));
  assert.equal(first.recorded, true);
  assert.ok(results.every((result) => result.duplicate === true));
  h.advance(1500);
  await h.send(token, 'viewable');
  await h.send(token, 'viewable');
  await h.send(token, 'click');
  await h.send(token, 'click');
  assert.deepEqual([h.db.total('served'), h.db.total('viewable'), h.db.total('clicks')], [1, 1, 1]);
});

test('separate exposures count independently: a new page load and a second ad in a video pod', async () => {
  const h = harness();
  for (let load = 0; load < 2; load += 1) {
    const { token } = await h.display();
    await h.send(token, 'served', { measurable: true });
  }
  const { token } = await h.video();
  await sendRaw(h, token, { position: 1, eventType: 'start', measurable: true });
  await sendRaw(h, token, { position: 1, eventType: 'served' });
  await sendRaw(h, token, { position: 2, eventType: 'start', measurable: true });
  await sendRaw(h, token, { position: 2, eventType: 'served' });
  const rows = h.db.daily();
  assert.equal(rows.find((row) => row.channel === 'display').served, 2);
  assert.equal(rows.find((row) => row.channel === 'video').served, 2);
  assert.equal(rows.find((row) => row.channel === 'video').starts, 2);
});

test('hidden or unmeasurable ads are served but never viewable, and viewability needs one continuous second', async () => {
  const h = harness();
  const hidden = (await h.display()).token;
  await h.send(hidden, 'served', { measurable: false });
  h.advance(5000);
  await assert.rejects(h.send(hidden, 'viewable'), AdMeasurementOrderError);
  assert.equal(h.db.total('measurable'), 0);

  const early = (await h.display()).token;
  await h.send(early, 'served', { measurable: true });
  h.advance(400);
  await assert.rejects(h.send(early, 'viewable'), /one continuous second/);
  const never = (await h.display()).token;
  await assert.rejects(h.send(never, 'viewable'), AdMeasurementOrderError, 'no viewable impression without a served one');
  assert.equal(h.db.total('served'), 2);
  assert.equal(h.db.total('viewable'), 0);
});

test('video: starts, quartiles and completions follow the ad, and blocked playback is a failure, not an impression', async () => {
  const h = harness();
  const { token } = await h.video();
  await assert.rejects(sendRaw(h, token, { position: 1, eventType: 'complete' }), /requires the ad to start/);
  await assert.rejects(sendRaw(h, token, { position: 1, eventType: 'midpoint' }), /requires the ad to start/);
  await sendRaw(h, token, { position: 1, eventType: 'start', measurable: true });
  await sendRaw(h, token, { position: 1, eventType: 'served' });
  await assert.rejects(sendRaw(h, token, { position: 1, eventType: 'complete' }), /implausibly quickly/);
  await assert.rejects(sendRaw(h, token, { position: 1, eventType: 'viewable' }), /two continuous seconds/);
  h.advance(2500);
  for (const eventType of ['viewable', 'firstQuartile', 'midpoint', 'thirdQuartile', 'complete']) await sendRaw(h, token, { position: 1, eventType });
  await assert.rejects(sendRaw(h, token, { position: 1, eventType: 'skip' }), /completed ad cannot be skipped/);
  const row = h.db.daily().find((item) => item.channel === 'video');
  assert.deepEqual([row.served, row.starts, row.viewable, row.firstQuartiles, row.midpoints, row.thirdQuartiles, row.completes],
    [1, 1, 1, 1, 1, 1, 1]);

  const blocked = (await h.video()).token;
  await sendRaw(h, blocked, { position: 0, eventType: 'error', reason: 'sdk_unavailable' });
  await assert.rejects(sendRaw(h, blocked, { position: 0, eventType: 'served' }), AdMeasurementInputError, 'position 0 is a failed break');
  const failed = (await h.video()).token;
  await sendRaw(h, failed, { position: 1, eventType: 'error', reason: 'playback_blocked' });
  await assert.rejects(sendRaw(h, failed, { position: 1, eventType: 'served' }), /failed ad cannot be served/);
  const interrupted = (await h.video()).token;
  await sendRaw(h, interrupted, { position: 1, eventType: 'start', measurable: true });
  await sendRaw(h, interrupted, { position: 1, eventType: 'error', reason: 'ad_error' });
  const after = h.db.daily().find((item) => item.channel === 'video');
  assert.equal(after.errors, 2);
  assert.equal(after.interrupted, 1);
  assert.equal(after.served, 1, 'failures never add served impressions');
});

test('automated clients, excessive frequency and test or Administrator activity stay out of the valid totals', async () => {
  const h = harness();
  const bot = (await h.display({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' })).token;
  await h.send(bot, 'served', { measurable: true });
  const webdriver = (await h.display({ automated: true })).token;
  await h.send(webdriver, 'served', { measurable: true });
  const scripted = (await h.display()).token;
  await sendRaw(h, scripted, { position: 1, eventType: 'served', measurable: true }, 'python-requests/2.31');
  const admin = (await h.display({ user: { uid: 'admin', admin: true } })).token;
  await h.send(admin, 'served', { measurable: true });
  const testRun = (await h.display({ test: true })).token;
  await h.send(testRun, 'served', { measurable: true });
  assert.equal(h.db.total('served'), 0);
  assert.equal(h.db.total('invalid_served'), 3);
  assert.equal(h.db.total('test_served'), 2);

  for (let index = 0; index < SERVED_LIMIT_PER_HOUR + 5; index += 1) {
    const { token } = await h.display();
    await h.send(token, 'served', { measurable: true });
  }
  assert.equal(h.db.total('served'), SERVED_LIMIT_PER_HOUR - 5, 'every served ad from the address counts toward its hourly cap');
  assert.equal(h.db.total('invalid_served'), 3 + 10);
  assert.ok(automatedAgent(''), 'a missing user agent is not a browser');
  assert.equal(automatedAgent(BROWSER), false);
});

test('only sessions this server signed, for their own placement, before they expire', async () => {
  const h = harness();
  const { token } = await h.display();
  const [version, payload, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), tr: 'valid', sc: 'title' })).toString('base64url');
  await assert.rejects(h.send(`${version}.${forged}.${signature}`, 'served'), /invalid/);
  await assert.rejects(sendRaw(h, token, { position: 2, eventType: 'served' }), /position/);
  await assert.rejects(h.send(token, 'complete'), /does not apply/);
  assert.throws(() => validateEvent({ token, position: 1, eventType: 'served', viewerEmail: 'x@example.com' }), /unsupported fields/);
  assert.throws(() => validateEvent({ token, position: 1, eventType: 'error' }), /failure reason/);
  h.advance(31 * 60 * 1000);
  await assert.rejects(h.send(token, 'served'), /expired/);
  const other = new AdMeasurementService({ db: h.db, key: 'another-key-'.padEnd(40, 'y'), increment: (value) => ({ [INCREMENT]: value }) });
  await assert.rejects(other.recordEvent({ event: validateEvent({ token, position: 1, eventType: 'served' }), userAgent: BROWSER, clientAddress: '1.1.1.1' }), /invalid/);
});

test('session signing is rate limited per address', async () => {
  const h = harness();
  for (let index = 0; index < 120; index += 1) await h.display({ clientAddress: '198.51.100.4' });
  await assert.rejects(h.display({ clientAddress: '198.51.100.4' }), AdMeasurementRateLimitError);
  await h.display({ clientAddress: '198.51.100.5' });
  h.advance(60_000);
  await h.display({ clientAddress: '198.51.100.4' });
});

test('campaign attribution: counts stay with their placement, page type and title, and reports add them up', async () => {
  const h = harness();
  const home = (await h.display()).token;
  const title = (await h.display({ scope: 'title' })).token;
  const preroll = (await h.video()).token;
  await h.send(home, 'served', { measurable: true });
  await h.send(title, 'served', { measurable: true });
  await sendRaw(h, preroll, { position: 1, eventType: 'start', measurable: true });
  await sendRaw(h, preroll, { position: 1, eventType: 'served' });
  const ids = [...h.db.documents.keys()].filter((path) => path.startsWith('adDailyMetrics/')).sort();
  assert.deepEqual(ids, [
    'adDailyMetrics/2026-11-08__display__native_banner__home',
    'adDailyMetrics/2026-11-08__display__native_banner__title',
    'adDailyMetrics/2026-11-08__video__preroll__title_abc',
  ]);
  const report = await h.service.report({ from: '2026-11-01', to: '2026-11-08' });
  const banner = report.placements.find((row) => row.placement === 'native_banner');
  assert.equal(banner.valid.requests, 2);
  assert.equal(banner.valid.served, 2);
  assert.deepEqual(report.titles.map((row) => [row.videoId, row.served]), [['title_abc', 1]]);
  assert.equal((await h.service.report({ from: '2026-11-09', to: '2026-11-30' })).placements.length, 0);
});

test('no viewer identity is stored, and historical metrics are reported as recorded, never converted', async () => {
  const h = harness();
  h.db.documents.set('adTitleMetrics/old_title', { videoId: 'old_title', playerImpressions: 7, providerImpressions: 1000, grossRevenueCents: 500 });
  const { token } = await h.display({ user: { uid: 'viewer-1', email: 'viewer@example.com' } });
  await h.send(token, 'served', { measurable: true });
  const stored = JSON.stringify([...h.db.documents.entries()]);
  for (const value of ['viewer-1', 'viewer@example.com', '203.0.113.7', 'Chrome/130']) assert.equal(stored.includes(value), false, `${value} is not stored`);
  assert.deepEqual(h.db.documents.get('adTitleMetrics/old_title'), { videoId: 'old_title', playerImpressions: 7, providerImpressions: 1000, grossRevenueCents: 500 });
  assert.deepEqual(await h.service.legacyTotals(), { playerImpressions: 7, providerImpressions: 1000 });
});

test('each event costs one transaction with at most three writes', async () => {
  const h = harness();
  const { token } = await h.display();
  const before = h.db.writes;
  await h.send(token, 'served', { measurable: true });
  assert.ok(h.db.writes - before <= 3);
  const duplicate = h.db.writes;
  await h.send(token, 'served', { measurable: true });
  assert.equal(h.db.writes, duplicate, 'a duplicate writes nothing');
});

test('the measurement key is derived from the playback secret but never equals it', () => {
  const playback = 'p'.repeat(40);
  const key = measurementKey({ PLAYBACK_TRACKING_SECRET: playback });
  assert.equal(key.length, 64);
  assert.notEqual(key, playback);
  assert.equal(measurementKey({}), '');
  assert.equal(measurementKey({ AD_MEASUREMENT_SECRET: 'a'.repeat(32), PLAYBACK_TRACKING_SECRET: playback }), 'a'.repeat(32));
});

async function start(t, { enabled = true, admin = true, allowEvent } = {}) {
  const h = harness();
  const app = express();
  app.use(express.json());
  app.use('/ads', createAdsRouter({
    store: {}, placements: new MemoryPlacementSettings({ nativeBannerEnabled: enabled }), audit: async () => {},
    measurement: h.service, identify: async () => null, ...(allowEvent ? { allowEvent } : {}), clientAddress: () => '203.0.113.9', getVideo: async (id) => ({ id, title: 'Test title' }),
    verifyAdmin: (req, res, next) => (admin ? next() : res.status(401).json({ error: 'No token provided' })),
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/ads`;
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER, ...headers }, body: JSON.stringify(body) });
  return { h, base, post };
}

test('HTTP: display sessions need the placement switched on; events are validated and never cached', async (t) => {
  const off = await start(t, { enabled: false });
  assert.deepEqual(await (await off.post('/measurement/session', { channel: 'display', placement: 'native_banner', page: 'home' })).json(), { enabled: false });
  assert.equal(off.h.db.total('requests'), 0);

  const { h, post } = await start(t);
  const session = await post('/measurement/session', { channel: 'display', placement: 'native_banner', page: 'home' });
  assert.equal(session.status, 201);
  assert.equal(session.headers.get('cache-control'), 'no-store');
  const { token } = await session.json();
  assert.equal((await post('/measurement/events', { token, position: 1, eventType: 'served', measurable: true })).status, 201);
  assert.equal((await post('/measurement/events', { token, position: 1, eventType: 'served', measurable: true })).status, 200);
  assert.equal((await post('/measurement/events', { token, position: 1, eventType: 'viewable' })).status, 409);
  assert.equal((await post('/measurement/events', { token: 'm1.bad.token', position: 1, eventType: 'served' })).status, 400);
  assert.equal((await post('/measurement/session', { channel: 'display', placement: 'popunder', page: 'home' })).status, 400);
  const testSession = await (await post('/measurement/session', { channel: 'display', placement: 'native_banner', page: 'home' }, { 'X-PROtv-Ad-Test': '1' })).json();
  await post('/measurement/events', { token: testSession.token, position: 1, eventType: 'served', measurable: true });
  assert.equal(h.db.total('served'), 1);
  assert.equal(h.db.total('test_served'), 1);
});

test('HTTP: the measurement report is for Administrators only', async (t) => {
  const denied = await start(t, { admin: false });
  assert.equal((await fetch(`${denied.base}/admin/measurement`)).status, 401);
  const { base } = await start(t);
  assert.equal((await fetch(`${base}/admin/measurement?from=2026-11-09&to=2026-11-01`)).status, 400);
  const report = await (await fetch(`${base}/admin/measurement?from=2026-11-01&to=2026-11-08`)).json();
  assert.deepEqual(report.legacy, { playerImpressions: 0, providerImpressions: 0 });
  assert.deepEqual(report.placements, []);
});

test('HTTP: measurement events from one address are capped, which can only undercount', async (t) => {
  let allowed = 2;
  const { post } = await start(t, { allowEvent: () => (allowed -= 1) >= 0 });
  const { token } = await (await post('/measurement/session', { channel: 'display', placement: 'native_banner', page: 'home' })).json();
  assert.equal((await post('/measurement/events', { token, position: 1, eventType: 'served', measurable: true })).status, 201);
  assert.equal((await post('/measurement/events', { token, position: 1, eventType: 'click' })).status, 201);
  const limited = await post('/measurement/events', { token, position: 1, eventType: 'error', reason: 'empty' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
});

test('reports state when measurement began, so earlier days are never presented as measured zeros', async () => {
  const h = harness();
  const before = await h.service.report({ from: '2026-10-10', to: '2026-11-08' });
  assert.equal(before.measurementStartedAt, '2026-11-08T19:47:49Z');
  assert.equal(before.measuredFrom, '2026-11-08T19:47:49Z', 'a 30-day period is measured only from go-live');
  assert.equal((await h.service.report({ from: '2026-11-01', to: '2026-11-07' })).measuredFrom, null, 'entirely before go-live: not measured');
  assert.equal((await h.service.report({ from: '2026-11-09', to: '2026-11-10' })).measuredFrom, '2026-11-09T00:00:00Z');
});

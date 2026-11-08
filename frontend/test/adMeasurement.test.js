import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
let vite, measurement;

// A controllable IntersectionObserver: tests set how much of the element is on screen.
const observers = [];
class FakeIntersectionObserver {
  constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
  observe(target) { this.targets.push(target); }
  disconnect() { this.targets = []; this.disconnected = true; }
}
function show(ratio) {
  for (const observer of observers) {
    if (!observer.disconnected) observer.callback(observer.targets.map((target) => ({ target, isIntersecting: ratio > 0, intersectionRatio: ratio })));
  }
}
let visibility = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

before(async () => {
  vite = await createServer({ configFile: false, envFile: false, root: frontendRoot, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  measurement = await vite.ssrLoadModule('/src/ads/adMeasurement.js');
});
after(async () => { await vite?.close(); dom.window.close(); });
beforeEach(() => {
  observers.length = 0;
  visibility = 'visible';
  window.IntersectionObserver = FakeIntersectionObserver;
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, value: false });
});

function recorder({ fail = [] } = {}) {
  const sent = [];
  let clock = 0;
  const send = async (event) => {
    const status = fail.shift();
    if (status) throw Object.assign(new Error('failed'), status === 'network' ? {} : { status });
    sent.push(event);
  };
  return { sent, send, now: () => clock, advance: (ms) => { clock += ms; }, wait: async (ms) => { clock += ms; } };
}

test('each event is sent once per ad position, in order, carrying nothing about the viewer', async () => {
  const r = recorder();
  const measurer = measurement.createAdMeasurer(Promise.resolve('token-1'), r);
  assert.equal(measurer.record(1, 'served', { measurable: true }), true);
  assert.equal(measurer.record(1, 'served', { measurable: true }), false, 're-renders and repeated SDK events are ignored');
  measurer.record(1, 'click');
  measurer.record(2, 'served');
  await measurer.settled();
  assert.deepEqual(r.sent, [
    { token: 'token-1', position: 1, eventType: 'served', measurable: true },
    { token: 'token-1', position: 1, eventType: 'click' },
    { token: 'token-1', position: 2, eventType: 'served' },
  ]);
});

test('retries once after a network or server failure, never after the server refuses an event', async () => {
  const flaky = recorder({ fail: ['network'] });
  const first = measurement.createAdMeasurer('token', flaky);
  first.record(1, 'served');
  await first.settled();
  assert.equal(flaky.sent.length, 1);

  const refused = recorder({ fail: [409, 409] });
  const second = measurement.createAdMeasurer('token', refused);
  second.record(1, 'viewable');
  await second.settled();
  assert.equal(refused.sent.length, 0);

  const down = recorder({ fail: [503, 503, 503] });
  const third = measurement.createAdMeasurer('token', down);
  third.record(1, 'served');
  await third.settled();
  assert.equal(down.sent.length, 0, 'gives up after one retry: the ad is undercounted, never overcounted');
});

test('without a measurement session nothing is sent and the page is unaffected', async () => {
  for (const token of [Promise.resolve(null), Promise.reject(new Error('rate limited'))]) {
    const r = recorder();
    const measurer = measurement.createAdMeasurer(token, r);
    measurer.record(1, 'served');
    await measurer.settled();
    assert.equal(r.sent.length, 0);
  }
});

test('dependent events wait until the required time after the server accepted their start', async () => {
  const r = recorder();
  const measurer = measurement.createAdMeasurer('token', r);
  measurer.record(1, 'start', { measurable: true });
  measurer.record(1, 'viewable', {}, { after: 'start', ms: 2000 });
  await measurer.settled();
  assert.ok(r.now() >= 2000, 'held until two seconds after the start was accepted');
  const orphan = recorder();
  const lonely = measurement.createAdMeasurer('token', orphan);
  lonely.record(1, 'viewable', {}, { after: 'served', ms: 1000 });
  await lonely.settled();
  assert.equal(orphan.sent.length, 0, 'a viewable impression without a recorded render is never sent');
});

test('automated browsers are flagged so the server counts them as invalid traffic', async () => {
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, value: true });
  const r = recorder();
  const measurer = measurement.createAdMeasurer('token', r);
  measurer.record(1, 'served');
  await measurer.settled();
  assert.equal(r.sent[0].automated, true);
});

test('viewability: half the pixels, visible tab, one continuous second; hidden or brief exposure never counts', async () => {
  const element = document.createElement('div');
  let viewable = 0;
  const watch = measurement.watchViewability(element, { durationMs: 60, onViewable: () => { viewable += 1; } });
  assert.equal(watch.measurable, true);
  show(0.3);
  await pause(90);
  assert.equal(viewable, 0, 'less than half on screen');
  show(0.6);
  await pause(30);
  show(0.2);
  await pause(60);
  assert.equal(viewable, 0, 'an interruption restarts the clock');
  show(0.6);
  visibility = 'hidden';
  document.dispatchEvent(new window.Event('visibilitychange'));
  await pause(90);
  assert.equal(viewable, 0, 'a background tab is not viewable');
  visibility = 'visible';
  document.dispatchEvent(new window.Event('visibilitychange'));
  await pause(90);
  assert.equal(viewable, 1);
  show(1);
  await pause(90);
  assert.equal(viewable, 1, 'counted once');
  assert.equal(observers[0].disconnected, true);
});

test('video viewability only accrues while the ad plays', async () => {
  const element = document.createElement('div');
  let playing = false;
  let viewable = 0;
  const watch = measurement.watchViewability(element, { durationMs: 50, active: () => playing, onViewable: () => { viewable += 1; } });
  show(1);
  await pause(80);
  assert.equal(viewable, 0, 'paused or blocked playback is never viewable');
  playing = true;
  watch.update();
  await pause(80);
  assert.equal(viewable, 1);
});

test('unsupported measurement is reported as not measurable rather than guessed', () => {
  delete window.IntersectionObserver;
  assert.equal(measurement.watchViewability(document.createElement('div'), { durationMs: 1, onViewable() {} }).measurable, false);
});

test('clicks: a link inside the unit counts; clicks elsewhere do not', () => {
  const container = document.createElement('div');
  container.innerHTML = '<a href="https://advertiser.example/">Ad</a><span>label</span>';
  document.body.append(container);
  let clicks = 0;
  const stop = measurement.watchClicks(container, () => { clicks += 1; });
  container.querySelector('span').click();
  container.querySelector('a').addEventListener('click', (event) => event.preventDefault());
  container.querySelector('a').click();
  document.body.click();
  assert.equal(clicks, 1);
  stop();
  container.querySelector('a').click();
  assert.equal(clicks, 1);
});

test('page attribution uses broad page types only', () => {
  const cases = { '/': 'home', '/title/the-film': 'title', '/series/a-show': 'series', '/podcasts/abc': 'podcast',
    '/podcast/me-and-my-white-friend': 'podcast', '/movies': 'browse', '/series': 'browse', '/cartoons': 'browse', '/search': 'other' };
  for (const [pathname, type] of Object.entries(cases)) assert.equal(measurement.pageType(pathname), type, pathname);
});

test('IMA failures map to reported reasons', () => {
  const error = (code) => ({ getErrorCode: () => code });
  assert.equal(measurement.imaFailureReason(error(1009)), 'empty');
  assert.equal(measurement.imaFailureReason(error(1205)), 'playback_blocked');
  assert.equal(measurement.imaFailureReason(error(301)), 'timeout');
  assert.equal(measurement.imaFailureReason(new Error('x')), 'ad_error');
});

test('video pre-roll: IMA events become measured events per pod position, with blocked or failed ads as failures', async () => {
  const names = ['LOADED', 'IMPRESSION', 'STARTED', 'PAUSED', 'RESUMED', 'FIRST_QUARTILE', 'MIDPOINT', 'THIRD_QUARTILE', 'CLICK', 'COMPLETE', 'SKIPPED'];
  const ima = { AdEvent: { Type: Object.fromEntries(names.map((name) => [name, name.toLowerCase()])) } };
  const listeners = new Map();
  const adsManager = { addEventListener: (type, handler) => listeners.set(type, [...(listeners.get(type) || []), handler]) };
  const fire = (name, position) => (listeners.get(name.toLowerCase()) || []).forEach((handler) =>
    handler({ getAd: () => ({ getAdPodInfo: () => ({ getAdPosition: () => position }) }) }));
  const recorded = [];
  const measurer = { record: (position, eventType, details = {}) => { recorded.push([position, eventType, details.measurable ?? details.reason ?? null]); } };
  const tracking = measurement.attachImaMeasurement({ ima, adsManager, container: document.createElement('div'), measurer });

  for (const name of ['LOADED', 'STARTED', 'IMPRESSION', 'FIRST_QUARTILE', 'MIDPOINT', 'CLICK', 'THIRD_QUARTILE', 'COMPLETE']) fire(name, 1);
  for (const name of ['LOADED', 'STARTED', 'IMPRESSION', 'SKIPPED']) fire(name, 2);
  fire('LOADED', 3);
  tracking.fail({ getErrorCode: () => 1205 });
  assert.deepEqual(recorded, [
    [1, 'start', true], [1, 'served', null], [1, 'firstQuartile', null], [1, 'midpoint', null], [1, 'click', null],
    [1, 'thirdQuartile', null], [1, 'complete', null],
    [2, 'start', true], [2, 'served', null], [2, 'skip', null],
    [3, 'error', 'playback_blocked'],
  ]);
  tracking.stop();
});

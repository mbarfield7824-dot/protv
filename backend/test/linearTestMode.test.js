// PROtv LIVE Administrator test mode: the real schedule engine evaluated at a simulated moment, for one admin only.
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { MemoryLinearStore } = require('../src/linear/store');
const { createLinearService } = require('../src/linear/service');
const { createAdminLinearRouter, createLinearRouter } = require('../src/linear/router');

// Tuesday 1 December 2026, 7:00 AM Eastern (real time in these tests).
const NOW = Date.parse('2026-12-01T12:00:00.000Z');
const at = (iso) => Date.parse(iso);
const movie = (overrides = {}) => ({
  id: 'movie-1', contentType: 'MOVIE', title: 'His Girl Friday', approvalStatus: 'approved', status: 'ready',
  muxPlaybackId: 'movie-playback', duration: 5520, ...overrides,
});
const secondMovie = movie({ id: 'movie-2', title: 'D.O.A.', muxPlaybackId: 'doa-playback', duration: 4500 });
const heldEpisode = (overrides = {}) => ({
  id: 'iron-1', contentType: 'EPISODE', title: 'Hell Has No Fury', episodeTitle: 'Hell Has No Fury', description: 'Secret synopsis',
  seriesTitle: 'Ironborn', seasonNumber: 1, episodeNumber: 1, creatorEpisodeId: 'e1',
  approvalStatus: 'draft', status: 'held', releaseStatus: 'held', muxPlaybackId: null, duration: 80, ...overrides,
});
const spot = (id, overrides = {}) => ({
  id, type: 'promo', title: `Spot ${id}`, advertiser: '', status: 'approved', source: 'upload', muxPlaybackId: `pb-${id}`,
  playbackPolicy: 'public', durationSeconds: 23, flightStart: null, flightEnd: null, createdAt: '2026-11-20T00:00:00Z', ...overrides,
});
const confirmed = { status: 'confirmed', basis: 'Signed agreement clause 2.1 streams the work through the PROtv Services.' };

function setup({ videos = [movie(), secondMovie, heldEpisode()], creatives = [spot('ad'), spot('bumper', { durationSeconds: 6 })], cacheMs = 0, settings = {} } = {}) {
  const clock = { now: NOW };
  const rights = { 'title_movie-1': confirmed, 'title_movie-2': confirmed, 'title_iron-1': confirmed };
  const store = new MemoryLinearStore({ videos, rights, settings, creatives });
  const service = createLinearService({ store, now: () => clock.now, cacheMs, signPlaybackToken: async (id) => `token:${id}` });
  return { clock, store, service };
}

async function approved(service, input) {
  const entry = await service.createEntry(input, 'admin');
  return service.approveEntry(entry.id, { acknowledgeWarnings: true }, 'admin');
}

// 7:00 movie (92 min) → 8:32 break (60 s: commercial, bumper, card) → 8:33 D.O.A.; Thursday 8 PM premiere with a countdown.
async function schedule(service) {
  const first = await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T07:00' });
  const brk = await service.createEntry({ kind: 'break', durationSeconds: 60, startAtLocal: '2026-12-01T08:32' }, 'admin');
  await service.setBreakPod(brk.id, { creativeIds: ['ad', 'bumper'] }, 'admin');
  await service.approveEntry(brk.id, { acknowledgeWarnings: true }, 'admin');
  const second = await approved(service, { videoId: 'movie-2', programType: 'movie', startAtLocal: '2026-12-01T08:33' });
  const premiere = await approved(service, { videoId: 'iron-1', programType: 'premiere', startAtLocal: '2026-12-03T20:00' });
  const countdown = await service.addCountdown(premiere.id, { minutes: 10, artworkUrl: 'https://watchprotv.com/api/posters/ironborn.jpg' }, 'admin');
  await service.approveEntry(countdown.id, { acknowledgeWarnings: true }, 'admin');
  return { first, brk, second, premiere, countdown };
}

async function listen(t, { service, admin }) {
  const app = express();
  app.use(express.json());
  const user = admin ? { uid: 'admin-uid', admin: true } : { uid: 'viewer-uid', admin: false };
  const recorded = [];
  const analytics = { record: async (event) => { recorded.push(event); return { recorded: true }; }, report: async () => ({}) };
  app.use('/v1/linear', createLinearRouter({
    service, analytics, rateLimit: async () => {}, clientAddress: () => '127.0.0.1',
    authenticate: (req, res, next) => { req.user = user; next(); },
  }));
  app.use('/admin/linear', createAdminLinearRouter({
    service, analytics, audit: async () => {},
    verifyAdmin: (req, res, next) => (admin ? (req.user = user, next()) : res.status(403).json({ error: 'Admin access is required.' })),
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path) => {
    const response = await fetch(`${base}${path}`);
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return { call, recorded };
}

test('only an Administrator can use test mode; viewers and the public channel API cannot set the time', async (t) => {
  const { service } = setup();
  await schedule(service);
  const viewer = await listen(t, { service, admin: false });
  assert.equal((await viewer.call(`/admin/linear/test/channel?at=${at('2026-12-01T13:32:10Z')}`)).status, 403);

  const admin = await listen(t, { service, admin: true });
  const simulated = await admin.call(`/admin/linear/test/channel?at=${at('2026-12-01T13:32:10Z')}`);
  assert.equal(simulated.status, 200);
  assert.equal(simulated.headers.get('cache-control'), 'no-store');
  assert.equal(simulated.body.channel.simulated, true);
  assert.equal(simulated.body.channel.actualServerTime, new Date(NOW).toISOString());
  assert.equal(simulated.body.serverTimeMs, at('2026-12-01T13:32:10Z'));
  assert.equal(simulated.body.now.kind, 'break');

  // The public channel route ignores any time parameter, even for an Administrator.
  const real = await admin.call(`/v1/linear/channel?preview=1&at=${at('2026-12-01T13:32:10Z')}&simulatedAt=${at('2026-12-01T13:32:10Z')}`);
  assert.equal(real.status, 200);
  assert.equal(real.body.serverTimeMs, NOW);
  assert.equal(real.body.channel.simulated, undefined);
  assert.equal(real.body.now.title, 'His Girl Friday');
});

test('test times are validated: whole milliseconds, one day back to 35 days ahead', async (t) => {
  const { service } = setup();
  const { call } = await listen(t, { service, admin: true });
  for (const value of ['', 'abc', '2026-12-01T12:00:00Z', String(NOW - 2 * 86_400_000), String(NOW + 36 * 86_400_000), '1.5']) {
    assert.equal((await call(`/admin/linear/test/channel?at=${encodeURIComponent(value)}`)).status, 400, value);
  }
  assert.equal((await call(`/admin/linear/test/channel?at=${NOW + 34 * 86_400_000}`)).status, 200);
  await assert.rejects(service.channelState({ simulatedAt: NOW }), /only available in Administrator preview/);
});

test('simulated time is isolated: it never moves the broadcast clock, the viewer cache, the schedule or analytics', async (t) => {
  const { service, store } = setup({ cacheMs: 30_000, settings: { status: 'public' } });
  await schedule(service);
  const before = JSON.stringify([...store.entries.values()]);
  let reads = 0;
  const listEntries = store.listEntries.bind(store);
  store.listEntries = async (...args) => { reads += 1; return listEntries(...args); };

  const viewerState = await service.channelState();
  assert.equal(viewerState.now.title, 'His Girl Friday');
  assert.equal(reads, 1);
  const simulated = await service.channelState({ preview: true, simulatedAt: at('2026-12-04T00:55:00Z') });
  assert.equal(simulated.now.kind, 'countdown', 'two days ahead is far outside the viewer cache window');
  assert.equal(reads, 2, 'test mode reads its own window');
  const again = await service.channelState();
  assert.equal(reads, 2, 'viewers still use their cached window; test mode did not replace it');
  assert.equal(again.serverTimeMs, NOW);
  assert.equal(again.now.title, 'His Girl Friday');
  assert.equal(again.channel.simulated, undefined);
  assert.equal(JSON.stringify([...store.entries.values()]), before, 'the approved schedule is unchanged');

  const { call, recorded } = await listen(t, { service, admin: true });
  await call(`/admin/linear/test/channel?at=${at('2026-12-01T13:32:00Z')}`);
  assert.equal(recorded.length, 0, 'test mode records no channel analytics');
});

test('a simulated break plays the commercial, then the bumper, then the PROtv card, then hands over to the next program', async () => {
  const { service } = setup();
  await schedule(service);
  const view = (iso) => service.channelState({ preview: true, simulatedAt: at(iso) });

  let state = await view('2026-12-01T13:31:55Z');
  assert.equal(state.now.title, 'His Girl Friday');
  assert.equal(state.now.playback.muxPlaybackId, 'movie-playback');
  assert.equal(state.refreshAfterMs, 5_000, 'a few seconds before the transition, the handoff is due in 5 s');
  assert.equal(state.next.kind, 'break', 'Up next at the simulated time is the commercial break');

  state = await view('2026-12-01T13:32:00Z');
  assert.equal(state.next.title, 'D.O.A.');
  assert.equal(state.now.kind, 'break');
  assert.equal(state.now.spot.creativeId, 'ad');
  assert.equal(state.now.playback.muxPlaybackId, 'pb-ad');
  assert.equal(state.now.playback.offsetSeconds, 0);

  state = await view('2026-12-01T13:32:25Z');
  assert.equal(state.now.spot.creativeId, 'bumper');
  assert.equal(state.now.playback.offsetSeconds, 2);

  state = await view('2026-12-01T13:32:40Z');
  assert.equal(state.now.kind, 'break');
  assert.equal(state.now.playback, undefined, 'the PROtv card fills the rest of the break');

  state = await view('2026-12-01T13:33:03Z');
  assert.equal(state.now.title, 'D.O.A.');
  assert.equal(state.now.playback.muxPlaybackId, 'doa-playback');
  assert.equal(state.now.playback.offsetSeconds, 3, 'joins the next program in sync');
  assert.ok(state.guide.find((item) => item.onNow).title === 'D.O.A.', 'the guide shows Now Playing at the simulated time');
});

test('a simulated premiere countdown hands over to its episode, keeping release and rights safeguards', async () => {
  const { service, store } = setup();
  await schedule(service);
  const view = (iso) => service.channelState({ preview: true, simulatedAt: at(iso) });

  let state = await view('2026-12-04T00:59:40Z');
  assert.equal(state.now.kind, 'countdown');
  assert.equal(state.now.countdown.premiereAt, '2026-12-04T01:00:00.000Z');
  assert.equal(state.next.title, 'Ironborn');

  state = await view('2026-12-04T01:00:05Z');
  assert.equal(state.now.state, 'awaiting-release', 'an unreleased episode still never plays, even in test mode');
  assert.equal(state.now.playback, undefined);
  assert.ok(!JSON.stringify(state).includes('Secret synopsis'));

  store.videos.set('iron-1', heldEpisode({ status: 'ready', approvalStatus: 'approved', releaseStatus: 'published', muxPlaybackId: 'iron-pb' }));
  state = await view('2026-12-04T01:00:05Z');
  assert.equal(state.now.state, 'playing');
  assert.equal(state.now.playback.muxPlaybackId, 'iron-pb');
  assert.equal(state.now.playback.offsetSeconds, 5);

  // Rights are evaluated at the simulated moment: a title whose linear rights are withdrawn shows the holding screen.
  await service.setRights('title_iron-1', { status: 'denied', basis: 'Withdrawn for this test: rights under review.' }, 'admin');
  state = await view('2026-12-04T01:00:05Z');
  assert.equal(state.now.kind, 'holding');
  assert.equal(state.now.playback, undefined);
});

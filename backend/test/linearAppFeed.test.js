// PROtv LIVE app feed: the same master schedule for every app, filtered by each app's own content eligibility.
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { MemoryLinearStore } = require('../src/linear/store');
const { createLinearService } = require('../src/linear/service');
const { createAdminLinearRouter, createLinearRouter } = require('../src/linear/router');
const { appAllows, appPolicy } = require('../src/linear/appPolicy');

// Tuesday 1 December 2026, 7:10 AM Eastern.
const NOW = Date.parse('2026-12-01T12:10:00.000Z');
const at = (iso) => Date.parse(iso);
const ROKU_FILM = 'LiMNMZWXBxJj3LoP73kU'; // His Girl Friday: Roku and Fire TV reviewed list, not Samsung
const SAMSUNG_FILM = 'hKPU3JNJ4faWLgWE6ZSq'; // Big Buck Bunny: on every app's list
const UNCLEARED = 'web-only-film'; // on no app list
const ITAN = 'creator_3af7527e-f093-41e3-a52e-b4586d315481'; // device-app hold
const UNITED = 'creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6'; // U.S.-only, signed Apple LIVE override
const film = (id, title, overrides = {}) => ({
  id, contentType: 'MOVIE', title, description: `${title} synopsis`, thumbnailUrl: `https://img/${id}.jpg`, approvalStatus: 'approved',
  status: 'ready', muxPlaybackId: `pb-${id}`, duration: 3600, ...overrides,
});
const videos = [
  film(ROKU_FILM, 'His Girl Friday'),
  film(SAMSUNG_FILM, 'Big Buck Bunny', { duration: 596 }),
  film(UNCLEARED, 'Website Only Feature'),
  film(ITAN, 'ITAN'),
  film('cleared-episode', 'Hell Has No Fury', { contentType: 'EPISODE', seriesTitle: 'Ironborn', seasonNumber: 1, episodeNumber: 1,
    creatorEpisodeId: 'e1', rokuCleared: true, duration: 80, approvalStatus: 'draft', status: 'held', releaseStatus: 'held', muxPlaybackId: null }),
];
const confirmed = { status: 'confirmed', basis: 'Signed agreement clause 2.1 streams the work through the PROtv Services.' };
const spot = (id, durationSeconds) => ({
  id, type: 'promo', title: `Spot ${id}`, advertiser: '', status: 'approved', source: 'upload', muxPlaybackId: `pb-${id}`,
  playbackPolicy: 'public', durationSeconds, flightStart: null, flightEnd: null, createdAt: '2026-11-20T00:00:00Z',
});

function setup({ status = 'public' } = {}) {
  const clock = { now: NOW };
  const rights = Object.fromEntries(videos.map((video) => [`title_${video.id}`, confirmed]));
  const store = new MemoryLinearStore({ videos, rights, settings: { status }, creatives: [spot('ad', 23), spot('bumper', 6)] });
  const service = createLinearService({ store, now: () => clock.now, cacheMs: 0, signPlaybackToken: async (id) => `token:${id}` });
  return { clock, store, service };
}

async function approved(service, input) {
  const entry = await service.createEntry(input, 'admin');
  return service.approveEntry(entry.id, { acknowledgeWarnings: true }, 'admin');
}

// 7:00 His Girl Friday → 8:00 break → 8:01 website-only feature → 9:01 ITAN → 10:01 Big Buck Bunny; Thursday 8 PM premiere.
async function schedule(service) {
  await approved(service, { videoId: ROKU_FILM, programType: 'movie', startAtLocal: '2026-12-01T07:00' });
  const brk = await service.createEntry({ kind: 'break', durationSeconds: 60, startAtLocal: '2026-12-01T08:00' }, 'admin');
  await service.setBreakPod(brk.id, { creativeIds: ['ad', 'bumper'] }, 'admin');
  await service.approveEntry(brk.id, { acknowledgeWarnings: true }, 'admin');
  await approved(service, { videoId: UNCLEARED, programType: 'movie', startAtLocal: '2026-12-01T08:01' });
  await approved(service, { videoId: ITAN, programType: 'movie', startAtLocal: '2026-12-01T09:01' });
  await approved(service, { videoId: SAMSUNG_FILM, programType: 'movie', startAtLocal: '2026-12-01T10:01' });
  const premiere = await approved(service, { videoId: 'cleared-episode', programType: 'premiere', startAtLocal: '2026-12-03T20:00' });
  const countdown = await service.addCountdown(premiere.id, { minutes: 10 }, 'admin');
  await service.approveEntry(countdown.id, { acknowledgeWarnings: true }, 'admin');
}

const view = (service, clock, iso, platform) => {
  clock.now = at(iso);
  return service.channelState({ app: platform ? appPolicy(platform) : null });
};
const leaks = (item, title) => JSON.stringify(item).includes(title);

test('app policies are fail-closed: Roku, Samsung, Fire TV, Android and the Apple apps have their own feeds', () => {
  assert.equal(appPolicy('firetv').policy, 'firetv-live-v1');
  assert.equal(appPolicy('roku').policy, 'roku-live-v1');
  assert.equal(appPolicy('SAMSUNG').policy, 'samsung-live-v1');
  assert.equal(appPolicy('android').policy, 'android-live-v1');
  assert.equal(appPolicy('ios').policy, 'ios-live-v1');
  assert.equal(appPolicy('appletv').policy, 'appletv-live-v1');
  for (const platform of ['tvos', 'default', '', undefined]) assert.equal(appPolicy(platform), null, String(platform));
  const roku = appPolicy('roku');
  assert.equal(appAllows(roku, videos[0], NOW), true);
  assert.equal(appAllows(roku, videos[2], NOW), false, 'not on the Roku list');
  assert.equal(appAllows(roku, { ...videos[0], rokuHold: true }, NOW), false, 'rokuHold withdraws');
  assert.equal(appAllows(roku, videos[3], NOW), false, 'ITAN device-app hold');
  assert.equal(appAllows(appPolicy('android'), videos[3], NOW), false, 'ITAN device-app hold on Android too');
  assert.equal(appAllows(appPolicy('android'), videos[2], NOW), true, 'Android follows its on-demand catalog');
  assert.equal(appAllows(roku, { id: 'creator_episode_x', contentType: 'EPISODE', pending: true }, NOW), false, 'undelivered premiere');
  assert.equal(appAllows(roku, { ...videos[0], id: 'p532d2Aqpb3bC2rvYkQw' }, NOW), false, 'global rights hold');
  assert.equal(appAllows(appPolicy('samsung'), videos[0], NOW), false, 'His Girl Friday is not on the Samsung list');
  assert.equal(appAllows(appPolicy('samsung'), videos[1], NOW), true);
});

test('the website feed is unchanged: no platform, full titles, no policy field', async () => {
  const { service, clock } = setup();
  await schedule(service);
  const web = await view(service, clock, '2026-12-01T13:30:00Z');
  assert.equal(web.channel.policy, undefined);
  assert.equal(web.channel.platform, undefined);
  assert.equal(web.now.title, 'Website Only Feature');
  assert.equal(web.now.playback.muxPlaybackId, `pb-${UNCLEARED}`);
});

test('Roku airs its cleared programs in sync with the website and gets a branded fallback for the rest', async () => {
  const { service, clock, store } = setup();
  await schedule(service);
  const before = JSON.stringify(await store.listEntries('2026-11-30T00:00:00Z', '2026-12-05T00:00:00Z'));

  // Cleared program: identical to the website, same playback position.
  const webFirst = await view(service, clock, '2026-12-01T12:30:00Z');
  const rokuFirst = await view(service, clock, '2026-12-01T12:30:00Z', 'roku');
  assert.equal(rokuFirst.channel.policy, 'roku-live-v1');
  assert.equal(rokuFirst.channel.platform, 'roku');
  assert.deepEqual(rokuFirst.now, webFirst.now);
  assert.equal(rokuFirst.now.playback.offsetSeconds, 1800);

  // Commercial break: PROtv's own spots air on every app.
  const webBreak = await view(service, clock, '2026-12-01T13:00:05Z');
  const rokuBreak = await view(service, clock, '2026-12-01T13:00:05Z', 'roku');
  assert.deepEqual(rokuBreak.now, webBreak.now);
  assert.equal(rokuBreak.now.playback.muxPlaybackId, 'pb-ad');
  assert.equal(rokuBreak.next.kind, 'restricted', 'Up Next never names a program Roku cannot play');

  // Uncleared program: same slot and times, no title, artwork, synopsis or playback.
  const restricted = await view(service, clock, '2026-12-01T13:30:00Z', 'roku');
  assert.equal(restricted.now.kind, 'restricted');
  assert.equal(restricted.now.state, 'restricted');
  assert.equal(restricted.now.title, 'PROtv LIVE');
  assert.equal(restricted.now.playback, undefined);
  assert.equal(restricted.now.startAt, '2026-12-01T13:01:00.000Z');
  assert.equal(restricted.now.endAt, '2026-12-01T14:01:00.000Z');
  assert.ok(restricted.refreshAfterMs <= 60_000);
  for (const title of ['Website Only Feature', 'ITAN', `pb-${UNCLEARED}`, `pb-${ITAN}`, 'synopsis']) {
    assert.ok(!leaks({ now: restricted.now, next: restricted.next, guide: restricted.guide.filter((item) => item.kind === 'restricted') }, title), title);
  }
  // The guide keeps every slot at its master time; restricted slots carry PROtv LIVE branding only.
  const web = await view(service, clock, '2026-12-01T13:30:00Z');
  assert.deepEqual(restricted.guide.map((item) => [item.startAt, item.endAt]), web.guide.map((item) => [item.startAt, item.endAt]));
  assert.deepEqual(restricted.guide.map((item) => item.kind), ['restricted', 'restricted', 'program']);
  assert.equal(restricted.guide[2].title, 'Big Buck Bunny');

  // Back to a cleared program at its scheduled second.
  const back = await view(service, clock, '2026-12-01T15:02:00Z', 'roku');
  assert.equal(back.now.title, 'Big Buck Bunny');
  assert.equal(back.now.playback.offsetSeconds, 60);

  // The master schedule was not touched.
  assert.equal(JSON.stringify(await store.listEntries('2026-11-30T00:00:00Z', '2026-12-05T00:00:00Z')), before);
});

test('Samsung uses its own narrower list; Android follows its catalog less device-app holds', async () => {
  const { service, clock } = setup();
  await schedule(service);
  assert.equal((await view(service, clock, '2026-12-01T12:30:00Z', 'samsung')).now.kind, 'restricted', 'His Girl Friday is not cleared for Samsung');
  assert.equal((await view(service, clock, '2026-12-01T15:02:00Z', 'samsung')).now.title, 'Big Buck Bunny');
  assert.equal((await view(service, clock, '2026-12-01T13:30:00Z', 'android')).now.title, 'Website Only Feature');
  assert.equal((await view(service, clock, '2026-12-01T14:30:00Z', 'android')).now.kind, 'restricted', 'ITAN is held from the apps');
  assert.equal((await view(service, clock, '2026-12-01T14:30:00Z')).now.title, 'ITAN', 'the website listing is unchanged');
});

test('Apple uses the master entry and preserves its exact airtime', async () => {
  const clock = { now: at('2026-12-01T13:30:00Z') };
  const master = [{
    id: 'master-uncleared', kind: 'program', videoId: UNCLEARED, programType: 'movie', status: 'approved',
    startAt: '2026-12-01T13:01:00.000Z', endAt: '2026-12-01T14:01:00.000Z', durationSeconds: 3600,
    sourceStartSeconds: 0, label: '', channelId: 'protv-live',
  }];
  const alternate = [{
    id: 'apple-cleared', kind: 'program', videoId: SAMSUNG_FILM, programType: 'movie', status: 'approved',
    startAt: '2026-12-01T13:00:00.000Z', endAt: '2026-12-01T13:09:56.000Z', durationSeconds: 596,
    sourceStartSeconds: 0, label: '', channelId: 'protv-live',
  }];
  const rights = Object.fromEntries(videos.map((video) => [`title_${video.id}`, confirmed]));
  const store = new MemoryLinearStore({ videos, rights, settings: { status: 'public' }, entries: master, appleEntries: alternate });
  const service = createLinearService({ store, now: () => clock.now, cacheMs: 0 });
  const before = await store.listEntries('2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z');

  const apple = await view(service, clock, '2026-12-01T13:05:00Z', 'ios');
  assert.equal(apple.channel.policy, 'ios-live-v1');
  assert.equal(apple.now.entryId, 'master-uncleared');
  assert.equal(apple.now.kind, 'restricted');

  const website = await view(service, clock, '2026-12-01T13:05:00Z');
  assert.equal(website.now.title, 'Website Only Feature');
  assert.equal(website.now.entryId, 'master-uncleared');
  assert.equal(website.now.startsAt, apple.now.startsAt);
  assert.equal(website.now.endsAt, apple.now.endsAt);
  assert.deepEqual(await store.listEntries('2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z'), before);
});

test('Apple cannot bypass the worldwide master linear-rights decision with an old override', async () => {
  const clock = { now: at('2026-12-01T13:30:00Z') };
  const united = film(UNITED, 'UNITED NATIONS', { duration: 4115, muxSignedPlaybackId: 'SignedUnited00000001' });
  const master = [{
    id: 'master-united', kind: 'program', videoId: UNITED, programType: 'movie', status: 'approved',
    startAt: '2026-12-01T13:00:00.000Z', endAt: '2026-12-01T14:08:35.000Z', durationSeconds: 4115,
    sourceStartSeconds: 0, label: '', channelId: 'protv-live',
  }];
  const alternate = [{ ...master[0], id: 'apple-united' }];
  const rights = {
    [`title_${UNITED}`]: { status: 'denied', basis: 'The master feed is not geofenced.' },
    [`apple_title_${UNITED}`]: {
      status: 'confirmed', territory: 'US', signedPlaybackRequired: true,
      basis: 'Executed agreement permits U.S. Apple apps with signed playback.',
    },
  };
  const store = new MemoryLinearStore({ videos: [united], rights, settings: { status: 'public' }, entries: master, appleEntries: alternate });
  const service = createLinearService({
    store, now: () => clock.now, cacheMs: 0, signPlaybackToken: async (id) => `token:${id}`,
  });

  clock.now = at('2026-12-01T13:30:00Z');
  const us = appPolicy('ios', { country: 'US', reason: 'ip' });
  const apple = await service.channelState({ app: us });
  assert.equal(apple.now.entryId, 'master-united');
  assert.equal(apple.now.kind, 'holding');
  assert.ok(!apple.now.playback);

  clock.now = at('2026-12-01T13:30:00Z');
  const website = await service.channelState();
  assert.equal(website.now.kind, 'holding', 'the global denial still applies to the master schedule');
  assert.equal(website.now.entryId, apple.now.entryId);
  assert.equal(website.now.startsAt, apple.now.startsAt);
  assert.equal(website.now.endsAt, apple.now.endsAt);
});

test('a premiere reaches an app only when the delivered title is cleared for it', async () => {
  const { service, clock } = setup();
  await schedule(service);
  // Ironborn E1 is delivered (held) and rokuCleared: Roku shows the countdown like the website.
  const roku = await view(service, clock, '2026-12-04T00:55:00Z', 'roku');
  assert.equal(roku.now.kind, 'countdown');
  assert.equal(roku.now.title, 'Ironborn');
  // Samsung's list does not include it: fallback, no series name or episode title.
  const samsung = await view(service, clock, '2026-12-04T00:55:00Z', 'samsung');
  assert.equal(samsung.now.kind, 'restricted');
  assert.ok(!leaks(samsung.now, 'Ironborn') && !leaks(samsung.now, 'Hell Has No Fury'));
});

async function listen(t, { service, admin = false }) {
  const app = express();
  app.use(express.json());
  const user = admin ? { uid: 'admin-uid', admin: true } : null;
  const analytics = { record: async () => ({ recorded: true }), report: async () => ({}) };
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
  return async (path, headers = {}) => {
    const response = await fetch(`${base}${path}`, { headers });
    return { status: response.status, body: await response.json() };
  };
}

test('the channel route selects the app feed by ?platform=, X-PROtv-Platform or the Roku User-Agent, and refuses other apps', async (t) => {
  const { service, clock } = setup();
  await schedule(service);
  clock.now = at('2026-12-01T13:30:00Z');
  const call = await listen(t, { service });
  const web = await call('/v1/linear/channel');
  assert.equal(web.body.now.title, 'Website Only Feature');
  assert.equal(web.body.channel.policy, undefined);
  for (const [path, headers] of [
    ['/v1/linear/channel?platform=roku', {}],
    ['/v1/linear/channel', { 'X-PROtv-Platform': 'roku' }],
    ['/v1/linear/channel', { 'User-Agent': 'Roku/DVP-14.0 (14.0.0.4210-46)' }],
  ]) {
    const roku = await call(path, headers);
    assert.equal(roku.status, 200);
    assert.equal(roku.body.channel.policy, 'roku-live-v1');
    assert.equal(roku.body.now.kind, 'restricted');
  }
  for (const platform of ['something']) {
    const refused = await call(`/v1/linear/channel?platform=${platform}`);
    assert.equal(refused.status, 404, platform);
    assert.equal(refused.body.code, 'LIVE_PLATFORM_UNSUPPORTED');
  }
  const firetv = await call('/v1/linear/channel', { 'X-PROtv-Platform': 'firetv' });
  assert.equal(firetv.status, 200);
  assert.equal(firetv.body.channel.policy, 'firetv-live-v1');
});

test('an app never gets the Administrator preview, so an off channel stays off in every app', async (t) => {
  const { service, clock } = setup({ status: 'off' });
  await schedule(service);
  clock.now = at('2026-12-01T12:30:00Z');
  const admin = await listen(t, { service, admin: true });
  assert.equal((await admin('/v1/linear/channel?preview=1')).status, 200, 'website preview unchanged');
  assert.equal((await admin('/v1/linear/channel?preview=1&platform=roku')).status, 404);
  // Administrator test mode can show what an app would show at a simulated time.
  const simulated = await admin(`/admin/linear/test/channel?at=${at('2026-12-01T13:30:00Z')}&platform=roku`);
  assert.equal(simulated.status, 200);
  assert.equal(simulated.body.now.kind, 'restricted');
  assert.equal(simulated.body.channel.policy, 'roku-live-v1');
  assert.equal((await admin(`/admin/linear/test/channel?at=${at('2026-12-01T13:30:00Z')}&platform=firetv`)).status, 200);
});

test('a U.S.-limited linear grant plays only for U.S. requests, by signed ID, on one unchanged timeline', async () => {
  const UN = 'creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6';
  const united = film(UN, 'UNITED NATIONS', { duration: 4115 });
  const entries = [{ id: 'un-slot', kind: 'program', videoId: UN, programType: 'movie', status: 'approved',
    startAt: '2026-12-01T12:00:00.000Z', endAt: '2026-12-01T13:08:35.000Z', durationSeconds: 4115, sourceStartSeconds: 0 }];
  const rights = { [`title_${UN}`]: { status: 'confirmed', territory: 'US', signedPlaybackRequired: true, signedPlaybackId: 'SignedUnited00000001', basis: 'f587ce8e' } };
  const store = new MemoryLinearStore({ videos: [united], rights, entries, settings: { status: 'public' } });
  const service = createLinearService({ store, now: () => NOW, cacheMs: 0, signPlaybackToken: async (id) => `token:${id}` });
  const US = { country: 'US', reason: 'ip' };
  const CA = { country: 'CA', reason: 'ip' };
  const UNKNOWN = { country: null, reason: 'unknown' };
  // Website, U.S.: the program plays by its signed ID only.
  const webUs = await service.channelState({ territory: US });
  assert.equal(webUs.now.kind, 'program');
  assert.equal(webUs.now.playback.muxPlaybackId, 'SignedUnited00000001');
  assert.equal(webUs.now.playback.playbackToken, 'token:SignedUnited00000001');
  assert.ok(!JSON.stringify(webUs).includes(`pb-${UN}`), 'the public playback ID never appears');
  // Website outside the U.S. or unknown: holding screen in the same slot, nothing about the title.
  for (const territory of [CA, UNKNOWN, null]) {
    const web = await service.channelState({ territory });
    assert.equal(web.now.kind, 'holding');
    assert.ok(!JSON.stringify(web).includes(UN));
  }
  // Apps: Roku, Fire TV and Samsung (U.S.) play it signed; elsewhere they get the branded card.
  const rokuUs = await service.channelState({ app: appPolicy('roku', US) });
  assert.equal(rokuUs.now.playback.muxPlaybackId, 'SignedUnited00000001');
  const rokuCa = await service.channelState({ app: appPolicy('roku', CA) });
  assert.equal(rokuCa.now.kind, 'restricted');
  assert.equal(rokuCa.now.playback, undefined);
  for (const platform of ['samsung', 'firetv']) {
    const us = await service.channelState({ app: appPolicy(platform, US) });
    assert.equal(us.now.playback.muxPlaybackId, 'SignedUnited00000001', platform);
    assert.equal((await service.channelState({ app: appPolicy(platform, CA) })).now.kind, 'restricted', platform);
  }
  // Every request sees the same slot times.
  for (const feed of [webUs, rokuUs, rokuCa]) assert.equal(feed.guide[0].endAt || feed.now.endAt, '2026-12-01T13:08:35.000Z');
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { MemoryLinearStore } = require('../src/linear/store');
const { createLinearService } = require('../src/linear/service');
const { account, validateLinearEvent, summarizeCreatives } = require('../src/linear/analytics');
const { autofillPod, spotAt, creativeAirable } = require('../src/linear/creatives');

// Tuesday 1 December 2026, 7:00 AM Eastern.
const NOW = Date.parse('2026-12-01T12:00:00.000Z');
const at = (iso) => Date.parse(iso);

const movie = (overrides = {}) => ({
  id: 'movie-1', contentType: 'MOVIE', title: 'His Girl Friday', approvalStatus: 'approved', status: 'ready',
  muxPlaybackId: 'movie-playback', duration: 5520, posterUrl: 'https://watchprotv.com/api/posters/hgf.jpg', ...overrides,
});
const heldEpisode = (overrides = {}) => ({
  id: 'iron-1', contentType: 'EPISODE', title: 'Hell Has No Fury', episodeTitle: 'Hell Has No Fury', description: 'Secret synopsis',
  seriesTitle: 'Ironborn', seasonNumber: 1, episodeNumber: 1, creatorEpisodeId: 'e1', thumbnailUrl: 'https://image.mux.com/secret/thumb.jpg',
  approvalStatus: 'draft', status: 'held', releaseStatus: 'held', muxPlaybackId: null, duration: 80, ...overrides,
});
const spot = (id, overrides = {}) => ({
  id, type: 'promo', title: `Spot ${id}`, advertiser: '', status: 'approved', source: 'upload', muxPlaybackId: `pb-${id}`,
  playbackPolicy: 'public', durationSeconds: 30, flightStart: null, flightEnd: null, createdAt: '2026-11-20T00:00:00Z', ...overrides,
});
const confirmed = { status: 'confirmed', basis: 'Signed agreement clause 2.1 streams the work through the PROtv Services.' };

function setup({ videos = [movie()], creatives = [], rights = { 'title_movie-1': confirmed } } = {}) {
  const clock = { now: NOW };
  const uploads = [];
  const mux = {
    createDirectUpload: async (origin) => { uploads.push(origin); return { id: 'upload-1', url: 'https://storage.mux.example/put' }; },
    getUpload: async () => ({ status: 'asset_created', asset_id: 'asset-1' }),
    getAsset: async () => ({ status: 'ready', duration: 15.04, playback_ids: [{ policy: 'public', id: 'pb-uploaded' }] }),
    getPlaybackId: (asset, policy) => asset.playback_ids.find((item) => item.policy === policy)?.id || null,
  };
  const store = new MemoryLinearStore({ videos, rights, settings: { status: 'public' }, creatives });
  const service = createLinearService({ store, now: () => clock.now, cacheMs: 0, mux, signPlaybackToken: async (id, d) => `token:${id}:${d}` });
  return { clock, store, service, uploads };
}

async function approved(service, input, acknowledgeWarnings = true) {
  const entry = await service.createEntry(input, 'admin');
  return service.approveEntry(entry.id, { acknowledgeWarnings }, 'admin');
}

test('spots are uploaded straight to Mux, follow processing, and need a rights statement before they can air', async () => {
  const { service, uploads } = setup();
  const { creative, uploadUrl } = await service.createCreative({ type: 'sponsor', title: 'Holiday sale', advertiser: 'Main Street Auto' }, 'admin', { corsOrigin: 'https://watchprotv.com' });
  assert.equal(uploadUrl, 'https://storage.mux.example/put');
  assert.deepEqual(uploads, ['https://watchprotv.com']);
  assert.equal(creative.status, 'draft');
  await assert.rejects(service.approveCreative(creative.id, { rightsConfirmation: 'Supplied by Main Street Auto under the order.' }, 'admin'), /not processed/);
  const ready = await service.refreshCreative(creative.id);
  assert.equal(ready.muxPlaybackId, 'pb-uploaded');
  assert.equal(ready.durationSeconds, 15.04);
  await assert.rejects(service.approveCreative(creative.id, { rightsConfirmation: 'ok' }, 'admin'), /who made or owns/);
  const live = await service.approveCreative(creative.id, { rightsConfirmation: 'Supplied by Main Street Auto under the November order.' }, 'admin');
  assert.equal(live.status, 'approved');
  assert.equal(live.airableNow, true);
  await assert.rejects(service.createCreative({ type: 'sponsor', title: 'No sponsor' }, 'admin'), /Name the sponsor/);
  const edited = await service.updateCreative(creative.id, { title: 'Holiday sale (30)' }, 'admin');
  assert.equal(edited.status, 'draft', 'any edit needs approval again');
});

test('an existing catalog trailer is reused as an upcoming-show trailer spot with signed playback', async () => {
  const show = { id: 'dread-show', contentType: 'SERIES', title: 'Dread Head', approvalStatus: 'approved', trailerStatus: 'ready', trailerPlaybackId: 'trailer-pb', trailerDuration: 92.4 };
  const { service } = setup({ videos: [movie(), show] });
  const { creative, uploadUrl } = await service.createCreative({ source: 'catalog-trailer', videoId: 'dread-show', type: 'trailer', title: 'Dread Head trailer' }, 'admin');
  assert.equal(uploadUrl, undefined);
  assert.equal(creative.playbackPolicy, 'signed');
  assert.equal(creative.muxPlaybackId, 'trailer-pb');
  await assert.rejects(service.createCreative({ source: 'catalog-trailer', videoId: 'movie-1', type: 'trailer', title: 'No trailer' }, 'admin'), /no ready, public trailer/);
});

test('a break plays its spots in order, in sync for every viewer, then the PROtv card; unavailable spots keep their time', async () => {
  const sponsor = spot('s1', { type: 'sponsor', advertiser: 'Main Street Auto', durationSeconds: 30 });
  const promo = spot('p1', { durationSeconds: 20 });
  const retired = spot('r1', { status: 'retired', durationSeconds: 15 });
  const { clock, service, store } = setup({ creatives: [sponsor, promo, retired] });
  const brk = await service.createEntry({ kind: 'break', durationSeconds: 120, startAtLocal: '2026-12-01T07:00' }, 'admin');
  await assert.rejects(service.setBreakPod(brk.id, { creativeIds: ['s1', 'r1'] }, 'admin'), /not approved/);
  const filled = await service.setBreakPod(brk.id, { creativeIds: ['s1', 'p1'] }, 'admin');
  assert.deepEqual(filled.pod.map((item) => item.creativeId), ['s1', 'p1']);
  assert.match(filled.issues.warnings.join(), /fill 50 of 120 s/);
  await service.approveEntry(brk.id, { acknowledgeWarnings: true }, 'admin');

  clock.now = NOW + 10_000;
  let state = await service.channelState();
  assert.equal(state.now.kind, 'break');
  assert.deepEqual(state.now.spot, { creativeId: 's1', type: 'sponsor', label: 'Sponsored', title: 'A message from Main Street Auto', index: 1, count: 2 });
  assert.deepEqual(state.now.playback, { muxPlaybackId: 'pb-s1', offsetSeconds: 10, sourceStartSeconds: 0, sourceEndSeconds: 30 });
  assert.equal(state.refreshAfterMs, 20_000, 'refresh at the next spot boundary');

  clock.now = NOW + 35_000;
  state = await service.channelState();
  assert.equal(state.now.spot.creativeId, 'p1');
  assert.equal(state.now.playback.offsetSeconds, 5, 'a late viewer joins the spot in progress');

  clock.now = NOW + 60_000;
  state = await service.channelState();
  assert.equal(state.now.playback, undefined, 'after the spots, the branded card fills the break');
  assert.equal(state.now.title, 'We\'ll be right back');

  // Retiring a spot mid-schedule: its time shows the card; the following spot keeps its scheduled time.
  store.creatives.set('s1', { ...sponsor, status: 'retired' });
  clock.now = NOW + 10_000;
  state = await service.channelState();
  assert.equal(state.now.playback, undefined);
  assert.equal(state.refreshAfterMs, 20_000);
  clock.now = NOW + 31_000;
  assert.equal((await service.channelState()).now.spot.creativeId, 'p1');
});

test('reused trailers carry a playback token; flight dates are honoured', async () => {
  const trailer = spot('t1', { type: 'trailer', playbackPolicy: 'signed', muxPlaybackId: 'trailer-pb', durationSeconds: 60, flightStart: '2026-12-01', flightEnd: '2026-12-01' });
  const { clock, service } = setup({ creatives: [trailer] });
  const brk = await service.createEntry({ kind: 'break', durationSeconds: 60, startAtLocal: '2026-12-01T07:00' }, 'admin');
  await service.setBreakPod(brk.id, { creativeIds: ['t1'] }, 'admin');
  await service.approveEntry(brk.id, { acknowledgeWarnings: true }, 'admin');
  clock.now = NOW + 5_000;
  assert.equal((await service.channelState()).now.playback.playbackToken, 'token:trailer-pb:60');
  assert.equal(creativeAirable(trailer, at('2026-12-02T05:00:00Z')), false, 'flight ended at midnight Eastern');
  assert.equal(creativeAirable(trailer, at('2026-12-02T04:59:00Z')), true);
});

test('automatic fill is deterministic, prefers sponsors, never repeats a spot in one break and fits the break', () => {
  const creatives = new Map([spot('a', { type: 'promo', durationSeconds: 30 }), spot('b', { type: 'sponsor', advertiser: 'X', durationSeconds: 60 }),
    spot('c', { type: 'trailer', durationSeconds: 45 }), spot('d', { type: 'promo', durationSeconds: 15 }), spot('e', { type: 'sponsor', advertiser: 'Y', status: 'draft' })]
    .map((item) => [item.id, item]));
  const pod = autofillPod(creatives, 120, { seed: 'entry-1', at: NOW });
  assert.equal(pod[0].creativeId, 'b');
  assert.ok(pod.reduce((sum, item) => sum + item.durationSeconds, 0) <= 120);
  assert.equal(new Set(pod.map((item) => item.creativeId)).size, pod.length);
  assert.ok(!pod.some((item) => item.creativeId === 'e'), 'drafts never fill a break');
  assert.deepEqual(autofillPod(creatives, 120, { seed: 'entry-1', at: NOW }), pod);
  assert.equal(spotAt(pod, 59.9).index, 0);
  assert.equal(spotAt(pod, 60).index, 1);
});

test('a premiere countdown shows the series, episode name, admin artwork and exact Eastern time, then hands over to the program', async () => {
  const promo = spot('p1', { durationSeconds: 120 });
  const rights = { 'title_iron-1': confirmed };
  const { clock, service, store } = setup({ videos: [heldEpisode()], creatives: [promo], rights });
  const program = await service.createEntry({ videoId: 'iron-1', programType: 'premiere', startAtLocal: '2026-12-03T20:00' }, 'admin');
  await assert.rejects(service.addCountdown(program.id, { minutes: 7 }, 'admin'), /5, 10, 15, 30/);
  await assert.rejects(service.addCountdown(program.id, { minutes: 10, artworkUrl: 'https://evil.example/a.jpg' }, 'admin'), /PROtv artwork/);
  const countdown = await service.addCountdown(program.id, { minutes: 10, creativeIds: ['p1'], artworkUrl: 'https://watchprotv.com/api/posters/ironborn.jpg' }, 'admin');
  assert.equal(countdown.startAt, '2026-12-04T00:50:00.000Z');
  assert.equal(countdown.endAt, '2026-12-04T01:00:00.000Z');
  await assert.rejects(service.approveEntry(countdown.id, { acknowledgeWarnings: true }, 'admin'), /Approve the program first/);
  await service.approveEntry(program.id, { acknowledgeWarnings: true }, 'admin');
  await assert.rejects(service.addCountdown(program.id, { minutes: 5 }, 'admin'), /already has a countdown/);
  await assert.rejects(service.approveEntry(countdown.id, {}, 'admin'), /episode name/);
  await service.approveEntry(countdown.id, { acknowledgeWarnings: true }, 'admin');

  clock.now = at('2026-12-04T00:51:00Z');
  let state = await service.channelState();
  assert.equal(state.now.kind, 'countdown');
  assert.equal(state.now.title, 'Ironborn');
  assert.equal(state.now.subtitle, 'S1 · E1 · Hell Has No Fury');
  assert.equal(state.now.countdown.premiereAt, '2026-12-04T01:00:00.000Z');
  assert.match(state.now.countdown.premiereLabel, /8:00 PM EST/);
  assert.equal(state.now.countdown.artworkUrl, 'https://watchprotv.com/api/posters/ironborn.jpg');
  assert.equal(state.now.spot.creativeId, 'p1', 'promotions play during the pre-premiere window');
  assert.equal(state.now.playback.muxPlaybackId, 'pb-p1');
  const serialized = JSON.stringify(state);
  assert.ok(!serialized.includes('Secret synopsis') && !serialized.includes('image.mux.com/secret'), 'no synopsis or episode artwork before release');

  clock.now = at('2026-12-04T00:59:30Z');
  state = await service.channelState();
  assert.equal(state.now.kind, 'countdown');
  assert.equal(state.now.playback, undefined, 'the final minute is the full-screen clock');
  assert.ok(state.refreshAfterMs <= 30_000);

  // Not released at 8 PM: the premiere waits on the "starting shortly" card; nothing plays.
  clock.now = at('2026-12-04T01:00:05Z');
  state = await service.channelState();
  assert.equal(state.now.state, 'awaiting-release');
  assert.equal(state.now.playback, undefined);

  // Released by the Creator Portal: everyone joins in progress at the scheduled position.
  store.videos.set('iron-1', heldEpisode({ status: 'ready', approvalStatus: 'approved', releaseStatus: 'published', muxPlaybackId: 'iron-pb' }));
  clock.now = at('2026-12-04T01:00:40Z');
  state = await service.channelState();
  assert.equal(state.now.state, 'playing');
  assert.equal(state.now.playback.offsetSeconds, 40);
});

test('the episode name can be hidden, and a countdown whose program moved or became unavailable shows a holding screen', async () => {
  const { clock, service, store } = setup({ videos: [movie()] });
  const program = await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T09:00' });
  const countdown = await service.addCountdown(program.id, { minutes: 5, showEpisodeTitle: false }, 'admin');
  await service.approveEntry(countdown.id, {}, 'admin');
  clock.now = at('2026-12-01T13:56:00Z');
  let state = await service.channelState();
  assert.equal(state.now.kind, 'countdown');
  assert.equal(state.now.title, 'His Girl Friday');
  assert.equal(state.now.countdown.artworkUrl, 'https://watchprotv.com/api/posters/hgf.jpg', 'a released film may show its own poster');
  store.rights.set('title_movie-1', { status: 'denied', basis: 'Withdrawn by the licensor in writing today.' });
  state = await service.channelState();
  assert.equal(state.now.state, 'holding');
  assert.equal(state.now.title, 'PROtv LIVE');
  assert.equal(JSON.stringify(state).includes('His Girl Friday'), false);
});

test('a programming block chains programs with filled breaks between them (never inside), and rolls back on failure', async () => {
  const videos = [movie(), movie({ id: 'movie-2', title: 'D.O.A.', duration: 4980, muxPlaybackId: 'pb-2' })];
  const rights = { 'title_movie-1': confirmed, 'title_movie-2': confirmed };
  const { service, store } = setup({ videos, rights, creatives: [spot('p1', { durationSeconds: 60 }), spot('p2', { durationSeconds: 60 })] });
  const { created } = await service.buildBlock({ startAtLocal: '2026-12-01T09:00', items: [{ videoId: 'movie-1' }, { videoId: 'movie-2' }], breakSeconds: 120 }, 'admin');
  assert.deepEqual(created.map((entry) => entry.kind), ['program', 'break', 'program']);
  assert.equal(created[1].startAt, created[0].endAt);
  assert.equal(created[2].startAt, created[1].endAt);
  assert.equal(created[1].pod.length, 2);
  assert.ok(created.every((entry) => entry.status === 'draft'));
  const before = store.entries.size;
  await assert.rejects(service.buildBlock({ startAtLocal: '2026-12-01T09:30', items: [{ videoId: 'movie-1' }] }, 'admin'), /overlaps/);
  await assert.rejects(service.buildBlock({ startAtLocal: '2026-12-02T09:00', items: [{ videoId: 'movie-1' }, { videoId: 'missing' }], breakSeconds: 60 }, 'admin'), /not in the PROtv catalog/);
  assert.equal(store.entries.size, before, 'a failed block leaves nothing behind');
});

test('commercial time above the hourly limit is flagged, repeats copy spots but not countdowns', async () => {
  const { service } = setup({ creatives: [spot('p1', { durationSeconds: 60 })] });
  const first = await service.createEntry({ kind: 'break', durationSeconds: 300, startAtLocal: '2026-12-01T10:00' }, 'admin');
  await service.createEntry({ kind: 'break', durationSeconds: 300, startAtLocal: '2026-12-01T10:30' }, 'admin');
  const listed = await service.listSchedule({ from: '2026-12-01T14:00:00Z', to: '2026-12-01T16:00:00Z' });
  assert.match(listed[0].issues.warnings.join(), /above the channel limit of 8 min/);
  await service.setBreakPod(first.id, { autofill: true }, 'admin');
  await service.approveEntry(first.id, { acknowledgeWarnings: true }, 'admin');
  const program = await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-02T09:00' });
  await service.approveEntry((await service.addCountdown(program.id, { minutes: 5 }, 'admin')).id, {}, 'admin');
  const plan = await service.repeatWeek({ sourceWeekOf: '2026-11-30', targetWeekOf: '2026-12-07', weeks: 1, apply: true }, 'admin');
  const copiedBreak = plan.items.find((item) => item.sourceEntryId === first.id);
  assert.equal(copiedBreak.action, 'create');
  assert.ok(plan.items.some((item) => item.title === 'Countdown' && /not repeated/.test(item.reason)));
});

test('spot plays are counted separately, once per visit and spot, only while the break is on air', () => {
  const event = validateLinearEvent({ eventType: 'spot_start', sessionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', entryId: 'break-1', creativeId: 's1' });
  assert.equal(event.creativeId, 's1');
  assert.throws(() => validateLinearEvent({ eventType: 'spot_start', sessionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', entryId: 'break-1' }), /break and spot/);
  assert.throws(() => validateLinearEvent({ eventType: 'heartbeat', sessionId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', entryId: 'b', seconds: 5, creativeId: 's1' }), /Only spot events/);
  const entry = { id: 'break-1', kind: 'break', pod: [{ creativeId: 's1', durationSeconds: 30 }] };
  const session = { startedAt: NOW };
  const counted = account(event, { session, eventKeyExists: false, entry, now: NOW });
  assert.deepEqual(counted.daily, { spotStarts: 1 });
  assert.deepEqual(counted.creative, { starts: 1 });
  assert.equal(account(event, { session, eventKeyExists: true, entry, now: NOW }).result.duplicate, true);
  assert.equal(account({ ...event, creativeId: 'other' }, { session, eventKeyExists: false, entry, now: NOW }).result.reason, 'not-on-air');
  const report = summarizeCreatives([{ creativeId: 's1', date: '2026-12-01', starts: 3, completes: 2 }, { creativeId: 's1', date: '2026-12-01', starts: 1 }], { from: '2026-12-01', to: '2026-12-01' });
  assert.deepEqual(report.creatives[0], { creativeId: 's1', starts: 4, completes: 2, days: { '2026-12-01': { starts: 4, completes: 2 } }, completionRate: 0.5 });
});

test('a premiere and its countdown can be configured before the episode reaches PROtv, and reveal nothing until release', async () => {
  const EP = 'creator_episode_bb27d79d-b541-4c38-97f1-6514f016de31';
  const seriesRights = { series_aXJvbmJvcm4: confirmed };
  const { clock, service, store } = setup({ videos: [movie()], rights: { ...seriesRights, 'title_movie-1': confirmed } });
  // Guard rails: only a Creator Portal episode, only as a premiere, only with its series and length.
  await assert.rejects(service.createEntry({ videoId: 'not-a-creator-episode', programType: 'premiere', pendingSeriesTitle: 'Ironborn', durationSeconds: 80, startAtLocal: '2026-12-03T20:00' }, 'admin'), /not in the PROtv catalog/);
  await assert.rejects(service.createEntry({ videoId: EP, programType: 'movie', pendingSeriesTitle: 'Ironborn', durationSeconds: 80, startAtLocal: '2026-12-03T20:00' }, 'admin'), /not in the PROtv catalog/);
  await assert.rejects(service.createEntry({ videoId: EP, programType: 'premiere', durationSeconds: 80, startAtLocal: '2026-12-03T20:00' }, 'admin'), /not in the PROtv catalog/);
  await assert.rejects(service.createEntry({ videoId: EP, programType: 'premiere', pendingSeriesTitle: 'Ironborn', startAtLocal: '2026-12-03T20:00' }, 'admin'), /episode length/);

  const premiere = await service.createEntry({ videoId: EP, programType: 'premiere', pendingSeriesTitle: 'Ironborn', durationSeconds: 80, startAtLocal: '2026-12-03T20:00' }, 'admin');
  assert.equal(premiere.pending, true);
  assert.equal(premiere.linearRights, 'confirmed', 'checked against the Ironborn series rights');
  assert.match(premiere.issues.warnings.join(), /not been delivered/);
  await service.approveEntry(premiere.id, { acknowledgeWarnings: true }, 'admin');
  const countdown = await service.addCountdown(premiere.id, { minutes: 10, artworkUrl: 'https://watchprotv.com/api/posters/ironborn.jpg' }, 'admin');
  await service.approveEntry(countdown.id, { acknowledgeWarnings: true }, 'admin');
  // The primetime drafter sees the slot as taken: no duplicate premiere.
  assert.equal((await store.findEntriesByVideoIds([EP])).length, 1);

  // Not delivered by air time: holding screens, no title, no playback.
  clock.now = at('2026-12-04T00:55:00Z');
  let state = await service.channelState();
  assert.equal(state.now.state, 'holding');
  assert.equal(JSON.stringify(state).includes('Ironborn'), false);

  // Delivered privately (held): the countdown shows; still nothing playable.
  store.videos.set(EP, heldEpisode({ id: EP, creatorEpisodeId: 'bb27d79d-b541-4c38-97f1-6514f016de31' }));
  state = await service.channelState();
  assert.equal(state.now.kind, 'countdown');
  assert.equal(state.now.subtitle, 'S1 · E1 · Hell Has No Fury');
  assert.equal(state.now.playback, undefined);
  clock.now = at('2026-12-04T01:00:10Z');
  state = await service.channelState();
  assert.equal(state.now.state, 'awaiting-release');
  assert.equal(state.now.playback, undefined);

  // Released at 8 PM by the Creator Portal: viewers join in progress.
  store.videos.set(EP, heldEpisode({ id: EP, creatorEpisodeId: 'bb27d79d', status: 'ready', approvalStatus: 'approved', releaseStatus: 'published', muxPlaybackId: 'iron-pb' }));
  clock.now = at('2026-12-04T01:00:30Z');
  state = await service.channelState();
  assert.equal(state.now.state, 'playing');
  assert.equal(state.now.playback.offsetSeconds, 30);
});

test('a pending premiere needs the series linear rights before it can be approved', async () => {
  const { service } = setup({ videos: [movie()] });
  const entry = await service.createEntry({ videoId: 'creator_episode_bb27d79d-b541-4c38-97f1-6514f016de31', programType: 'premiere', pendingSeriesTitle: 'Ironborn', durationSeconds: 80, startAtLocal: '2026-12-03T20:00' }, 'admin');
  assert.match(entry.issues.blocking.join(), /not confirmed for the series "Ironborn"/);
  await assert.rejects(service.approveEntry(entry.id, { acknowledgeWarnings: true }, 'admin'), /not confirmed for the series/);
});

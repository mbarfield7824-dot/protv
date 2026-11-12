const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { channelLocalToUtc, channelWeekDates } = require('../src/linear/time');
const { MemoryLinearStore } = require('../src/linear/store');
const { createLinearService, LAUNCH_CONFIRMATION } = require('../src/linear/service');
const { account, programRange, summarize, validateLinearEvent } = require('../src/linear/analytics');
const { createAdminLinearRouter, createLinearRouter } = require('../src/linear/router');
const { seriesKey } = require('../src/catalog/readModel');

// Tuesday 1 December 2026, 7:00 AM Eastern.
const NOW = Date.parse('2026-12-01T12:00:00.000Z');
const SESSION = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

const movie = (overrides = {}) => ({
  id: 'movie-1', contentType: 'MOVIE', title: 'His Girl Friday', approvalStatus: 'approved', status: 'ready',
  muxPlaybackId: 'public-playback-1', duration: 5520, description: 'Fast talk.', thumbnailUrl: 'https://img/1.jpg', ...overrides,
});
const heldEpisode = (overrides = {}) => ({
  id: 'creator_episode_ep1', contentType: 'EPISODE', title: 'Secret pilot title', episodeTitle: 'Secret pilot title',
  description: 'Secret synopsis', seriesTitle: 'Dreadheads', seasonNumber: 1, episodeNumber: 1, creatorEpisodeId: 'ep1',
  approvalStatus: 'draft', status: 'held', releaseStatus: 'held', muxPlaybackId: null, duration: 1500, ...overrides,
});
const confirmed = (extra = {}) => ({ status: 'confirmed', basis: 'Schedule B clause 4 grants scheduled linear streaming.', ...extra });

function setup({ videos = [movie()], rights = { 'title_movie-1': confirmed() }, settings = {}, signed } = {}) {
  const clock = { now: NOW };
  const store = new MemoryLinearStore({ videos, rights, settings });
  const service = createLinearService({
    store, now: () => clock.now, cacheMs: 0,
    signPlaybackToken: signed || (async (id) => `token-for-${id}`),
  });
  return { clock, store, service };
}

async function approved(service, input, acknowledgeWarnings = false) {
  const entry = await service.createEntry(input, 'admin-uid');
  return service.approveEntry(entry.id, { acknowledgeWarnings }, 'admin-uid');
}

test('Eastern Time scheduling follows daylight saving and refuses missing or ambiguous wall times', () => {
  assert.equal(channelLocalToUtc('2026-03-03T20:00'), '2026-03-04T01:00:00.000Z', 'EST is UTC-5');
  assert.equal(channelLocalToUtc('2026-03-10T20:00'), '2026-03-11T00:00:00.000Z', 'EDT is UTC-4');
  assert.throws(() => channelLocalToUtc('2026-03-08T02:30'), /does not exist/);
  assert.throws(() => channelLocalToUtc('2026-11-01T01:30'), /occurs twice/);
  assert.equal(channelLocalToUtc('2026-11-01T01:30', { fold: 'first' }), '2026-11-01T05:30:00.000Z');
  assert.equal(channelLocalToUtc('2026-11-01T01:30', { fold: 'second' }), '2026-11-01T06:30:00.000Z');
  assert.deepEqual(channelWeekDates('2026-11-30').slice(0, 2), ['2026-11-30', '2026-12-01']);
  assert.throws(() => channelWeekDates('2026-12-01'), /Monday/);
});

test('titles without confirmed linear rights cannot be approved; on-demand approval does not count', async () => {
  const { service } = setup({ rights: {} });
  const entry = await service.createEntry({ videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T09:00' }, 'admin-uid');
  assert.equal(entry.status, 'draft');
  assert.equal(entry.linearRights, 'unverified');
  await assert.rejects(service.approveEntry(entry.id, {}, 'admin-uid'), /Linear .* rights are not confirmed/);
});

test('series rights cover its episodes, a title denial overrides them, and expiry inside the slot blocks approval', async () => {
  const episode = movie({ id: 'ep-2', contentType: 'EPISODE', seriesTitle: 'Dreadheads', seasonNumber: 1, episodeNumber: 2 });
  const { service, store } = setup({ videos: [episode], rights: { [`series_${seriesKey('Dreadheads')}`]: confirmed() } });
  const ok = await service.createEntry({ videoId: 'ep-2', programType: 'episode', startAtLocal: '2026-12-01T09:00' }, 'a');
  assert.deepEqual(ok.issues.blocking, []);
  await store.setRights('title_ep-2', { status: 'denied', basis: 'Creator withdrew linear permission in writing.' });
  assert.match((await service.listSchedule({ from: '2026-12-01T00:00:00Z', to: '2026-12-02T00:00:00Z' }))[0].issues.blocking.join(), /not granted/);
  await store.setRights('title_ep-2', confirmed({ expiresAt: '2026-12-01T14:10:00.000Z' }));
  await assert.rejects(service.approveEntry(ok.id, {}, 'a'), /expire before this slot ends/);
});

test('viewers join at the server-computed offset, the guide lists what is next, and drafts never air', async () => {
  const { clock, service } = setup({ videos: [movie(), movie({ id: 'movie-2', title: 'D.O.A.', muxPlaybackId: 'p2', duration: 4500 })],
    rights: { 'title_movie-1': confirmed(), 'title_movie-2': confirmed() }, settings: { status: 'public' } });
  const first = await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T07:00', sourceStartSeconds: 30, durationSeconds: 3600 });
  await approved(service, { videoId: 'movie-2', programType: 'rerun', afterEntryId: first.id });
  await service.createEntry({ videoId: 'movie-2', programType: 'movie', startAtLocal: '2026-12-01T15:00' }, 'a');
  clock.now = NOW + 600_500;
  const state = await service.channelState();
  assert.equal(state.now.state, 'playing');
  assert.equal(state.now.title, 'His Girl Friday');
  assert.equal(state.now.playback.muxPlaybackId, 'public-playback-1');
  assert.equal(state.now.playback.offsetSeconds, 630.5);
  assert.equal(state.now.playback.sourceEndSeconds, 3630);
  assert.equal(state.now.playback.playbackToken, undefined);
  assert.equal(state.next.title, 'D.O.A.');
  assert.equal(state.next.label, 'Rerun');
  assert.equal(state.next.startAt, '2026-12-01T13:00:00.000Z');
  assert.equal(state.next.playback, undefined, 'the next program is never handed out early');
  assert.equal(state.guide.length, 2, 'the unapproved draft does not appear');
  assert.equal(state.refreshAfterMs, 60_000);
  clock.now = Date.parse('2026-12-01T12:59:58.000Z');
  assert.equal((await service.channelState()).refreshAfterMs, 2_000);
  clock.now = Date.parse('2026-12-01T13:00:00.000Z');
  assert.equal((await service.channelState()).now.title, 'D.O.A.');
  clock.now = Date.parse('2026-12-01T14:20:00.000Z');
  const offAir = await service.channelState();
  assert.equal(offAir.now.state, 'off-air');
  assert.equal(offAir.now.playback, undefined);
});

test('the channel stays hidden until launched, except for an Administrator preview', async () => {
  const { service } = setup();
  await assert.rejects(service.channelState(), /not available/);
  assert.equal((await service.channelState({ preview: true })).channel.preview, true);
  await assert.rejects(service.updateSettings({ status: 'public' }, 'a'), /Type "LAUNCH PROtv LIVE"/);
  const launched = await service.updateSettings({ status: 'public', confirmation: LAUNCH_CONFIRMATION }, 'owner');
  assert.equal(launched.status, 'public');
  assert.equal(launched.launchedBy, 'owner');
  assert.equal((await service.status()).public, true);
});

test('a premiere never plays or reveals its episode before release, then joins on schedule once released', async () => {
  const rights = { [`series_${seriesKey('Dreadheads')}`]: confirmed() };
  const { clock, service, store } = setup({ videos: [heldEpisode()], rights, settings: { status: 'public' } });
  const draft = await service.createEntry({ videoId: 'creator_episode_ep1', programType: 'premiere', startAtLocal: '2026-12-01T20:00' }, 'a');
  assert.match(draft.issues.warnings[0], /Not released yet/);
  await assert.rejects(service.approveEntry(draft.id, {}, 'a'), /Confirm before approving/);
  await service.approveEntry(draft.id, { acknowledgeWarnings: true }, 'a');
  await assert.rejects(service.createEntry({ videoId: 'creator_episode_ep1', programType: 'episode', startAtLocal: '2026-12-02T20:00' }, 'a')
    .then((entry) => service.approveEntry(entry.id, {}, 'a')), /not released yet/);

  const guide = await service.channelState();
  assert.equal(guide.next.title, 'Dreadheads');
  assert.equal(guide.next.subtitle, 'New episode');
  assert.doesNotMatch(JSON.stringify(guide), /Secret/);

  clock.now = Date.parse('2026-12-02T01:00:30.000Z');
  const waiting = await service.channelState();
  assert.equal(waiting.now.state, 'awaiting-release');
  assert.equal(waiting.now.playback, undefined);
  assert.ok(waiting.refreshAfterMs <= 15_000);
  assert.doesNotMatch(JSON.stringify(waiting), /Secret/);

  // The Creator Portal releases the episode (PROtv LIVE never does).
  store.videos.set('creator_episode_ep1', heldEpisode({ status: 'ready', approvalStatus: 'approved', releaseStatus: 'published', muxPlaybackId: 'released-1' }));
  clock.now = Date.parse('2026-12-02T01:01:00.000Z');
  const live = await service.channelState();
  assert.equal(live.now.state, 'playing');
  assert.equal(live.now.playback.offsetSeconds, 60);
  assert.equal(live.now.subtitle, 'S1 · E1 · Secret pilot title');
});

test('a premiere slot before an approved release time is refused', async () => {
  const scheduled = movie({ id: 'movie-9', releaseStatus: 'scheduled', releaseAt: '2026-12-02T02:00:00.000Z', muxPlaybackId: 'p9' });
  const { service } = setup({ videos: [scheduled], rights: { 'title_movie-9': confirmed() } });
  const early = await service.createEntry({ videoId: 'movie-9', programType: 'premiere', startAtLocal: '2026-12-01T20:00' }, 'a');
  assert.match(early.issues.blocking.join(), /before the approved release time/);
  const onTime = await service.createEntry({ videoId: 'movie-9', programType: 'premiere', startAtLocal: '2026-12-01T22:00' }, 'a');
  assert.deepEqual(onTime.issues.blocking, []);
});

test('withdrawn rights or an unpublished title take a program off the air immediately', async () => {
  const { clock, service, store } = setup({ settings: { status: 'public' } });
  await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T07:00' });
  clock.now = NOW + 60_000;
  assert.equal((await service.channelState()).now.state, 'playing');
  await store.setRights('title_movie-1', { status: 'denied', basis: 'Licensor withdrew linear permission today.' });
  const after = await service.channelState();
  assert.equal(after.now.state, 'off-air');
  assert.deepEqual(after.guide, []);
});

test('signed titles receive a playback token; overlapping slots are refused; chaining follows the previous slot', async () => {
  const { service } = setup({ videos: [movie({ muxPlaybackPolicy: 'signed' })], settings: { status: 'public' }, signed: async (id, duration) => `signed:${id}:${duration}` });
  const first = await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T07:00' });
  assert.equal((await service.channelState()).now.playback.playbackToken, 'signed:public-playback-1:5520');
  await assert.rejects(service.createEntry({ videoId: 'movie-1', programType: 'rerun', startAtLocal: '2026-12-01T08:00' }, 'a'), /overlaps/);
  const brk = await service.createEntry({ kind: 'break', durationSeconds: 120, afterEntryId: first.id }, 'a');
  assert.equal(brk.startAt, first.endAt);
  assert.match(brk.issues.warnings.join(), /Ad insertion is not active/);
  await assert.rejects(service.createEntry({ kind: 'break', durationSeconds: 5, startAtLocal: '2026-12-01T18:00' }, 'a'), /15 seconds/);
});

test('primetime drafting fills only what is available, never approves, and explains every empty slot', async () => {
  const rights = { [`series_${seriesKey('Dreadheads')}`]: confirmed() };
  const placeholder = { id: 'coming_soon_x', contentType: 'SERIES', title: 'Dread Head', seriesTitle: 'Dread Head', approvalStatus: 'approved', status: 'ready' };
  const iron = heldEpisode({ id: 'iron-1', creatorEpisodeId: 't1', seriesTitle: 'Ironborn' });
  const { service } = setup({ videos: [heldEpisode(), placeholder, iron], rights });
  const results = await service.draftPrimetimeWeek('2026-11-30', 'admin-uid');
  const bySeries = Object.fromEntries(results.map((item) => [item.seriesTitle, item]));
  assert.equal(bySeries.Dreadheads.created.programType, 'premiere');
  assert.equal(bySeries.Dreadheads.created.status, 'draft');
  assert.equal(bySeries.Dreadheads.created.startAt, '2026-12-02T01:00:00.000Z');
  assert.match(bySeries['Mr. Ceasefire'].reason, /No episodes of "Mr. Ceasefire"/);
  assert.match(bySeries.Ironborn.reason, /linear rights are not confirmed/);
  assert.equal(bySeries.Ironborn.slot, '2026-12-03T20:00');
  assert.match(bySeries.Sidepiece.reason, /No episodes/);
  const again = await service.draftPrimetimeWeek('2026-11-30', 'admin-uid');
  assert.match(again.find((item) => item.seriesTitle === 'Dreadheads').reason, /Already scheduled/);
  const { service: lateService, clock } = setup({ videos: [heldEpisode()], rights });
  clock.now = Date.parse('2026-12-03T12:00:00.000Z');
  assert.match((await lateService.draftPrimetimeWeek('2026-11-30', 'a'))[0].reason, /in the past/);
});

test('repeating a week copies approved programming at the same Eastern times, checks every copy, and keeps primetime open', async () => {
  const videos = [movie(), movie({ id: 'movie-2', title: 'D.O.A.', muxPlaybackId: 'p2', duration: 4500 })];
  const { service, store } = setup({ videos, rights: { 'title_movie-1': confirmed(), 'title_movie-2': confirmed() } });
  const first = await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T09:00' });
  await approved(service, { kind: 'break', durationSeconds: 120, afterEntryId: first.id }, true);
  await approved(service, { videoId: 'movie-2', programType: 'movie', startAtLocal: '2026-12-01T19:30' });
  await service.createEntry({ videoId: 'movie-2', programType: 'movie', startAtLocal: '2026-12-02T12:00' }, 'a');

  const preview = await service.repeatWeek({ sourceWeekOf: '2026-11-30', targetWeekOf: '2026-12-07', weeks: 2 }, 'a');
  assert.equal(preview.applied, false);
  assert.equal(preview.planned, 4, 'the movie and break, twice; the draft is not copied');
  assert.match(preview.items.find((item) => item.title === 'D.O.A.').reason, /Primetime lineup slot left open/);
  assert.equal(store.entries.size, 4, 'a preview writes nothing');

  const applied = await service.repeatWeek({ sourceWeekOf: '2026-11-30', targetWeekOf: '2026-12-07', weeks: 2, apply: true }, 'admin-uid');
  assert.equal(applied.created, 4);
  const copies = [...store.entries.values()].filter((entry) => entry.origin === 'repeat');
  assert.deepEqual(copies.map((entry) => entry.startAt).sort(), [
    '2026-12-08T14:00:00.000Z', '2026-12-08T15:32:00.000Z', '2026-12-15T14:00:00.000Z', '2026-12-15T15:32:00.000Z',
  ]);
  assert.ok(copies.every((entry) => entry.status === 'approved' && entry.approvedBy === 'admin-uid'));

  const again = await service.repeatWeek({ sourceWeekOf: '2026-11-30', targetWeekOf: '2026-12-07', apply: true }, 'a');
  assert.equal(again.created, 0);
  assert.match(again.items[0].reason, /Conflicts with an entry/);

  await service.setRights('title_movie-1', { status: 'confirmed', basis: 'Schedule B clause 4 grants linear.', expiresOn: '2026-12-20' }, 'a');
  const expired = await service.repeatWeek({ sourceWeekOf: '2026-11-30', targetWeekOf: '2026-12-21' }, 'a');
  assert.match(expired.items.find((item) => item.title === 'His Girl Friday').reason, /expired/);
  await assert.rejects(service.repeatWeek({ sourceWeekOf: '2026-11-30', targetWeekOf: '2026-11-30' }, 'a'), /after the source week/);
  await assert.rejects(service.repeatWeek({ sourceWeekOf: '2026-11-30', targetWeekOf: '2026-12-07', weeks: 9 }, 'a'), /1 to 4/);
});

test('repeating across the spring daylight-saving change keeps wall-clock times and skips times that do not exist', async () => {
  const { clock, service } = setup({ videos: [movie({ duration: 1800 })] });
  clock.now = Date.parse('2027-03-01T05:00:00.000Z');
  await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2027-03-03T18:00' });
  await approved(service, { videoId: 'movie-1', programType: 'rerun', startAtLocal: '2027-03-07T02:30' });
  const result = await service.repeatWeek({ sourceWeekOf: '2027-03-01', targetWeekOf: '2027-03-08', weeks: 2, apply: true }, 'a');
  const [beforeChange, night, afterChange] = result.items;
  assert.equal(beforeChange.startAt, '2027-03-10T23:00:00.000Z', '6 PM EST, before the change');
  assert.equal(afterChange.startAt, '2027-03-17T22:00:00.000Z', '6 PM EDT after the change');
  assert.equal(afterChange.action, 'create');
  assert.equal(night.action, 'skip');
  assert.match(night.reason, /does not exist/, 'Sunday 14 March 2:30 AM is skipped when clocks spring forward');
});

test('weekly coverage shows on-air time and every gap; drafts and unplayable slots count as gaps', async () => {
  const { service } = setup({ videos: [movie(), movie({ id: 'no-rights', muxPlaybackId: 'p3' })] });
  await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T09:00' });
  await service.createEntry({ videoId: 'movie-1', programType: 'rerun', startAtLocal: '2026-12-01T13:00' }, 'a');
  await service.createEntry({ videoId: 'no-rights', programType: 'movie', startAtLocal: '2026-12-01T16:00' }, 'a');
  const coverage = await service.weekCoverage('2026-11-30');
  const monday = coverage.days[0];
  const tuesday = coverage.days[1];
  assert.equal(monday.onAirSeconds, 0);
  assert.equal(monday.gapSeconds, 86_400);
  assert.equal(tuesday.onAirSeconds, 5520);
  assert.deepEqual(tuesday.gaps, [
    { startAt: '2026-12-01T05:00:00.000Z', endAt: '2026-12-01T14:00:00.000Z' },
    { startAt: '2026-12-01T15:32:00.000Z', endAt: '2026-12-02T05:00:00.000Z' },
  ]);
  await assert.rejects(service.weekCoverage('2026-12-01'), /Monday/);
});

test('the agreement review pre-fills evidence but never records a decision; partial creator films need acknowledgement', async () => {
  const altc = movie({ id: 'creator_5a913abe-bbb5-44a5-9c8f-cc12b7496ba9', title: 'A Long Time Coming', muxPlaybackId: 'p4', duration: 8998, creatorContractReference: '3e9c05e3-55d4-463a-9d60-8da0622adab9', licenseType: 'Creator Schedule STD6040-v1', copyrightStatus: 'creator-owned' });
  const other = movie({ id: 'creator_other', title: 'Other', muxPlaybackId: 'p5', duration: 3000, creatorContractReference: 'ref-b', licenseType: 'Creator Schedule B', rokuCleared: 'true', copyrightStatus: 'creator-owned' });
  const { service } = setup({ videos: [altc, other], rights: { 'title_creator_other': confirmed() } });
  const review = await service.rightsReview();
  const byId = Object.fromEntries(review.titles.map((item) => [item.videoId, item]));
  assert.equal(byId[altc.id].agreement.finding, 'supports');
  assert.equal(byId[altc.id].effective, 'unverified', 'a finding is not a decision');
  assert.equal(byId[altc.id].record, null);
  assert.match(byId[altc.id].agreement.basis, /watchprotv\.com/);
  assert.equal(byId.creator_other.agreement.finding, 'not-reviewed');
  assert.match(byId.creator_other.agreement.caution, /names TV apps/);
  const partial = await service.createEntry({ videoId: 'creator_other', programType: 'movie', startAtLocal: '2026-12-01T09:00', durationSeconds: 1200 }, 'a');
  assert.match(partial.issues.warnings.join(), /only part of a creator film/);
  await assert.rejects(service.approveEntry(partial.id, {}, 'a'), /Confirm before approving/);
});

test('events from a program that just ended are still attributed to it within the grace period', async () => {
  const { clock, service } = setup({ settings: { status: 'public' } });
  const entry = await approved(service, { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T07:00', durationSeconds: 600 });
  clock.now = Date.parse(entry.endAt) + 60_000;
  assert.equal((await service.entryOnAir(entry.id)).entry.id, entry.id);
  assert.equal(await service.entryOnAir(null), null, 'a tune-in after the end belongs to no program');
  clock.now = Date.parse(entry.endAt) + 180_000;
  assert.equal(await service.entryOnAir(entry.id), null);
});

test('program reports cover Eastern days, and rights end at the end of an Eastern day in any season', async () => {
  assert.deepEqual(programRange('2026-11-01', '2026-11-07'), {
    fromIso: '2026-11-01T04:00:00.000Z',
    toIso: '2026-11-08T05:00:00.000Z',
  }, 'Saturday 8 PM ET (01:00Z Sunday) is included; the previous Saturday night is not');
  const { service } = setup();
  const winter = await service.setRights('title_movie-1', { status: 'confirmed', basis: 'Schedule B clause 4 grants linear.', expiresOn: '2026-12-31' }, 'a');
  assert.equal(winter.expiresAt, '2027-01-01T04:59:59.999Z');
  const summer = await service.setRights('title_movie-1', { status: 'confirmed', basis: 'Schedule B clause 4 grants linear.', expiresOn: '2026-07-31' }, 'a');
  assert.equal(summer.expiresAt, '2026-08-01T03:59:59.999Z');
});

test('analytics credit watch time only up to real elapsed time and de-duplicate starts', () => {
  const entry = { id: 'e1' };
  const session = { startedAt: NOW, lastCreditAt: NOW, errors: 0 };
  const tune = account({ eventType: 'tune_in', sessionId: SESSION, guestId: SESSION }, { session: null, eventKeyExists: false, viewerKeyExists: false, entry, now: NOW });
  assert.deepEqual(tune.daily, { tuneIns: 1, uniqueViewers: 1 });
  assert.equal(account({ eventType: 'tune_in', sessionId: SESSION }, { eventKeyExists: true, now: NOW }).result.duplicate, true);
  assert.equal(account({ eventType: 'video_start', sessionId: SESSION, entryId: 'e1' }, { session: null, entry, now: NOW }).result.reason, 'no-tune-in');
  assert.equal(account({ eventType: 'video_start', sessionId: SESSION, entryId: 'e1' }, { session, entry: null, now: NOW }).result.reason, 'not-on-air');
  const early = account({ eventType: 'heartbeat', sessionId: SESSION, entryId: 'e1', seconds: 60 }, { session, entry, now: NOW + 10_000 });
  assert.equal(early.daily.watchSeconds, 10, 'only the ten seconds that really passed');
  const full = account({ eventType: 'heartbeat', sessionId: SESSION, entryId: 'e1', seconds: 60 }, { session, entry, now: NOW + 600_000 });
  assert.equal(full.daily.watchSeconds, 60);
  // A client flooding heartbeats is credited no more than real time.
  let spamSession = { ...session };
  let credited = 0;
  for (let index = 1; index <= 89; index += 1) {
    const at = NOW + index * 670;
    const outcome = account({ eventType: 'heartbeat', sessionId: SESSION, entryId: 'e1', seconds: 60 }, { session: spamSession, entry, now: at });
    if (outcome.daily) {
      credited += outcome.daily.watchSeconds;
      spamSession = { ...spamSession, ...outcome.sessionUpdate };
    }
  }
  assert.ok(credited <= 60, `credited ${credited}s in 59.6s of real time`);
  const capped = account({ eventType: 'error', sessionId: SESSION, code: 'network' }, { session: { ...session, errors: 20 }, now: NOW });
  assert.equal(capped.result.reason, 'error-limit');
  assert.throws(() => validateLinearEvent({ eventType: 'heartbeat', sessionId: SESSION, entryId: 'e1', seconds: 600 }), /1 to 60/);
  assert.throws(() => validateLinearEvent({ eventType: 'tune_in', sessionId: SESSION, videoId: 'x' }), /unsupported fields/);

  const report = summarize([
    { date: '2026-12-01', tuneIns: 3, uniqueViewers: 2, videoStarts: 2, watchSeconds: 1200, errors: 1, errors_network: 1 },
    { date: '2026-12-01', tuneIns: 1, videoStarts: 1, watchSeconds: 600 },
  ], [
    { entryId: 'e1', title: 'A', startAt: '2026-12-02T01:00:00.000Z', videoStarts: 2, watchSeconds: 1500, tuneIns: 3 },
    { entryId: 'e1', title: 'A', startAt: '2026-12-02T01:00:00.000Z', videoStarts: 1, watchSeconds: 300 },
  ], { from: '2026-12-01', to: '2026-12-01' });
  assert.equal(report.totals.tuneIns, 4);
  assert.equal(report.totals.watchMinutes, 30);
  assert.equal(report.totals.startRate, 0.75);
  assert.equal(report.days[0].errorsByCode.network, 1);
  assert.equal(report.programs[0].videoStarts, 3);
  assert.equal(report.programs[0].averageMinutesPerStart, 10);
});

async function listen(t, { service, admin = false, recorded = [] }) {
  const app = express();
  app.use(express.json());
  const user = admin ? { uid: 'admin-uid', admin: true } : null;
  const analytics = { record: async (event, context) => { recorded.push({ event, context }); return { recorded: true }; }, report: async () => ({ totals: {} }) };
  app.use('/v1/linear', createLinearRouter({
    service, analytics, rateLimit: async () => {}, clientAddress: () => '127.0.0.1',
    authenticate: (req, res, next) => { req.user = user; next(); },
  }));
  const audits = [];
  app.use('/admin/linear', createAdminLinearRouter({
    service, analytics, audit: async (event) => { audits.push(event); },
    verifyAdmin: (req, res, next) => (admin ? (req.user = user, next()) : res.status(403).json({ error: 'Admin access is required.' })),
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body } = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
  };
  return { call, audits };
}

test('HTTP: the public channel is hidden while off, events validate, and admin-only routes refuse viewers', async (t) => {
  const { service } = setup();
  const recorded = [];
  const { call } = await listen(t, { service, recorded });
  assert.deepEqual((await call('/v1/linear/status')).body, { channelId: 'protv-live', name: 'PROtv LIVE', public: false });
  const hidden = await call('/v1/linear/channel?preview=1');
  assert.equal(hidden.status, 404);
  assert.equal(hidden.headers.get('cache-control'), 'no-store');
  assert.equal((await call('/v1/linear/events', { method: 'POST', body: { eventType: 'tune_in', sessionId: SESSION } })).status, 404);
  assert.equal((await call('/admin/linear/schedule?from=2026-12-01&to=2026-12-02')).status, 403);
  await service.updateSettings({ status: 'public', confirmation: LAUNCH_CONFIRMATION }, 'owner');
  assert.equal((await call('/v1/linear/events', { method: 'POST', body: { eventType: 'tune_in', sessionId: 'nope' } })).status, 400);
  assert.equal((await call('/v1/linear/events', { method: 'POST', body: { eventType: 'tune_in', sessionId: SESSION } })).status, 201);
  assert.equal(recorded.length, 1);
});

test('HTTP: an Administrator previews, schedules, approves and is excluded from channel analytics', async (t) => {
  const { service } = setup();
  const recorded = [];
  const { call, audits } = await listen(t, { service, admin: true, recorded });
  const created = await call('/admin/linear/schedule', { method: 'POST', body: { videoId: 'movie-1', programType: 'movie', startAtLocal: '2026-12-01T07:00' } });
  assert.equal(created.status, 201);
  assert.equal((await call(`/admin/linear/schedule/${created.body.id}/approve`, { method: 'POST', body: {} })).body.status, 'approved');
  const preview = await call('/v1/linear/channel?preview=1');
  assert.equal(preview.status, 200);
  assert.equal(preview.body.now.title, 'His Girl Friday');
  assert.equal((await call('/v1/linear/events', { method: 'POST', body: { eventType: 'tune_in', sessionId: SESSION } })).body.excluded, true);
  assert.equal(recorded.length, 0);
  const rights = await call('/admin/linear/rights/title_movie-1', { method: 'PUT', body: { status: 'confirmed', basis: 'short' } });
  assert.equal(rights.status, 400);
  assert.equal((await call('/admin/linear/analytics?from=2026-12-01&to=2027-06-01')).status, 400);
  assert.deepEqual(audits.map((event) => event.type), ['linear.schedule_create', 'linear.schedule_approve']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TEST_AHEAD_MS, TEST_PAST_MS, clampTestTime, testPrograms, testTargets } from '../src/data/linearTestMode.js';

const at = (iso) => Date.parse(iso);
// 7:00 movie → 8:32 break → 8:33 movie; Thursday 7:50 countdown → 8:00 premiere. One draft that must be ignored.
const schedule = [
  { id: 'doa', kind: 'program', status: 'approved', title: 'D.O.A.', startAt: '2026-12-01T13:33:00.000Z', endAt: '2026-12-01T14:48:00.000Z' },
  { id: 'hgf', kind: 'program', status: 'approved', title: 'His Girl Friday', startAt: '2026-12-01T12:00:00.000Z', endAt: '2026-12-01T13:32:00.000Z' },
  { id: 'brk', kind: 'break', status: 'approved', title: 'Commercial break', startAt: '2026-12-01T13:32:00.000Z', endAt: '2026-12-01T13:33:00.000Z' },
  { id: 'draft', kind: 'program', status: 'draft', title: 'Not approved', startAt: '2026-12-02T12:00:00.000Z', endAt: '2026-12-02T13:00:00.000Z' },
  { id: 'cd', kind: 'countdown', status: 'approved', title: 'Countdown: Ironborn', startAt: '2026-12-04T00:50:00.000Z', endAt: '2026-12-04T01:00:00.000Z' },
  { id: 'iron', kind: 'program', status: 'approved', title: 'Ironborn — Hell Has No Fury', startAt: '2026-12-04T01:00:00.000Z', endAt: '2026-12-04T01:01:20.000Z' },
];

test('the program dropdown lists approved programs only, in air order, with Eastern day and time', () => {
  const programs = testPrograms(schedule);
  assert.deepEqual(programs.map((item) => item.id), ['hgf', 'doa', 'iron']);
  assert.equal(programs[0].label, 'Tue, Dec 1, 7:00 AM ET · His Girl Friday');
  assert.match(programs[2].label, /^Thu, Dec 3, 8:00 PM ET · Ironborn/);
});

test('each test button jumps to the right simulated moment', () => {
  const now = at('2026-12-01T12:30:00Z');
  const targets = testTargets(schedule, now, 'iron');
  assert.equal(targets.programStart, at('2026-12-04T01:00:00Z'));
  assert.equal(targets.programEnding, at('2026-12-04T01:01:10Z'), 'ten seconds before the selected program ends');
  assert.equal(targets.nextBreak, at('2026-12-01T13:32:00Z'));
  assert.equal(targets.beforeNextBreak, at('2026-12-01T13:31:55Z'));
  assert.equal(targets.handoff, at('2026-12-01T13:31:55Z'), 'five seconds before the on-air program hands over');
  assert.equal(targets.countdownStart, at('2026-12-04T00:50:00Z'));
  assert.equal(targets.countdownFinal, at('2026-12-04T00:59:40Z'));

  const duringCountdown = testTargets(schedule, at('2026-12-04T00:55:00Z'));
  assert.equal(duringCountdown.countdownFinal, at('2026-12-04T00:59:40Z'), 'the countdown on air can still jump to its final seconds');
  assert.equal(duringCountdown.handoff, at('2026-12-04T00:59:55Z'));
  assert.equal(duringCountdown.programStart, null, 'nothing selected');
  assert.equal(testTargets(schedule, at('2026-12-05T00:00:00Z')).nextBreak, null, 'no break left in range');
});

test('test times stay inside the range the server accepts', () => {
  const realNow = at('2026-11-22T20:00:00Z');
  assert.equal(clampTestTime(realNow + 40 * 86_400_000, realNow), realNow + TEST_AHEAD_MS - 60_000);
  assert.equal(clampTestTime(realNow - 3 * 86_400_000, realNow), realNow - TEST_PAST_MS + 60_000);
  assert.equal(clampTestTime(realNow + 1000.4, realNow), realNow + 1000);
});

test('test mode uses only the Administrator route and never records channel analytics', () => {
  const api = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
  const live = readFileSync(new URL('../src/pages/Live.jsx', import.meta.url), 'utf8');
  assert.match(api, /\/admin\/linear\/test\/channel\?at=/);
  assert.doesNotMatch(api, /\/v1\/linear\/channel[^`]*at=/, 'the public channel request never carries a time');
  assert.match(live, /if \(testMode \|\| doNotTrack\(\)\) return;/);
  assert.match(live, /testMode && \(adminLoading \|\| !isAdmin\)/, 'test mode loads nothing for non-Administrators');
});

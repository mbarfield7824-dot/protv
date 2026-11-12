import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createServerClock,
  createWatchMeter,
  formatChannelTime,
  guideByDay,
  livePosition,
  needsResync,
  refreshDelay,
  retryDelay,
  seekAllowed,
  segmentFinished,
  serverNow,
  stillWatchingDue,
  withGaps,
} from '../src/data/linearChannel.js';

const playback = { offsetSeconds: 600, sourceStartSeconds: 0, sourceEndSeconds: 1500 };

test('the server clock is anchored at the request midpoint, so a wrong device clock does not move the join point', () => {
  // The device clock is 1 hour fast and the request took 400 ms.
  const deviceSkew = 3_600_000;
  const clock = createServerClock({ serverTimeMs: 1_000_000, requestStartedAt: 1_000_000 - 200 + deviceSkew, responseReceivedAt: 1_000_000 + 200 + deviceSkew });
  assert.equal(serverNow(clock, 1_000_000 + deviceSkew), 1_000_000);
  assert.equal(livePosition(playback, clock, 1_000_000 + deviceSkew + 30_000), 630);
});

test('the live position never runs past the scheduled segment and drives end-of-program handling', () => {
  const clock = { serverMs: 0, localMs: 0 };
  assert.equal(livePosition(playback, clock, 899_000), 1499);
  assert.equal(livePosition(playback, clock, 5_000_000), 1500);
  assert.equal(segmentFinished(playback, clock, 899_000), false);
  assert.equal(segmentFinished(playback, clock, 899_600), true);
});

test('drift beyond tolerance resyncs; seeks that leave the live point are undone', () => {
  assert.equal(needsResync(605, 600), false);
  assert.equal(needsResync(590, 600), true);
  assert.equal(needsResync(Number.NaN, 600), false);
  assert.equal(seekAllowed(602, 600), true);
  assert.equal(seekAllowed(1400, 600), false, 'cannot skip ahead');
  assert.equal(seekAllowed(10, 600), false, 'cannot rewind on the channel');
});

test('boundary refreshes are spread out and failures back off to 30 seconds', () => {
  assert.equal(refreshDelay(5_000, () => 0), 5_250);
  assert.equal(refreshDelay(5_000, () => 0.999), 7_497);
  assert.equal(refreshDelay(0, () => 0), 60_250);
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(retryDelay), [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
});

test('the guide is grouped by Eastern day across midnight and labelled in ET', () => {
  const days = guideByDay([
    { entryId: 'a', startAt: '2026-12-02T01:00:00.000Z' },
    { entryId: 'b', startAt: '2026-12-02T04:30:00.000Z' },
    { entryId: 'c', startAt: '2026-12-02T05:30:00.000Z' },
  ]);
  assert.deepEqual(days.map((day) => [day.date, day.items.map((item) => item.entryId)]), [
    ['2026-12-01', ['a', 'b']],
    ['2026-12-02', ['c']],
  ]);
  assert.equal(formatChannelTime('2026-12-02T01:00:00.000Z'), '8:00 PM ET');
  assert.equal(formatChannelTime('2026-07-01T00:00:00.000Z'), '8:00 PM ET');
});

test('the guide shows gaps between programs as off air instead of filling them', () => {
  const items = withGaps([
    { entryId: 'a', startAt: '2026-12-02T01:00:00.000Z', endAt: '2026-12-02T02:00:00.000Z' },
    { entryId: 'b', startAt: '2026-12-02T02:00:30.000Z', endAt: '2026-12-02T03:00:00.000Z' },
    { entryId: 'c', startAt: '2026-12-02T05:00:00.000Z', endAt: '2026-12-02T06:00:00.000Z' },
  ]);
  assert.deepEqual(items.map((item) => item.kind === 'gap' ? `gap ${item.startAt}-${item.endAt}` : item.entryId), [
    'a', 'b', 'gap 2026-12-02T03:00:00.000Z-2026-12-02T05:00:00.000Z', 'c',
  ], 'a 30-second seam is not a gap');
});

test('an unattended player is stopped after three hours so no delivery is spent on an empty room', () => {
  const hour = 3_600_000;
  assert.equal(stillWatchingDue({ lastInteractionAt: 0, now: 3 * hour - 1, playing: true }), false);
  assert.equal(stillWatchingDue({ lastInteractionAt: 0, now: 3 * hour, playing: true }), true);
  assert.equal(stillWatchingDue({ lastInteractionAt: 0, now: 10 * hour, playing: false }), false, 'nothing to stop off air');
});

class FakePlayer extends EventTarget {
  currentTime = 0;
  paused = false;
  seeking = false;
}

test('watch time counts only real forward playback and is taken in heartbeat-sized pieces', () => {
  const player = new FakePlayer();
  let wall = 0;
  const meter = createWatchMeter({ player, now: () => wall });
  for (let second = 1; second <= 90; second += 1) {
    wall = second * 1000;
    player.currentTime = second;
    player.dispatchEvent(new Event('timeupdate'));
  }
  assert.equal(meter.take(), 60);
  assert.equal(meter.take(), 30);
  player.paused = true;
  wall += 20_000;
  player.currentTime += 20;
  player.dispatchEvent(new Event('timeupdate'));
  player.paused = false;
  wall += 1_000;
  player.currentTime += 600;
  player.dispatchEvent(new Event('timeupdate'));
  assert.equal(meter.take(), 0, 'paused time and jumps are not counted');
  meter.cleanup();
});

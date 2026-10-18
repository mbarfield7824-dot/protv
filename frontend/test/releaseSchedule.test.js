import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleInZone, scheduleToUtc } from '../src/admin/releaseSchedule.js';
import { muxThumbnailUrl, muxStillUrl, fallbackArtworkUrl } from '../src/utils/artwork.js';

test('release times use the selected zone, not the browser zone', () => {
  assert.equal(scheduleToUtc('2026-10-20T20:30', 'America/New_York'), '2026-10-21T00:30:00.000Z');
  assert.equal(scheduleToUtc('2026-12-20T20:30', 'America/New_York'), '2026-12-21T01:30:00.000Z');
  assert.equal(scheduleToUtc('2026-10-20T20:30', 'Asia/Kathmandu'), '2026-10-20T14:45:00.000Z');
  assert.equal(scheduleToUtc('2026-10-20T00:00', 'UTC'), '2026-10-20T00:00:00.000Z');
  assert.equal(scheduleInZone('2026-10-21T00:30:00Z', 'America/New_York'), '2026-10-20T20:30');
});

test('daylight-saving gaps and overlaps cannot silently select the wrong instant', () => {
  assert.throws(() => scheduleToUtc('2027-03-14T02:30', 'America/New_York'), /does not exist/);
  assert.throws(() => scheduleToUtc('2026-11-01T01:30', 'America/New_York'), /occurs twice/);
  for (const value of ['', 'bad', '2026-02-30T12:00', '2026-12-20T25:00']) {
    assert.throws(() => scheduleToUtc(value, 'UTC'));
  }
});

test('signed assets use catalog fallback artwork, not unsigned thumbnail requests', () => {
  const video = { muxPlaybackId: 'signedPlayback', muxPlaybackPolicy: 'signed' };
  assert.equal(muxThumbnailUrl(video), '');
  assert.equal(muxStillUrl(video), '');
  assert.equal(fallbackArtworkUrl(video, 'fallback.jpg'), 'fallback.jpg');
  assert.match(muxThumbnailUrl({ muxPlaybackId: 'publicPlayback' }), /publicPlayback/);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const { restoredWatchProgress } = require('../src/watchProgress');

test('restores legacy literal dotted fields alongside correctly nested watch progress', () => {
  const older = { positionSeconds: 10, updatedAt: 100 };
  const newer = { positionSeconds: 20, updatedAt: 200 };
  assert.deepEqual(restoredWatchProgress({
    watchProgress: { one: older, two: newer },
    'watchProgress.one': newer,
    'watchProgress.two': older,
    'watchProgress.three': older,
    email: 'not-progress',
  }), { one: newer, two: newer, three: older });
  assert.deepEqual(restoredWatchProgress(), {});
});

test('older records without timestamps are retained and dated legacy entries can supersede them', () => {
  const undated = { positionSeconds: 10, durationSeconds: 100, progressPercent: 10 };
  const dated = { ...undated, positionSeconds: 5, updatedAt: 100 };
  const profile = {
    watchProgress: { undated, updated: undated, tied: dated },
    'watchProgress.updated': dated,
    'watchProgress.legacy-only': undated,
    'watchProgress.tied': { ...dated, positionSeconds: 90 },
  };
  assert.deepEqual(restoredWatchProgress(profile), {
    undated, updated: dated, tied: dated, 'legacy-only': undated,
  });
  assert.equal(profile.watchProgress.updated, undated);
  assert.equal(profile['watchProgress.updated'], dated);
});

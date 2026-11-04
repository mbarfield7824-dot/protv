const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const { localTimeToUtc, releaseAllowed, scheduledRelease } = require('../src/catalog/releases');

test('Eastern premiere times follow daylight saving and reject missing or ambiguous clock times', () => {
  assert.equal(localTimeToUtc('2026-11-04T20:00', 'America/New_York'), '2026-11-05T01:00:00.000Z');
  assert.throws(() => localTimeToUtc('2026-03-08T02:30', 'America/New_York'), /does not exist/);
  assert.throws(() => localTimeToUtc('2026-11-01T01:30', 'America/New_York'), /ambiguous/);
});

test('scheduled premieres require future local time and retain their timezone', () => {
  const now = Date.parse('2026-10-01T00:00:00.000Z');
  assert.deepEqual(scheduledRelease({
    contentType: 'MOVIE',
    rightsHolder: 'Rights holder',
    rightsVerificationNotes: 'Reviewed signed license.',
    releaseAtLocal: '2026-11-04T20:00',
    releaseTimeZone: 'America/New_York',
  }, now), {
    releaseStatus: 'scheduled',
    releaseAt: '2026-11-05T01:00:00.000Z',
    releaseTimeZone: 'America/New_York',
  });
  assert.equal(scheduledRelease({ releaseAtLocal: '', releaseTimeZone: 'America/New_York' }, now), null);
  assert.throws(() => scheduledRelease({
    contentType: 'MOVIE', rightsHolder: 'Rights holder', rightsVerificationNotes: 'Reviewed.',
    releaseAtLocal: '2026-09-30T20:00',
    releaseTimeZone: 'America/New_York',
  }, now), /future/);
  assert.throws(() => scheduledRelease({
    contentType: 'MOVIE', releaseAtLocal: '2026-11-04T20:00',
    releaseTimeZone: 'America/New_York', rightsHolder: '', rightsVerificationNotes: '',
  }, now), /rights holder/);
  assert.throws(() => scheduledRelease({
    contentType: 'MUSIC', releaseAtLocal: '2026-11-04T20:00',
    releaseTimeZone: 'America/New_York', rightsHolder: 'Rights holder', rightsVerificationNotes: 'Reviewed.',
  }, now), /movies and TV episodes/);
  assert.equal(releaseAllowed({ releaseStatus: 'scheduled', releaseAt: '2099-01-01T00:00:00.000Z' }, now), false);
  assert.equal(releaseAllowed({ releaseStatus: 'scheduled', releaseAt: '2020-01-01T00:00:00.000Z' }, now), true);
});

test('a signed scheduled full title has no public playback until its release instant', async (context) => {
  const title = {
    id: 'scheduled-title', title: 'Scheduled premiere', contentType: 'MOVIE',
    approvalStatus: 'approved', status: 'ready', muxPlaybackPolicy: 'signed',
    muxPlaybackId: 'private-playback-id', duration: 90,
    releaseStatus: 'scheduled', releaseAt: new Date(Date.now() + 60_000).toISOString(),
  };
  let tokenRequests = 0;
  const app = express();
  app.use('/catalog', createCatalogRouter({
    loadApproved: async () => [title],
    signPlaybackToken: async () => { tokenRequests += 1; return 'short-lived-token'; },
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/catalog`;

  assert.equal((await fetch(`${base}/titles/scheduled-title/playback`)).status, 404);
  assert.deepEqual((await (await fetch(`${base}?view=all`)).json()).items, []);
  assert.equal(tokenRequests, 0);

  title.releaseAt = new Date(Date.now() - 60_000).toISOString();
  const response = await fetch(`${base}/titles/scheduled-title/playback`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: title.id, streamType: 'on-demand', muxPlaybackId: title.muxPlaybackId,
    playbackToken: 'short-lived-token',
  });
  assert.equal(tokenRequests, 1);
});

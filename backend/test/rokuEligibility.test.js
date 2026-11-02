const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');

const ROKU = { 'User-Agent': 'Roku/DVP-14.0 (114.00E04114A)' };
const REVIEWED = 'gbcxmtl6mAHQeBxx8Dgs'; // Tears of Steel
const title = (id, overrides = {}) => ({
  id, title: id, contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: `pb${id}`, category: 'Drama', ...overrides,
});
const FUTURE = '2999-01-01T00:00:00.000Z';
const episode = (id, overrides) => title(id, { contentType: 'EPISODE', seriesTitle: 'Show', seasonNumber: 1, episodeNumber: 1, ...overrides });
const records = [
  title(REVIEWED),
  title('held-legacy'),
  title('creator_cleared', { rokuCleared: true }),
  title('creator_silent'),
  title('creator_withdrawn', { rokuCleared: true, rokuHold: true }),
  title(`${REVIEWED}x`, { rokuHold: true }),
  title('creator_rejected', { rokuCleared: true, approvalStatus: 'rejected' }),
  title('creator_music', { contentType: 'MUSIC', musicFormat: 'music_video', rokuCleared: true }),
  episode('creator_episode_live', { rokuCleared: true }),
  episode('creator_episode_uncleared', { episodeNumber: 2 }),
  episode('creator_episode_scheduled', { rokuCleared: true, episodeNumber: 3, releaseStatus: 'scheduled', releaseAt: FUTURE }),
];

async function serve(context) {
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => records.filter((item) => item.approvalStatus === 'approved') }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  return (suffix, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/v1/catalog${suffix}`, { headers });
}
const ids = async (response) => (await response.json()).items.map((item) => item.id).sort();

test('Roku sees reviewed and cleared titles only, without Music, held or unreleased items', async (context) => {
  const get = await serve(context);
  assert.deepEqual(await ids(await get('?view=all', ROKU)), ['creator_cleared', 'creator_episode_live', REVIEWED].sort());
});

test('held titles cannot be reached on Roku by deep link or playback, but stay on other clients', async (context) => {
  const get = await serve(context);
  for (const id of ['held-legacy', 'creator_silent', 'creator_withdrawn', 'creator_episode_scheduled']) {
    assert.equal((await get(`/titles/${id}/playback`, ROKU)).status, 404, id);
    assert.equal((await get(`/titles/${id}`, ROKU)).status, 404, id);
  }
  assert.equal((await get('/titles/creator_cleared/playback', ROKU)).status, 200);
  const web = await ids(await get(''));
  assert.ok(web.includes('held-legacy') && web.includes('creator_silent') && web.includes('creator_music'));
  assert.ok(!web.includes('creator_episode_scheduled') && !web.includes('creator_rejected'));
});

test('an explicit platform header and caching both respect the platform', async (context) => {
  const get = await serve(context);
  assert.ok(!(await ids(await get('?view=all', { 'X-PROtv-Platform': 'roku' }))).includes('held-legacy'));
  const response = await get('?view=all', ROKU);
  assert.match(response.headers.get('vary'), /User-Agent/);
  assert.match(response.headers.get('vary'), /X-PROtv-Platform/);
});

test('both reviewed creator films stay on Roku and off the Fire TV launch list', () => {
  const { eligibleForPlatform } = require('../src/catalog/platformEligibility');
  const films = ['creator_613e215e-709f-48ee-91bb-b225d8da4a33', 'creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6'].map((id) => title(id));
  assert.equal(eligibleForPlatform(films, 'roku').length, 2);
  assert.equal(eligibleForPlatform(films, 'firetv').length, 0);
});

test('Roku series lists contain only cleared released episodes', async (context) => {
  const get = await serve(context);
  const { items } = await (await get('/series', ROKU)).json();
  assert.deepEqual(items.map((item) => item.episodeCount), [1]);
});

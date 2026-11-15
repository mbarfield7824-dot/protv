// Integration of the Samsung (feature/samsung-tizen) and iOS (mobile/ios-release-prep) eligibility rules:
// each platform keeps its own allowlist and policy marker, and every other client is unchanged.
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const {
  FIRETV_LAUNCH_TITLE_IDS,
  IOS_LAUNCH_TITLE_EXPIRY,
  SAMSUNG_LAUNCH_TITLE_EXPIRY,
  eligibleForPlatform,
  rokuEligible,
} = require('../src/catalog/platformEligibility');

const SAMSUNG = { 'User-Agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 10.0)', 'X-PROtv-Platform': 'samsung' };
const IOS = { 'X-PROtv-Platform': 'ios' };
const FIRETV = { 'X-PROtv-Platform': 'firetv' };
const ROKU = { 'User-Agent': 'Roku/DVP-14.0 (14.0.0.4185)' };

const ids = (list) => list.map((item) => item.id).sort();
const title = (id, extra = {}) => ({ id, title: `Title ${id}`, contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: `p-${id}`, category: 'Drama', ...extra });

// Every allowlisted id on any platform, plus titles cleared nowhere special.
const universe = [...new Set([
  ...FIRETV_LAUNCH_TITLE_IDS, ...IOS_LAUNCH_TITLE_EXPIRY.keys(), ...SAMSUNG_LAUNCH_TITLE_EXPIRY.keys(),
  'creator_613e215e-709f-48ee-91bb-b225d8da4a33', 'creator_web-only-a', 'creator_web-only-b',
])].map((id) => title(id));

const ON = new Date('2026-11-14T12:00:00Z');

test('the merged module keeps each platform catalog exactly as on its own branch', () => {
  assert.deepEqual(ids(eligibleForPlatform(universe, 'default', ON)), ids(universe), 'website/Android: everything');
  assert.deepEqual(ids(eligibleForPlatform(universe, 'samsung', ON)), [...SAMSUNG_LAUNCH_TITLE_EXPIRY.keys()].sort());
  assert.deepEqual(ids(eligibleForPlatform(universe, 'ios', ON)), [...IOS_LAUNCH_TITLE_EXPIRY.keys()].sort());
  assert.deepEqual(ids(eligibleForPlatform(universe, 'firetv', ON)), [...FIRETV_LAUNCH_TITLE_IDS].sort());
  assert.deepEqual(ids(eligibleForPlatform(universe, 'roku', ON)), ids(universe.filter(rokuEligible)));
  assert.equal(eligibleForPlatform(universe, 'samsung', ON).length, 8);
  assert.equal(eligibleForPlatform(universe, 'ios', ON).length, 8);
});

test('Samsung and iOS rules stay independent (holds, cutoffs, unknown platforms)', () => {
  const held = universe.map((video) => (SAMSUNG_LAUNCH_TITLE_EXPIRY.has(video.id) ? { ...video, samsungHold: true } : video));
  assert.equal(eligibleForPlatform(held, 'samsung', ON).length, 0, 'samsungHold withdraws from Samsung');
  assert.equal(eligibleForPlatform(held, 'ios', ON).length, 8, 'samsungHold does not affect iOS');
  const after = new Date('2028-11-10T00:00:00Z');
  for (const platform of ['samsung', 'ios']) {
    assert.deepEqual(ids(eligibleForPlatform(universe, platform, after)),
      ['creator_20752565-9909-4c2b-9f53-c9719ca26769', 'gbcxmtl6mAHQeBxx8Dgs', 'hKPU3JNJ4faWLgWE6ZSq', 'sCWQqVE5WIoNNN5wAGQ2'],
      `${platform}: dated grants expire, open-ended ones remain`);
  }
  assert.deepEqual(ids(eligibleForPlatform(universe, 'tizen', ON)), ids(universe), 'an unrecognized platform name is not a rights policy');
});

test('through the router: policy markers and catalogs per client', async (context) => {
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => universe, signPlaybackToken: async () => 'signed' }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;
  const get = async (suffix, headers = {}) => {
    const res = await fetch(base + suffix, { headers });
    return { status: res.status, header: res.headers.get('x-protv-platform-policy'), body: await res.json() };
  };

  const samsung = await get('?view=all', SAMSUNG);
  assert.equal(samsung.body.platformPolicy, 'samsung-rights-v1');
  assert.equal(samsung.body.items.length, 8);
  const ios = await get('?view=all', IOS);
  assert.equal(ios.header, 'ios-rights-v1');
  assert.equal(ios.body.platformPolicy, undefined, 'iOS keeps its header-based marker');
  assert.equal(ios.body.items.length, 8);
  const web = await get('?view=all');
  assert.equal(web.body.platformPolicy, undefined);
  assert.equal(web.header, null);
  assert.equal(web.body.items.length, universe.length);
  assert.equal((await get('?view=all', FIRETV)).body.items.length, FIRETV_LAUNCH_TITLE_IDS.size);
  assert.equal((await get('?view=all', ROKU)).body.items.length, universe.filter(rokuEligible).length);

  // Direct playback of a title outside a platform's allowlist is refused for that platform only.
  assert.equal((await get('/titles/creator_web-only-a/playback', SAMSUNG)).status, 404);
  assert.equal((await get('/titles/creator_web-only-a/playback', IOS)).status, 404);
  assert.equal((await get('/titles/creator_web-only-a/playback')).status, 200);
});

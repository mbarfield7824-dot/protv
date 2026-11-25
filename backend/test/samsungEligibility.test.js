const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const {
  SAMSUNG_LAUNCH_TITLE_EXPIRY,
  FIRETV_LAUNCH_TITLE_IDS,
  eligibleForPlatform,
  samsungEligible,
} = require('../src/catalog/platformEligibility');

const SAMSUNG = { 'User-Agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36', 'X-PROtv-Platform': 'samsung' };
const CC_BY = 'gbcxmtl6mAHQeBxx8Dgs'; // Tears of Steel: CC BY 3.0, worldwide
const SIGNED = 'creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f'; // CAESAR III JUDGEMENT, cutoff 2028-11-03
const US_PUBLIC_DOMAIN = 'LiMNMZWXBxJj3LoP73kU'; // His Girl Friday: U.S. finding only (Roku/Fire TV cleared)
const US_ONLY_GRANT = 'creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6'; // UNITED NATIONS: U.S.-only grant (Roku cleared)
const ROKU_FLAGGED = 'creator_roku-only';

function title(id, overrides = {}) {
  return {
    id,
    title: `Title ${id}`,
    contentType: 'MOVIE',
    approvalStatus: 'approved',
    status: 'ready',
    muxPlaybackId: `playback-${id}`,
    category: 'Drama',
    ...overrides,
  };
}

const records = [
  title(CC_BY),
  title(SIGNED),
  title(US_PUBLIC_DOMAIN),
  title(US_ONLY_GRANT),
  title(ROKU_FLAGGED, { rokuCleared: true, firetvCleared: true }),
];

async function serve(context, loadApproved = async () => records) {
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved, signPlaybackToken: async () => 'signed-token' }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;
  return async (suffix, headers = {}) => {
    const response = await fetch(`${base}${suffix}`, { headers });
    return { status: response.status, vary: response.headers.get('vary'), body: await response.json() };
  };
}

test('Samsung sees only Samsung-cleared titles on browse, search, detail and playback', async (context) => {
  const get = await serve(context);
  const all = await get('?view=all', SAMSUNG);
  assert.deepEqual(all.body.items.map((item) => item.id).sort(), [CC_BY, SIGNED].sort());
  assert.equal(all.body.platformPolicy, 'samsung-rights-v1');
  assert.match(all.vary, /X-PROtv-Platform/i);
  assert.deepEqual((await get('?q=Title', SAMSUNG)).body.items.map((item) => item.id).sort(), [CC_BY, SIGNED].sort());
  assert.equal((await get(`/titles/${CC_BY}`, SAMSUNG)).status, 200);
  const playback = await get(`/titles/${CC_BY}/playback`, SAMSUNG);
  assert.equal(playback.status, 200);
  assert.equal(playback.body.platformPolicy, 'samsung-rights-v1');
  assert.equal(playback.body.muxPlaybackId, `playback-${CC_BY}`);
  for (const blocked of [US_PUBLIC_DOMAIN, US_ONLY_GRANT, ROKU_FLAGGED]) {
    assert.equal((await get(`/titles/${blocked}`, SAMSUNG)).status, 404, `${blocked} cannot be opened`);
    assert.equal((await get(`/titles/${blocked}/playback`, SAMSUNG)).status, 404, `${blocked} cannot be played`);
  }
});

test('Roku, Fire TV and iOS clearances never authorize Samsung', () => {
  const cleared = title(ROKU_FLAGGED, { rokuCleared: true, firetvCleared: true, iosCleared: true });
  assert.equal(samsungEligible(cleared), false);
  for (const id of FIRETV_LAUNCH_TITLE_IDS) {
    if (!SAMSUNG_LAUNCH_TITLE_EXPIRY.has(id)) assert.equal(samsungEligible(title(id)), false, id);
  }
});

test('Samsung cutoffs are inclusive UTC dates and samsungHold withdraws a title', () => {
  const caesar = title(SIGNED);
  assert.equal(samsungEligible(caesar, new Date('2028-11-03T23:59:59Z')), true);
  assert.equal(samsungEligible(caesar, new Date('2028-11-04T00:00:00Z')), false);
  assert.equal(samsungEligible(title(CC_BY), new Date('2099-01-01T00:00:00Z')), true, 'CC BY has no calendar expiry');
  assert.equal(samsungEligible(title(CC_BY, { samsungHold: true })), false);
  assert.deepEqual(eligibleForPlatform([caesar], 'samsung', new Date('2030-01-01T00:00:00Z')), []);
});

test('Samsung allowlist holds exactly the thirteen worldwide app-scope clearances', () => {
  assert.equal(SAMSUNG_LAUNCH_TITLE_EXPIRY.size, 13);
  assert.equal(SAMSUNG_LAUNCH_TITLE_EXPIRY.get('creator_613e215e-709f-48ee-91bb-b225d8da4a33'), '2027-10-25', 'The Thirst: Addendum F');
  assert.equal(SAMSUNG_LAUNCH_TITLE_EXPIRY.has('creator_08283e5a-f35c-402e-9639-50e1711a5d67'), false, 'TV-MA exceeds the 16+ Samsung store rating');
  // Agreements executed 2026-11-18/19 run 24 months from signing; the U.S.-only grants and U.S. public-domain findings stay out.
  assert.equal(SAMSUNG_LAUNCH_TITLE_EXPIRY.get('creator_693966b2-abd3-4aa4-94a9-e3f5081a0d47'), '2028-11-17');
  assert.equal(SAMSUNG_LAUNCH_TITLE_EXPIRY.get('creator_episode_ac1c153a-2cd4-4c1e-a1ba-813fcbdacd90'), '2028-11-18');
  assert.equal(SAMSUNG_LAUNCH_TITLE_EXPIRY.has(US_ONLY_GRANT), false);
  assert.equal(SAMSUNG_LAUNCH_TITLE_EXPIRY.has(US_PUBLIC_DOMAIN), false);
  for (const [, cutoff] of SAMSUNG_LAUNCH_TITLE_EXPIRY) {
    assert.ok(cutoff === null || /^\d{4}-\d{2}-\d{2}$/.test(cutoff));
  }
});

test('other clients get unchanged responses with no policy field', async (context) => {
  const get = await serve(context);
  const clients = [{}, { 'User-Agent': 'Mozilla/5.0' }, { 'X-PROtv-Platform': 'firetv' }, { 'User-Agent': 'Roku/DVP-14.0' }];
  for (const headers of clients) {
    const all = await get('?view=all', headers);
    assert.equal(all.status, 200);
    assert.equal('platformPolicy' in all.body, false);
    assert.deepEqual(Object.keys(all.body), ['items']);
  }
  const website = await get('?view=all');
  assert.equal(website.body.items.length, records.length, 'the website keeps the full approved catalog');
  const playback = await get(`/titles/${US_PUBLIC_DOMAIN}/playback`);
  assert.equal(playback.status, 200);
  assert.equal('platformPolicy' in playback.body, false);
});

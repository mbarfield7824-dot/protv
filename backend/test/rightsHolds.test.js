const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const { RIGHTS_HOLD_TITLE_IDS, DEVICE_APP_HOLD_TITLE_IDS } = require('../src/catalog/rightsHolds');

const HAUNTED = 'p532d2Aqpb3bC2rvYkQw';
const ITAN = 'creator_3af7527e-f093-41e3-a52e-b4586d315481';
const TEARS = 'gbcxmtl6mAHQeBxx8Dgs';
const title = (id, overrides = {}) => ({
  id, title: id, contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: `pb${id}`, category: 'Drama', ...overrides,
});
const records = [title(HAUNTED), title(ITAN, { rokuCleared: true }), title(TEARS), title('ordinary')];

async function serve(context) {
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => records }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  return (suffix, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/v1/catalog${suffix}`, { headers });
}
const ids = async (response) => (await response.json()).items.map((item) => item.id).sort();
const ANDROID = { 'User-Agent': 'PROtv/1.0.0' };
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/142' };
const ROKU = { 'User-Agent': 'Roku/DVP-14.0 (114.00E04114A)' };

test('the hold lists are exactly the reviewed titles', () => {
  assert.equal(RIGHTS_HOLD_TITLE_IDS.size, 8);
  assert.ok(RIGHTS_HOLD_TITLE_IDS.has('6h3blkiA6LTeLv66jj1v'), 'Murder in Harlem');
  assert.ok(RIGHTS_HOLD_TITLE_IDS.has('creator_89303465-51e3-46bb-bd21-ff5ed2db2c49'), 'Dead Air');
  assert.deepEqual([...DEVICE_APP_HOLD_TITLE_IDS.keys()], [ITAN]);
});

test('a confirmed restriction is withheld everywhere, including deep links and playback', async (context) => {
  const get = await serve(context);
  for (const headers of [BROWSER, ANDROID, ROKU]) {
    assert.ok(!(await ids(await get('?view=all', headers))).includes(HAUNTED));
    assert.equal((await get(`/titles/${HAUNTED}/playback`, headers)).status, 404);
  }
  const sitemap = await (await get('/sitemap.xml')).text();
  assert.ok(!sitemap.includes(HAUNTED));
});

test('a device-app hold removes the title from Roku and the Android app only', async (context) => {
  const get = await serve(context);
  assert.deepEqual(await ids(await get('?view=all', BROWSER)), [ITAN, TEARS, 'ordinary'].sort());
  assert.deepEqual(await ids(await get('?view=all', ANDROID)), [TEARS, 'ordinary'].sort());
  assert.deepEqual(await ids(await get('?view=all', ROKU)), [TEARS]);
  assert.equal((await get(`/titles/${ITAN}/playback`, ANDROID)).status, 404);
  assert.equal((await get(`/titles/${ITAN}/playback`, BROWSER)).status, 200);
  // A client that declares its platform is not treated as the Android app.
  assert.ok(!(await ids(await get('?view=all', { ...ANDROID, 'X-PROtv-Platform': 'ios' }))).includes(ITAN), 'iOS uses its own fail-closed policy');
});

test('Android otherwise keeps the website catalog and Coming Soon response', async (context) => {
  const get = await serve(context);
  const web = await (await get('/coming-soon', BROWSER)).json();
  const android = await (await get('/coming-soon', ANDROID)).json();
  assert.deepEqual(android, web);
});

test('2026-11-23 holds: Murder in Harlem and Dead Air leave every catalog, playback and PROtv LIVE', async (context) => {
  const { MemoryLinearStore } = require('../src/linear/store');
  const { createLinearService } = require('../src/linear/service');
  const { appPolicy } = require('../src/linear/appPolicy');
  const HARLEM = '6h3blkiA6LTeLv66jj1v';
  const DEAD_AIR = 'creator_89303465-51e3-46bb-bd21-ff5ed2db2c49';
  const held = [title(HARLEM), title(DEAD_AIR, { rokuCleared: true }), title(TEARS)];
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => held }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const get = (suffix, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/v1/catalog${suffix}`, { headers });
  for (const headers of [BROWSER, ANDROID, ROKU, { 'X-PROtv-Platform': 'samsung' }, { 'X-PROtv-Platform': 'firetv' }, { 'X-PROtv-Platform': 'ios' }]) {
    const list = await ids(await get('?view=all', headers));
    assert.ok(!list.includes(HARLEM) && !list.includes(DEAD_AIR), JSON.stringify(headers));
    for (const id of [HARLEM, DEAD_AIR]) assert.equal((await get(`/titles/${id}/playback`, headers)).status, 404);
  }
  assert.equal((await get(`/titles/${TEARS}/playback`, BROWSER)).status, 200, 'unrelated titles keep playing');
  // PROtv LIVE: the held slot airs the holding card for its exact time; the next program still plays.
  const now = Date.parse('2026-12-01T12:10:00Z');
  const videos = [title(HARLEM, { duration: 3600 }), title(TEARS, { duration: 3600 })];
  const rights = { [`title_${HARLEM}`]: { status: 'confirmed', basis: 't' }, [`title_${TEARS}`]: { status: 'confirmed', basis: 't' } };
  const entries = [
    { id: 'h', kind: 'program', programType: 'movie', videoId: HARLEM, status: 'approved', startAt: '2026-12-01T12:00:00.000Z', endAt: '2026-12-01T13:00:00.000Z', durationSeconds: 3600, sourceStartSeconds: 0 },
    { id: 't', kind: 'program', programType: 'movie', videoId: TEARS, status: 'approved', startAt: '2026-12-01T13:00:00.000Z', endAt: '2026-12-01T14:00:00.000Z', durationSeconds: 3600, sourceStartSeconds: 0 },
  ];
  const service = createLinearService({ store: new MemoryLinearStore({ videos, rights, entries, settings: { status: 'public' } }), now: () => now, cacheMs: 0 });
  for (const appName of [null, 'roku', 'android', 'samsung']) {
    const feed = await service.channelState({ app: appName ? appPolicy(appName) : null });
    assert.equal(feed.now.kind, appName === 'samsung' ? 'holding' : 'holding', String(appName));
    assert.ok(!JSON.stringify(feed).includes(HARLEM), `${appName}: nothing about the held title`);
  }
  const later = createLinearService({ store: new MemoryLinearStore({ videos, rights, entries, settings: { status: 'public' } }), now: () => Date.parse('2026-12-01T13:10:00Z'), cacheMs: 0 });
  assert.equal((await later.channelState()).now.playback.muxPlaybackId, `pb${TEARS}`, 'the next program plays as scheduled');
});

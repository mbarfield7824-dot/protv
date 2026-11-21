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
  assert.equal(RIGHTS_HOLD_TITLE_IDS.size, 6);
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
  assert.ok((await ids(await get('?view=all', { ...ANDROID, 'X-PROtv-Platform': 'ios' }))).includes(ITAN));
});

test('Android otherwise keeps the website catalog and Coming Soon response', async (context) => {
  const get = await serve(context);
  const web = await (await get('/coming-soon', BROWSER)).json();
  const android = await (await get('/coming-soon', ANDROID)).json();
  assert.deepEqual(android, web);
});

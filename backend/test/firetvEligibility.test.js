const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const { FIRETV_LAUNCH_TITLE_IDS, platformFromRequest } = require('../src/catalog/platformEligibility');

const ROKU_UA = 'Roku/DVP-14.0 (114.00E04114A)';
const FIRE_TV = { 'User-Agent': 'okhttp/4.12.0', 'X-PROtv-Platform': 'firetv' };
const CLEARED = 'gbcxmtl6mAHQeBxx8Dgs'; // Tears of Steel
const HELD = 'IHkqDr5bGIY0Nw5Lhkky'; // Detour: replacement copy awaiting approval
const HELD_EPISODE = '5FHvg3BEwBlk9qqNdZT5'; // One Step Beyond - The Storm

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
  title(CLEARED),
  title(HELD),
  title(HELD_EPISODE, { contentType: 'EPISODE', seriesTitle: 'One Step Beyond', seasonNumber: 2, episodeNumber: 7 }),
];

async function serve(context) {
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => records }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;
  return async (suffix, headers = {}) => {
    const response = await fetch(`${base}${suffix}`, { headers });
    return { status: response.status, vary: response.headers.get('vary'), body: await response.json() };
  };
}

test('Fire TV code 6+ sees only launch-cleared titles on every catalog path', async (context) => {
  const get = await serve(context);
  assert.deepEqual((await get('?view=all', FIRE_TV)).body.items.map((item) => item.id), [CLEARED]);
  assert.equal((await get(`/titles/${CLEARED}`, FIRE_TV)).status, 200);
  assert.equal((await get(`/titles/${CLEARED}/playback`, FIRE_TV)).status, 200);
  assert.equal((await get(`/titles/${HELD}`, FIRE_TV)).status, 404, 'held titles cannot be opened by ID');
  assert.equal((await get(`/titles/${HELD}/playback`, FIRE_TV)).status, 404, 'held titles cannot be played');
  assert.equal((await get(`/titles/${HELD_EPISODE}/playback`, FIRE_TV)).status, 404);
  assert.deepEqual((await get('/series', FIRE_TV)).body.items, [], 'held episodes leave no series behind');
  assert.deepEqual((await get('?q=Title', FIRE_TV)).body.items.map((item) => item.id), [CLEARED], 'search is filtered too');
});

test('Roku, the website, Android and older Fire TV builds keep the full approved catalog', async (context) => {
  const get = await serve(context);
  const clients = [{}, { 'User-Agent': ROKU_UA }, { 'User-Agent': 'Mozilla/5.0' }, { 'User-Agent': 'okhttp/4.12.0' }];
  for (const headers of clients) {
    const catalog = await get('?view=all', headers);
    assert.equal(catalog.body.items.length, 3, JSON.stringify(headers));
    assert.equal((await get(`/titles/${HELD}/playback`, headers)).status, 200);
    assert.equal((await get('/series', headers)).body.items.length, 1);
    assert.match(catalog.vary, /X-PROtv-Platform/);
    assert.doesNotMatch(catalog.vary, /User-Agent/, 'no cache split by User-Agent');
  }
});

test('no Roku filter: neither the Roku user agent nor a roku header narrows the catalog', async (context) => {
  const get = await serve(context);
  assert.equal((await get('?view=all', { 'X-PROtv-Platform': 'roku' })).body.items.length, 3);
  assert.equal((await get('?view=all', { 'User-Agent': ROKU_UA })).body.items.length, 3);
  assert.equal(platformFromRequest({ get: (name) => (name === 'User-Agent' ? ROKU_UA : '') }), 'default');
  assert.equal(platformFromRequest({ get: (name) => (name === 'X-PROtv-Platform' ? ' FireTV ' : '') }), 'firetv');
});

test('the Fire TV launch list holds no restricted or rights-hold title', () => {
  const restricted = ['vyjpYtuEpOlCWzyzlaxM', 'UPq8eJixIfLiKXPIOXRm', 's0Eu00ADQQZnAoknUpxx', 'APlVZLmiQPIczS9uEbEd', 'tsq6EVuAjU7hf95yuGl8', '1uuUM2H0SzmcKeOpIe3V', 'SWSvCl89kxWp2qMXHT3w'];
  const held = [
    'IHkqDr5bGIY0Nw5Lhkky', 'WIVB9NPQQzvtvjTBsiKw', 'zGpbFWvSaup6ioUaoqsN', 'tuwoR1lZN8VnSTCSEiTc', 'WeNPJRItOH2nOdbwLkDG', 'hFVcdczhgn8dT3cZcXAR',
    '5FHvg3BEwBlk9qqNdZT5', '9P2whdYluJRAJeI6cOuh', 'BcyriYT9mIQj4ZDd9jFr', 'biitnhJJnBvHGFx8TJZC', 'FOn1pIGiBKaUb89oE6Gm', 'iUX01XuVHd9okFW4gmqR',
    'lussNXvK08RN9xtfq4wN', 'morl7jrTRiEF2ihf282A', 'p532d2Aqpb3bC2rvYkQw', 'sqKR6c5Cq7MD9lg1GDxG', 't6Ii7hflAigcefjBRz3r', 'v_1789872561270_i3svw5cbz',
    'vmsxoXY005wf3SwsfF7F', 'vuvTzWOcVJJeg12CsTq9', 'XMj306OZSbomES2Zz0Fz',
  ];
  assert.equal(FIRETV_LAUNCH_TITLE_IDS.size, 28);
  for (const id of [...restricted, ...held]) assert.ok(!FIRETV_LAUNCH_TITLE_IDS.has(id), id);
});

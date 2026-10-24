const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const { ROKU_LAUNCH_TITLE_IDS, platformFromRequest } = require('../src/catalog/platformEligibility');

const ROKU_UA = 'Roku/DVP-14.0 (114.00E04114A)';
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

test('Roku clients see only launch-cleared titles on every catalog path', async (context) => {
  const get = await serve(context);
  const roku = { 'User-Agent': ROKU_UA };

  const catalog = await get('?view=all', roku);
  assert.deepEqual(catalog.body.items.map((item) => item.id), [CLEARED]);
  assert.equal((await get(`/titles/${CLEARED}/playback`, roku)).status, 200);
  assert.equal((await get(`/titles/${HELD}`, roku)).status, 404, 'held titles cannot be opened by ID (deep links)');
  assert.equal((await get(`/titles/${HELD}/playback`, roku)).status, 404, 'held titles cannot be played');
  assert.equal((await get(`/titles/${HELD_EPISODE}/playback`, roku)).status, 404);
  assert.deepEqual((await get('/series', roku)).body.items, [], 'held episodes leave no series behind');
  assert.deepEqual((await get('?q=Title', roku)).body.items.map((item) => item.id), [CLEARED], 'search is filtered too');
});

test('website, Fire TV and other clients keep the full approved catalog', async (context) => {
  const get = await serve(context);
  for (const headers of [{}, { 'User-Agent': 'Mozilla/5.0' }, { 'User-Agent': 'okhttp/4.12.0' }]) {
    const catalog = await get('?view=all', headers);
    assert.equal(catalog.body.items.length, 3);
    assert.match(catalog.vary, /User-Agent/);
    assert.match(catalog.vary, /X-PROtv-Platform/);
    assert.equal((await get(`/titles/${HELD}/playback`, headers)).status, 200);
  }
});

test('an explicit platform header overrides the user agent', async (context) => {
  const get = await serve(context);
  assert.deepEqual((await get('?view=all', { 'X-PROtv-Platform': 'roku' })).body.items.map((item) => item.id), [CLEARED]);
  assert.equal((await get('?view=all', { 'User-Agent': ROKU_UA, 'X-PROtv-Platform': 'web' })).body.items.length, 3);
  assert.equal(platformFromRequest({ get: (name) => (name === 'User-Agent' ? 'roku/dvp-9.0 (x)' : '') }), 'roku');
});

test('the Roku launch list holds no restricted or rights-hold title', () => {
  const restricted = ['vyjpYtuEpOlCWzyzlaxM', 'UPq8eJixIfLiKXPIOXRm', 's0Eu00ADQQZnAoknUpxx', 'APlVZLmiQPIczS9uEbEd', 'tsq6EVuAjU7hf95yuGl8', '1uuUM2H0SzmcKeOpIe3V', 'SWSvCl89kxWp2qMXHT3w'];
  const held = [
    'IHkqDr5bGIY0Nw5Lhkky', 'WIVB9NPQQzvtvjTBsiKw', 'zGpbFWvSaup6ioUaoqsN', 'tuwoR1lZN8VnSTCSEiTc', 'WeNPJRItOH2nOdbwLkDG', 'hFVcdczhgn8dT3cZcXAR',
    '5FHvg3BEwBlk9qqNdZT5', '9P2whdYluJRAJeI6cOuh', 'BcyriYT9mIQj4ZDd9jFr', 'biitnhJJnBvHGFx8TJZC', 'FOn1pIGiBKaUb89oE6Gm', 'iUX01XuVHd9okFW4gmqR',
    'lussNXvK08RN9xtfq4wN', 'morl7jrTRiEF2ihf282A', 'p532d2Aqpb3bC2rvYkQw', 'sqKR6c5Cq7MD9lg1GDxG', 't6Ii7hflAigcefjBRz3r', 'v_1789872561270_i3svw5cbz',
    'vmsxoXY005wf3SwsfF7F', 'vuvTzWOcVJJeg12CsTq9', 'XMj306OZSbomES2Zz0Fz',
  ];
  assert.equal(ROKU_LAUNCH_TITLE_IDS.size, 28);
  for (const id of [...restricted, ...held]) assert.ok(!ROKU_LAUNCH_TITLE_IDS.has(id), id);
});

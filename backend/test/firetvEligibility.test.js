const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');
const {
  FIRETV_LAUNCH_TITLE_IDS,
  IOS_LAUNCH_TITLE_IDS,
  IOS_LAUNCH_TITLE_EXPIRY,
  eligibleForPlatform,
  platformFromRequest,
} = require('../src/catalog/platformEligibility');

const ROKU_UA = 'Roku/DVP-14.0 (114.00E04114A)';
const FIRE_TV = { 'User-Agent': 'okhttp/4.12.0', 'X-PROtv-Platform': 'firetv' };
const CLEARED = 'gbcxmtl6mAHQeBxx8Dgs'; // Tears of Steel
const HELD = 'IHkqDr5bGIY0Nw5Lhkky'; // Detour: replacement copy awaiting approval
const HELD_EPISODE = '5FHvg3BEwBlk9qqNdZT5'; // One Step Beyond - The Storm
const IOS_A_LONG_TIME_COMING = 'creator_5a913abe-bbb5-44a5-9c8f-cc12b7496ba9';
const IOS_DOUBLE_DATE = 'creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8';
const IOS_CAESAR = 'creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f';
const IOS_CURTAIN_CALL = 'creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d';
const IOS_LOST_CAMP = 'creator_20752565-9909-4c2b-9f53-c9719ca26769';
const IOS_CLEARANCES = [
  [IOS_A_LONG_TIME_COMING, 'A Long Time Coming'],
  [IOS_DOUBLE_DATE, 'It’s a Double Date a Classic'],
  [IOS_CAESAR, 'CAESAR III JUDGEMENT'],
  [IOS_CURTAIN_CALL, 'Curtain Call'],
  [IOS_LOST_CAMP, 'The Lost Camp'],
];
const IOS_EXPECTED_EXPIRY = new Map([
  [IOS_A_LONG_TIME_COMING, '2028-11-09'],
  [IOS_DOUBLE_DATE, '2028-11-06'],
  [IOS_CAESAR, '2028-11-03'],
  [IOS_CURTAIN_CALL, '2028-11-03'],
  [IOS_LOST_CAMP, null],
]);

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
  title(IOS_A_LONG_TIME_COMING, { title: 'A Long Time Coming' }),
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
    return {
      status: response.status,
      vary: response.headers.get('vary'),
      policy: response.headers.get('X-PROtv-Platform-Policy'),
      body: await response.json(),
    };
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

test('the website, Android and older Fire TV builds keep the full approved catalog', async (context) => {
  const get = await serve(context);
  const clients = [{}, { 'User-Agent': 'Mozilla/5.0' }, { 'User-Agent': 'okhttp/4.12.0' }];
  for (const headers of clients) {
    const catalog = await get('?view=all', headers);
    assert.equal(catalog.body.items.length, 4, JSON.stringify(headers));
    assert.equal((await get(`/titles/${HELD}/playback`, headers)).status, 200);
    assert.equal((await get('/series', headers)).body.items.length, 1);
    assert.match(catalog.vary, /X-PROtv-Platform/);
  }
});

test('iOS exposes only signed mobile clearances and enforces their term boundaries', async (context) => {
  const iosRecords = IOS_CLEARANCES.map(([id, name]) => title(id, { title: name }));
  const iosIds = IOS_CLEARANCES.map(([id]) => id);
  assert.equal(IOS_LAUNCH_TITLE_IDS.size, 5);
  assert.equal(IOS_LAUNCH_TITLE_EXPIRY.size, 5);
  assert.deepEqual([...IOS_LAUNCH_TITLE_IDS], iosIds);
  assert.deepEqual([...IOS_LAUNCH_TITLE_EXPIRY], [...IOS_EXPECTED_EXPIRY]);
  assert.deepEqual(eligibleForPlatform(iosRecords, 'ios').map(({ id }) => id), iosIds);

  for (const [id, expiresOn] of IOS_LAUNCH_TITLE_EXPIRY) {
    if (expiresOn === null) continue;
    const endOfTermDate = new Date(`${expiresOn}T23:59:59.999Z`);
    const firstInstantAfterTermDate = new Date(endOfTermDate.getTime() + 1);
    assert.equal(eligibleForPlatform([title(id)], 'ios', endOfTermDate).length, 1, id);
    assert.equal(eligibleForPlatform([title(id)], 'ios', firstInstantAfterTermDate).length, 0, id);
  }
  assert.deepEqual(
    eligibleForPlatform([title(IOS_LOST_CAMP)], 'ios', new Date('2100-01-01T00:00:00.000Z')).map(({ id }) => id),
    [IOS_LOST_CAMP],
  );

  const unresolved = [
    'creator_3af7527e-f093-41e3-a52e-b4586d315481', // ARÍỌRÍ: AI commercial-use evidence pending
    'creator_613e215e-709f-48ee-91bb-b225d8da4a33', // The Thirst: US-only; playback geofencing unverified
    'creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6', // UNITED NATIONS: US-only; playback geofencing unverified
    'creator_89303465-51e3-46bb-bd21-ff5ed2db2c49', // Dead Air: signing authority unverified
  ].map((id) => title(id));
  assert.deepEqual(eligibleForPlatform(unresolved, 'ios'), []);

  const get = await serve(context);
  const ios = { 'X-PROtv-Platform': 'ios' };
  assert.deepEqual((await get('?view=all', ios)).body.items.map((item) => item.id), [IOS_A_LONG_TIME_COMING]);
  assert.deepEqual((await get('?q=A+Long', ios)).body.items.map((item) => item.id), [IOS_A_LONG_TIME_COMING]);
  assert.deepEqual((await get('/details', ios)).body.items.map((item) => item.id), [IOS_A_LONG_TIME_COMING]);
  assert.equal((await get(`/titles/${CLEARED}`, ios)).status, 404);
  assert.equal((await get(`/titles/${CLEARED}/playback`, ios)).status, 404);
  assert.equal((await get(`/titles/${IOS_A_LONG_TIME_COMING}/details`, ios)).status, 200);
  assert.equal((await get(`/titles/${IOS_A_LONG_TIME_COMING}/playback`, ios)).status, 200);
  assert.equal((await get('?view=all', ios)).policy, 'ios-rights-v1');
});

test('the Roku user agent or header selects Roku; a header wins over the user agent', async () => {
  assert.equal(platformFromRequest({ get: (name) => (name === 'User-Agent' ? ROKU_UA : '') }), 'roku');
  assert.equal(platformFromRequest({ get: (name) => (name === 'X-PROtv-Platform' ? ' FireTV ' : '') }), 'firetv');
  assert.equal(platformFromRequest({ get: (name) => (name === 'X-PROtv-Platform' ? ' iOS ' : '') }), 'ios');
  assert.equal(platformFromRequest({ get: (name) => (name === 'User-Agent' ? 'okhttp/4.12.0' : '') }), 'default');
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

test('Music stays off device catalogs while the website keeps it', async (context) => {
  const music = title('creator_music', { contentType: 'MUSIC', musicFormat: 'music_video', category: 'Music' });
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => [...records, music] }));
  const server = app.listen(0);
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;
  const ids = async (query, headers = {}) => (await (await fetch(`${base}${query}`, { headers })).json()).items.map((item) => item.id);
  const allIds = records.map((item) => item.id).sort();

  // The exact requests shipped in the Roku, Fire TV and mobile builds.
  assert.deepEqual(await ids('?view=all', { 'User-Agent': ROKU_UA }), [CLEARED]);
  assert.deepEqual((await ids('?view=all')).sort(), allIds);
  assert.deepEqual(await ids('?view=all', FIRE_TV), [CLEARED]);
  assert.equal((await fetch(`${base}/titles/creator_music/playback`, { headers: FIRE_TV })).status, 404);

  assert.ok((await ids('')).includes('creator_music'));
  assert.deepEqual(await ids('?view=music'), ['creator_music']);
  assert.ok(!(await ids('?view=movies')).includes('creator_music'));
  assert.equal((await fetch(`${base}/titles/creator_music/playback`)).status, 200);
});

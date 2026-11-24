// iPhone/iPad and Apple TV eligibility: the shared connected-TV policy, fail closed, with the rights marker the apps require.
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createCatalogRouter } = require('../src/catalog/router');

const ALTC = 'creator_5a913abe-bbb5-44a5-9c8f-cc12b7496ba9'; // signed agreement, worldwide, all PROtv apps
const YDMD = 'creator_08283e5a-f35c-402e-9639-50e1711a5d67'; // TV-MA: fits Apple's 18+ rating
const THIRST = 'creator_613e215e-709f-48ee-91bb-b225d8da4a33'; // U.S.-only grant
const HIS_GIRL = 'LiMNMZWXBxJj3LoP73kU'; // U.S. public domain, element review not done
const HARLEM = '6h3blkiA6LTeLv66jj1v'; // rights hold
const UNKNOWN = 'web-only-title'; // no rights record
const title = (id, extra = {}) => ({ id, title: id, contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: `Pub${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}`, category: 'Drama', ...extra });
const records = [title(ALTC), title(YDMD), title(THIRST), title(HIS_GIRL), title(HARLEM), title(UNKNOWN)];

async function serve(context, recs = records) {
  const app = express();
  app.use((req, res, next) => { // the same marker middleware as app.js
    const platform = String(req.get('X-PROtv-Platform') || '').toLowerCase();
    if (platform === 'ios' || platform === 'appletv') res.set('X-PROtv-Platform-Policy', `${platform}-rights-v1`);
    next();
  });
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => recs, signPlaybackToken: async (id) => `tok-${id}` }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  return (suffix, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/v1/catalog${suffix}`, { headers });
}

for (const platform of ['ios', 'appletv']) {
  test(`${platform}: only titles with established rights, the policy marker, and nothing else`, async (context) => {
    const get = await serve(context);
    const headers = { 'X-PROtv-Platform': platform, 'x-vercel-ip-country': 'US' };
    const response = await get('?view=all', headers);
    const body = await response.json();
    assert.equal(response.headers.get('X-PROtv-Platform-Policy'), `${platform}-rights-v1`);
    assert.equal(body.platformPolicy, `${platform}-rights-v1`);
    assert.deepEqual(body.items.map((item) => item.id).sort(), [ALTC, YDMD, THIRST].sort());
    assert.equal((await get(`/titles/${ALTC}/playback`, headers)).status, 200);
    const thirst = body.items.find((item) => item.id === THIRST);
    assert.notEqual(thirst.muxPlaybackId, title(THIRST).muxPlaybackId, 'the U.S.-only title is listed only by its signed ID');
    const signed = await (await get(`/titles/${THIRST}/playback`, headers)).json();
    assert.equal(signed.muxPlaybackId, thirst.muxPlaybackId);
    assert.equal(signed.playbackToken, `tok-${thirst.muxPlaybackId}`);
    assert.equal((await get(`/titles/${THIRST}/playback`, { 'X-PROtv-Platform': platform })).status, 404, 'unknown location');
    for (const id of [HIS_GIRL, HARLEM, UNKNOWN]) assert.equal((await get(`/titles/${id}/playback`, headers)).status, 404, id);
    const soon = await (await get('/coming-soon', headers)).json();
    assert.equal(soon.platformPolicy, `${platform}-rights-v1`);
  });
}

test('a U.S.-only title plays on Apple only in the U.S., by signed ID with a token', async (context) => {
  const get = await serve(context, [title(THIRST, { muxSignedPlaybackId: 'SignedThirst00000001' })]);
  const us = { 'X-PROtv-Platform': 'ios', 'x-vercel-ip-country': 'US' };
  const playback = await (await get(`/titles/${THIRST}/playback`, us)).json();
  assert.equal(playback.muxPlaybackId, 'SignedThirst00000001');
  assert.equal(playback.playbackToken, 'tok-SignedThirst00000001');
  for (const country of ['CA', 'GB', undefined]) {
    const headers = { 'X-PROtv-Platform': 'ios', ...(country ? { 'x-vercel-ip-country': country } : {}) };
    assert.equal((await get(`/titles/${THIRST}/playback`, headers)).status, 404, String(country));
  }
});

test('the website and Android are unchanged by the Apple policy', async (context) => {
  const get = await serve(context);
  const web = await (await get('?view=all')).json();
  assert.equal(web.platformPolicy, undefined);
  assert.equal(web.items.length, records.length - 1, 'only the rights-held title is missing');
  const android = await get('?view=all', { 'User-Agent': 'PROtv/1.0.1' });
  assert.equal(android.headers.get('X-PROtv-Platform-Policy'), null);
});

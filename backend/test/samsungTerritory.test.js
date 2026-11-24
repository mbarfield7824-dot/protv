// Samsung U.S.-only tier (development): deny by default, country from Vercel's edge, signed playback only.
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { requestTerritory, UNKNOWN } = require('../src/catalog/territory');
const { samsungEligible, samsungView, eligibleForPlatform, SAMSUNG_US_ONLY_TITLE_EXPIRY } = require('../src/catalog/platformEligibility');
const { createCatalogRouter } = require('../src/catalog/router');
const { MemoryLinearStore } = require('../src/linear/store');
const { createLinearService } = require('../src/linear/service');
const { samsungEligible: eligible } = require('../src/catalog/platformEligibility');

const req = (headers) => ({ get: (name) => headers[Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())] });
const US = Object.freeze({ country: 'US', reason: 'ip' });
const CA = Object.freeze({ country: 'CA', reason: 'ip' });
const PD = 'LiMNMZWXBxJj3LoP73kU'; // His Girl Friday: U.S. public-domain finding only
const WORLDWIDE = 'hKPU3JNJ4faWLgWE6ZSq'; // Big Buck Bunny: CC BY 3.0
const usOnly = new Map([[PD, null], ['expired-us', '2026-01-01']]);
const NOW = new Date('2026-12-01T12:00:00Z');
const film = (id, extra = {}) => ({ id, title: `Film ${id}`, contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: `public${id.slice(0, 6)}aaaaaa`, duration: 3600, ...extra });
const SIGNED = 'SignedPlaybackId0001';

test('territory: only a real ISO country from Vercel counts; everything else is unknown', () => {
  assert.deepEqual(requestTerritory(req({ 'x-vercel-ip-country': 'US' })), US);
  assert.equal(requestTerritory(req({ 'x-vercel-ip-country': 'us' })).country, 'US');
  for (const value of [undefined, '', 'USA', '1', 'XX', 'T1', 'A1', 'A2', 'EU', 'AP', 'ZZ']) {
    assert.equal(requestTerritory(req({ 'x-vercel-ip-country': value })).country, null, String(value));
  }
  assert.equal(requestTerritory(null), UNKNOWN);
  // A TV that reports a different region than its network location (VPN / proxy sign) is uncertain.
  const mismatch = requestTerritory(req({ 'x-vercel-ip-country': 'US', 'X-PROtv-Device-Region': 'GB' }));
  assert.deepEqual(mismatch, { country: null, reason: 'region-mismatch' });
  assert.equal(requestTerritory(req({ 'x-vercel-ip-country': 'US', 'X-PROtv-Device-Region': 'nonsense' })).country, null);
  assert.equal(requestTerritory(req({ 'x-vercel-ip-country': 'US', 'X-PROtv-Device-Region': 'us' })).country, 'US');
});

test('U.S.-only titles: only in the United States, before the cutoff, with a signed playback ID', () => {
  const pd = film(PD, { muxSignedPlaybackId: SIGNED });
  assert.equal(samsungEligible(pd, NOW, US, { usOnly }), true);
  assert.equal(samsungEligible(pd, NOW, CA, { usOnly }), false, 'outside the United States');
  assert.equal(samsungEligible(pd, NOW, UNKNOWN, { usOnly }), false, 'unknown location');
  assert.equal(samsungEligible(pd, NOW, null, { usOnly }), false, 'no territory at all');
  assert.equal(samsungEligible(pd, NOW, { country: null, reason: 'region-mismatch' }, { usOnly }), false, 'VPN/proxy sign');
  assert.equal(samsungEligible(film(PD), NOW, US, { usOnly }), false, 'no signed playback ID: never the public stream');
  assert.equal(samsungEligible(film('expired-us', { muxSignedPlaybackId: SIGNED }), NOW, US, { usOnly }), false, 'rights expired');
  assert.equal(samsungEligible(film(PD, { muxSignedPlaybackId: SIGNED, samsungHold: true }), NOW, US, { usOnly }), false, 'held');
  assert.equal(samsungEligible(film('not-listed', { muxSignedPlaybackId: SIGNED }), NOW, US, { usOnly }), false, 'not listed');
  // Worldwide titles are unaffected by territory, including unknown.
  assert.equal(samsungEligible(film(WORLDWIDE), NOW, UNKNOWN, { usOnly }), true);
});

test('U.S.-only titles reach Samsung with only the signed playback ID, so streams need a short-lived token', () => {
  const pd = film(PD, { muxSignedPlaybackId: SIGNED });
  const view = samsungView(pd, { usOnly });
  assert.equal(view.muxPlaybackId, SIGNED);
  assert.equal(view.muxPlaybackPolicy, 'signed');
  assert.equal(samsungView(film(WORLDWIDE), { usOnly }).muxPlaybackId, film(WORLDWIDE).muxPlaybackId);
  const out = eligibleForPlatform([pd, film(WORLDWIDE)], 'samsung', NOW, US, { usOnly });
  assert.deepEqual(out.map((v) => v.id), [PD, WORLDWIDE]);
  assert.ok(!JSON.stringify(out).includes(pd.muxPlaybackId), 'the public playback ID never appears');
  assert.deepEqual(eligibleForPlatform([pd, film(WORLDWIDE)], 'samsung', NOW, CA, { usOnly }).map((v) => v.id), [WORLDWIDE]);
});

test('deployed configuration: the U.S.-only list is empty, so a U.S. request still gets only worldwide titles', async (context) => {
  assert.equal(SAMSUNG_US_ONLY_TITLE_EXPIRY.size, 0, 'nothing U.S.-only is playable until counsel confirms each title');
  const records = [film(PD, { muxSignedPlaybackId: SIGNED }), film(WORLDWIDE)];
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => records, signPlaybackToken: async () => 'tok' }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;
  const headers = { 'X-PROtv-Platform': 'samsung', 'x-vercel-ip-country': 'US' };
  const all = await (await fetch(`${base}?view=all`, { headers })).json();
  assert.deepEqual(all.items.map((i) => i.id), [WORLDWIDE]);
  assert.equal((await fetch(`${base}/titles/${PD}/playback`, { headers })).status, 404);
});

test('PROtv LIVE on Samsung: a U.S.-only program plays signed in the U.S. and is a branded card elsewhere', async () => {
  const at = Date.parse('2026-12-01T12:10:00Z');
  const videos = [film(PD, { muxSignedPlaybackId: SIGNED, muxPlaybackId: 'PublicPlaybackId0001' })];
  const rights = { [`title_${PD}`]: { status: 'confirmed', basis: 'test' } };
  const entries = [{ id: 'e1', kind: 'program', programType: 'movie', videoId: PD, status: 'approved', startAt: '2026-12-01T12:00:00.000Z', endAt: '2026-12-01T13:00:00.000Z', durationSeconds: 3600, sourceStartSeconds: 0 }];
  const store = new MemoryLinearStore({ videos, rights, entries, settings: { status: 'public' } });
  const service = createLinearService({ store, now: () => at, cacheMs: 0, signPlaybackToken: async (id) => `token:${id}` });
  const samsung = (territory) => ({
    platform: 'samsung', policy: 'samsung-live-v1', territory,
    allows: (video, when, t) => eligible(video, new Date(when), t, { usOnly }), view: (video) => samsungView(video, { usOnly }),
  });
  const us = await service.channelState({ app: samsung(US) });
  assert.equal(us.now.kind, 'program');
  assert.equal(us.now.playback.muxPlaybackId, SIGNED);
  assert.equal(us.now.playback.playbackToken, `token:${SIGNED}`);
  assert.ok(!JSON.stringify(us).includes('PublicPlaybackId0001'));
  for (const territory of [CA, UNKNOWN]) {
    const elsewhere = await service.channelState({ app: samsung(territory) });
    assert.equal(elsewhere.now.kind, 'restricted');
    assert.equal(elsewhere.now.playback, undefined);
    assert.ok(!JSON.stringify(elsewhere).includes(PD), 'no title ID, playback or details outside the U.S.');
  }
});

// Samsung U.S.-only tier (development): deny by default, country from Vercel's edge, signed playback only.
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { requestTerritory, UNKNOWN } = require('../src/catalog/territory');
const { samsungEligible, samsungView, eligibleForPlatform } = require('../src/catalog/platformEligibility');
const { registry } = require('../src/catalog/ctvPolicy');
const { createCatalogRouter } = require('../src/catalog/router');
const { MemoryLinearStore } = require('../src/linear/store');
const { createLinearService } = require('../src/linear/service');
const { samsungEligible: eligible } = require('../src/catalog/platformEligibility');

const req = (headers) => ({ get: (name) => headers[Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())] });
const US = Object.freeze({ country: 'US', reason: 'ip' });
const CA = Object.freeze({ country: 'CA', reason: 'ip' });
const PD = 'LiMNMZWXBxJj3LoP73kU'; // His Girl Friday: U.S. public-domain finding only
const WORLDWIDE = 'hKPU3JNJ4faWLgWE6ZSq'; // Big Buck Bunny: CC BY 3.0
const NOW = new Date('2026-12-01T12:00:00Z');
const film = (id, extra = {}) => ({ id, title: `Film ${id}`, contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: `public${id.slice(0, 6)}aaaaaa`, duration: 3600, ...extra });
const SIGNED = registry[PD].signedPlaybackId; // recorded with its rights entry (element review 2026-11-25)

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

test('U.S.-only titles: only in the United States, inside the rights term, with a signed playback ID', () => {
  const pd = film(PD);
  assert.equal(samsungEligible(pd, NOW, US), true);
  assert.equal(samsungEligible(pd, NOW, CA), false, 'outside the United States');
  assert.equal(samsungEligible(pd, NOW, UNKNOWN), false, 'unknown location');
  assert.equal(samsungEligible(pd, NOW, null), false, 'no territory at all');
  assert.equal(samsungEligible(pd, NOW, { country: null, reason: 'region-mismatch' }), false, 'VPN/proxy sign');
  assert.equal(samsungEligible(film('creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6'), new Date('2027-10-26T00:00:00Z'), US), false, 'UNITED NATIONS after its term');
  assert.equal(samsungEligible(film(PD, { samsungHold: true }), NOW, US), false, 'held');
  assert.equal(samsungEligible(film('not-listed'), NOW, US), false, 'no rights record');
  // Worldwide titles are unaffected by territory, including unknown.
  assert.equal(samsungEligible(film(WORLDWIDE), NOW, UNKNOWN), true);
});

test('U.S.-only titles reach Samsung with only the signed playback ID, so streams need a short-lived token', async (context) => {
  const pd = film(PD);
  const view = samsungView(pd, NOW, US);
  assert.equal(view.muxPlaybackId, SIGNED);
  assert.equal(view.muxPlaybackPolicy, 'signed');
  assert.equal(samsungView(film(WORLDWIDE), NOW, US).muxPlaybackId, film(WORLDWIDE).muxPlaybackId);
  const out = eligibleForPlatform([pd, film(WORLDWIDE)], 'samsung', NOW, US);
  assert.deepEqual(out.map((v) => v.id), [PD, WORLDWIDE]);
  assert.ok(!JSON.stringify(out).includes(pd.muxPlaybackId), 'the public playback ID never appears');
  assert.deepEqual(eligibleForPlatform([pd, film(WORLDWIDE)], 'samsung', NOW, CA).map((v) => v.id), [WORLDWIDE]);
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved: async () => [pd, film(WORLDWIDE)], signPlaybackToken: async (id) => `tok-${id}` }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1/catalog`;
  const playback = await (await fetch(`${base}/titles/${PD}/playback`, { headers: { 'X-PROtv-Platform': 'samsung', 'x-vercel-ip-country': 'US' } })).json();
  assert.equal(playback.muxPlaybackId, SIGNED);
  assert.equal(playback.playbackToken, `tok-${SIGNED}`);
  assert.equal((await fetch(`${base}/titles/${PD}/playback`, { headers: { 'X-PROtv-Platform': 'samsung', 'x-vercel-ip-country': 'CA' } })).status, 404);
});

test('PROtv LIVE on Samsung: a U.S.-only program plays signed in the U.S. and is a branded card elsewhere', async () => {
  const at = Date.parse('2026-12-01T12:10:00Z');
  const videos = [film(PD, { muxPlaybackId: 'PublicPlaybackId0001' })];
  const rights = { [`title_${PD}`]: { status: 'confirmed', basis: 'test' } };
  const entries = [{ id: 'e1', kind: 'program', programType: 'movie', videoId: PD, status: 'approved', startAt: '2026-12-01T12:00:00.000Z', endAt: '2026-12-01T13:00:00.000Z', durationSeconds: 3600, sourceStartSeconds: 0 }];
  const store = new MemoryLinearStore({ videos, rights, entries, settings: { status: 'public' } });
  const service = createLinearService({ store, now: () => at, cacheMs: 0, signPlaybackToken: async (id) => `token:${id}` });
  const samsung = (territory) => ({
    platform: 'samsung', policy: 'samsung-live-v1', territory,
    allows: (video, when, t) => eligible(video, new Date(when), t), view: (video) => samsungView(video),
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

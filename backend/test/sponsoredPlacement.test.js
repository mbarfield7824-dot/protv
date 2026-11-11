const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAdsRouter } = require('../src/ads/router');
const { MemoryPlacementSettings } = require('../src/ads/placementSettings');
const { sponsoredConsentMode } = require('../src/ads/consentRegion');

async function start(t, { placements = new MemoryPlacementSettings(), admin = true } = {}) {
  const audits = [];
  const app = express();
  app.use(express.json());
  app.use('/ads', createAdsRouter({
    store: {}, placements, audit: async (event) => { audits.push(event); },
    verifyAdmin: (req, res, next) => (admin ? (req.user = { uid: 'owner-uid' }, next()) : res.status(401).json({ error: 'No token provided' })),
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}/ads`, audits, placements };
}

test('the Sponsored placement is off by default and the public answer is never cached', async (t) => {
  const { base } = await start(t);
  const response = await fetch(`${base}/placements`);
  assert.deepEqual(await response.json(), { nativeBanner: { enabled: false, consent: 'opt_in' } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('an unreadable setting fails closed', async (t) => {
  const { base } = await start(t, { placements: { read: async () => { throw new Error('Firestore down'); } } });
  assert.deepEqual(await (await fetch(`${base}/placements`)).json(), { nativeBanner: { enabled: false, consent: 'opt_in' } });
});

test('only an Administrator can switch it, each change is audited, and the public answer follows at once', async (t) => {
  const { base, audits } = await start(t);
  const put = (body) => fetch(`${base}/admin/placements`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put({ nativeBannerEnabled: 'yes' })).status, 400);
  const saved = await (await put({ nativeBannerEnabled: true })).json();
  assert.equal(saved.nativeBannerEnabled, true);
  assert.equal(saved.updatedBy, 'owner-uid');
  assert.deepEqual(await (await fetch(`${base}/placements`)).json(), { nativeBanner: { enabled: true, consent: 'opt_in' } });
  await put({ nativeBannerEnabled: false });
  assert.deepEqual(await (await fetch(`${base}/placements`)).json(), { nativeBanner: { enabled: false, consent: 'opt_in' } });
  assert.deepEqual(audits.map((event) => event.details.nativeBannerEnabled), [true, false]);
  assert.deepEqual(Object.keys(await (await fetch(`${base}/placements`)).json().then((j) => j.nativeBanner)), ['enabled', 'consent'],
    'the public answer carries only the on/off state, never script URLs');
});

test('the admin endpoints refuse anyone who is not an Administrator', async (t) => {
  const { base, placements } = await start(t, { admin: false });
  assert.equal((await fetch(`${base}/admin/placements`)).status, 401);
  const response = await fetch(`${base}/admin/placements`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"nativeBannerEnabled":true}' });
  assert.equal(response.status, 401);
  assert.equal((await placements.read()).nativeBannerEnabled, false);
});

test('consent rule by location: opt-out notice only in the US and Canada outside Quebec; unknown means asking', () => {
  const mode = (country, region) => sponsoredConsentMode({
    ...(country !== undefined ? { 'x-vercel-ip-country': country } : {}),
    ...(region !== undefined ? { 'x-vercel-ip-country-region': region } : {}),
  });
  assert.equal(mode('US', 'CA'), 'notice');
  assert.equal(mode('us'), 'notice');
  assert.equal(mode('PR'), 'notice');
  assert.equal(mode('CA', 'ON'), 'notice');
  assert.equal(mode('CA', 'QC'), 'opt_in', 'Quebec Law 25: off by default');
  assert.equal(mode('CA'), 'opt_in', 'Canada with no province: ask');
  for (const country of ['DE', 'FR', 'IE', 'GB', 'CH', 'NO', 'BR', 'IN', 'JP', 'ZA', 'XX', '']) assert.equal(mode(country), 'opt_in', country);
  assert.equal(mode(undefined), 'opt_in', 'no location header (not on Vercel): ask');
  assert.equal(sponsoredConsentMode({ 'x-vercel-ip-country': ['US'] }), 'opt_in', 'malformed header: ask');
});

test("the public answer carries the visitor's consent rule and is never cached", async (t) => {
  const { base } = await start(t, { placements: new MemoryPlacementSettings({ nativeBannerEnabled: true }) });
  const ask = (headers) => fetch(`${base}/placements`, { headers });
  const us = await ask({ 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'TX' });
  assert.deepEqual(await us.json(), { nativeBanner: { enabled: true, consent: 'notice' } });
  assert.equal(us.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await (await ask({ 'x-vercel-ip-country': 'DE' })).json(), { nativeBanner: { enabled: true, consent: 'opt_in' } });
  assert.deepEqual(await (await ask({ 'x-vercel-ip-country': 'CA', 'x-vercel-ip-country-region': 'QC' })).json(),
    { nativeBanner: { enabled: true, consent: 'opt_in' } });
});

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAdsRouter } = require('../src/ads/router');
const { MemoryPlacementSettings } = require('../src/ads/placementSettings');

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
  assert.deepEqual(await response.json(), { nativeBanner: { enabled: false } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('an unreadable setting fails closed', async (t) => {
  const { base } = await start(t, { placements: { read: async () => { throw new Error('Firestore down'); } } });
  assert.deepEqual(await (await fetch(`${base}/placements`)).json(), { nativeBanner: { enabled: false } });
});

test('only an Administrator can switch it, each change is audited, and the public answer follows at once', async (t) => {
  const { base, audits } = await start(t);
  const put = (body) => fetch(`${base}/admin/placements`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put({ nativeBannerEnabled: 'yes' })).status, 400);
  const saved = await (await put({ nativeBannerEnabled: true })).json();
  assert.equal(saved.nativeBannerEnabled, true);
  assert.equal(saved.updatedBy, 'owner-uid');
  assert.deepEqual(await (await fetch(`${base}/placements`)).json(), { nativeBanner: { enabled: true } });
  await put({ nativeBannerEnabled: false });
  assert.deepEqual(await (await fetch(`${base}/placements`)).json(), { nativeBanner: { enabled: false } });
  assert.deepEqual(audits.map((event) => event.details.nativeBannerEnabled), [true, false]);
  assert.deepEqual(Object.keys(await (await fetch(`${base}/placements`)).json().then((j) => j.nativeBanner)), ['enabled'],
    'the public answer carries only the on/off state, never script URLs');
});

test('the admin endpoints refuse anyone who is not an Administrator', async (t) => {
  const { base, placements } = await start(t, { admin: false });
  assert.equal((await fetch(`${base}/admin/placements`)).status, 401);
  const response = await fetch(`${base}/admin/placements`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"nativeBannerEnabled":true}' });
  assert.equal(response.status, 401);
  assert.equal((await placements.read()).nativeBannerEnabled, false);
});

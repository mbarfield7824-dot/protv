const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  AdRevenueStore,
  createAdSessionToken,
  hmac,
  verifyAdSessionToken,
  verifySignedBody,
} = require('../src/ads/adRevenueService');
const { validateProviderEvent } = require('../src/ads/router');

test('signed ad sessions bind telemetry to one catalog title', () => {
  const token = createAdSessionToken({ videoId: 'catalog_123', secret: 'test-secret' });
  const payload = verifyAdSessionToken(token, 'test-secret');
  assert.equal(payload.videoId, 'catalog_123');
  assert.match(payload.sessionId, /^[0-9a-f-]{36}$/);
  assert.throws(() => verifyAdSessionToken(token, 'wrong-secret'), /invalid/);
});

test('provider webhook signatures are verified against the exact request body', () => {
  const body = '{"providerEventId":"event-1"}';
  const signature = hmac(body, 'provider-secret');
  assert.doesNotThrow(() => verifySignedBody(body, signature, 'provider-secret'));
  assert.throws(() => verifySignedBody(`${body} `, signature, 'provider-secret'), /invalid/);
});

test('file revenue store records impressions and provider revenue idempotently', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protv-ad-revenue-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new AdRevenueStore({
    db: null,
    filePath: path.join(directory, 'revenue.json'),
  });
  const telemetry = {
    sessionId: 'session-1',
    videoId: 'catalog_123',
    eventType: 'impression',
    occurredAt: new Date().toISOString(),
  };
  assert.equal((await store.recordTelemetry(telemetry)).duplicate, false);
  assert.equal((await store.recordTelemetry(telemetry)).duplicate, true);

  const event = validateProviderEvent({
    providerEventId: 'provider-1',
    catalogId: 'catalog_123',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    currency: 'USD',
    grossRevenueCents: 12_500,
    impressions: 1000,
  });
  assert.equal((await store.recordProviderRevenue(event)).duplicate, false);
  assert.equal((await store.recordProviderRevenue(event)).duplicate, true);
  assert.deepEqual(await store.getTitleMetrics('catalog_123'), {
    playerImpressions: 1,
    providerImpressions: 1000,
    grossRevenueCents: 12_500,
    currency: 'USD',
    updatedAt: event.receivedAt,
  });
});

test('provider revenue validation rejects money that is not integer cents', () => {
  assert.throws(() => validateProviderEvent({
    providerEventId: 'provider-1',
    catalogId: 'catalog_123',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    currency: 'USD',
    grossRevenueCents: 12.5,
    impressions: 10,
  }), /integer number of cents/);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DistributorFeedClient,
  normalizeTitle,
  parseDistributorFeed,
} = require('../src/distributorIngestion/feedClient');
const { DistributorIngestionRunner, stateKey } = require('../src/distributorIngestion/runner');
const { validateRightsWindow } = require('../src/distributorIngestion/rightsValidator');

function validItem(overrides = {}) {
  return {
    externalId: 'film-100',
    title: 'Example__Movie',
    releaseYear: 2024,
    description: 'A distributor-provided description.',
    runtimeSeconds: 5400,
    categories: ['Science Fiction', 'Drama'],
    tags: ['licensed', 'feature'],
    mediaUrl: 'https://media.example.com/example.mp4',
    poster: {
      url: 'https://media.example.com/example.jpg',
      rightsConfirmed: true,
    },
    rights: {
      holder: 'Example Distribution',
      licenseType: 'SVOD',
      startAt: '2026-01-01T00:00:00.000Z',
      endAt: '2027-01-01T00:00:00.000Z',
      territories: ['US', 'CA'],
      exclusive: false,
      confirmedForStreaming: true,
    },
    ...overrides,
  };
}

function validFeed(items = [validItem()]) {
  return {
    schemaVersion: '1.0',
    distributor: { id: 'example-distribution', name: 'Example Distribution' },
    generatedAt: '2026-09-19T12:00:00.000Z',
    items,
  };
}

test('normalizes distributor titles without changing intentional casing', () => {
  assert.equal(normalizeTitle('  A__Film   from A24  '), 'A Film from A24');
});

test('parses the standard feed and maps supported category aliases', () => {
  const feed = parseDistributorFeed(validFeed());
  assert.equal(feed.failures.length, 0);
  assert.equal(feed.items[0].title, 'Example Movie');
  assert.deepEqual(feed.items[0].categories, ['Sci-Fi', 'Drama']);
  assert.equal(feed.items[0].rights.confirmedForStreaming, true);
});

test('feed client sends the configured bearer token over HTTPS', async (t) => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify(validFeed()),
    };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const client = new DistributorFeedClient({
    feedUrl: 'https://feed.example.com/catalog.json',
    bearerToken: 'test-token',
  });
  const feed = await client.fetch();

  assert.equal(request.url, 'https://feed.example.com/catalog.json');
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
  assert.equal(feed.items.length, 1);
});

test('isolates malformed feed items instead of rejecting valid neighbors', () => {
  const feed = parseDistributorFeed(validFeed([
    validItem(),
    validItem({ externalId: 'bad-item', mediaUrl: 'http://insecure.example.com/movie.mp4' }),
  ]));
  assert.equal(feed.items.length, 1);
  assert.equal(feed.failures.length, 1);
  assert.match(feed.failures[0].message, /must use HTTPS/);
});

test('validates active dates, territory, and confirmed streaming rights', () => {
  const now = new Date('2026-09-19T12:00:00.000Z');
  const rights = validItem().rights;
  assert.equal(validateRightsWindow(rights, 'US', now).eligible, true);
  assert.equal(validateRightsWindow({ ...rights, startAt: '2026-10-01T00:00:00.000Z' }, 'US', now).eligible, false);
  assert.equal(validateRightsWindow({ ...rights, endAt: '2026-09-01T00:00:00.000Z' }, 'US', now).eligible, false);
  assert.equal(validateRightsWindow({ ...rights, territories: ['GB'] }, 'US', now).eligible, false);
  assert.equal(validateRightsWindow({ ...rights, confirmedForStreaming: false }, 'US', now).eligible, false);
});

test('runner skips an ineligible rights window before catalog creation', async () => {
  const calls = [];
  const audits = [];
  const item = validItem({ rights: { ...validItem().rights, territories: ['GB'] } });
  const runner = new DistributorIngestionRunner({
    feedClient: {
      fetch: async () => ({
        distributor: validFeed().distributor,
        items: [item],
        failures: [],
      }),
    },
    posterService: { create: async () => calls.push('poster') },
    catalogService: { createDraft: async () => calls.push('draft') },
    stateStore: { get: async () => null },
    audit: async (event) => audits.push(event),
    requiredTerritory: 'US',
    now: () => new Date('2026-09-19T12:00:00.000Z'),
  });

  const report = await runner.run({ actorId: 'admin-1' });
  assert.deepEqual(calls, []);
  assert.equal(report.skippedMovies.length, 1);
  assert.match(report.skippedMovies[0].reason, /US territory/);
  assert.equal(audits[0].type, 'distributor.rights-skipped');
});

test('runner persists and publishes an eligible distributor title', async () => {
  const item = validItem();
  const key = stateKey('example-distribution', item.externalId);
  const state = new Map();
  const calls = [];
  const audits = [];
  const stateStore = {
    get: async (lookupKey) => state.get(lookupKey) || null,
    set: async (lookupKey, value) => {
      state.set(lookupKey, { ...(state.get(lookupKey) || {}), ...value });
    },
  };
  const runner = new DistributorIngestionRunner({
    feedClient: {
      fetch: async () => ({
        distributor: validFeed().distributor,
        items: [item],
        failures: [],
      }),
    },
    posterService: {
      storeRemoteImage: async () => '/posters/example.jpg',
      create: async () => { throw new Error('Fallback should not be used.'); },
    },
    catalogService: {
      createDraft: async () => ({ id: 'catalog-200', status: 'processing' }),
      ensureTranscoded: async () => ({ id: 'catalog-200', status: 'ready', muxPlaybackId: 'playback-200' }),
      publish: async (video) => {
        calls.push(`publish:${video.id}`);
        return video;
      },
    },
    stateStore,
    audit: async (event) => audits.push(event),
    requiredTerritory: 'US',
    now: () => new Date('2026-09-19T12:00:00.000Z'),
  });

  const report = await runner.run({ actorId: 'admin-1' });
  assert.equal(report.status, 'completed');
  assert.deepEqual(calls, ['publish:catalog-200']);
  assert.equal(report.addedMovies.length, 1);
  assert.equal(state.get(key).status, 'published');
  assert.equal(audits[0].type, 'distributor.ingested');
});

test('runner removes a published title when its rights are no longer active', async () => {
  const item = validItem({
    rights: { ...validItem().rights, endAt: '2026-09-01T00:00:00.000Z' },
  });
  const calls = [];
  const stateStore = {
    value: { status: 'published', catalogId: 'catalog-300' },
    async get() { return this.value; },
    async set(_key, value) {
      this.value = { ...this.value, ...value };
      return this.value;
    },
  };
  const runner = new DistributorIngestionRunner({
    feedClient: {
      fetch: async () => ({
        distributor: validFeed().distributor,
        items: [item],
        failures: [],
      }),
    },
    posterService: {},
    catalogService: {
      unpublish: async (catalogId) => calls.push(`unpublish:${catalogId}`),
    },
    stateStore,
    audit: async () => {},
    requiredTerritory: 'US',
    now: () => new Date('2026-09-19T12:00:00.000Z'),
  });

  const report = await runner.run({ actorId: 'admin-1' });
  assert.deepEqual(calls, ['unpublish:catalog-300']);
  assert.equal(stateStore.value.status, 'rights-inactive');
  assert.match(report.skippedMovies[0].reason, /Removed from the live catalog/);
});

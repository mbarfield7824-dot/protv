const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { discoverableEvents } = require('../src/live/readModel');
const { createLiveService } = require('../src/live/service');
const { createLiveRouter } = require('../src/live/router');

function event(id, overrides = {}) {
  return {
    id,
    title: `Event ${id}`,
    description: 'Public event description',
    artworkUrl: 'https://images.example/event.jpg',
    scheduledStartAt: new Date('2026-10-01T18:00:00Z'),
    scheduledEndAt: new Date('2026-10-01T20:00:00Z'),
    status: 'scheduled',
    accessPolicy: 'free',
    published: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    muxLiveStreamId: 'internal-stream',
    muxPlaybackId: 'internal-playback',
    streamKey: 'internal-key',
    playbackAuthorization: 'internal-auth',
    providerConfiguration: { key: 'internal' },
    paymentReference: 'internal-payment',
    entitlement: { uid: 'internal-user' },
    adminNotes: 'internal-notes',
    ...overrides,
  };
}

const fixtures = [
  event('later', { scheduledStartAt: new Date('2026-10-02T18:00:00Z'), scheduledEndAt: new Date('2026-10-02T20:00:00Z') }),
  event('same-b'),
  event('same-a', { scheduledStartAt: { toDate: () => new Date('2026-10-01T18:00:00Z') } }),
  event('draft', { status: 'draft' }),
  event('unpublished', { published: false }),
  event('cancelled', { status: 'cancelled' }),
  event('live', { status: 'live' }),
  event('ended', { status: 'ended' }),
  event('paid', { accessPolicy: 'paid', priceMinor: 999, currency: 'USD' }),
];

const publicKeys = [
  'accessPolicy', 'artworkUrl', 'description', 'id', 'scheduledEndAt',
  'scheduledStartAt', 'status', 'title',
];

async function listen(context, service) {
  const app = express();
  app.use('/v1/live', createLiveRouter({ service }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  return async (path = '/events') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/live${path}`);
    return {
      status: response.status,
      body: response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : null,
    };
  };
}

test('only published free scheduled events appear, ordered by start then stable ID', () => {
  const items = discoverableEvents(fixtures);
  assert.deepEqual(items.map(({ id }) => id), ['same-a', 'same-b', 'later']);
  assert.deepEqual(discoverableEvents([...fixtures].reverse()), items);
  assert.deepEqual(Object.keys(items[0]).sort(), publicKeys);
  assert.equal(items[0].scheduledStartAt, '2026-10-01T18:00:00.000Z');
  assert.equal(items[0].muxPlaybackId, undefined);
  assert.equal(items[0].streamKey, undefined);
  assert.equal(items[0].published, undefined);
  assert.equal(items[0].priceMinor, undefined);
  assert.equal(discoverableEvents([event('free', { priceMinor: 999, currency: 'USD' })])[0].currency, undefined);
});

test('malformed published scheduled records fail closed rather than leaking or faking results', () => {
  assert.throws(() => discoverableEvents([event('broken', { scheduledEndAt: new Date('2026-09-01') })]));
  assert.throws(() => discoverableEvents([event('broken', { title: null })]));
});

test('public collection and detail routes return the same allowlisted projection without auth', async (context) => {
  const get = await listen(context, {
    list: async () => fixtures,
    get: async (id) => fixtures.find((item) => item.id === id) || null,
  });
  const list = await get();
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map(({ id }) => id), ['same-a', 'same-b', 'later']);
  const detail = await get('/events/same-a');
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body, list.body.items[0]);
  assert.deepEqual(Object.keys(detail.body).sort(), publicKeys);
  for (const id of ['missing', 'draft', 'unpublished', 'cancelled', 'live', 'ended', 'paid']) {
    assert.deepEqual(await get(`/events/${id}`), { status: 404, body: { error: 'Live event not found.' } });
  }
  assert.equal((await get('/events/same-a/playback')).status, 404);
  assert.equal((await get('/events/same-a/access')).status, 404);
});

test('Firestore service reads only liveEvents and never falls back to local JSON', async () => {
  const calls = [];
  const service = createLiveService({
    getDb: () => ({
      collection(name) {
        calls.push(name);
        return {
          where: (field, operator, value) => {
            assert.deepEqual([field, operator, value], ['published', '==', true]);
            return { get: async () => ({ docs: [{ id: 'first', data: () => event('spoofed', { id: 'spoofed' }) }] }) };
          },
          doc: (id) => ({
            get: async () => ({ exists: true, id, data: () => event('spoofed') }),
          }),
        };
      },
    }),
  });
  assert.equal((await service.list())[0].id, 'first');
  assert.equal((await service.get('first')).id, 'first');
  assert.deepEqual(calls, ['liveEvents', 'liveEvents']);
  const unavailable = createLiveService({ getDb: () => null });
  await assert.rejects(unavailable.list(), /Firestore is unavailable/);
  await assert.rejects(unavailable.get('first'), /Firestore is unavailable/);
});

test('authoritative read and validation failures return sanitized 503, not empty success', async (context) => {
  const originalError = console.error;
  console.error = () => {};
  context.after(() => { console.error = originalError; });
  const get = await listen(context, {
    list: async () => { throw new Error('private database diagnostics'); },
    get: async () => { throw new Error('private database diagnostics'); },
  });
  const expected = { status: 503, body: { error: 'Live events are temporarily unavailable.' } };
  assert.deepEqual(await get(), expected);
  assert.deepEqual(await get('/events/first'), expected);
});

test('empty authoritative collection is a valid success; malformed public records are not', async (context) => {
  const empty = await listen(context, {
    list: async () => [],
    get: async () => null,
  });
  assert.deepEqual(await empty(), { status: 200, body: { items: [] } });
  assert.equal((await empty('/events/missing')).status, 404);

  const originalError = console.error;
  console.error = () => {};
  context.after(() => { console.error = originalError; });
  const malformed = await listen(context, {
    list: async () => [event('bad', { scheduledStartAt: null })],
    get: async () => event('bad', { scheduledStartAt: null }),
  });
  assert.equal((await malformed()).status, 503);
  assert.equal((await malformed('/events/bad')).status, 503);
});

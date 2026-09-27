const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAdminLiveService } = require('../src/live/adminService');
const { createLiveRouter } = require('../src/live/router');

const baseEvent = {
  title: 'Live Premiere',
  description: 'A scheduled show',
  artworkUrl: 'https://images.example/live.jpg',
  scheduledStartAt: '2026-10-01T18:00:00Z',
  scheduledEndAt: '2026-10-01T20:00:00Z',
  status: 'draft',
  accessPolicy: 'free',
  published: false,
};

function fakeFirestore() {
  const records = new Map();
  let sequence = 0;
  let broken = false;
  const db = {
    collection(name) {
      assert.equal(name, 'liveEvents');
      if (broken) throw new Error('private storage details');
      const doc = (id = `generated-${++sequence}`) => ({
        id,
        async create(value) {
          if (records.has(id)) throw new Error('already exists');
          records.set(id, { ...value });
        },
        async get() {
          return { id, exists: records.has(id), data: () => records.get(id) };
        },
      });
      return {
        doc,
        async get() {
          return { docs: [...records].map(([id, value]) => ({ id, data: () => value })) };
        },
        where(field, operator, value) {
          assert.deepEqual([field, operator, value], ['published', '==', true]);
          return {
            get: async () => ({
              docs: [...records].filter(([, record]) => record.published === true)
                .map(([id, record]) => ({ id, data: () => record })),
            }),
          };
        },
      };
    },
    async runTransaction(callback) {
      const changes = [];
      const result = await callback({
        get: (ref) => ref.get(),
        update: (ref, fields) => changes.push([ref.id, fields]),
      });
      for (const [id, fields] of changes) records.set(id, { ...records.get(id), ...fields });
      return result;
    },
  };
  return { db, records, breakStorage: () => { broken = true; } };
}

async function harness(context) {
  const firebase = require('../src/firebase');
  const previousAuth = firebase.auth;
  firebase.auth = {
    verifyIdToken: async (token) => {
      if (token === 'admin') return { uid: 'admin-uid', admin: true, firebase: { sign_in_provider: 'password' } };
      if (token === 'viewer') return { uid: 'viewer-uid', admin: false, firebase: { sign_in_provider: 'password' } };
      if (token === 'device') return { uid: 'admin-uid', admin: true, firebase: { sign_in_provider: 'custom' } };
      throw new Error('Invalid token');
    },
  };
  delete require.cache[require.resolve('../src/middleware/auth')];
  delete require.cache[require.resolve('../src/live/adminRouter')];
  const { createAdminLiveRouter } = require('../src/live/adminRouter');
  const store = fakeFirestore();
  const service = createAdminLiveService({ getDb: () => store.db, now: () => new Date('2026-09-27T12:00:00Z') });
  const app = express();
  app.use(express.json());
  app.use('/admin/live', createAdminLiveRouter({ service }));
  app.use('/v1/live', createLiveRouter({ service: {
    list: async () => {
      const snapshot = await store.db.collection('liveEvents').where('published', '==', true).get();
      return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    },
    get: (id) => service.get(id),
  } }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    firebase.auth = previousAuth;
    delete require.cache[require.resolve('../src/middleware/auth')];
    delete require.cache[require.resolve('../src/live/adminRouter')];
  });
  await new Promise((resolve) => server.once('listening', resolve));
  async function request(method, route, token, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { request, store };
}

test('every Admin route requires an interactive Firebase token with the admin claim', async (context) => {
  const { request, store } = await harness(context);
  for (const [method, route, body] of [
    ['GET', '/admin/live/events'],
    ['GET', '/admin/live/events/missing'],
    ['POST', '/admin/live/events', baseEvent],
    ['PATCH', '/admin/live/events/missing', { title: 'Changed' }],
  ]) {
    assert.equal((await request(method, route)).status, 401);
    assert.equal((await request(method, route, 'invalid', body)).status, 401);
    assert.equal((await request(method, route, 'viewer', body)).status, 403);
    assert.equal((await request(method, route, 'device', body)).status, 403);
  }
  assert.equal(store.records.size, 0);
});

test('admin creates and reads draft with server ID and timestamps; public API remains unchanged', async (context) => {
  const { request, store } = await harness(context);
  const created = await request('POST', '/admin/live/events', 'admin', baseEvent);
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 'generated-1');
  assert.equal(created.body.createdAt, '2026-09-27T12:00:00.000Z');
  assert.equal(created.body.updatedAt, created.body.createdAt);
  assert.equal(created.body.published, false);
  assert.equal(created.body.streamKey, undefined);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  store.records.get(created.body.id).streamKey = 'private-value';
  store.records.get(created.body.id).muxPlaybackId = 'private-playback';
  assert.equal((await request('GET', '/admin/live/events', 'admin')).body.items[0].streamKey, undefined);
  assert.deepEqual((await request('GET', `/admin/live/events/${created.body.id}`, 'admin')).body, created.body);
  assert.equal((await request('GET', '/admin/live/events/unknown', 'admin')).status, 404);
  assert.deepEqual((await request('GET', '/v1/live/events')).body, { items: [] });
  assert.equal((await request('GET', `/v1/live/events/${created.body.id}`)).status, 404);

  const published = await request('POST', '/admin/live/events', 'admin', {
    ...baseEvent, status: 'scheduled', published: true,
  });
  assert.equal(published.status, 201);
  const publicList = await request('GET', '/v1/live/events');
  assert.deepEqual(publicList.body.items.map(({ id }) => id), [published.body.id]);
  assert.equal(publicList.body.items[0].published, undefined);
  assert.equal(publicList.body.items[0].streamKey, undefined);
  assert.equal((await request('GET', `/v1/live/events/${published.body.id}`)).body.title, baseEvent.title);
});

test('create rejects malformed fields, private injections, invalid schedules and unsafe publication', async (context) => {
  const { request, store } = await harness(context);
  const invalid = [
    { title: '' }, { title: 'X'.repeat(201) }, { description: 'X'.repeat(5001) },
    { artworkUrl: 'javascript:alert(1)' }, { artworkUrl: 'http://images.example/live.jpg' },
    { scheduledStartAt: 'not a date' }, { scheduledStartAt: '2026-10-01T18:00:00' },
    { scheduledStartAt: '2026-02-30T18:00:00Z' },
    { scheduledEndAt: '2026-10-01T17:00:00Z' }, { status: 'unknown' },
    { status: 'ended' }, { accessPolicy: 'subscriber' }, { published: 'true' },
    { extraField: 1 }, { id: 'attacker-id' }, { createdAt: '2020-01-01' },
    { muxLiveStreamId: 'injected' }, { muxPlaybackId: 'injected' },
    { streamKey: 'injected' }, { paymentReference: 'injected' },
    { entitlement: true }, { status: 'draft', published: true },
    { status: 'scheduled', accessPolicy: 'paid', published: true },
  ];
  for (const override of invalid) {
    const result = await request('POST', '/admin/live/events', 'admin', { ...baseEvent, ...override });
    assert.equal(result.status, 400, `invalid override: ${Object.keys(override).join(',')}`);
  }
  assert.equal((await request('POST', '/admin/live/events', 'admin', {})).status, 400);
  assert.equal(store.records.size, 0);
});

test('PATCH preserves private/server-owned fields, validates final state and enforces lifecycle transitions', async (context) => {
  const { request, store } = await harness(context);
  const created = (await request('POST', '/admin/live/events', 'admin', baseEvent)).body;
  const url = `/admin/live/events/${created.id}`;
  store.records.get(created.id).adminNotes = 'retained';
  store.records.get(created.id).scheduledStartAt = { toDate: () => new Date(baseEvent.scheduledStartAt) };
  store.records.get(created.id).scheduledEndAt = { toDate: () => new Date(baseEvent.scheduledEndAt) };
  const patched = await request('PATCH', url, 'admin', {
    title: 'Updated', status: 'scheduled', published: true,
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.title, 'Updated');
  assert.equal(patched.body.createdAt, created.createdAt);
  assert.equal(store.records.get(created.id).adminNotes, 'retained');
  assert.equal((await request('GET', '/v1/live/events')).body.items.length, 1);
  for (const changes of [
    {}, { createdAt: '2020-01-01' }, { updatedAt: '2020-01-01' },
    { streamKey: 'injected' }, { accessPolicy: 'paid' }, { status: 'draft' },
    { scheduledEndAt: '2026-09-01T00:00:00Z' }, { published: 1 },
  ]) {
    assert.equal((await request('PATCH', url, 'admin', changes)).status, 400);
  }
  assert.equal((await request('PATCH', url, 'admin', { published: false, status: 'draft' })).status, 200);
  assert.deepEqual((await request('GET', '/v1/live/events')).body, { items: [] });
  assert.equal((await request('PATCH', url, 'admin', { published: true })).status, 400);
  assert.equal((await request('PATCH', url, 'admin', { status: 'scheduled', published: true })).status, 200);
  assert.equal((await request('PATCH', url, 'admin', { status: 'live', published: false })).status, 200);
  assert.equal((await request('PATCH', url, 'admin', { status: 'ended' })).status, 200);
  assert.equal((await request('PATCH', url, 'admin', { status: 'live' })).status, 400);
  const cancelled = (await request('POST', '/admin/live/events', 'admin', baseEvent)).body;
  assert.equal((await request('PATCH', `/admin/live/events/${cancelled.id}`, 'admin', { status: 'cancelled' })).status, 200);
  assert.equal((await request('PATCH', `/admin/live/events/${cancelled.id}`, 'admin', { status: 'live' })).status, 400);
  assert.equal((await request('PATCH', '/admin/live/events/unknown', 'admin', { title: 'Nope' })).status, 404);
  assert.equal((await request('GET', '/admin/live/events', 'admin')).body.items.length, 2);
});

test('Admin list includes every lifecycle state and never emits injected private fields', async (context) => {
  const { request, store } = await harness(context);
  for (const status of ['draft', 'scheduled', 'live', 'ended', 'cancelled']) {
    store.records.set(status, {
      ...baseEvent,
      scheduledStartAt: new Date(baseEvent.scheduledStartAt),
      scheduledEndAt: new Date(baseEvent.scheduledEndAt),
      createdAt: new Date(), updatedAt: new Date(), status, streamKey: 'secret',
    });
  }
  const list = await request('GET', '/admin/live/events', 'admin');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map(({ status }) => status), ['cancelled', 'draft', 'ended', 'live', 'scheduled']);
  assert.equal(list.body.items.every((item) => item.streamKey === undefined), true);
  assert.deepEqual((await request('GET', '/v1/live/events')).body, { items: [] });
});

test('missing Firestore or failed reads/writes return sanitized 503 without fallback', async (context) => {
  const { request, store } = await harness(context);
  const original = console.error;
  console.error = () => {};
  context.after(() => { console.error = original; });
  store.breakStorage();
  for (const [method, route, body] of [
    ['GET', '/admin/live/events'],
    ['GET', '/admin/live/events/id'],
    ['POST', '/admin/live/events', baseEvent],
    ['PATCH', '/admin/live/events/id', { title: 'Changed' }],
  ]) {
    const result = await request(method, route, 'admin', body);
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: 'Live administration is temporarily unavailable.' });
  }
  const unavailable = createAdminLiveService({ getDb: () => null });
  await assert.rejects(unavailable.list(), /Firestore is unavailable/);
  await assert.rejects(unavailable.create(baseEvent), /Firestore is unavailable/);
});

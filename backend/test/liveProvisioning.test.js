const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAdminLiveService } = require('../src/live/adminService');
const { createLiveRouter } = require('../src/live/router');

function fakeDb() {
  const records = new Map();
  let transactionCount = 0;
  let failAttach = false;
  let lock = Promise.resolve();
  const collection = (name) => {
    assert.equal(name, 'liveEvents');
    return {
      doc: (id) => ({
        id,
        get: async () => ({
          exists: records.has(id), id, data: () => records.get(id),
        }),
      }),
      where: (field, operator, value) => {
        assert.deepEqual([field, operator, value], ['published', '==', true]);
        return { get: async () => ({
          docs: [...records].filter(([, event]) => event.published)
            .map(([id, event]) => ({ id, data: () => event })),
        }) };
      },
    };
  };
  const db = {
    collection,
    runTransaction(callback) {
      const result = lock.then(async () => {
        transactionCount += 1;
        const changes = [];
        const output = await callback({
          get: (ref) => ref.get(),
          update: (ref, fields) => {
            if (failAttach && transactionCount === 2) throw new Error('Firestore attach failed');
            changes.push([ref.id, fields]);
          },
        });
        for (const [id, fields] of changes) records.set(id, { ...records.get(id), ...fields });
        return output;
      });
      lock = result.then(() => {}, () => {});
      return result;
    },
  };
  return { db, records, failNextAttach: () => { failAttach = true; } };
}

async function harness(context, { createStream } = {}) {
  const firebase = require('../src/firebase');
  const previousAuth = firebase.auth;
  firebase.auth = {
    verifyIdToken: async (token) => {
      if (token === 'admin') return { uid: 'admin', admin: true, firebase: { sign_in_provider: 'password' } };
      if (token === 'viewer') return { uid: 'viewer', admin: false, firebase: { sign_in_provider: 'password' } };
      if (token === 'device') return { uid: 'admin', admin: true, firebase: { sign_in_provider: 'custom' } };
      throw new Error('Invalid token');
    },
  };
  delete require.cache[require.resolve('../src/middleware/auth')];
  delete require.cache[require.resolve('../src/live/adminRouter')];
  const { createAdminLiveRouter } = require('../src/live/adminRouter');
  const store = fakeDb();
  store.records.set('event-1', {
    title: 'Test Live', description: 'Free test', artworkUrl: 'https://images.example/live.jpg',
    scheduledStartAt: new Date('2026-10-01T18:00:00Z'),
    scheduledEndAt: new Date('2026-10-01T20:00:00Z'),
    status: 'scheduled', accessPolicy: 'free', published: false,
    createdAt: new Date(), updatedAt: new Date(),
  });
  let creations = 0;
  const service = createAdminLiveService({
    getDb: () => store.db,
    createStream: async (options) => {
      creations += 1;
      assert.deepEqual(options, { playback_policies: ['public'], passthrough: 'event-1' });
      return createStream ? createStream(options) : {
        id: 'mux-live-id', stream_key: 'private-stream-key',
        playback_ids: [{ policy: 'public', id: 'mux-playback-id' }],
      };
    },
  });
  const app = express();
  app.use(express.json());
  app.use('/admin/live', createAdminLiveRouter({ service }));
  app.use('/v1/live', createLiveRouter({ service: {
    get: service.get,
    list: async () => {
      const snapshot = await store.db.collection('liveEvents').where('published', '==', true).get();
      return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    },
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
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  return { request, store, service, creations: () => creations };
}

const provision = '/admin/live/events/event-1/provision-stream';
const status = '/admin/live/events/event-1/stream';

test('only interactive Admin may provision or inspect, and unknown events return 404', async (context) => {
  const { request, creations } = await harness(context);
  for (const route of [provision, status]) {
    const method = route === provision ? 'POST' : 'GET';
    assert.equal((await request(method, route)).status, 401);
    assert.equal((await request(method, route, 'viewer')).status, 403);
    assert.equal((await request(method, route, 'device')).status, 403);
  }
  assert.equal((await request('POST', '/admin/live/events/missing/provision-stream', 'admin')).status, 404);
  assert.equal((await request('GET', '/admin/live/events/missing/stream', 'admin')).status, 404);
  assert.equal(creations(), 0);
});

test('provisioning stores only IDs, preserves event lifecycle and never exposes the stream key', async (context) => {
  const { request, store, creations } = await harness(context);
  assert.deepEqual((await request('GET', status, 'admin')).body, { state: 'unprovisioned' });
  const result = await request('POST', provision, 'admin');
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, {
    state: 'provisioned', muxLiveStreamId: 'mux-live-id', muxPlaybackId: 'mux-playback-id',
  });
  assert.deepEqual((await request('GET', status, 'admin')).body, result.body);
  assert.equal(store.records.get('event-1').streamKey, undefined);
  assert.equal(store.records.get('event-1').stream_key, undefined);
  assert.equal(store.records.get('event-1').status, 'scheduled');
  assert.equal(store.records.get('event-1').published, false);
  assert.equal((await request('GET', '/admin/live/events/event-1', 'admin')).body.muxLiveStreamId, undefined);
  assert.equal((await request('GET', '/v1/live/events/event-1')).status, 404);
  assert.deepEqual((await request('GET', '/v1/live/events')).body, { items: [] });
  assert.deepEqual((await request('POST', provision, 'admin')).body, result.body);
  assert.equal(creations(), 1);
  assert.equal((await request('PATCH', '/admin/live/events/event-1', 'admin',
    { accessPolicy: 'paid' })).status, 400);
  assert.equal(store.records.get('event-1').accessPolicy, 'free');
  assert.equal((await request('PATCH', '/admin/live/events/event-1', 'admin',
    { published: true })).status, 200);
  const publicItem = (await request('GET', '/v1/live/events/event-1')).body;
  assert.deepEqual(Object.keys(publicItem).sort(), [
    'accessPolicy', 'artworkUrl', 'description', 'id', 'scheduledEndAt',
    'scheduledStartAt', 'status', 'title',
  ]);
});

test('concurrent provisioning sees reservation and cannot create a second Mux stream', async (context) => {
  let release;
  let started;
  const inMux = new Promise((resolve) => { started = resolve; });
  const { request, creations } = await harness(context, {
    createStream: () => {
      started();
      return new Promise((resolve) => { release = resolve; });
    },
  });
  const first = request('POST', provision, 'admin');
  await inMux;
  assert.equal((await request('POST', provision, 'admin')).status, 409);
  assert.equal((await request('GET', status, 'admin')).body.state, 'reserved');
  release({ id: 'mux-live-id', stream_key: 'private-stream-key',
    playback_ids: [{ policy: 'public', id: 'mux-playback-id' }] });
  assert.equal((await first).status, 201);
  assert.equal(creations(), 1);
});

test('failed or ambiguous Mux create requires recovery and never triggers an automatic retry', async (context) => {
  const { request, creations, store } = await harness(context, {
    createStream: async () => { throw new Error('Mux outcome unknown: private-stream-key'); },
  });
  const result = await request('POST', provision, 'admin');
  assert.equal(result.status, 409);
  assert.equal(JSON.stringify(result.body).includes('private-stream-key'), false);
  assert.deepEqual((await request('GET', status, 'admin')).body, { state: 'recovery_required' });
  assert.equal(store.records.get('event-1').muxLiveStreamId, undefined);
  assert.equal((await request('POST', provision, 'admin')).status, 409);
  assert.equal(creations(), 1);
});

test('Firestore unavailable before reservation never calls Mux', async () => {
  let called = false;
  const service = createAdminLiveService({
    getDb: () => null,
    createStream: async () => { called = true; },
  });
  await assert.rejects(service.provisionStream('event-1'), /Firestore is unavailable/);
  assert.equal(called, false);
});

test('Firestore attach failure after confirmed Mux create locks event for manual recovery', async (context) => {
  const { request, store, creations } = await harness(context);
  store.failNextAttach();
  assert.equal((await request('POST', provision, 'admin')).status, 409);
  assert.deepEqual((await request('GET', status, 'admin')).body, { state: 'recovery_required' });
  assert.equal((await request('POST', provision, 'admin')).status, 409);
  assert.equal(creations(), 1);
});

test('only unpublished scheduled free events can reserve a public Mux stream', async (context) => {
  const { request, store, creations } = await harness(context);
  for (const change of [
    { accessPolicy: 'paid' }, { published: true }, { status: 'ended' },
  ]) {
    Object.assign(store.records.get('event-1'), change);
    assert.equal((await request('POST', provision, 'admin')).status, 409);
    Object.assign(store.records.get('event-1'), {
      accessPolicy: 'free', published: false, status: 'scheduled',
    });
  }
  assert.equal(creations(), 0);
});

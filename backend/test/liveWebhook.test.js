const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const express = require('express');
const { adminEvent } = require('../src/live/adminModel');
const { publicEvent } = require('../src/live/readModel');

function fakeDb() {
  const events = new Map();
  const receipts = new Map();
  let writes = 0;
  let lock = Promise.resolve();
  const db = {
    collection(name) {
      assert.equal(name, 'liveEvents');
      return {
        doc(id) {
          return {
            id,
            collection(subcollection) {
              assert.equal(subcollection, 'muxWebhookEvents');
              return { doc: (receiptId) => ({ id, receiptId }) };
            },
          };
        },
      };
    },
    runTransaction(callback) {
      const result = lock.then(async () => {
        const pending = [];
        const output = await callback({
          get: async (ref) => {
            const value = ref.receiptId
              ? receipts.get(`${ref.id}:${ref.receiptId}`) : events.get(ref.id);
            return { exists: value !== undefined, data: () => value };
          },
          create: (ref, fields) => pending.push(() => {
            receipts.set(`${ref.id}:${ref.receiptId}`, fields);
            writes += 1;
          }),
          update: (ref, fields) => pending.push(() => {
            events.set(ref.id, { ...events.get(ref.id), ...fields });
            writes += 1;
          }),
        });
        pending.forEach((apply) => apply());
        return output;
      });
      lock = result.then(() => {}, () => {});
      return result;
    },
  };
  return { db, events, receipts, writes: () => writes };
}

test('signed Mux Live signals record private evidence without changing PROtv events', async (context) => {
  const firebase = require('../src/firebase');
  const previousDb = firebase.db;
  const previousSecret = process.env.MUX_WEBHOOK_SECRET;
  const secret = 'test-only-live-webhook-secret';
  process.env.MUX_WEBHOOK_SECRET = secret;
  const store = fakeDb();
  firebase.db = store.db;
  const base = {
    title: 'Private test', description: 'Description', artworkUrl: 'https://example.com/live.jpg',
    scheduledStartAt: new Date('2026-09-28T01:00:00Z'),
    scheduledEndAt: new Date('2026-09-28T04:00:00Z'),
    createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
    status: 'scheduled', published: false, accessPolicy: 'free',
    streamProvisioning: { state: 'provisioned' },
    muxLiveStreamId: 'stream-1', muxPlaybackId: 'original-playback-id',
  };
  store.events.set('event-1', structuredClone(base));
  store.events.set('event-2', { ...structuredClone(base), muxLiveStreamId: 'stream-2' });
  store.events.set('unprovisioned', {
    ...structuredClone(base), streamProvisioning: { state: 'reserved' },
  });

  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const app = express();
  app.use(express.json({ verify: (req, res, raw) => { req.rawBody = Buffer.from(raw); } }));
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    firebase.db = previousDb;
    if (previousSecret === undefined) delete process.env.MUX_WEBHOOK_SECRET;
    else process.env.MUX_WEBHOOK_SECRET = previousSecret;
    delete require.cache[routePath];
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/videos/webhook`;

  async function send(event, signed = true) {
    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('sha256', secret)
      .update(`${timestamp}.${body}`).digest('hex');
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signed ? { 'mux-signature': `t=${timestamp},v1=${signature}` } : {}),
      },
      body,
    });
  }

  function signal(type, id, passthrough = 'event-1', streamId = 'stream-1') {
    return {
      id, type: `video.live_stream.${type}`, created_at: '2026-09-28T01:00:00Z',
      data: {
        id: streamId, passthrough, stream_key: 'do-not-persist-this-key',
        playback_ids: [{ policy: 'public', id: 'do-not-persist-this-playback-id' }],
      },
    };
  }

  const active = signal('active', 'webhook-1');
  assert.equal((await send(active, false)).status, 401);
  assert.equal(store.writes(), 0);
  for (const [index, type] of [
    'active', 'disconnected', 'idle', 'disabled', 'enabled', 'deleted',
  ].entries()) {
    assert.equal((await send(signal(type, `webhook-${index + 1}`))).status, 200);
    assert.equal(store.events.get('event-1').muxOperationalSignal.type,
      `video.live_stream.${type}`);
  }
  assert.equal(store.writes(), 12);
  assert.equal(store.receipts.size, 6);
  assert.equal((await send(active)).status, 200);
  assert.equal(store.writes(), 12, 'older duplicate must remain a no-op');
  assert.equal((await send(signal('active', 'webhook-7',
    'event-1', 'different-stream'))).status, 200);
  assert.equal((await send(signal('active', 'webhook-8',
    'unknown-event'))).status, 200);
  assert.equal((await send(signal('active', 'webhook-9',
    'event-2', 'stream-1'))).status, 200);
  assert.equal((await send(signal('active', 'webhook-10',
    'unprovisioned'))).status, 200);
  assert.equal((await send(signal('recording', 'webhook-11'))).status, 200);
  assert.equal(store.writes(), 12);

  const stored = store.events.get('event-1');
  assert.equal(stored.status, 'scheduled');
  assert.equal(stored.published, false);
  assert.equal(stored.accessPolicy, 'free');
  assert.equal(stored.muxPlaybackId, 'original-playback-id');
  assert.equal(stored.muxOperationalSignal.webhookEventId, 'webhook-6');
  assert.deepEqual(Object.keys(stored.muxOperationalSignal).sort(),
    ['muxCreatedAt', 'receivedAt', 'type', 'webhookEventId']);
  for (const receipt of store.receipts.values()) {
    assert.deepEqual(Object.keys(receipt).sort(),
      ['muxCreatedAt', 'receivedAt', 'type', 'webhookEventId']);
  }
  assert.doesNotMatch(JSON.stringify([...store.events, ...store.receipts]),
    /do-not-persist-this-key|do-not-persist-this-playback-id/);
  assert.deepEqual(Object.keys(adminEvent({ ...stored, id: 'event-1' })).sort(),
    ['accessPolicy', 'artworkUrl', 'createdAt', 'description', 'id', 'published',
      'scheduledEndAt', 'scheduledStartAt', 'status', 'title', 'updatedAt']);
  assert.deepEqual(Object.keys(publicEvent({ ...stored, id: 'event-1' })).sort(),
    ['accessPolicy', 'artworkUrl', 'description', 'id', 'scheduledEndAt',
      'scheduledStartAt', 'status', 'title']);
});

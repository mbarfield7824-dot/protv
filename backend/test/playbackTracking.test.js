const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createOptionalTokenVerifier } = require('../src/middleware/auth');
const {
  PlaybackInputError,
  PlaybackNotEligibleError,
  PlaybackRateLimitError,
  PlaybackTrackingService,
  validatePlaybackEvent,
} = require('../src/playback/trackingService');
const { createPlaybackRouter } = require('../src/playback/router');

const SECRET = 'playback-test-secret-'.padEnd(40, 'x');
const ID = 'creator_test-title';
const GUEST = 'e2ac6747-b9d8-42f0-9679-8111a8fcc020';
const SESSION = 'b30be475-2982-4f71-9f76-9f1c4a993d3f';
const playableVideo = (changes = {}) => ({
  id: ID,
  title: 'Test title',
  approvalStatus: 'approved',
  status: 'ready',
  muxPlaybackId: 'mux-playback-id',
  views: 12,
  ...changes,
});

class MemoryFirestore {
  constructor(videos = [playableVideo()]) {
    this.documents = new Map(videos.map((video) => [`videos/${video.id}`, structuredClone(video)]));
    this.queue = Promise.resolve();
  }

  collection(name) {
    return {
      doc: (id) => ({ path: `${name}/${id}`, id }),
    };
  }

  async runTransaction(operation) {
    const result = this.queue.then(async () => {
      const transaction = {
        get: async (ref) => {
          const value = this.documents.get(ref.path);
          return {
            id: ref.id,
            exists: value !== undefined,
            data: () => value === undefined ? undefined : structuredClone(value),
          };
        },
        create: (ref, value) => {
          if (this.documents.has(ref.path)) throw new Error('already-exists');
          this.documents.set(ref.path, structuredClone(value));
        },
        set: (ref, value, options = {}) => {
          const current = options.merge ? this.documents.get(ref.path) || {} : {};
          this.documents.set(ref.path, { ...current, ...structuredClone(value) });
        },
        update: (ref, value) => {
          const current = this.documents.get(ref.path);
          if (!current) throw new Error('not-found');
          this.documents.set(ref.path, { ...current, ...structuredClone(value) });
        },
      };
      return operation(transaction);
    });
    this.queue = result.catch(() => {});
    return result;
  }

  get(collection, id) {
    return this.documents.get(`${collection}/${id}`);
  }
}

function harness(options = {}) {
  let now = 1_800_000_000_000;
  const db = options.db || new MemoryFirestore(options.videos);
  const service = new PlaybackTrackingService({
    db,
    secret: SECRET,
    now: () => now,
    ipLimit: options.ipLimit,
    viewerLimit: options.viewerLimit,
  });
  return {
    db,
    service,
    setNow: (value) => { now = value; },
    advance: (milliseconds) => { now += milliseconds; },
    now: () => now,
  };
}

function playbackEvent(eventType, changes = {}) {
  return validatePlaybackEvent({
    videoId: ID,
    sessionId: SESSION,
    guestId: GUEST,
    eventType,
    ...(eventType === 'qualified_view' ? { playedSeconds: 30 } : {}),
    ...changes,
  });
}

async function record(h, event, changes = {}) {
  return h.service.recordEvent({
    event,
    clientAddress: '192.0.2.10',
    ...changes,
  });
}

test('validation only accepts bounded event fields, UUIDs, and 30 played seconds', () => {
  assert.throws(() => validatePlaybackEvent(null), PlaybackInputError);
  assert.throws(() => playbackEvent('play_start', { sessionId: '../../bad' }), PlaybackInputError);
  assert.throws(() => playbackEvent('play_start', { extra: 'ignored fields are not allowed' }), PlaybackInputError);
  assert.throws(() => playbackEvent('qualified_view', { playedSeconds: 29 }), PlaybackInputError);
  assert.throws(() => playbackEvent('qualified_view', { playedSeconds: 31 }), PlaybackInputError);
  assert.throws(() => playbackEvent('unsupported'), PlaybackInputError);
  assert.equal(playbackEvent('qualified_view').playedSeconds, 30);
});

test('no qualified count before 30 server seconds, then exactly one at the threshold', async () => {
  const h = harness();
  const started = await record(h, playbackEvent('play_start'));
  assert.deepEqual(started, { recorded: true, views: 12, qualifiedAfterMs: 30_000 });
  assert.deepEqual(await record(h, playbackEvent('play_start')), {
    duplicate: true, qualified: false, views: 12, qualifiedAfterMs: 30_000,
  });
  assert.equal(h.db.get('playbackTitleMetrics', ID).playStarts, 1);
  assert.equal(h.db.get('videos', ID).views, 12);

  h.advance(29_999);
  await assert.rejects(record(h, playbackEvent('qualified_view')), PlaybackInputError);
  assert.equal(h.db.get('videos', ID).views, 12);
  h.advance(1);
  const qualified = await record(h, playbackEvent('qualified_view'));
  assert.deepEqual(qualified, { recorded: true, qualified: true, duplicateView: false, views: 13 });
  assert.equal(h.db.get('videos', ID).views, 13);

  const retry = await record(h, playbackEvent('qualified_view'));
  assert.deepEqual(retry, { duplicate: true, qualified: true, views: 13 });
  assert.equal(h.db.get('playbackTitleMetrics', ID).playStarts, 1);
});

test('one viewer can qualify again after the rolling 24-hour window expires', async () => {
  const h = harness();
  await record(h, playbackEvent('play_start'));
  h.advance(30_000);
  await record(h, playbackEvent('qualified_view'));

  h.advance(24 * 60 * 60 * 1000);
  const laterSession = '2d4a2346-0578-4b73-8a1c-c0f88ed6be9e';
  await record(h, playbackEvent('play_start', { sessionId: laterSession }));
  h.advance(30_000);
  const laterView = await record(h, playbackEvent('qualified_view', { sessionId: laterSession }));
  assert.equal(laterView.qualified, true);
  assert.equal(h.db.get('videos', ID).views, 14);
});

test('parallel sessions for one viewer cannot double count a concurrent qualification', async () => {
  const h = harness();
  const sessions = [
    '2d4a2346-0578-4b73-8a1c-c0f88ed6be9e',
    '68e12c08-a03e-48b2-8a72-b6c651f1f2ea',
  ];
  for (const sessionId of sessions) await record(h, playbackEvent('play_start', { sessionId }));
  h.advance(30_000);
  const results = await Promise.all(sessions.map((sessionId) =>
    record(h, playbackEvent('qualified_view', { sessionId }))));
  assert.equal(results.filter((result) => result.qualified).length, 1);
  assert.equal(results.filter((result) => result.duplicateView).length, 1);
  assert.equal(h.db.get('videos', ID).views, 13);
  assert.equal(h.db.get('playbackTitleMetrics', ID).playStarts, 2);
});

test('signed-in viewers deduplicate with the guest identity across sign-in transition', async () => {
  const h = harness();
  await record(h, playbackEvent('play_start'));
  h.advance(30_000);
  const user = { uid: 'verified-user-1', admin: false };
  await record(h, playbackEvent('qualified_view'), { user });

  const nextSession = '2d4a2346-0578-4b73-8a1c-c0f88ed6be9e';
  await record(h, playbackEvent('play_start', { sessionId: nextSession, guestId: '55398807-df63-4ef0-8b5c-d423113f56c4' }), { user });
  h.advance(30_000);
  const duplicate = await record(
    h,
    playbackEvent('qualified_view', { sessionId: nextSession, guestId: '55398807-df63-4ef0-8b5c-d423113f56c4' }),
    { user },
  );
  assert.equal(duplicate.qualified, false);
  assert.equal(h.db.get('videos', ID).views, 13);
});

test('different signed-in accounts are not collapsed merely because they share a browser', async () => {
  const h = harness();
  const firstUser = { uid: 'account-1', admin: false };
  const secondUser = { uid: 'account-2', admin: false };
  await record(h, playbackEvent('play_start'), { user: firstUser });
  h.advance(30_000);
  await record(h, playbackEvent('qualified_view'), { user: firstUser });

  const secondSession = '2d4a2346-0578-4b73-8a1c-c0f88ed6be9e';
  await record(h, playbackEvent('play_start', { sessionId: secondSession }), { user: secondUser });
  h.advance(30_000);
  const secondView = await record(h, playbackEvent('qualified_view', { sessionId: secondSession }), { user: secondUser });
  assert.equal(secondView.qualified, true);
  assert.equal(h.db.get('videos', ID).views, 14);
});

test('verified Admin and configured owner events are excluded from public counts', async () => {
  const h = harness();
  const admin = { uid: 'admin-id', admin: true };
  const start = await record(h, playbackEvent('play_start'), { user: admin });
  assert.deepEqual(start, { excluded: true, recorded: false, views: 12 });
  const excludedView = await record(h, playbackEvent('qualified_view'), { user: admin });
  assert.deepEqual(excludedView, { excluded: true, recorded: false, views: 12 });
  assert.equal(h.db.get('playbackTitleMetrics', ID), undefined);

  const oldOwnerEmail = process.env.OWNER_EMAIL;
  process.env.OWNER_EMAIL = 'owner@example.test';
  try {
    const owner = { uid: 'owner-id', email: 'OWNER@example.test', email_verified: true };
    assert.deepEqual(await record(h, playbackEvent('play_start'), { user: owner }), {
      excluded: true, recorded: false, views: 12,
    });
  } finally {
    if (oldOwnerEmail === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = oldOwnerEmail;
  }
});

test('unknown, unpublished, processing, and non-playable titles are rejected', async () => {
  const invalidVideos = [
    { id: 'draft', approvalStatus: 'draft', status: 'ready', muxPlaybackId: 'playback' },
    { id: 'processing', approvalStatus: 'approved', status: 'processing', muxPlaybackId: 'playback' },
    { id: 'no-playback', approvalStatus: 'approved', status: 'ready', muxPlaybackId: '' },
  ];
  for (const video of invalidVideos) {
    const h = harness({ videos: [playableVideo({ id: video.id, ...video })] });
    const event = playbackEvent('play_start', { videoId: video.id });
    await assert.rejects(record(h, event), PlaybackNotEligibleError);
  }
  const h = harness();
  await assert.rejects(record(h, playbackEvent('play_start', { videoId: 'unknown-title' })), PlaybackNotEligibleError);
});

test('qualified events require a recorded session and the same viewer/title', async () => {
  const h = harness();
  await assert.rejects(record(h, playbackEvent('qualified_view')), PlaybackInputError);
  await record(h, playbackEvent('play_start'));
  h.advance(30_000);
  const other = { uid: 'different-user', admin: false };
  await assert.rejects(record(h, playbackEvent('qualified_view', {
    guestId: '55398807-df63-4ef0-8b5c-d423113f56c4',
  }), { user: other }), PlaybackInputError);
});

test('request rate limits are atomic and bounded', async () => {
  const h = harness({ viewerLimit: 2 });
  const separateSession = '2d4a2346-0578-4b73-8a1c-c0f88ed6be9e';
  await record(h, playbackEvent('play_start'));
  await record(h, playbackEvent('play_start', { sessionId: separateSession }));
  await assert.rejects(
    record(h, playbackEvent('play_start', { sessionId: '68e12c08-a03e-48b2-8a72-b6c651f1f2ea' })),
    PlaybackRateLimitError,
  );
  const rateDocs = [...h.db.documents.entries()].filter(([path]) => path.startsWith('playbackRateLimits/'));
  assert.ok(rateDocs.every(([, value]) => !JSON.stringify(value).includes('192.0.2.10')));
});

test('optional authentication distinguishes anonymous, verified, malformed, and invalid tokens', async () => {
  const middleware = createOptionalTokenVerifier({
    async verifyIdToken(token) {
      if (token !== 'valid') throw new Error('invalid');
      return { uid: 'verified-account', admin: true };
    },
  });
  const run = async (authorization) => {
    const req = { headers: authorization ? { authorization } : {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    return { req, res, nextCalled };
  };
  assert.equal((await run()).nextCalled, true);
  assert.equal((await run('Bearer valid')).req.user.uid, 'verified-account');
  assert.equal((await run('invalid')).res.statusCode, 401);
  assert.equal((await run('Bearer invalid')).res.statusCode, 401);
});

test('HTTP route validates content type and payload, applies authentication, and returns authoritative counts', async (context) => {
  const h = harness();
  const app = express();
  app.use(express.json());
  app.use('/playback', createPlaybackRouter({
    service: h.service,
    authenticate: (req, res, next) => {
      req.user = req.headers.authorization === 'Bearer admin'
        ? { uid: 'admin-id', admin: true } : null;
      if (req.headers.authorization === 'Bearer invalid') return res.status(401).json({ error: 'Invalid token.' });
      return next();
    },
    clientAddress: () => 'test-client',
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise((resolve) => server.once('listening', resolve));
  const request = (body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/playback/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  const invalidAuth = await request(playbackEvent('play_start'), { Authorization: 'Bearer invalid' });
  assert.equal(invalidAuth.status, 401);
  const unsupportedType = await fetch(`http://127.0.0.1:${server.address().port}/playback/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(playbackEvent('play_start')),
  });
  assert.equal(unsupportedType.status, 415);
  const invalidBody = await request({ ...playbackEvent('play_start'), admin: true });
  assert.equal(invalidBody.status, 400);
  const startResponse = await request(playbackEvent('play_start'));
  assert.equal(startResponse.status, 201);
  assert.equal((await startResponse.json()).views, 12);
  const adminResponse = await request(playbackEvent('play_start'), { Authorization: 'Bearer admin' });
  assert.equal(adminResponse.status, 201);
  assert.deepEqual(await adminResponse.json(), { excluded: true, recorded: false, views: 12 });
});

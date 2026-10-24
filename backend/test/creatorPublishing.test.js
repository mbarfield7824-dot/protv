const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  CreatorPublishingService,
  validateCreatorActionRequest,
} = require('../src/integrations/creatorPublishingService');
const { transferMatches } = require('../src/integrations/creatorPromotional');
const { publicTitle } = require('../src/catalog/readModel');

function signedRequest(overrides = {}) {
  const payload = {
    requestId: '4d7132eb-2a9d-4de0-a455-05467113a97e:publishing',
    timestamp: Date.now(),
    action: 'publishing',
    project: {
      id: '4d7132eb-2a9d-4de0-a455-05467113a97e',
      title: 'Creator Film',
      ownership: { status: 'verified' },
      approval: { status: 'approved' },
      contract: { status: 'signed', signedAt: new Date().toISOString() },
    },
    ...overrides,
  };
  const rawBody = JSON.stringify(payload);
  return {
    payload,
    rawBody,
    signature: crypto.createHmac('sha256', 'publishing-secret').update(rawBody).digest('hex'),
  };
}

test('accepts an exact signed, approved Creator Agent request', () => {
  const request = signedRequest();
  assert.deepEqual(
    validateCreatorActionRequest(request.rawBody, request.signature, 'publishing-secret'),
    request.payload,
  );
});

test('rejects tampered and expired Creator Agent requests', () => {
  const request = signedRequest();
  assert.throws(
    () => validateCreatorActionRequest(`${request.rawBody} `, request.signature, 'publishing-secret'),
    /signature/i,
  );

  const expired = signedRequest({ timestamp: Date.now() - (6 * 60 * 1000) });
  assert.throws(
    () => validateCreatorActionRequest(expired.rawBody, expired.signature, 'publishing-secret'),
    /expired/i,
  );
});

test('rejects publishing without verified ownership, approval, or signature', () => {
  for (const project of [
    {
      id: '4d7132eb-2a9d-4de0-a455-05467113a97e',
      title: 'Creator Film',
      ownership: { status: 'pending' },
      approval: { status: 'approved' },
      contract: { status: 'signed', signedAt: new Date().toISOString() },
    },
    {
      id: '4d7132eb-2a9d-4de0-a455-05467113a97e',
      title: 'Creator Film',
      ownership: { status: 'verified' },
      approval: { status: 'rejected' },
      contract: { status: 'signed', signedAt: new Date().toISOString() },
    },
    {
      id: '4d7132eb-2a9d-4de0-a455-05467113a97e',
      title: 'Creator Film',
      ownership: { status: 'verified' },
      approval: { status: 'approved' },
      contract: { status: 'link_issued', signedAt: null },
    },
  ]) {
    const request = signedRequest({ project });
    assert.throws(
      () => validateCreatorActionRequest(request.rawBody, request.signature, 'publishing-secret'),
    );
  }
});

function publishingPayload() {
  return {
    requestId: '4d7132eb-2a9d-4de0-a455-05467113a97e:publishing',
    action: 'publishing',
    project: {
      id: '4d7132eb-2a9d-4de0-a455-05467113a97e',
      title: 'Creator Film',
      description: 'A creator-owned film.',
      creatorName: 'Creator',
      metadata: { synopsis: 'A film.', genre: 'Drama' },
      ownership: { status: 'verified', copyrightHolderName: 'Creator' },
      contract: {
        status: 'signed',
        signedAt: new Date().toISOString(),
        scheduleCode: 'A',
        reference: 'envelope-1',
      },
      media: {
        sourceUrl: 'https://creator.example/api/integrations/protv/media/project/asset',
      },
    },
  };
}

function dependencies(overrides = {}) {
  return {
    createCreatorVideo: async () => ({
      id: 'creator_4d7132eb-2a9d-4de0-a455-05467113a97e',
      created: true,
    }),
    getVideoByCreatorProjectId: async () => null,
    updateVideo: async () => true,
    createAssetFromUrl: async () => ({ id: 'mux-asset-1' }),
    getAsset: async () => ({ status: 'ready', duration: 120 }),
    getPlaybackId: () => 'playback-1',
    logAdminEvent: async () => ({}),
    ...overrides,
  };
}

test('publishing reserves one catalog ID and starts Mux from the allowlisted Creator Agent', async () => {
  const updates = [];
  let sourceUrl = '';
  const service = new CreatorPublishingService({
    creatorAgentOrigin: 'https://creator.example',
    dependencies: dependencies({
      createAssetFromUrl: async (url) => {
        sourceUrl = url;
        return { id: 'mux-asset-1' };
      },
      updateVideo: async (id, update) => updates.push({ id, update }),
    }),
  });

  const result = await service.execute(publishingPayload());
  assert.equal(result.status, 'processing');
  assert.equal(sourceUrl, publishingPayload().project.media.sourceUrl);
  assert.equal(updates[0].update.muxAssetId, 'mux-asset-1');
});

test('publishing retry returns the existing title without contacting Mux', async () => {
  let muxCalls = 0;
  const service = new CreatorPublishingService({
    creatorAgentOrigin: 'https://creator.example',
    dependencies: dependencies({
      getVideoByCreatorProjectId: async () => ({ id: 'catalog-1', status: 'processing' }),
      createAssetFromUrl: async () => {
        muxCalls += 1;
        return { id: 'unexpected' };
      },
    }),
  });

  const result = await service.execute(publishingPayload());
  assert.equal(result.externalId, 'catalog-1');
  assert.equal(muxCalls, 0);
});

test('distribution waits for Mux readiness and activates a ready title', async () => {
  const payload = publishingPayload();
  payload.action = 'distribution';
  payload.project.catalogId = 'catalog-1';
  const updates = [];
  const processingService = new CreatorPublishingService({
    dependencies: dependencies({
      getVideoByCreatorProjectId: async () => ({
        id: 'catalog-1',
        status: 'processing',
        muxAssetId: 'mux-asset-1',
      }),
      getAsset: async () => ({ status: 'preparing' }),
    }),
  });

  await assert.rejects(() => processingService.execute(payload), /still processing/);

  const readyService = new CreatorPublishingService({
    dependencies: dependencies({
      getVideoByCreatorProjectId: async () => ({
        id: 'catalog-1',
        status: 'processing',
        muxAssetId: 'mux-asset-1',
      }),
      updateVideo: async (id, update) => updates.push({ id, update }),
    }),
  });
  const result = await readyService.execute(payload);
  assert.equal(result.status, 'active');
  assert.equal(updates.at(-1).update.distributionStatus, 'active');
});

test('local poster retry storage exports token-checked updates without touching unrelated metadata', (context) => {
  const fs = require('node:fs');
  const storage = require('../src/storage');
  const file = require('path').resolve(__dirname, '../.data/videos.json');
  let records = {};
  const exists = fs.existsSync;
  const read = fs.readFileSync;
  context.mock.method(fs, 'existsSync', (name) => name === file ? true : exists(name));
  context.mock.method(fs, 'readFileSync', (name, ...args) => name === file ? JSON.stringify(records) : read(name, ...args));
  context.mock.method(fs, 'writeFileSync', (name, data) => {
    assert.equal(name, file);
    records = JSON.parse(data);
  });
  const id = storage.createCreatorVideo('local-project', {
    title: 'Original movie', credits: 'Original credits',
    status: 'poster_transfer_failed', posterTransferToken: 'old',
  }).id;
  const expected = { status: 'poster_transfer_failed', posterTransferToken: 'old' };
  assert.equal(storage.updateCreatorPosterTransfer(id, expected, {
    status: 'poster_transferring', posterTransferToken: 'new',
  }), true);
  assert.equal(storage.updateCreatorPosterTransfer(id, expected, { status: 'initializing' }), false);
  assert.equal(storage.getVideoById(id).title, 'Original movie');
  assert.equal(storage.getVideoById(id).credits, 'Original credits');
});

test.describe('movie promotional publishing', () => {
  function posterPayload() {
    const payload = publishingPayload();
    const assetId = 'poster-asset-1';
    const expires = String(Math.floor(Date.now() / 1000) + 300);
    const signature = crypto.createHmac('sha256', 'publishing-secret')
      .update(`${payload.project.id}:${assetId}:poster:${expires}`).digest('hex');
    payload.project.promotional = {
      credits: 'Director: Creator\nCast: First, Second',
      poster: {
        assetId, mimeType: 'image/png', bytes: 100,
        sourceUrl: `https://creator.example/api/integrations/protv/promotional/${payload.project.id}/${assetId}?expires=${expires}&signature=${signature}`,
      },
    };
    return payload;
  }

  function movieStore(overrides = {}) {
    let video = null;
    let muxCalls = 0;
    let transfers = 0;
    const events = [];
    const deps = dependencies({
      getVideoByCreatorProjectId: async () => video,
      createCreatorVideo: async (projectId, data) => {
        if (video) return { id: video.id, created: false };
        video = { id: `creator_${projectId}`, ...data };
        return { id: video.id, created: true };
      },
      updateCreatorPosterTransfer: async (id, expected, updates) => {
        if (!transferMatches(video, expected)) return false;
        video = { ...video, ...updates };
        return true;
      },
      updateVideo: async (id, updates) => { video = { ...video, ...updates }; },
      transferPoster: async () => {
        transfers += 1;
        events.push('poster');
        return 'https://catalog.example/posters/creator.png';
      },
      createAssetFromUrl: async (url) => {
        muxCalls += 1;
        events.push('mux');
        assert.equal(url, publishingPayload().project.media.sourceUrl);
        return { id: 'mux-1' };
      },
      ...overrides,
    });
    const service = new CreatorPublishingService({
      creatorAgentOrigin: 'https://creator.example', publishingSecret: 'publishing-secret', dependencies: deps,
    });
    return { service, events, video: () => video, muxCalls: () => muxCalls, transfers: () => transfers };
  }

  test('poster is durably persisted with credits before primary video Mux ingestion; retries are idempotent', async () => {
    const store = movieStore();
    const payload = posterPayload();
    const first = await store.service.execute(payload);
    assert.equal(first.status, 'processing');
    assert.deepEqual(store.events, ['poster', 'mux']);
    assert.equal(store.video().thumbnailUrl, store.video().posterUrl);
    assert.equal(store.video().credits, payload.project.promotional.credits);
    assert.equal(store.video().approvalStatus, 'approved');
    assert.equal(JSON.stringify(store.video()).includes('signature='), false);
    assert.equal(JSON.stringify(store.video()).includes('/api/integrations/protv/'), false);
    assert.equal(publicTitle({ ...store.video(), muxPlaybackId: 'public' }).credits, payload.project.promotional.credits);
    await store.service.execute(payload);
    assert.equal(store.transfers(), 1);
    assert.equal(store.muxCalls(), 1);
  });

  test('legacy missing and empty promotional fields preserve movie publishing without poster transfer', async () => {
    for (const promotional of [undefined, null, '', {}, { credits: '', poster: null }, { credits: '', poster: '' }]) {
      const store = movieStore();
      const payload = publishingPayload();
      payload.project.promotional = promotional;
      assert.equal((await store.service.execute(payload)).status, 'processing');
      assert.equal(store.video().credits, '');
      assert.equal(store.transfers(), 0);
      assert.equal(store.muxCalls(), 1);
    }
  });

  test('poster transfer failure keeps an unapproved retryable reservation and never starts Mux', async () => {
    let fail = true;
    const store = movieStore({ transferPoster: async () => {
      if (fail) throw new Error('private signed URL must not appear in public errors');
      return 'https://catalog.example/posters/creator.png';
    } });
    const payload = posterPayload();
    await assert.rejects(store.service.execute(payload), /Poster transfer failed before Mux/);
    const id = store.video().id;
    assert.equal(store.video().status, 'poster_transfer_failed');
    assert.equal(store.video().approvalStatus, 'draft');
    assert.equal(store.muxCalls(), 0);
    assert.equal(store.video().integrationError.includes('private signed'), false);
    const changed = posterPayload();
    changed.project.promotional.credits = 'Changed';
    await assert.rejects(store.service.execute(changed), /must match/);
    fail = false;
    await store.service.execute(posterPayload());
    assert.equal(store.video().id, id);
    assert.equal(store.video().approvalStatus, 'approved');
    assert.equal(store.muxCalls(), 1);
  });

  test('concurrent retries cannot steal a live transfer reservation', async () => {
    let release;
    const store = movieStore({ transferPoster: () => new Promise((resolve) => { release = resolve; }) });
    const pending = store.service.execute(posterPayload());
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(store.service.execute(posterPayload()), /in progress/);
    release('https://catalog.example/posters/creator.png');
    await pending;
    assert.equal(store.muxCalls(), 1);
  });

  test('expired transfer leases are safely reclaimed and stale workers cannot start Mux', async () => {
    const releases = [];
    const store = movieStore({
      transferPoster: () => new Promise((resolve) => releases.push(resolve)),
    });
    const first = store.service.execute(posterPayload());
    while (releases.length < 1) await new Promise((resolve) => setImmediate(resolve));
    store.video().posterTransferLeaseUntil = 0;
    const second = store.service.execute(posterPayload());
    while (releases.length < 2) await new Promise((resolve) => setImmediate(resolve));
    releases[0]('https://catalog.example/posters/stale.png');
    await assert.rejects(first, /reservation changed/);
    assert.equal(store.muxCalls(), 0);
    releases[1]('https://catalog.example/posters/current.png');
    await second;
    assert.equal(store.muxCalls(), 1);
    assert.equal(store.video().thumbnailUrl, 'https://catalog.example/posters/current.png');
  });

  test('uncertain Mux failure is not automatically retried after a safe poster transfer', async () => {
    let muxCalls = 0;
    const store = movieStore({
      createAssetFromUrl: async () => { muxCalls += 1; throw new Error('Uncertain Mux result'); },
    });
    await assert.rejects(store.service.execute(posterPayload()), /Uncertain Mux/);
    assert.equal(store.video().status, 'ingestion_failed');
    const retry = await store.service.execute(posterPayload());
    assert.equal(retry.status, 'ingestion_failed');
    assert.equal(muxCalls, 1);
    assert.equal(store.transfers(), 1);
  });

  test('invalid poster origin, identity, type and size never reserve a title or contact Mux', async () => {
    for (const change of [
      { sourceUrl: 'https://evil.example/poster.png' },
      { sourceUrl: 'https://creator.example/api/integrations/protv/promotional/wrong/asset' },
      { mimeType: 'image/svg+xml' }, { bytes: '100' }, { bytes: 0 }, { bytes: 10 * 1024 * 1024 + 1 },
    ]) {
      const payload = posterPayload();
      Object.assign(payload.project.promotional.poster, change);
      const store = movieStore();
      await assert.rejects(store.service.execute(payload));
      assert.equal(store.video(), null);
      assert.equal(store.muxCalls(), 0);
    }
  });

  test('request validation rejects malformed promotional structures but ignores them for other milestones', () => {
    for (const promotional of [[], 3, { credits: [] }, { credits: 'a'.repeat(5001) }, { poster: true }]) {
      const payload = publishingPayload();
      payload.project.approval = { status: 'approved' };
      payload.project.promotional = promotional;
      const request = signedRequest({ project: payload.project });
      assert.throws(() => validateCreatorActionRequest(request.rawBody, request.signature, 'publishing-secret'));
      const licensing = signedRequest({
        action: 'licensing', requestId: `${payload.project.id}:licensing`, project: payload.project,
      });
      assert.doesNotThrow(() => validateCreatorActionRequest(licensing.rawBody, licensing.signature, 'publishing-secret'));
    }
  });

test('Firestore poster retry updates are transactional and reject stale or approved reservations without fallback', async () => {
      const fs = require('node:fs');
      const vm = require('node:vm');
      const filename = require.resolve('../src/firebase');
      let video = {
        approvalStatus: 'draft', status: 'poster_transfer_failed', posterTransferToken: 'first',
      };
      let fail = false;
      const db = {
        collection: () => ({ doc: () => ({}) }),
        runTransaction: async (operation) => {
          if (fail) throw new Error('Synthetic Firestore unavailable.');
          return operation({
            get: async () => ({ data: () => video }),
            update: (reference, updates) => { video = { ...video, ...updates }; },
          });
        },
      };
      const adminModules = {
        'firebase-admin/app': {
          initializeApp() {},
          cert: () => ({}),
        },
        'firebase-admin/auth': { getAuth: () => ({}) },
        'firebase-admin/firestore': {
          getFirestore: () => db,
          FieldValue: require('firebase-admin/firestore').FieldValue,
        },
        'firebase-admin/storage': { getStorage: () => ({}) },
      };
      const module = { exports: {} };
      vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, process: { env: { FIREBASE_SERVICE_ACCOUNT_JSON: '{}' } },
        console: { log() {}, warn() {} },
        require: (name) => {
          if (Object.hasOwn(adminModules, name)) return adminModules[name];
          if (name === './storage') throw new Error('Unexpected local storage fallback.');
          return require(name.startsWith('.') ? `../src/${name.slice(2)}` : name);
        },
      }, { filename });
      const stale = { ...video };
      const updates = { status: 'poster_transferring', posterTransferToken: 'second' };
      assert.equal(await module.exports.updateCreatorPosterTransfer('movie', stale, updates), true);
      assert.equal(await module.exports.updateCreatorPosterTransfer('movie', stale, updates), false);
      const current = { ...video };
      video.approvalStatus = 'approved';
      assert.equal(await module.exports.updateCreatorPosterTransfer('movie', current, { status: 'initializing' }), false);
      fail = true;
      await assert.rejects(module.exports.updateCreatorPosterTransfer('movie', current, {}), /Firestore unavailable/);
  });
});

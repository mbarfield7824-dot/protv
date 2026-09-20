const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  CreatorPublishingService,
  validateCreatorActionRequest,
} = require('../src/integrations/creatorPublishingService');

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

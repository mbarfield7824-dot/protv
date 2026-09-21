const assert = require('node:assert/strict');
const test = require('node:test');
const {
  InternetArchiveService,
  explicitPublicDomainEvidence,
  parseRuntime,
  selectVideoFile,
} = require('../src/adminBot/internetArchiveService');
const { WebIngestionRunner, webStateKey } = require('../src/adminBot/webIngestionRunner');

function sourceItem() {
  return {
    identifier: 'example-film',
    source: 'Internet Archive',
    title: 'Example Film',
    year: 1940,
    contentKind: 'movie',
    sourceDescription: 'A source description.',
    creator: 'Example Creator',
    subjects: ['Classic'],
    runtime: 3600,
    mediaUrl: 'https://archive.org/download/example-film/example.mp4',
    posterUrl: 'https://archive.org/services/img/example-film',
    sourceUrl: 'https://archive.org/details/example-film',
    licenseEvidence: {
      eligible: true,
      label: 'Public Domain Mark',
      url: 'https://creativecommons.org/publicdomain/mark/1.0/',
    },
    sourceFile: {
      name: 'example.mp4',
      format: 'MPEG4',
      size: 1000,
      sha1: 'abc',
    },
  };
}

test('resolved Internet Archive items retain their source label', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      metadata: {
        title: 'Example Film',
        licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/',
      },
      files: [{ name: 'example.mp4', size: '1000', source: 'original' }],
    }),
  }));
  const item = await new InternetArchiveService().resolve('example-film', 'movie');
  assert.equal(item.source, 'Internet Archive');
});

test('accepts only explicit Public Domain or CC0 evidence', () => {
  assert.equal(explicitPublicDomainEvidence({
    licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/',
  }).eligible, true);
  assert.equal(explicitPublicDomainEvidence({
    licenseurl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  }).eligible, true);
  assert.equal(explicitPublicDomainEvidence({ rights: 'This work is in the public domain.' }).eligible, true);
  assert.equal(explicitPublicDomainEvidence({
    licenseurl: 'https://creativecommons.org/licenses/by/4.0/',
  }).eligible, false);
});

test('parses common Internet Archive runtime formats', () => {
  assert.equal(parseRuntime('01:02:03'), 3723);
  assert.equal(parseRuntime('12:30'), 750);
  assert.equal(parseRuntime('95.4'), 95);
  assert.equal(parseRuntime('unknown'), null);
});

test('selects an original supported video within the configured size limit', () => {
  const file = selectVideoFile([
    { name: 'derived.mp4', size: '900', source: 'derivative' },
    { name: 'original.mkv', size: '800', source: 'original' },
    { name: 'oversized.mp4', size: '5000', source: 'original' },
    { name: 'notes.txt', size: '10', source: 'original' },
  ], 1000);
  assert.equal(file.name, 'original.mkv');
});

test('web ingestion refuses to run without administrator confirmation', async () => {
  const runner = new WebIngestionRunner({
    archive: {},
    aiMetadataService: {},
    posterService: {},
    catalogService: {},
    stateStore: {},
    audit: async () => {},
  });
  await assert.rejects(
    runner.run({ identifier: 'example-film', contentKind: 'movie', confirmation: false, actorId: 'admin-1' }),
    /Administrator confirmation is required/
  );
});

test('confirmed web ingestion reaches Mux and publishing in order', async () => {
  const calls = [];
  const audits = [];
  const state = new Map();
  const stateStore = {
    get: async (key) => state.get(key) || null,
    set: async (key, value) => state.set(key, { ...(state.get(key) || {}), ...value }),
  };
  const runner = new WebIngestionRunner({
    archive: {
      resolve: async () => {
        calls.push('resolve');
        return sourceItem();
      },
    },
    aiMetadataService: {
      enrich: async () => {
        calls.push('metadata');
        return { description: 'Prepared description.', tags: ['classic'], categories: ['Drama'] };
      },
    },
    posterService: {
      storeRemoteImage: async () => {
        calls.push('poster');
        return '/posters/example.jpg';
      },
    },
    catalogService: {
      createDraft: async () => {
        calls.push('draft');
        return { id: 'catalog-web-1', status: 'processing' };
      },
      ensureTranscoded: async () => {
        calls.push('mux');
        return { id: 'catalog-web-1', status: 'ready', muxPlaybackId: 'playback-web-1' };
      },
      publish: async (video) => {
        calls.push('publish');
        return video;
      },
    },
    stateStore,
    audit: async (event) => audits.push(event),
  });

  const report = await runner.run({
    identifier: 'example-film',
    contentKind: 'movie',
    confirmation: true,
    actorId: 'admin-1',
  });

  assert.deepEqual(calls, ['resolve', 'metadata', 'poster', 'draft', 'mux', 'publish']);
  assert.equal(report.addedMovies.length, 1);
  assert.equal(state.get(webStateKey('example-film')).status, 'published');
  assert.deepEqual(audits.map((event) => event.type), ['pd.web-confirmed', 'pd.web-ingested']);
});

test('serverless web ingestion persists a Mux handoff without waiting in memory', async () => {
  const decisions = [];
  const state = new Map();
  const runner = new WebIngestionRunner({
    archive: { resolve: async () => sourceItem() },
    aiMetadataService: {
      enrich: async () => ({
        description: 'Prepared description.',
        tags: ['classic'],
        categories: ['Drama'],
      }),
    },
    posterService: { storeRemoteImage: async () => 'https://archive.org/poster.jpg' },
    catalogService: {
      createDraft: async ({ item }) => {
        assert.equal(item.candidateId, 'internet-archive:example-film');
        return { id: 'catalog-web-1', status: 'processing' };
      },
      ensureTranscoded: async () => ({ id: 'catalog-web-1', status: 'processing' }),
      publish: async () => {
        throw new Error('Publishing must wait for Mux readiness.');
      },
    },
    stateStore: {
      get: async (key) => state.get(key) || null,
      set: async (key, value) => {
        const next = { ...(state.get(key) || {}), ...value };
        state.set(key, next);
        return next;
      },
    },
    candidateStore: {
      setDecision: async (id, decision, details) => decisions.push({ id, decision, details }),
    },
    audit: async () => {},
  });

  const report = await runner.run({
    source: 'internet-archive',
    identifier: 'example-film',
    contentKind: 'movie',
    candidateId: 'internet-archive:example-film',
    confirmation: true,
    actorId: 'admin-1',
  });

  assert.equal(report.status, 'processing');
  assert.match(report.message, /sent to Mux/);
  assert.equal(state.get(webStateKey('internet-archive', 'example-film')).catalogId, 'catalog-web-1');
  assert.deepEqual(decisions.at(-1), {
    id: 'internet-archive:example-film',
    decision: 'processing',
    details: {
      catalogId: 'catalog-web-1',
      progressPercent: 70,
      stage: 'Mux is preparing playback',
    },
  });
});

test('status reconciliation publishes a Mux asset when its webhook was missed', async () => {
  const decisions = [];
  const state = new Map();
  const audits = [];
  const runner = new WebIngestionRunner({
    sources: {},
    aiMetadataService: {},
    posterService: {},
    catalogService: {
      refreshTranscode: async (catalogId) => ({
        id: catalogId,
        status: 'ready',
        muxPlaybackId: 'playback-web-1',
      }),
      publish: async (video, actorId) => {
        assert.equal(actorId, 'admin-1');
        return video;
      },
    },
    stateStore: {
      set: async (key, value) => state.set(key, value),
    },
    candidateStore: {
      setDecision: async (id, decision, details) => {
        const updated = { id, decision, ...details };
        decisions.push(updated);
        return updated;
      },
    },
    audit: async (event) => audits.push(event),
  });
  const candidate = {
    id: 'wikimedia:woman-on-the-run',
    source: 'wikimedia',
    externalId: 'woman-on-the-run',
    title: 'Woman On The Run 1950',
    decision: 'processing',
    catalogId: 'catalog-web-1',
    processingBy: 'admin-1',
  };

  const result = await runner.reconcile(candidate);

  assert.equal(result.decision, 'approved');
  assert.equal(result.progressPercent, 100);
  assert.equal(state.get(webStateKey('wikimedia', 'woman-on-the-run')).status, 'published');
  assert.equal(decisions.at(-1).stage, 'Published');
  assert.equal(audits.at(-1).details.recoveredBy, 'status-reconciliation');
});

test('status reconciliation exposes a Mux transcode failure for retry', async () => {
  const decisions = [];
  const runner = new WebIngestionRunner({
    sources: {},
    aiMetadataService: {},
    posterService: {},
    catalogService: {
      refreshTranscode: async (catalogId) => ({ id: catalogId, status: 'errored' }),
    },
    stateStore: {},
    candidateStore: {
      setDecision: async (id, decision, details) => {
        const updated = { id, decision, ...details };
        decisions.push(updated);
        return updated;
      },
    },
    audit: async () => {},
  });

  const result = await runner.reconcile({
    id: 'wikimedia:failed',
    source: 'wikimedia',
    externalId: 'failed',
    title: 'Failed Film',
    decision: 'processing',
    catalogId: 'catalog-failed',
  });

  assert.equal(result.decision, 'failed');
  assert.equal(result.progressPercent, 100);
  assert.match(result.lastError, /retry/i);
  assert.equal(decisions.length, 1);
});

test('catalog reconciliation retrieves the Mux asset and records ready playback', async (context) => {
  const mux = require('../src/mux');
  const firebase = require('../src/firebase');
  const updates = [];
  context.mock.method(firebase, 'getVideoById', async () => ({
    id: 'catalog-web-1',
    status: 'processing',
    muxAssetId: 'mux-asset-1',
    duration: 0,
  }));
  context.mock.method(firebase, 'updateVideo', async (id, update) => updates.push({ id, update }));
  context.mock.method(mux, 'getAsset', async (id) => ({
    id,
    status: 'ready',
    duration: 3600,
    playback_ids: [{ policy: 'public', id: 'playback-web-1' }],
  }));
  const modulePath = require.resolve('../src/adminBot/webCatalogService');
  delete require.cache[modulePath];
  const { WebCatalogService } = require(modulePath);

  const result = await new WebCatalogService({ transcodeTimeoutMs: 1000 })
    .refreshTranscode('catalog-web-1');

  assert.equal(result.status, 'ready');
  assert.equal(result.muxPlaybackId, 'playback-web-1');
  assert.deepEqual(updates, [{
    id: 'catalog-web-1',
    update: {
      muxAssetId: 'mux-asset-1',
      muxPlaybackId: 'playback-web-1',
      duration: 3600,
      status: 'ready',
    },
  }]);
});

test('retrying an errored catalog title creates a fresh Mux asset', async (context) => {
  const mux = require('../src/mux');
  const firebase = require('../src/firebase');
  const updates = [];
  context.mock.method(mux, 'createAssetFromUrl', async (mediaUrl) => {
    assert.equal(mediaUrl, 'https://commons.example/woman-on-the-run.webm');
    return { id: 'mux-asset-retry' };
  });
  context.mock.method(firebase, 'updateVideo', async (id, update) => updates.push({ id, update }));
  context.mock.method(firebase, 'getVideoById', async () => ({
    id: 'catalog-woman',
    status: 'processing',
    muxAssetId: 'mux-asset-retry',
  }));
  const modulePath = require.resolve('../src/adminBot/webCatalogService');
  delete require.cache[modulePath];
  const { WebCatalogService } = require(modulePath);

  const result = await new WebCatalogService({
    transcodeTimeoutMs: 1000,
    deferUntilWebhook: true,
  }).ensureTranscoded({
    id: 'catalog-woman',
    status: 'errored',
    muxAssetId: 'mux-asset-failed',
    muxPlaybackId: null,
  }, 'https://commons.example/woman-on-the-run.webm');

  assert.equal(result.muxAssetId, 'mux-asset-retry');
  assert.deepEqual(updates, [{
    id: 'catalog-woman',
    update: {
      muxAssetId: 'mux-asset-retry',
      muxPlaybackId: null,
      status: 'processing',
    },
  }]);
});

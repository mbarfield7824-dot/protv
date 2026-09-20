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

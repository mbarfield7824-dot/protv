const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { AdminBotRunner } = require('../src/adminBot/adminBotRunner');
const { discoverFiles, listVideoFiles } = require('../src/adminBot/fileDiscovery');
const { metadataFromFileName } = require('../src/adminBot/metadataExtractor');
const { PosterService, isPublicDomainLicense, wrapTitleLines } = require('../src/adminBot/posterService');
const { FirestoreIngestionStateStore, IngestionStateStore } = require('../src/adminBot/stateStore');

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protv-admin-bot-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('metadataFromFileName removes separators and extracts the year', () => {
  assert.deepEqual(metadataFromFileName('night_of_the_living_dead_(1968).mp4'), {
    title: 'Night Of The Living Dead',
    year: 1968,
  });
  assert.deepEqual(metadataFromFileName('A-Trip-To-The-Moon.mov'), {
    title: 'A Trip To The Moon',
    year: null,
  });
});

test('listVideoFiles finds supported videos recursively and ignores other files', async (t) => {
  const directory = await temporaryDirectory(t);
  await fs.mkdir(path.join(directory, 'classics'));
  await Promise.all([
    fs.writeFile(path.join(directory, 'one.MP4'), 'one'),
    fs.writeFile(path.join(directory, 'classics', 'two.mkv'), 'two'),
    fs.writeFile(path.join(directory, 'notes.txt'), 'ignore'),
  ]);

  const files = await listVideoFiles(directory);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map((file) => path.extname(file).toLowerCase()).sort(), ['.mkv', '.mp4']);
});

test('discoverFiles skips published hashes but retries failed hashes', async (t) => {
  const directory = await temporaryDirectory(t);
  const stateStore = new IngestionStateStore(path.join(directory, 'state.json'));
  const publishedPath = path.join(directory, 'published.mp4');
  const failedPath = path.join(directory, 'failed.mov');
  await fs.writeFile(publishedPath, 'published content');
  await fs.writeFile(failedPath, 'failed content');

  const first = await discoverFiles({ directory, stateStore });
  const publishedItem = first.newItems.find((item) => item.fileName === 'published.mp4');
  const failedItem = first.newItems.find((item) => item.fileName === 'failed.mov');
  await stateStore.set(publishedItem.hash, { status: 'published', title: 'Published' });
  await stateStore.set(failedItem.hash, { status: 'failed', title: 'Retry Me' });

  const second = await discoverFiles({ directory, stateStore });
  assert.deepEqual(second.skipped.map((item) => item.fileName), ['published.mp4']);
  assert.deepEqual(second.newItems.map((item) => item.fileName), ['failed.mov']);
});

test('Firestore ingestion state merges durable processing stages', async () => {
  let saved = null;
  const ref = {
    get: async () => ({ exists: Boolean(saved), data: () => saved }),
  };
  const db = {
    collection: () => ({ doc: () => ref }),
    async runTransaction(operation) {
      let pending;
      const result = await operation({
        get: (target) => target.get(),
        set: (_target, value) => { pending = value; },
      });
      saved = pending;
      return result;
    },
  };
  const store = new FirestoreIngestionStateStore(db);

  await store.set('item-1', { status: 'processing', catalogId: 'catalog-1' });
  await store.set('item-1', { stage: 'Mux is preparing playback' });

  assert.equal((await store.get('item-1')).status, 'processing');
  assert.equal((await store.get('item-1')).catalogId, 'catalog-1');
  assert.equal((await store.get('item-1')).stage, 'Mux is preparing playback');
});

test('poster license screening accepts public-domain markers only', () => {
  assert.equal(isPublicDomainLicense({ LicenseShortName: { value: 'Public domain' } }), true);
  assert.equal(isPublicDomainLicense({ UsageTerms: { value: 'CC0 1.0' } }), true);
  assert.equal(isPublicDomainLicense({ LicenseShortName: { value: 'CC BY-SA 4.0' } }), false);
});

test('fallback poster titles wrap into readable lines', () => {
  assert.deepEqual(
    wrapTitleLines('All public domain Looney Tunes and Merrie Melodies shorts'),
    ['All public domain', 'Looney Tunes and', 'Merrie Melodies', 'shorts']
  );
});

test('serverless poster validation keeps the durable source URL', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    headers: new Headers({ 'content-type': 'image/jpeg' }),
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }));
  const service = new PosterService({
    storageDirectory: 'Z:\\read-only',
    publicBaseUrl: 'https://watchprotv.com',
    durableFileStorage: false,
  });

  assert.equal(
    await service.storeRemoteImage('https://archive.org/poster.jpg', 'Example Film', 'Internet Archive'),
    'https://archive.org/poster.jpg'
  );
});

test('runner publishes a complete movie and records success', async () => {
  const state = new Map();
  const audits = [];
  const published = [];
  const stateStore = {
    get: async (hash) => state.get(hash) || null,
    set: async (hash, value) => {
      const next = { ...(state.get(hash) || {}), ...value };
      state.set(hash, next);
      return next;
    },
  };
  const runner = new AdminBotRunner({
    discover: async () => ({
      newItems: [{ hash: 'hash-1', fileName: 'movie.mp4', filePath: 'C:\\movies\\movie.mp4' }],
      skipped: [],
    }),
    metadataExtractor: {
      extract: async () => ({
        title: 'Movie',
        year: 1940,
        runtime: 3600,
        description: 'A complete description.',
        tags: ['classic'],
        categories: ['Movies'],
      }),
    },
    posterService: {
      create: async () => ({ posterUrl: '/posters/movie.jpg', source: 'test', warnings: [] }),
    },
    catalogService: {
      createDraft: async () => ({ id: 'catalog-1', status: 'draft' }),
      ensureTranscoded: async (draft) => ({ ...draft, playbackId: 'playback-1' }),
      publish: async (draft) => {
        published.push(draft.id);
        return { ...draft, approvalStatus: 'approved' };
      },
    },
    stateStore,
    audit: async (event) => audits.push(event),
  });

  const report = await runner.run({ directory: 'C:\\movies', actorId: 'admin-1' });
  assert.equal(report.status, 'completed');
  assert.deepEqual(published, ['catalog-1']);
  assert.equal(report.addedMovies.length, 1);
  assert.equal(state.get('hash-1').status, 'published');
  assert.equal(audits[0].type, 'pd.ingested');
});

test('runner never creates or publishes a catalog entry when poster creation fails', async () => {
  const calls = [];
  const audits = [];
  const stateStore = {
    value: null,
    async get() { return this.value; },
    async set(_hash, value) {
      this.value = { ...(this.value || {}), ...value };
      return this.value;
    },
  };
  const runner = new AdminBotRunner({
    discover: async () => ({
      newItems: [{ hash: 'hash-2', fileName: 'broken.mov', filePath: 'C:\\movies\\broken.mov' }],
      skipped: [],
    }),
    metadataExtractor: {
      extract: async () => ({
        title: 'Broken',
        runtime: 100,
        description: 'Description',
        tags: [],
        categories: ['Movies'],
      }),
    },
    posterService: { create: async () => { throw new Error('Poster storage unavailable.'); } },
    catalogService: {
      createDraft: async () => calls.push('draft'),
      ensureTranscoded: async () => calls.push('transcode'),
      publish: async () => calls.push('publish'),
    },
    stateStore,
    audit: async (event) => audits.push(event),
  });

  const report = await runner.run({ directory: 'C:\\movies', actorId: 'admin-1' });
  assert.deepEqual(calls, []);
  assert.equal(report.status, 'completed-with-errors');
  assert.equal(report.failures[0].message, 'Poster storage unavailable.');
  assert.equal(stateStore.value.status, 'failed');
  assert.equal(audits[0].type, 'pd.error');
});

test('safe test prepares metadata without creating or publishing a catalog entry', async () => {
  const calls = [];
  const audits = [];
  const runner = new AdminBotRunner({
    discover: async () => ({
      newItems: [{ hash: 'hash-3', fileName: 'preview.mp4', filePath: 'C:\\movies\\preview.mp4' }],
      skipped: [],
    }),
    metadataExtractor: {
      extract: async () => ({
        title: 'Preview',
        runtime: 120,
        description: 'Description',
        tags: ['preview'],
        categories: ['Drama'],
      }),
    },
    posterService: {
      create: async () => ({
        posterUrl: '/posters/preview.svg',
        source: 'test',
        warnings: [],
      }),
    },
    catalogService: {
      createDraft: async () => calls.push('draft'),
      ensureTranscoded: async () => calls.push('transcode'),
      publish: async () => calls.push('publish'),
    },
    stateStore: {
      get: async () => null,
      set: async () => calls.push('state'),
    },
    audit: async (event) => audits.push(event),
  });

  const report = await runner.run({
    directory: 'C:\\movies',
    actorId: 'admin-1',
    dryRun: true,
  });
  assert.deepEqual(calls, []);
  assert.equal(report.previewMovies.length, 1);
  assert.equal(report.addedMovies.length, 0);
  assert.equal(audits[0].type, 'pd.dry-run');
});

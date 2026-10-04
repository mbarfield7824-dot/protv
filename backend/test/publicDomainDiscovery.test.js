const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CandidateStore,
  FirestoreCandidateStore,
  deduplicateCandidates,
} = require('../src/adminBot/candidateStore');
const {
  activeReviewCandidates,
  filterExistingCatalogCandidates,
} = require('../src/adminBot/catalogDeduplication');
const { InternetArchiveService } = require('../src/adminBot/internetArchiveService');
const { PublicDomainDiscoveryRunner } = require('../src/adminBot/discoveryRunner');
const { DailyDiscoveryScheduler } = require('../src/adminBot/discoveryScheduler');
const {
  cleanDescription,
  parseRss,
  PublicDomainMovieDiscoveryService,
} = require('../src/adminBot/publicDomainMovieDiscoveryService');
const {
  candidateFromPage,
  metadataYear,
  preferredVideoUrl,
  WikimediaVideoService,
} = require('../src/adminBot/wikimediaVideoService');
const { YouTubeDiscoveryService } = require('../src/adminBot/youtubeDiscoveryService');

function candidate(overrides = {}) {
  return {
    id: 'internet-archive:item-1',
    source: 'internet-archive',
    sourceLabel: 'Internet Archive',
    externalId: 'item-1',
    title: 'Example Film',
    contentKind: 'movie',
    ingestionAvailable: true,
    ...overrides,
  };
}

function publicCatalogVideo(overrides = {}) {
  return {
    id: 'catalog-1',
    title: 'Existing Feature',
    year: 1940,
    contentType: 'MOVIE',
    approvalStatus: 'approved',
    status: 'ready',
    muxPlaybackId: 'playback-1',
    ...overrides,
  };
}

function memoryPaginationStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key) {
      return values.get(key) || null;
    },
    async set(key, update) {
      values.set(key, { ...(values.get(key) || {}), ...update });
      return values.get(key);
    },
  };
}

function fakeFirestore() {
  const records = new Map();
  const metrics = { collectionScans: 0, documentReads: 0 };
  function ref(collection, id) {
    const key = `${collection}/${id}`;
    return {
      key,
      async get() {
        metrics.documentReads += 1;
        return {
          exists: records.has(key),
          data: () => records.get(key),
        };
      },
      async set(value, options) {
        write(this, value, options);
      },
    };
  }
  function write(target, value, options) {
    records.set(target.key, options?.merge
      ? { ...(records.get(target.key) || {}), ...value }
      : value);
  }
  return {
    metrics,
    collection(name) {
      return {
        doc: (id) => ref(name, id),
        async get() {
          metrics.collectionScans += 1;
          return {
            docs: [...records.entries()]
              .filter(([key]) => key.startsWith(`${name}/`))
              .map(([, value]) => ({ data: () => value })),
          };
        },
      };
    },
    batch() {
      const writes = [];
      return {
        set: (...args) => writes.push(args),
        async commit() {
          writes.forEach((args) => write(...args));
        },
      };
    },
    async runTransaction(operation) {
      const writes = [];
      const result = await operation({
        get: (target) => target.get(),
        set: (...args) => writes.push(args),
      });
      writes.forEach((args) => write(...args));
      return result;
    },
  };
}

test('candidate decisions survive later discovery runs', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protv-candidates-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new CandidateStore(path.join(directory, 'candidates.json'));

  await store.upsert([candidate()]);
  await store.setDecision('internet-archive:item-1', 'rejected', { rejectedBy: 'admin-1' });
  await store.upsert([candidate({ title: 'Updated Example Film' })]);

  const saved = await store.get('internet-archive:item-1');
  assert.equal(saved.title, 'Updated Example Film');
  assert.equal(saved.decision, 'rejected');
  assert.equal(saved.rejectedBy, 'admin-1');
});

test('Firestore candidate decisions persist across discovery runs', async () => {
  const db = fakeFirestore();
  const store = new FirestoreCandidateStore(db);
  await store.upsert([candidate()]);
  await store.setDecision('internet-archive:item-1', 'rejected', { rejectedBy: 'admin-1' });
  await store.upsert([candidate({ title: 'Updated Example Film', optionalValue: undefined })]);

  const saved = await store.get('internet-archive:item-1');
  const status = await store.status();
  assert.equal(saved.title, 'Updated Example Film');
  assert.equal(saved.decision, 'rejected');
  assert.equal(saved.rejectedBy, 'admin-1');
  assert.equal('optionalValue' in saved, false);
  assert.equal(status.rejected, 1);
  assert.ok(status.lastDiscoveryAt);
  assert.equal(db.metrics.collectionScans, 1);
});

test('candidate lists group duplicate titles and prefer ingestible sources', () => {
  const items = deduplicateCandidates([
    candidate({
      id: 'youtube:one',
      source: 'youtube',
      sourceLabel: 'YouTube Creative Commons',
      title: 'Example Film (1940) - Full Movie HD',
      ingestionAvailable: false,
    }),
    candidate({
      id: 'internet-archive:item-1',
      source: 'internet-archive',
      sourceLabel: 'Internet Archive',
      title: 'Example Film 1940',
      ingestionAvailable: true,
    }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'internet-archive');
  assert.deepEqual(items[0].alternateSources, ['YouTube Creative Commons']);
});

test('candidate grouping does not merge the same title from different known years', () => {
  const items = deduplicateCandidates([
    candidate({ id: 'source:1940', title: 'Same Title', year: 1940 }),
    candidate({ id: 'source:1952', title: 'Same Title', year: 1952 }),
  ]);
  assert.equal(items.length, 2);
});

test('catalog deduplication excludes an exact source and source ID match', () => {
  const result = filterExistingCatalogCandidates(
    [candidate({ title: 'Different Source Title', year: null })],
    [publicCatalogVideo({
      title: 'Existing Feature',
      publicDomainSource: 'Internet Archive',
      publicDomainSourceId: 'item-1',
    })]
  );
  assert.equal(result.items.length, 0);
  assert.deepEqual(result.excluded, { sourceId: 1, sourceUrl: 0, titleYear: 0, total: 1 });
});

test('catalog deduplication excludes a normalized exact source URL', () => {
  const result = filterExistingCatalogCandidates(
    [candidate({
      externalId: 'other-id',
      sourceUrl: 'https://www.archive.org/details/existing-feature/?utm_source=feed#media',
    })],
    [publicCatalogVideo({
      publicDomainSourceUrl: 'https://archive.org/details/existing-feature',
    })]
  );
  assert.equal(result.items.length, 0);
  assert.equal(result.excluded.sourceUrl, 1);
});

test('catalog source URL matching preserves meaningful query identity', () => {
  const result = filterExistingCatalogCandidates(
    [candidate({
      source: 'youtube',
      sourceLabel: 'YouTube Creative Commons',
      externalId: 'video-2',
      sourceUrl: 'https://youtube.com/watch?v=video-2',
      title: 'Same Title',
      year: null,
    })],
    [publicCatalogVideo({
      title: 'Same Title',
      year: null,
      publicDomainSource: 'YouTube Creative Commons',
      publicDomainSourceId: 'video-1',
      publicDomainSourceUrl: 'https://www.youtube.com/watch?v=video-1',
    })]
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.excluded.total, 0);
});

test('catalog deduplication excludes exact normalized title and matching year', () => {
  const result = filterExistingCatalogCandidates(
    [candidate({ title: 'Example Film (1940)', year: 1940 })],
    [publicCatalogVideo({ title: 'Example Film', year: 1940 })]
  );
  assert.equal(result.items.length, 0);
  assert.equal(result.excluded.titleYear, 1);
});

test('catalog title matching keeps the same title from a different year', () => {
  const result = filterExistingCatalogCandidates(
    [candidate({ title: 'Same Title', year: 1940 })],
    [publicCatalogVideo({ title: 'Same Title', year: 1952 })]
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.excluded.total, 0);
});

test('catalog title matching does not exclude candidates with a missing year', () => {
  const result = filterExistingCatalogCandidates(
    [candidate({ title: 'Same Title', year: null })],
    [publicCatalogVideo({ title: 'Same Title', year: 1940 })]
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.excluded.total, 0);
});

test('catalog identity and title matches ignore non-public catalog records', () => {
  const result = filterExistingCatalogCandidates(
    [candidate({ title: 'Existing Feature', year: 1940 })],
    [publicCatalogVideo({ status: 'errored' })]
  );
  assert.equal(result.items.length, 1);
});

test('active review excludes rejected and already ingested candidates without deleting history', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protv-review-filter-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new CandidateStore(path.join(directory, 'candidates.json'));
  await store.upsert([
    candidate(),
    candidate({ id: 'internet-archive:ingested', externalId: 'ingested', title: 'Ingested Feature' }),
  ]);
  await store.setDecision('internet-archive:item-1', 'rejected', { rejectedBy: 'admin-1' });
  await store.setDecision('internet-archive:ingested', 'approved', { catalogId: 'catalog-2' });

  const active = activeReviewCandidates(await store.all(), []);
  assert.equal(active.items.length, 0);
  assert.equal((await store.all()).length, 2);
  assert.equal((await store.get('internet-archive:item-1')).decision, 'rejected');
  assert.equal((await store.get('internet-archive:ingested')).decision, 'approved');
});

test('Internet Archive discovery advances through result pages and wraps at the end', async () => {
  const paginationStore = memoryPaginationStore();
  const service = new InternetArchiveService({ paginationStore });
  const requestedPages = [];
  service.search = async ({ query, contentKind, page }) => {
    requestedPages.push({ query, contentKind, page });
    return {
      total: 40,
      page,
      items: [{
        identifier: `${query.replace(/\W+/g, '-')}-${page}`,
        title: `${query} ${page}`,
        year: 1940,
        contentKind,
        licenseEvidence: { eligible: true },
      }],
    };
  };

  await service.discover();
  await service.discover();
  await service.discover();
  assert.deepEqual(requestedPages.slice(0, 4).map((request) => request.page), [1, 1, 1, 1]);
  assert.deepEqual(requestedPages.slice(4, 8).map((request) => request.page), [2, 2, 2, 2]);
  assert.deepEqual(requestedPages.slice(8, 12).map((request) => request.page), [1, 1, 1, 1]);
});

test('Wikimedia continuation advances and safely resets when no continuation remains', async () => {
  const paginationStore = memoryPaginationStore();
  const service = new WikimediaVideoService({ paginationStore });
  const requests = [];
  service.request = async (params) => {
    requests.push({ ...params });
    return requests.length === 1
      ? { continue: { gsroffset: 30, continue: 'gsroffset||' }, query: { pages: {} } }
      : { query: { pages: {} } };
  };

  await service.discover();
  await service.discover();
  await service.discover();
  assert.equal(requests[0].gsroffset, undefined);
  assert.equal(requests[1].gsroffset, '30');
  assert.equal(requests[2].gsroffset, undefined);
  assert.equal((await paginationStore.get('wikimedia:discovery')).continuation, null);
});

test('YouTube discovery advances each query using its bounded page token', async (context) => {
  const paginationStore = memoryPaginationStore();
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(new URL(url));
    return {
      ok: true,
      json: async () => ({ items: [], nextPageToken: 'next-page-token' }),
    };
  });
  const service = new YouTubeDiscoveryService({ apiKey: 'test-key', paginationStore });

  await service.discover();
  await service.discover();
  assert.equal(requests.length, 4);
  assert.equal(requests[0].searchParams.has('pageToken'), false);
  assert.equal(requests[2].searchParams.get('pageToken'), 'next-page-token');
  assert.equal(requests[3].searchParams.get('pageToken'), 'next-page-token');
});

test('YouTube discovery safely resets each query when no next-page token remains', async (context) => {
  const paginationStore = memoryPaginationStore();
  const requests = [];
  let responseCount = 0;
  context.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(new URL(url));
    responseCount += 1;
    return {
      ok: true,
      json: async () => (responseCount <= 2
        ? { items: [], nextPageToken: 'next-page-token' }
        : { items: [] }),
    };
  });
  const service = new YouTubeDiscoveryService({ apiKey: 'test-key', paginationStore });

  await service.discover();
  await service.discover();
  await service.discover();
  assert.deepEqual(requests.map((request) => request.searchParams.has('pageToken')), [
    false, false, true, true, false, false,
  ]);
});

test('PublicDomainMovie RSS discovery rotates bounded windows without changing reference-only status', async (context) => {
  const paginationStore = memoryPaginationStore();
  const rss = `<rss><channel>${Array.from({ length: 25 }, (_, index) => `
    <item><title>Film ${index}</title><link>https://publicdomainmovie.net/movie/film-${index}</link></item>
  `).join('')}</channel></rss>`;
  context.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    text: async () => rss,
  }));
  const service = new PublicDomainMovieDiscoveryService({ paginationStore });

  const first = await service.discover();
  const second = await service.discover();
  const third = await service.discover();
  assert.equal(first.items[0].externalId, 'film-0');
  assert.equal(second.items[0].externalId, 'film-10');
  assert.equal(third.items[0].externalId, 'film-20');
  assert.equal(first.items[0].ingestionAvailable, false);
  assert.equal((await service.discover()).items[0].externalId, 'film-0');
});

test('PublicDomainMovie RSS rotates within a ten-item feed instead of repeating it', async (context) => {
  const paginationStore = memoryPaginationStore();
  const rss = `<rss><channel>${Array.from({ length: 10 }, (_, index) => `
    <item><title>Film ${index}</title><link>https://publicdomainmovie.net/movie/film-${index}</link></item>
  `).join('')}</channel></rss>`;
  context.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    text: async () => rss,
  }));
  const service = new PublicDomainMovieDiscoveryService({ paginationStore });

  const first = await service.discover();
  const second = await service.discover();
  assert.equal(first.items.length, 5);
  assert.equal(second.items.length, 5);
  assert.equal(first.items[0].externalId, 'film-0');
  assert.equal(second.items[0].externalId, 'film-5');
});

test('manual Internet Archive search honors later pages and wraps an exhausted page safely', async (context) => {
  const pages = [];
  let total = 60;
  context.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    pages.push(parsed.searchParams.get('page'));
    return {
      ok: true,
      json: async () => ({
        response: {
          numFound: total,
          docs: [{
            identifier: `page-${parsed.searchParams.get('page')}`,
            title: 'Page result',
          }],
        },
      }),
    };
  });
  const service = new InternetArchiveService();
  const secondPage = await service.search({ query: 'example film', page: 2 });
  assert.equal(secondPage.page, 2);
  assert.deepEqual(pages, ['2']);
  pages.length = 0;
  total = 20;
  const wrapped = await service.search({ query: 'example film', page: 2 });
  assert.equal(wrapped.page, 1);
  assert.deepEqual(pages, ['2', '1']);
  pages.length = 0;
  const pageOne = await service.search({ query: 'example film', page: 1 });
  assert.equal(pageOne.page, 1);
  assert.deepEqual(pages, ['1']);
});

test('discovery continues when one source fails', async () => {
  let saved = [];
  const runner = new PublicDomainDiscoveryRunner({
    providers: [
      { name: 'Unavailable', discover: async () => { throw new Error('Source is down.'); } },
      { name: 'Working', discover: async () => ({ items: [candidate()] }) },
    ],
    candidateStore: {
      all: async () => [],
      upsert: async (items) => { saved = items; },
      status: async () => ({ pending: saved.length }),
    },
    audit: async () => {},
  });

  const report = await runner.run({ actorId: 'admin-1' });
  assert.equal(saved.length, 1);
  assert.equal(report.status, 'completed-with-errors');
  assert.equal(report.failures[0].title, 'Unavailable');
});

test('discovery excludes previously rejected candidates without removing history', async () => {
  let saved = [];
  const runner = new PublicDomainDiscoveryRunner({
    providers: [{ name: 'Archive', discover: async () => ({ items: [candidate()] }) }],
    candidateStore: {
      all: async () => [{ ...candidate(), decision: 'rejected' }],
      upsert: async (items) => { saved = items; },
      status: async () => ({ pending: 0 }),
    },
    audit: async () => {},
  });

  const report = await runner.run({});
  assert.deepEqual(saved, []);
  assert.equal(report.candidatesFound, 0);
  assert.equal(report.handledExcluded, 1);
});

test('PublicDomainMovie RSS entries remain reference only', () => {
  const result = parseRss(`
    <rss><channel><item>
      <title><![CDATA[Example Movie]]></title>
      <link>https://publicdomainmovie.net/movie/example-movie</link>
      <description><![CDATA[<p>A classic movie.</p>]]></description>
    </item></channel></rss>
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Example Movie');
  assert.equal(result[0].ingestionAvailable, false);
  assert.match(result[0].description, /classic movie/);
});

test('PublicDomainMovie descriptions discard embedded player scripts', () => {
  assert.equal(
    cleanDescription(`
      <p>&nbsp;</p>
      <script>Drupal.settings.mediafront = {"file":"movie.mp4"}; jQuery.extend({});</script>
    `),
    'Review the source page for the title description and media details.'
  );
});

test('YouTube is disabled clearly without an API key', async () => {
  const result = await new YouTubeDiscoveryService({ apiKey: '' }).discover();
  assert.deepEqual(result.items, []);
  assert.match(result.warning, /YOUTUBE_API_KEY/);
});

test('Wikimedia allows Public Domain metadata but not a general free license', () => {
  const basePage = {
    pageid: 42,
    title: 'File:Example.webm',
    imageinfo: [{
      mime: 'video/webm',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example.webm',
      extmetadata: {
        ObjectName: { value: 'Example' },
        LicenseShortName: { value: 'Public domain' },
      },
    }],
  };
  assert.equal(candidateFromPage(basePage).ingestionAvailable, true);
  assert.equal(candidateFromPage({
    ...basePage,
    imageinfo: [{
      ...basePage.imageinfo[0],
      extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } },
    }],
  }).ingestionAvailable, false);
});

test('Wikimedia selects its highest-resolution transcoded derivative for Mux', () => {
  assert.equal(preferredVideoUrl({
    url: 'https://upload.wikimedia.org/original.webm',
    derivatives: [
      {
        src: 'https://upload.wikimedia.org/original-with-query.webm',
        type: 'video/webm; codecs="av1, opus"',
        width: 1456,
        height: 1072,
      },
      {
        src: 'https://upload.wikimedia.org/240p.webm',
        type: 'video/webm; codecs="vp9, opus"',
        transcodekey: '240p.vp9.webm',
        width: 326,
        height: 240,
      },
      {
        src: 'https://upload.wikimedia.org/480p.webm',
        type: 'video/webm; codecs="vp9, opus"',
        transcodekey: '480p.vp9.webm',
        width: 652,
        height: 480,
      },
    ],
  }), 'https://upload.wikimedia.org/480p.webm');
});

test('Wikimedia extracts a four-digit year from human-readable dates', () => {
  assert.equal(metadataYear({ DateTimeOriginal: { value: '29 November 1950' } }), 1950);
  assert.equal(metadataYear({ DateTimeOriginal: { value: '2025-04-03' } }), 2025);
  assert.equal(metadataYear({ DateTimeOriginal: { value: 'Unknown' } }), null);
});

test('daily scheduler runs only when discovery is stale', async () => {
  let starts = 0;
  let lastDiscoveryAt = new Date().toISOString();
  const scheduler = new DailyDiscoveryScheduler({
    jobs: { start: () => { starts += 1; } },
    candidateStore: { status: async () => ({ lastDiscoveryAt }) },
    intervalMs: 60_000,
  });

  await scheduler.runIfDue();
  assert.equal(starts, 0);
  lastDiscoveryAt = new Date(Date.now() - 120_000).toISOString();
  await scheduler.runIfDue();
  assert.equal(starts, 1);
});

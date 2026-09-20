const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CandidateStore, FirestoreCandidateStore } = require('../src/adminBot/candidateStore');
const { PublicDomainDiscoveryRunner } = require('../src/adminBot/discoveryRunner');
const { DailyDiscoveryScheduler } = require('../src/adminBot/discoveryScheduler');
const { parseRss } = require('../src/adminBot/publicDomainMovieDiscoveryService');
const { candidateFromPage } = require('../src/adminBot/wikimediaVideoService');
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

function fakeFirestore() {
  const records = new Map();
  function ref(collection, id) {
    const key = `${collection}/${id}`;
    return {
      key,
      async get() {
        return {
          exists: records.has(key),
          data: () => records.get(key),
        };
      },
    };
  }
  function write(target, value, options) {
    records.set(target.key, options?.merge
      ? { ...(records.get(target.key) || {}), ...value }
      : value);
  }
  return {
    collection(name) {
      return {
        doc: (id) => ref(name, id),
        async get() {
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
  const store = new FirestoreCandidateStore(fakeFirestore());
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
});

test('discovery continues when one source fails', async () => {
  let saved = [];
  const runner = new PublicDomainDiscoveryRunner({
    providers: [
      { name: 'Unavailable', discover: async () => { throw new Error('Source is down.'); } },
      { name: 'Working', discover: async () => ({ items: [candidate()] }) },
    ],
    candidateStore: {
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

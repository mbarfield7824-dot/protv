const assert = require('node:assert/strict');
const test = require('node:test');
const { FieldValue } = require('firebase-admin/firestore');
const { ReportStore, ReportRateLimitError } = require('../src/reports/store');

// Local optimistic transaction double. Server timestamp sentinels resolve only at commit.
function firestoreDouble() {
  const entries = new Map();
  const writes = [];
  let version = 0;
  const harness = { clock: 1_800_000_000_000, fail: false, entries, writes };
  const check = () => { if (harness.fail) throw new Error('Local Firestore fixture unavailable'); };
  const snapshot = (key) => ({
    id: key.split('/')[1], exists: entries.has(key),
    data: () => entries.has(key) ? { ...entries.get(key).data } : undefined,
  });
  const apply = (kind, key, data) => {
    check();
    writes.push({ kind, key, data });
    const stored = { ...data };
    for (const [field, value] of Object.entries(stored)) {
      if (value?.isEqual?.(FieldValue.serverTimestamp())) {
        const time = harness.clock;
        stored[field] = { toDate: () => new Date(time) };
      }
    }
    entries.set(key, {
      data: kind === 'update' ? { ...entries.get(key).data, ...stored } : stored, version: ++version,
    });
  };
  const ref = (collection, id) => {
    const key = `${collection}/${id}`;
    return {
      key, id,
      async get() { check(); return snapshot(key); },
      async create(data) {
        check();
        assert.ok(!entries.has(key), 'create must not overwrite an existing report');
        apply('create', key, data);
      },
    };
  };
  const query = (name, cursor, limit) => ({
    startAfter(doc) { return query(name, doc.id, limit); },
    limit(value) { return query(name, cursor, value); },
    async get() {
      check();
      let docs = [...entries.keys()].filter((key) => key.startsWith(`${name}/`)).map(snapshot);
      docs.sort((left, right) => right.data().createdAt.toDate() - left.data().createdAt.toDate()
        || right.id.localeCompare(left.id));
      if (cursor) docs = docs.slice(docs.findIndex((doc) => doc.id === cursor) + 1);
      return { docs: docs.slice(0, limit) };
    },
  });
  harness.db = {
    collection(name) {
      check();
      return {
        doc: (id) => ref(name, id),
        orderBy(field, direction) {
          assert.equal(field, 'createdAt');
          assert.equal(direction, 'desc');
          return query(name);
        },
      };
    },
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        check();
        const reads = new Map();
        const pending = [];
        const result = await callback({
          async get(target) {
            await new Promise((resolve) => setImmediate(resolve));
            reads.set(target.key, entries.get(target.key)?.version || 0);
            return snapshot(target.key);
          },
          set(target, data) { pending.push(['set', target.key, data]); },
          update(target, data) { pending.push(['update', target.key, data]); },
        });
        if ([...reads].some(([key, seen]) => (entries.get(key)?.version || 0) !== seen)) continue;
        check();
        pending.forEach((args) => apply(...args));
        return result;
      }
      throw new Error('Local fixture transaction contention');
    },
  };
  harness.store = new ReportStore({
    db: harness.db, production: true, filePath: 'unused-fixture-path',
    now: () => harness.clock, perClientLimit: 2, globalLimit: 3,
  });
  return harness;
}

const data = {
  type: 'general', reason: 'csam_child_sexual_exploitation', description: 'Local reference',
  contactEmail: '', targetId: '', targetUrl: '', targetDescription: '',
};

test('Firestore creates separate report records with server timestamps; Admin review is transactional', async () => {
  const fixture = firestoreDouble();
  const { store } = fixture;
  const id = await store.create(data);
  assert.ok(fixture.entries.has(`safetyReports/${id}`));
  const create = fixture.writes[0];
  assert.ok(create.data.createdAt.isEqual(FieldValue.serverTimestamp()));
  assert.ok(create.data.updatedAt.isEqual(FieldValue.serverTimestamp()));
  assert.equal(create.data.status, 'pending');
  fixture.clock += 1000;
  assert.equal(await store.review(id, { status: 'in_review', reviewNotes: 'Private test note' }, 'reviewer-uid'), true);
  const saved = await store.get(id);
  assert.equal(saved.createdAt, new Date(fixture.clock - 1000).toISOString());
  assert.equal(saved.reviewedAt, new Date(fixture.clock).toISOString());
  assert.equal(saved.reviewedBy, 'reviewer-uid');
  assert.equal(saved.reviewNotes, 'Private test note');
  const updated = fixture.writes.at(-1);
  assert.ok(updated.data.reviewedAt.isEqual(FieldValue.serverTimestamp()));
  assert.ok(updated.data.updatedAt.isEqual(FieldValue.serverTimestamp()));
  const before = fixture.writes.length;
  assert.equal(await store.review('missing', { status: 'resolved', reviewNotes: 'Test' }, 'reviewer-uid'), false);
  assert.equal(fixture.writes.length, before);
  assert.equal(await store.get('missing'), null);
});

test('Firestore pagination retains equal-timestamp reports and stable cursor after review', async () => {
  const { store } = firestoreDouble();
  const ids = await Promise.all(Array.from({ length: 5 }, () => store.create(data)));
  const received = [];
  let cursor;
  do {
    const page = await store.list({ limit: 2, cursor });
    received.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
    if (cursor) await store.review(cursor, { status: 'resolved', reviewNotes: 'Test' }, 'admin');
  } while (cursor);
  assert.deepEqual(received, ids.sort((a, b) => b.localeCompare(a)));
  await assert.rejects(store.list({ limit: 2, cursor: 'missing' }), /cursor not found/);
});

test('Firestore transactional rate limits survive competing submissions and window rollover', async () => {
  const fixture = firestoreDouble();
  const { store } = fixture;
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.consumeRateLimit('local-client')));
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 2);
  for (const result of results.filter((item) => item.status === 'rejected')) {
    assert.ok(result.reason instanceof ReportRateLimitError);
  }
  await store.consumeRateLimit('other-client');
  await assert.rejects(store.consumeRateLimit('third-client'), ReportRateLimitError);
  const counters = [...fixture.entries.entries()].filter(([key]) => key.startsWith('safetyReportRateLimits/'));
  assert.equal(counters.length, 3);
  assert.ok(counters.every(([key]) => !key.includes('local-client')));
  fixture.clock += 60 * 1000;
  await store.consumeRateLimit('third-client');
  await assert.rejects(store.consumeRateLimit('local-client'), ReportRateLimitError);
  fixture.clock += 10 * 60 * 1000;
  await store.consumeRateLimit('local-client');
});

test('Firestore errors reject all operations even in development; no local fallback', async () => {
  const fixture = firestoreDouble();
  fixture.store.production = false;
  fixture.fail = true;
  for (const operation of [
    () => fixture.store.create(data), () => fixture.store.get('id'),
    () => fixture.store.list({ limit: 25 }), () => fixture.store.consumeRateLimit('client'),
    () => fixture.store.review('id', { status: 'resolved' }, 'actor'),
  ]) await assert.rejects(operation, /fixture unavailable/);
  assert.equal(fixture.entries.size, 0);
});

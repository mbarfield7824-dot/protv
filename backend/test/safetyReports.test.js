const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const { ReportStore, ReportRateLimitError } = require('../src/reports/store');
const { submission, review, pagination, ReportInputError } = require('../src/reports/validation');

const valid = {
  type: 'content', reason: 'csam_child_sexual_exploitation',
  description: 'Local test text reference only.', targetId: 'episode-stable-id',
  contactEmail: 'reporter@example.test',
};

async function localStore(context, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protv-reports-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new ReportStore({
    db: null, production: false, filePath: path.join(directory, 'reports.json'), ...options,
  });
}

async function httpHarness(context, store, actualApp = false) {
  const firebase = require('../src/firebase');
  const previousAuth = firebase.auth;
  firebase.auth = {
    async verifyIdToken(token) {
      if (token === 'invalid') throw new Error('Invalid token');
      return {
        uid: 'local-admin', admin: token !== 'viewer',
        firebase: { sign_in_provider: token === 'custom' ? 'custom' : 'password' },
      };
    },
  };
  const modules = ['../src/middleware/auth', '../src/reports/router'];
  for (const module of modules) delete require.cache[require.resolve(module)];
  const routerModule = require('../src/reports/router');
  const { createReportRouters } = routerModule;
  context.after(() => {
    firebase.auth = previousAuth;
    for (const module of modules) delete require.cache[require.resolve(module)];
  });
  const routers = createReportRouters({ store });
  let app;
  if (actualApp) {
    const appPath = require.resolve('../src/app');
    const previousApp = require.cache[appPath];
    routerModule.createReportRouters = () => routers;
    delete require.cache[appPath];
    try { app = require(appPath); } finally {
      routerModule.createReportRouters = createReportRouters;
      if (previousApp) require.cache[appPath] = previousApp;
      else delete require.cache[appPath];
    }
  } else {
    app = express();
    app.use('/reports', routers.publicRouter);
    app.use('/admin/reports', routers.adminRouter);
  }
  const server = app.listen(0, '127.0.0.1');
  context.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (method, route, { body, token, raw, contentType = 'application/json' } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined || raw !== undefined ? { 'Content-Type': contentType } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : raw !== undefined ? { body: raw } : {}),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text.startsWith('{') ? JSON.parse(text) : text };
  };
}

test('valid content/account/general references and explicit CSAM reason normalize without invented IDs', () => {
  assert.deepEqual(submission(valid), { ...valid, targetUrl: '', targetDescription: '' });
  assert.equal(submission({ ...valid, type: 'account', targetId: undefined, targetDescription: 'Creator shown as Test Creator' }).targetId, '');
  assert.equal(submission({ ...valid, targetId: undefined, targetUrl: 'https://example.test/title' }).targetUrl, 'https://example.test/title');
  assert.equal(submission({ type: 'general', reason: 'other', description: 'General concern' }).type, 'general');
});

test('invalid inputs, field injection, file evidence, and invalid review/pagination are rejected', () => {
  for (const body of [
    null, [], { ...valid, type: 'creator' }, { ...valid, reason: 'unknown' },
    { ...valid, description: '' }, { ...valid, description: 'x'.repeat(5001) },
    { ...valid, description: '\u0000' }, { ...valid, targetId: 'a/b' },
    { ...valid, targetId: undefined }, { ...valid, contactEmail: 'invalid@' },
    { ...valid, contactEmail: 'a@b.test\nInjected: text' },
    { ...valid, targetUrl: 'file:///private' }, { ...valid, targetUrl: 'not a URL' },
    { ...valid, targetUrl: 'https://user:password@example.test/' },
    { ...valid, targetDescription: 'x'.repeat(1001) }, { ...valid, evidence: ['upload'] },
    { ...valid, status: 'resolved' }, { ...valid, reviewedBy: 'forged' },
  ]) assert.throws(() => submission(body), ReportInputError);
  for (const body of [
    { status: 'approved', reviewNotes: 'note' }, { status: 'resolved', reviewNotes: '' },
    { status: 'resolved', reviewNotes: 'note', reviewedBy: 'forged' },
  ]) assert.throws(() => review(body), ReportInputError);
  for (const query of [{ limit: '0' }, { limit: '101' }, { limit: ['1'] }, { cursor: 'invalid' }, { status: 'pending' }]) {
    assert.throws(() => pagination(query), ReportInputError);
  }
  assert.deepEqual(pagination({}), { limit: 25, cursor: undefined });
});

test('local submissions survive new store instances; IDs, times, pagination and latest review are server-managed', async (context) => {
  let now = 1_800_000_000_000;
  const store = await localStore(context, { now: () => now });
  const first = await store.create(submission(valid));
  now += 1000;
  const second = await store.create(submission({ ...valid, type: 'account' }));
  const restarted = new ReportStore({ db: null, filePath: store.filePath, production: false, now: () => now });
  const saved = await restarted.get(first);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.createdAt, new Date(now - 1000).toISOString());
  assert.equal(saved.reviewedBy, null);
  assert.notEqual(first, second);
  const page = await restarted.list({ limit: 1 });
  assert.equal(page.items[0].id, second);
  assert.equal(page.nextCursor, second);
  assert.deepEqual((await restarted.list({ limit: 1, cursor: second })).items.map((item) => item.id), [first]);
  await assert.rejects(restarted.list({ limit: 1, cursor: '00000000-0000-4000-8000-000000000000' }), ReportInputError);
  now += 1000;
  assert.equal(await restarted.review(first, review({ status: 'in_review', reviewNotes: 'Local reviewer note' }), 'local-admin'), true);
  const changed = await store.get(first);
  assert.equal(changed.reviewedBy, 'local-admin');
  assert.equal(changed.reviewedAt, new Date(now).toISOString());
  assert.equal(changed.updatedAt, changed.reviewedAt);
  assert.equal(changed.createdAt, saved.createdAt);
  assert.equal(changed.reviewNotes, 'Local reviewer note');
  assert.equal(await restarted.review('missing', { status: 'dismissed' }, 'local-admin'), false);
});

test('queued local writes preserve concurrent reports and enforce client/global windows across restarts', async (context) => {
  let now = 1_800_000_000_000;
  const store = await localStore(context, { now: () => now, perClientLimit: 2, globalLimit: 3 });
  const other = new ReportStore({ db: null, filePath: store.filePath, production: false, now: () => now, perClientLimit: 2, globalLimit: 3 });
  const ids = await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? other : store).create(submission(valid))));
  assert.equal((await store.list({ limit: 100 })).items.length, ids.length);
  const attempts = await Promise.allSettled([store.consumeRateLimit('client-a'), other.consumeRateLimit('client-a'), store.consumeRateLimit('client-a')]);
  assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 2);
  assert.ok(attempts.find((item) => item.status === 'rejected').reason instanceof ReportRateLimitError);
  await store.consumeRateLimit('client-b');
  await assert.rejects(store.consumeRateLimit('client-c'), ReportRateLimitError);
  now += 60 * 1000;
  await other.consumeRateLimit('client-c');
  await assert.rejects(other.consumeRateLimit('client-a'), ReportRateLimitError);
  now += 10 * 60 * 1000;
  await other.consumeRateLimit('client-a');
  const disk = await fs.readFile(store.filePath, 'utf8');
  assert.ok(!disk.includes('client-a'));
});

test('production never reads/writes local storage; Firestore failures never fall back; corrupt and unwritable local files fail', async (context) => {
  const local = await localStore(context);
  const production = new ReportStore({ db: null, filePath: local.filePath, production: true });
  for (const operation of [
    () => production.create(submission(valid)), () => production.get('id'),
    () => production.list({ limit: 25 }), () => production.consumeRateLimit('client'),
    () => production.review('id', { status: 'resolved' }, 'actor'),
  ]) await assert.rejects(operation, /requires Firestore/);
  await assert.rejects(fs.access(local.filePath), { code: 'ENOENT' });
  const unavailable = new ReportStore({
    filePath: local.filePath, production: false,
    db: { collection() { throw new Error('Firestore unavailable'); } },
  });
  await assert.rejects(unavailable.create(submission(valid)), /Firestore unavailable/);
  await assert.rejects(unavailable.get('id'), /Firestore unavailable/);
  await assert.rejects(fs.access(local.filePath), { code: 'ENOENT' });
  await fs.writeFile(local.filePath, '{bad JSON');
  await assert.rejects(local.create(submission(valid)), SyntaxError);
  await fs.writeFile(local.filePath, '[]');
  await assert.rejects(local.get('id'), /storage is invalid/);
  await fs.writeFile(local.filePath, '{"reports":{},"rateLimits":{}}');
  await local.create(submission(valid));
  const blocked = new ReportStore({ db: null, production: false, filePath: path.join(local.filePath, 'child.json') });
  await assert.rejects(blocked.create(submission(valid)));
  assert.equal((await local.list({ limit: 25 })).items.length, 1);
});

test('public response contains only receipt; authenticated Admin sees private details and records actor/status/time', async (context) => {
  const store = await localStore(context);
  const request = await httpHarness(context, store);
  const response = await request('POST', '/reports', { body: valid });
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(response.body).sort(), ['id', 'status']);
  assert.equal(response.body.status, 'received');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const id = response.body.id;
  assert.equal((await request('GET', `/reports/${id}`)).status, 404);
  for (const token of [undefined, 'invalid', 'viewer', 'custom']) {
    for (const [method, route, body] of [
      ['GET', '/admin/reports', undefined], ['GET', `/admin/reports/${id}`, undefined],
      ['PATCH', `/admin/reports/${id}`, { status: 'resolved', reviewNotes: 'Private note' }],
    ]) {
      const result = await request(method, route, { token, body });
      assert.equal(result.status, token === undefined || token === 'invalid' ? 401 : 403);
      assert.ok(!JSON.stringify(result.body).includes(valid.contactEmail));
    }
  }
  const detail = await request('GET', `/admin/reports/${id}`, { token: 'admin' });
  assert.equal(detail.body.contactEmail, valid.contactEmail);
  assert.equal(detail.body.description, valid.description);
  const updated = await request('PATCH', `/admin/reports/${id}`, { token: 'admin', body: { status: 'resolved', reviewNotes: 'Private note' } });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.body, { id, status: 'resolved' });
  const reviewed = await request('GET', `/admin/reports/${id}`, { token: 'admin' });
  assert.equal(reviewed.body.reviewedBy, 'local-admin');
  assert.equal(reviewed.body.reviewNotes, 'Private note');
  assert.ok(reviewed.body.reviewedAt);
  const list = await request('GET', '/admin/reports?limit=1', { token: 'admin' });
  assert.equal(list.body.items[0].id, id);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.equal((await request('GET', '/admin/reports?limit=101', { token: 'admin' })).status, 400);
  assert.equal((await request('GET', '/admin/reports/invalid', { token: 'admin' })).status, 400);
  assert.equal((await request('GET', '/admin/reports/00000000-0000-4000-8000-000000000000', { token: 'admin' })).status, 404);
  assert.equal((await request('PATCH', '/admin/reports/00000000-0000-4000-8000-000000000000', { token: 'admin', body: { status: 'dismissed', reviewNotes: 'Test' } })).status, 404);
});

test('HTTP validation, malformed/oversized JSON, unsupported uploads and durable rate rejection are explicit', async (context) => {
  const store = await localStore(context, { perClientLimit: 8 });
  const request = await httpHarness(context, store);
  assert.equal((await request('POST', '/reports', { body: { ...valid, evidence: 'file' } })).status, 400);
  assert.equal((await request('POST', '/reports', { raw: '{bad JSON' })).status, 400);
  assert.equal((await request('POST', '/reports', { body: { ...valid, description: 'x'.repeat(17000) } })).status, 413);
  assert.equal((await request('POST', '/reports', { raw: 'binary fixture', contentType: 'multipart/form-data' })).status, 415);
  for (const body of [
    valid, { ...valid, type: 'account', targetId: undefined, targetDescription: 'Creator test' },
    { type: 'general', reason: 'other', description: 'General test concern' }, valid,
  ]) assert.equal((await request('POST', '/reports', { body })).status, 201);
  const rejected = await request('POST', '/reports', { body: valid });
  assert.equal(rejected.status, 429);
  assert.ok(Number(rejected.headers.get('retry-after')) > 0);
  assert.equal((await store.list({ limit: 25 })).items.length, 4);
});

test('storage failures return 503, never acknowledgment; private text is not logged or returned', async (context) => {
  const logs = [];
  context.mock.method(console, 'error', (...args) => logs.push(args));
  const store = {
    consumeRateLimit: async () => {},
    create: async () => { throw new Error(`failed writing ${valid.description}`); },
    list: async () => { throw new Error('list failed'); },
    get: async () => { throw new Error('get failed'); },
    review: async () => { throw new Error('review failed'); },
  };
  const request = await httpHarness(context, store);
  for (const [method, route, options] of [
    ['POST', '/reports', { body: valid }],
    ['GET', '/admin/reports', { token: 'admin' }],
    ['GET', '/admin/reports/00000000-0000-4000-8000-000000000000', { token: 'admin' }],
    ['PATCH', '/admin/reports/00000000-0000-4000-8000-000000000000', { token: 'admin', body: { status: 'resolved', reviewNotes: 'Private note' } }],
  ]) {
    const result = await request(method, route, options);
    assert.equal(result.status, 503);
    assert.ok(!('id' in result.body));
  }
  store.consumeRateLimit = async () => { throw new Error('counter unavailable'); };
  assert.equal((await request('POST', '/reports', { body: valid })).status, 503);
  assert.equal(logs.length, 5);
  assert.ok(!JSON.stringify(logs).includes(valid.description));
});

test('actual app mounts reporting before legacy JSON parsing and preserves existing health route', async (context) => {
  const store = await localStore(context);
  const request = await httpHarness(context, store, true);
  assert.equal((await request('GET', '/health')).status, 200);
  const received = await request('POST', '/reports', { body: valid });
  assert.equal(received.status, 201);
  assert.equal((await request('GET', `/admin/reports/${received.body.id}`, { token: 'admin' })).status, 200);
  const tooLarge = await request('POST', '/reports', { body: { ...valid, description: 'x'.repeat(17000) } });
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.headers.get('cache-control'), 'no-store');
  const malformed = await request('POST', '/reports', { raw: '{ private-invalid-text' });
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body, { error: 'Invalid report JSON.' });
  const privateOversize = await request('PATCH', `/admin/reports/${received.body.id}`, {
    token: 'admin', body: { status: 'resolved', reviewNotes: 'x'.repeat(17000) },
  });
  assert.equal(privateOversize.status, 413);
  assert.equal((await store.get(received.body.id)).status, 'pending');
});

test('Vercel bridge preserves report pagination without broadening legacy query forwarding', () => {
  const appPath = require.resolve('../src/app');
  const bridgePath = require.resolve('../../api/index');
  const previousApp = require.cache[appPath];
  const previousBridge = require.cache[bridgePath];
  try {
    require.cache[appPath] = { id: appPath, filename: appPath, loaded: true, exports: (request) => request.url };
    delete require.cache[bridgePath];
    const bridge = require(bridgePath);
    assert.equal(bridge({ query: { path: 'admin/reports', limit: '10', cursor: 'stable-id' } }, {}), '/api/admin/reports?limit=10&cursor=stable-id');
    assert.equal(bridge({ query: { path: 'videos', view: 'movies' } }, {}), '/api/videos');
  } finally {
    delete require.cache[bridgePath];
    if (previousBridge) require.cache[bridgePath] = previousBridge;
    if (previousApp) require.cache[appPath] = previousApp;
    else delete require.cache[appPath];
  }
});

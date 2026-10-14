const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');
const { createCreatorPosterStorageCheckRouter } = require('../src/integrations/creatorPosterStore');

function authorization() {
  const filename = require.resolve('../src/middleware/auth');
  const module = { exports: {} };
  const nativeRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: name => name === '../firebase' ? { auth: {
      verifyIdToken: async token => {
        if (token === 'invalid') throw new Error('Synthetic invalid token');
        return { uid: 'synthetic-admin', admin: token !== 'creator',
          firebase: { sign_in_provider: token === 'custom' ? 'custom' : 'password' } };
      },
    } } : nativeRequire(name),
  }, { filename });
  return module.exports.verifyAdmin;
}

async function api(store) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/creator-posters', createCreatorPosterStorageCheckRouter({ store, verifyAdmin: authorization() }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/api/admin/creator-posters/storage-check`,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

test('storage check requires a valid interactive Admin token before storage access', async () => {
  let calls = 0;
  const app = await api({ bucket: {}, save: async () => { calls++; throw new Error('Should not execute'); } });
  try {
    for (const [token, status] of [[null, 401], ['invalid', 401], ['creator', 403], ['custom', 403]]) {
      const r = await fetch(app.url, { method: 'POST', headers: {
        'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }, body: '{}' });
      assert.equal(r.status, status);
    }
    assert.equal(calls, 0);
  } finally { await app.close(); }
});

test('storage check refuses supplied media, paths, buckets, malformed bodies and GET', async () => {
  let calls = 0;
  const app = await api({ bucket: {}, save: async () => { calls++; } });
  try {
    for (const body of ['[]', 'null', '{"bucket":"public"}', '{"sourceUrl":"https://example.test/private"}', '{"projectId":"dead-air"}']) {
      const r = await fetch(app.url, { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer admin',
      }, body });
      assert.equal(r.status, 400);
    }
    assert.equal((await fetch(app.url)).status, 404);
    assert.equal(calls, 0);
  } finally { await app.close(); }
});

test('storage check uses one fixed tiny image and verifies its exact round trip without publishing dependencies', async () => {
  const saved = [];
  let current;
  const store = { bucket: {}, save: async (bytes, mime) => {
    assert.equal(mime, 'image/png');
    assert.ok(bytes.length < 1000);
    saved.push(bytes); current = bytes;
    return 'https://watchprotv.com/api/posters/creator-synthetic.png';
  }, read: async name => {
    assert.equal(name, 'creator-synthetic.png');
    return { bytes: current, mimeType: 'image/png' };
  } };
  const app = await api(store);
  try {
    let last;
    for (let i = 0; i < 2; i++) {
      const r = await fetch(app.url, { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer admin',
      }, body: '{}' });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      const result = await r.json();
      assert.equal(result.status, 'passed');
      assert.equal(result.catalogChanged, false);
      assert.equal(result.publishingStarted, false);
      assert.equal(result.synthetic, true);
      assert.equal(result.sha256, require('crypto').createHash('sha256').update(current).digest('hex'));
      if (last) assert.deepEqual(result, last);
      last = result;
    }
    assert.ok(saved[0].equals(saved[1]));
  } finally { await app.close(); }
});

test('storage check fails explicitly and safely on unavailable storage, save errors and mismatched reads', async () => {
  for (const store of [
    { bucket: null },
    { bucket: {}, save: async () => { throw new Error('private credential and private URL'); } },
    { bucket: {}, save: async () => 'https://watchprotv.com/api/posters/example.png', read: async () => null },
    { bucket: {}, save: async () => 'https://watchprotv.com/api/posters/example.png', read: async () => ({ bytes: Buffer.from('bad'), mimeType: 'image/png' }) },
  ]) {
    const app = await api(store);
    try {
      const r = await fetch(app.url, { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer admin',
      }, body: '{}' });
      assert.equal(r.status, 503);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      const text = await r.text();
      assert.ok(!text.includes('private credential'));
      assert.ok(!text.includes('private URL'));
      assert.ok(text.includes('no publishing was started'));
    } finally { await app.close(); }
  }
});

const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createRequire } = require('node:module');
const express = require('express');
const sharp = require('sharp');
const { createTitlePosterRouter, MAX_UPLOAD_BYTES } = require('../src/integrations/titlePosterUpload');

// Real verifyAdmin with a synthetic Firebase token verifier.
function authorization() {
  const filename = require.resolve('../src/middleware/auth');
  const module = { exports: {} };
  const nativeRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: name => name === '../firebase' ? { auth: {
      verifyIdToken: async token => {
        if (token === 'invalid') throw new Error('Synthetic invalid token');
        return { uid: 'synthetic-admin', admin: token !== 'viewer',
          firebase: { sign_in_provider: token === 'custom' ? 'custom' : 'password' } };
      },
    } } : nativeRequire(name),
  }, { filename });
  return module.exports.verifyAdmin;
}

// Vercel-mode CreatorPosterStore over an in-memory bucket.
function productionStore() {
  const objects = new Map();
  const bucket = {
    file: (name, options = {}) => ({
      getMetadata: async () => {
        if (!objects.has(name)) throw Object.assign(new Error('Missing'), { code: 404 });
        return [objects.get(name).metadata];
      },
      save: async (bytes, configuration) => {
        assert.equal(configuration.preconditionOpts.ifGenerationMatch, 0);
        if (objects.has(name)) throw Object.assign(new Error('Exists'), { code: 412 });
        objects.set(name, { bytes: Buffer.from(bytes), metadata: { ...configuration.metadata, size: String(bytes.length), generation: '7' } });
      },
      createReadStream: () => {
        assert.equal(options.generation, '7');
        return Readable.from([objects.get(name).bytes]);
      },
    }),
  };
  const filename = require.resolve('../src/integrations/creatorPosterStore');
  const module = { exports: {} };
  const nativeRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process: { env: { VERCEL: '1', NODE_ENV: 'production' } },
    __dirname: path.dirname(filename), Buffer, URL, console, setTimeout, clearTimeout,
    require: name => {
      if (name === '../firebase') return { getCreatorPosterBucket: () => bucket };
      if (name === 'fs/promises') return { mkdir: () => { throw new Error('Forbidden serverless write.'); }, writeFile: () => { throw new Error('Forbidden serverless write.'); } };
      return nativeRequire(name);
    },
  }, { filename });
  return { modules: module.exports, objects };
}

async function api(options) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/title-posters', createTitlePosterRouter({ verifyAdmin: authorization(), logAdminEvent: async () => {}, ...options }));
  if (options.serve) app.use('/api/posters', options.serve);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}/api`,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

const put = (base, id, body, { token = 'admin', type = 'image/jpeg' } = {}) => fetch(`${base}/admin/title-posters/${id}`, {
  method: 'PUT', body,
  headers: { ...(type ? { 'Content-Type': type } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});
const jpeg = (width = 40, height = 60) => sharp({ create: { width, height, channels: 3, background: '#1d3a8f' } }).jpeg().toBuffer();
const bundy = { id: 'sqKR6c5Cq7MD9lg1GDxG', title: 'The Bundy Chronicles', contentType: 'MOVIE', thumbnailUrl: 'https://scontent.example.fbcdn.net/expiring.jpg?oe=6AABDF00' };

test('poster upload requires an interactive Administrator before touching storage or the catalog', async () => {
  let calls = 0;
  const spy = async () => { calls++; throw new Error('Should not execute'); };
  const app = await api({ store: { assertAvailable: () => { calls++; }, save: spy }, getVideoById: spy, updateVideo: spy });
  try {
    for (const [token, status] of [[null, 401], ['invalid', 401], ['viewer', 403], ['custom', 403]]) {
      assert.equal((await put(app.base, bundy.id, await jpeg(), { token })).status, status, String(token));
    }
    assert.equal((await fetch(`${app.base}/admin/title-posters/${bundy.id}`)).status, 404);
    assert.equal(calls, 0);
  } finally { await app.close(); }
});

test('uploads are validated: identifier, type, size, decodable image, title and podcast rules', async () => {
  const updates = [];
  const app = await api({
    store: { assertAvailable: () => {}, save: async () => 'https://watchprotv.com/api/posters/title-x.jpg' },
    getVideoById: async (id) => {
      if (id === 'missing') throw new (class VideoNotFoundError extends Error {})('Video not found');
      if (id === 'podcast') return { id, contentType: 'PODCAST_EPISODE' };
      return { ...bundy, id };
    },
    updateVideo: async (...args) => { updates.push(args); },
  });
  try {
    const image = await jpeg();
    const cases = [
      [put(app.base, 'bad%20id', image), 400],
      [put(app.base, bundy.id, image, { type: 'image/gif' }), 415],
      [put(app.base, bundy.id, image, { type: 'text/plain' }), 415],
      [put(app.base, bundy.id, JSON.stringify({ url: 'https://example.com/a.jpg' }), { type: 'application/json' }), 415],
      [put(app.base, bundy.id, Buffer.alloc(0)), 400],
      [put(app.base, bundy.id, Buffer.alloc(MAX_UPLOAD_BYTES + 1)), 413],
      [put(app.base, bundy.id, Buffer.from('not an image')), 422],
      [put(app.base, bundy.id, await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).png().toBuffer()), 422],
      [put(app.base, 'missing', image), 404],
      [put(app.base, 'podcast', image), 400],
    ];
    for (const [index, [request, status]] of cases.entries()) {
      const response = await request;
      assert.equal(response.status, status, `case ${index}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(updates.length, 0);
  } finally { await app.close(); }
});

test('storage or catalog failures change nothing and never leak internals', async () => {
  for (const [options, expected] of [
    [{ store: { assertAvailable: () => { throw new Error('private bucket name'); } } }, /not configured/],
    [{ store: { assertAvailable: () => {}, save: async () => { throw new Error('private credential'); } } }, /No catalog record was changed/],
    [{ store: { assertAvailable: () => {}, save: async () => 'https://watchprotv.com/api/posters/title-x.jpg' }, updateVideo: async () => { throw new Error('private firestore'); } }, /could not be updated/],
    [{ store: { assertAvailable: () => {} }, getVideoById: async () => { throw new Error('private firestore'); } }, /No poster was stored/],
  ]) {
    let updated = 0;
    const app = await api({ getVideoById: async () => ({ ...bundy }), updateVideo: async () => { updated++; }, ...options });
    try {
      const response = await put(app.base, bundy.id, await jpeg());
      assert.equal(response.status, 503);
      const text = await response.text();
      assert.match(text, expected);
      assert.equal(/private/.test(text), false);
      if (!options.updateVideo) assert.equal(updated, 0);
    } finally { await app.close(); }
  }
});

test('Bundy case: an uploaded poster is re-encoded, stored durably and served after a cold start', async () => {
  const { modules, objects } = productionStore();
  const writes = [];
  const audit = [];
  const app = await api({
    store: new modules.CreatorPosterStore(),
    getVideoById: async () => ({ ...bundy }),
    updateVideo: async (id, changes) => { writes.push({ id, changes }); },
    logAdminEvent: async (event) => { audit.push(event); },
    normalizePosterImage: require('../src/integrations/creatorPromotional').normalizePosterImage,
    serve: modules.createCreatorPosterRouter({ store: new modules.CreatorPosterStore() }),
  });
  try {
    const source = await sharp({ create: { width: 2000, height: 3000, channels: 3, background: '#1d3a8f' } })
      .withMetadata({ exif: { IFD0: { Copyright: 'private camera owner' } } }).jpeg().toBuffer();
    const response = await put(app.base, bundy.id, source);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.posterUrl, /^https:\/\/watchprotv\.com\/api\/posters\/title-[a-f0-9]{64}\.jpg$/);
    assert.equal(result.thumbnailUrl, result.posterUrl);
    assert.deepEqual(writes, [{ id: bundy.id, changes: { posterUrl: result.posterUrl, thumbnailUrl: result.posterUrl } }]);
    assert.equal(audit[0].type, 'title_poster_uploaded');
    assert.equal(audit[0].actorId, 'synthetic-admin');
    assert.equal(audit[0].details.previousThumbnailUrl, bundy.thumbnailUrl);

    const [objectName] = [...objects.keys()];
    assert.match(objectName, /^title-posters\/title-[a-f0-9]{64}\.jpg$/);
    const stored = objects.get(objectName);
    assert.equal(stored.metadata.metadata.sha256, crypto.createHash('sha256').update(stored.bytes).digest('hex'));
    const metadata = await sharp(stored.bytes).metadata();
    assert.ok(metadata.width <= 1000 && metadata.height <= 1000, 'resized to fit 1000 x 1000');
    assert.equal(metadata.exif, undefined, 'embedded metadata stripped');

    const served = await fetch(`${app.base}/posters/${result.posterUrl.split('/').at(-1)}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await served.arrayBuffer()).equals(stored.bytes));

    // Re-uploading identical bytes reuses the same immutable object.
    assert.equal((await (await put(app.base, bundy.id, source)).json()).posterUrl, result.posterUrl);
    assert.equal(objects.size, 1);
  } finally { await app.close(); }
});

test('the creator store keeps creator- names and refuses unknown poster kinds', async () => {
  const { modules } = productionStore();
  const store = new modules.CreatorPosterStore();
  const image = await jpeg();
  assert.match(await store.save(image, 'image/jpeg'), /\/posters\/creator-[a-f0-9]{64}\.jpg$/);
  await assert.rejects(store.save(image, 'image/jpeg', 'public'), /Invalid durable poster/);
  assert.equal(await store.read('../creator-posters/creator-x.jpg'), null);
  assert.equal(await store.read(`other-${'0'.repeat(64)}.jpg`), null);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');
const express = require('express');
const sharp = require('sharp');
const { Readable } = require('stream');
const { createRequire } = require('module');
const { CreatorPublishingService } = require('../src/integrations/creatorPublishingService');
const { transferMatches } = require('../src/integrations/creatorPromotional');

function mockBucket() {
  const objects = new Map();
  const saves = [];
  let fail = '';
  let race = false;
  const bucket = {
    file: (name, options = {}) => {
      assert.match(name, /^(creator-posters\/creator|title-posters\/title)-[a-f0-9]{64}\.(png|jpg)$/);
      return {
        getMetadata: async () => {
          if (fail === 'metadata') throw new Error('Synthetic metadata failure');
          if (!objects.has(name)) throw Object.assign(new Error('Missing'), { code: 404 });
          return [objects.get(name).metadata];
        },
        save: async (bytes, configuration) => {
          saves.push(configuration);
          assert.equal(configuration.preconditionOpts.ifGenerationMatch, 0);
          assert.equal(configuration.resumable, false);
          assert.equal(configuration.validation, 'crc32c');
          assert.equal(configuration.public, undefined);
          assert.equal(configuration.predefinedAcl, undefined);
          if (fail === 'save') throw new Error('Synthetic save failure');
          if (objects.has(name)) throw Object.assign(new Error('Already exists'), { code: 412 });
          objects.set(name, {
            bytes: Buffer.from(bytes),
            metadata: { ...configuration.metadata, size: String(bytes.length), generation: '1' },
          });
          if (race) { race = false; throw Object.assign(new Error('Concurrent create'), { code: 412 }); }
        },
        createReadStream: (configuration) => {
          assert.equal(options.generation, objects.get(name).metadata.generation);
          assert.equal(configuration.decompress, false);
          assert.equal(configuration.validation, 'crc32c');
          if (fail === 'read') return Readable.from((async function* () { throw new Error('Synthetic read failure'); })());
          return Readable.from([objects.get(name).bytes]);
        },
      };
    },
  };
  return { bucket, objects, saves, fail: (value) => { fail = value; }, race: () => { race = true; } };
}

function loadModule(relativePath, mocks = {}, env = { VERCEL: '1', NODE_ENV: 'production' }) {
  const filename = require.resolve(relativePath);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process: { env }, __dirname: require('path').dirname(filename),
    Buffer, URL, AbortSignal, console, setTimeout, clearTimeout,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name),
  }, { filename });
  return module.exports;
}

function productionModules(bucket) {
  const storage = loadModule('../src/integrations/creatorPosterStore', {
    '../firebase': { getCreatorPosterBucket: () => bucket },
    'fs/promises': {
      mkdir: () => { throw new Error('Forbidden serverless filesystem write.'); },
      writeFile: () => { throw new Error('Forbidden serverless filesystem write.'); },
    },
  });
  return {
    ...storage,
    ...loadModule('../src/integrations/creatorPromotional', { './creatorPosterStore': storage }),
  };
}

async function productionApi(store, storageModule) {
  const router = () => express.Router();
  const app = loadModule('../src/app', {
    './routes/auth': router(), './routes/videos': router(), './routes/users': router(),
    './adminBot/router': { createAdminBotRouter: router },
    './distributorIngestion/router': { createDistributorIngestionRouter: router },
    './admin/router': { createAdminAssistantRouter: router },
    './ads/router': { createAdsRouter: router },
    './catalog/router': { createCatalogRouter: router },
    './catalog/adminPodcastRouter': { createAdminPodcastRouter: router },
    './live/router': { createLiveRouter: router },
    './live/adminRouter': { createAdminLiveRouter: router },
    './reports/router': { createReportRouters: () => ({ publicRouter: router(), adminRouter: router() }) },
    './integrations/creatorPosterStore': {
      createCreatorPosterRouter: () => storageModule.createCreatorPosterRouter({ store }),
      createCreatorPosterStorageCheckRouter: router,
      posterNotFound: storageModule.posterNotFound,
    },
    './integrations/titlePosterUpload': { createTitlePosterRouter: router },
  });
  const handler = loadModule('../../api/index', { '../backend/src/app': app });
  const server = require('http').createServer((request, response) => {
    request.query = Object.fromEntries(new URL(request.url, 'http://localhost').searchParams);
    handler(request, response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function publishingRequest(bytes) {
  const projectId = '4d7132eb-2a9d-4de0-a455-05467113a97e';
  const assetId = 'poster-asset';
  const expires = String(Math.floor(Date.now() / 1000) + 300);
  const signature = crypto.createHmac('sha256', 'test-secret').update(`${projectId}:${assetId}:poster:${expires}`).digest('hex');
  return {
    requestId: `${projectId}:publishing`, action: 'publishing',
    project: {
      id: projectId, title: 'Production movie', creatorName: 'Creator',
      ownership: { status: 'verified' }, approval: { status: 'approved' },
      contract: { status: 'signed', signedAt: new Date().toISOString() },
      media: { sourceUrl: 'https://creator.example/api/integrations/protv/media/master' },
      promotional: { credits: 'Director: Creator\nCast: Example', poster: {
        assetId, bytes: bytes.length, mimeType: 'image/png',
        sourceUrl: `https://creator.example/api/integrations/protv/promotional/${projectId}/${assetId}?expires=${expires}&signature=${signature}`,
      } },
    },
  };
}

function movieService(modules, bytes) {
  let video;
  let muxCalls = 0;
  let downloads = 0;
  const service = new CreatorPublishingService({
    creatorAgentOrigin: 'https://creator.example', publishingSecret: 'test-secret',
    dependencies: {
      createCreatorVideo: async (id, data) => { video = { id: `creator_${id}`, ...data }; return { id: video.id, created: true }; },
      getVideoByCreatorProjectId: async () => video,
      updateVideo: async (id, updates) => { video = { ...video, ...updates }; },
      updateCreatorPosterTransfer: async (id, expected, updates) => {
        if (!transferMatches(video, expected)) return false;
        video = { ...video, ...updates };
        return true;
      },
      transferPoster: (projectId, poster, options) => modules.transferPoster(projectId, poster, {
        ...options, download: async () => { downloads += 1; return bytes; },
      }),
      createAssetFromUrl: async () => { muxCalls += 1; return { id: 'mux-test' }; },
      logAdminEvent: async () => {},
    },
  });
  return { service, video: () => video, muxCalls: () => muxCalls, downloads: () => downloads };
}

const pngImage = () => sharp({ create: { width: 12, height: 16, channels: 4, background: '#123456' } }).png().toBuffer();

test('Vercel bucket publishing serves validated artwork through actual API rewrite after cold start, without public ACL', async () => {
  const mock = mockBucket();
  const modules = productionModules(mock.bucket);
  const bytes = await pngImage();
  const movie = movieService(modules, bytes);
  const payload = publishingRequest(bytes);
  assert.equal((await movie.service.execute(payload)).status, 'processing');
  const video = movie.video();
  assert.equal(video.credits, payload.project.promotional.credits);
  assert.equal(video.approvalStatus, 'approved');
  assert.equal(video.posterUrl, video.thumbnailUrl);
  assert.match(video.posterUrl, /^https:\/\/watchprotv\.com\/api\/posters\/creator-[a-f0-9]{64}\.png$/);
  assert.equal(mock.objects.size, 1);
  assert.equal(JSON.stringify([...mock.objects.values()]).includes('signature='), false);
  await movie.service.execute(payload);
  assert.equal(movie.muxCalls(), 1);
  assert.equal(mock.saves.length, 1);
  const restarted = productionModules(mock.bucket);
  const api = await productionApi(new restarted.CreatorPosterStore(), restarted);
  try {
    const url = `${api.base}/api/index?path=posters/${video.posterUrl.split('/').at(-1)}`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, 'png');
    assert.equal((await fetch(url, { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(`${api.base}/api/index?path=posters/creator-${'0'.repeat(64)}.png`)).status, 404);
    // Missing posters of any name are JSON 404s, never the generic 500.
    for (const name of [`title-${'0'.repeat(64)}.jpg`, 'legacy-poster.jpg', 'creator-short.png']) {
      const missing = await fetch(`${api.base}/api/index?path=posters/${name}`);
      assert.equal(missing.status, 404, name);
      assert.equal(missing.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await missing.json(), { error: 'Poster not found.' });
    }
    mock.fail('read');
    const failed = await fetch(url);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get('cache-control'), 'no-store');
    assert.equal((await failed.text()).includes('Synthetic'), false);
  } finally { await api.close(); }
});

test('bucket reuse and concurrent creates are idempotent; mismatched existing objects are never overwritten', async () => {
  const mock = mockBucket();
  const { CreatorPosterStore } = productionModules(mock.bucket);
  const store = new CreatorPosterStore();
  const bytes = await pngImage();
  mock.race();
  const url = await store.save(bytes, 'image/png');
  assert.equal(await store.save(bytes, 'image/png'), url);
  assert.equal(mock.saves.length, 1);
  const object = [...mock.objects.values()][0];
  const valid = { ...object.metadata, metadata: { ...object.metadata.metadata } };
  for (const change of [
    { contentType: 'image/jpeg' }, { size: String(4 * 1024 * 1024 + 1) },
    { metadata: { sha256: 'wrong' } }, { generation: 'invalid' },
  ]) {
    object.metadata = { ...valid, ...change };
    await assert.rejects(store.save(bytes, 'image/png'), /metadata/);
    assert.equal(mock.saves.length, 1);
  }
  object.metadata = valid;
  object.bytes[0] ^= 1;
  await assert.rejects(store.save(bytes, 'image/png'), /integrity/);
  assert.equal(mock.saves.length, 1);
});

test('bucket reads enforce actual byte/type/hash bounds and cannot address private/video objects', async () => {
  const mock = mockBucket();
  const { CreatorPosterStore } = productionModules(mock.bucket);
  const store = new CreatorPosterStore();
  const bytes = await pngImage();
  const url = await store.save(bytes, 'image/png');
  const name = url.split('/').at(-1);
  const object = [...mock.objects.values()][0];
  object.bytes = Buffer.concat([bytes, Buffer.from('extra')]);
  await assert.rejects(store.read(name), /byte limit/);
  object.bytes = bytes.subarray(0, -1);
  await assert.rejects(store.read(name), /byte count/);
  for (const value of ['../private', 'videos/master.mp4', `creator-${'0'.repeat(64)}.svg`]) assert.equal(await store.read(value), null);
  const fake = Buffer.from('<html>not a PNG</html>');
  await assert.rejects(store.save(fake, 'image/png'));
});

test('Vercel missing bucket and bucket save/read failures keep draft retryable reservations and never call Mux', async () => {
  const bytes = await pngImage();
  const missing = movieService(productionModules(null), bytes);
  await assert.rejects(missing.service.execute(publishingRequest(bytes)), /Poster transfer failed before Mux/);
  assert.equal(missing.downloads(), 0);
  assert.equal(missing.muxCalls(), 0);
  assert.equal(missing.video().approvalStatus, 'draft');
  for (const failure of ['save', 'metadata', 'read']) {
    const mock = mockBucket();
    const modules = productionModules(mock.bucket);
    if (failure === 'read') await new modules.CreatorPosterStore().save(bytes, 'image/png');
    mock.fail(failure);
    const movie = movieService(modules, bytes);
    await assert.rejects(movie.service.execute(publishingRequest(bytes)), /Poster transfer failed before Mux/);
    assert.equal(movie.muxCalls(), 0);
    assert.equal(movie.video().status, 'poster_transfer_failed');
    assert.equal(movie.video().approvalStatus, 'draft');
    if (failure === 'save') assert.equal(mock.objects.size, 0);
    mock.fail('');
    assert.equal((await movie.service.execute(publishingRequest(bytes))).status, 'processing');
    assert.equal(movie.muxCalls(), 1);
  }
});

test('Firebase helper uses only explicit environment or initialized-app bucket settings, never provisions or infers', () => {
  for (const source of ['environment', 'app', 'missing', 'invalid']) {
    let selected;
    const bucket = {};
    const app = { options: source === 'app' ? { storageBucket: 'existing-app.appspot.com' } : {} };
    const admin = {
      initializeApp: (options) => { Object.assign(app.options, options); },
      credential: { cert: () => ({}) }, firestore: () => ({}), auth: () => ({}), app: () => app,
      storage: (value) => { assert.equal(value, app); return { bucket: (name) => { selected = name; return bucket; } }; },
    };
    const env = { FIREBASE_SERVICE_ACCOUNT_JSON: '{}', VERCEL: '1' };
    if (source === 'environment') env.FIREBASE_STORAGE_BUCKET = 'existing-explicit.firebasestorage.app';
    if (source === 'invalid') env.FIREBASE_STORAGE_BUCKET = 'gs://not-a-bucket';
    const helper = loadModule('../src/firebase', { 'firebase-admin': admin }, env);
    if (source === 'invalid') assert.throws(() => helper.getCreatorPosterBucket(), /explicit valid/);
    else if (source === 'missing') assert.equal(helper.getCreatorPosterBucket(), null);
    else assert.equal(helper.getCreatorPosterBucket(), bucket);
    if (source === 'environment') assert.equal(selected, env.FIREBASE_STORAGE_BUCKET);
    if (source === 'app') assert.equal(selected, app.options.storageBucket);
    if (source === 'missing' || source === 'invalid') assert.equal(selected, undefined);
  }
});

test('exactly 10 MiB valid PNG is accepted, resized and saved as one bounded bucket object', async () => {
  const mock = mockBucket();
  const modules = productionModules(mock.bucket);
  const png = await sharp(crypto.randomBytes(1610 * 1610 * 4), {
    raw: { width: 1610, height: 1610, channels: 4 },
  }).png().toBuffer();
  const maximum = 10 * 1024 * 1024;
  const padding = Buffer.alloc(maximum - png.length - 12, 32);
  padding.write('Comment\0', 'ascii');
  const chunk = Buffer.alloc(padding.length + 12);
  chunk.writeUInt32BE(padding.length, 0);
  chunk.write('tEXt', 4, 'ascii');
  padding.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, chunk.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  const input = Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
  assert.equal(input.length, maximum);
  const payload = publishingRequest(input);
  const url = await modules.transferPoster(payload.project.id, payload.project.promotional.poster, {
    origin: 'https://creator.example', secret: 'test-secret', download: async () => input,
  });
  const image = await new modules.CreatorPosterStore().read(url.split('/').at(-1));
  assert.ok(image.bytes.length <= 4 * 1024 * 1024);
  const metadata = await sharp(image.bytes).metadata();
  assert.equal(metadata.width, 1000);
  assert.equal(metadata.height, 1000);
  assert.equal(mock.objects.size, 1);
});

test('global error handler keeps client errors as 4xx and hides server error details', async () => {
  const mock = mockBucket();
  const modules = productionModules(mock.bucket);
  const app = loadModule('../src/app', {
    './routes/auth': (() => { const r = express.Router(); r.post('/echo', (req, res) => res.json(req.body)); r.get('/boom', () => { throw new Error('private detail'); }); return r; })(),
    './routes/videos': express.Router(), './routes/users': express.Router(),
    './adminBot/router': { createAdminBotRouter: express.Router },
    './distributorIngestion/router': { createDistributorIngestionRouter: express.Router },
    './admin/router': { createAdminAssistantRouter: express.Router },
    './ads/router': { createAdsRouter: express.Router },
    './catalog/router': { createCatalogRouter: express.Router },
    './catalog/adminPodcastRouter': { createAdminPodcastRouter: express.Router },
    './live/router': { createLiveRouter: express.Router },
    './live/adminRouter': { createAdminLiveRouter: express.Router },
    './reports/router': { createReportRouters: () => ({ publicRouter: express.Router(), adminRouter: express.Router() }) },
    './integrations/creatorPosterStore': {
      createCreatorPosterRouter: () => modules.createCreatorPosterRouter({ store: new modules.CreatorPosterStore() }),
      createCreatorPosterStorageCheckRouter: express.Router,
      posterNotFound: modules.posterNotFound,
    },
    './integrations/titlePosterUpload': { createTitlePosterRouter: express.Router },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const malformed = await fetch(`${base}/auth/echo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'Invalid request.' });
    const broken = await fetch(`${base}/auth/boom`);
    assert.equal(broken.status, 500);
    assert.equal((await broken.text()).includes('private detail'), false);
  } finally { server.close(); }
});

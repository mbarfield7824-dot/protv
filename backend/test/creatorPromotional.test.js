const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('crypto');
const https = require('https');
const dns = require('dns');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { CreatorPosterStore } = require('../src/integrations/creatorPosterStore');
const {
  validatePromotional, posterSource, publicAddress, publicLookup, downloadPoster, transferPoster,
} = require('../src/integrations/creatorPromotional');

const projectId = '4d7132eb-2a9d-4de0-a455-05467113a97e';
const origin = 'https://creator.example';
const secret = 'publishing-secret';
function poster(bytes = 10, mimeType = 'image/png', expires = String(Math.floor(Date.now() / 1000) + 300)) {
  const assetId = 'poster-1';
  const signature = crypto.createHmac('sha256', secret)
    .update(`${projectId}:${assetId}:poster:${expires}`).digest('hex');
  return {
    assetId, bytes, mimeType,
    sourceUrl: `${origin}/api/integrations/protv/promotional/${projectId}/${assetId}?expires=${expires}&signature=${signature}`,
  };
}

test('signed poster URLs bind HTTPS origin, path, project, asset, purpose, expiry and signature', () => {
  const valid = poster();
  assert.equal(posterSource(projectId, valid, origin, secret).origin, origin);
  assert.ok(posterSource(projectId, poster(10, 'image/png', String(Date.now() + 60_000)), origin, secret));
  for (const sourceUrl of [
    valid.sourceUrl.replace('https:', 'http:'),
    valid.sourceUrl.replace('creator.example', 'evil.example'),
    valid.sourceUrl.replace('creator.example', 'user:password@creator.example'),
    valid.sourceUrl.replace(projectId, 'other-project'),
    valid.sourceUrl.replace('/poster-1?', '/other-asset?'),
    valid.sourceUrl.replace('/promotional/', '/media/'),
    `${valid.sourceUrl}#fragment`,
    `${valid.sourceUrl}&expires=9999999999`,
    `${valid.sourceUrl}&review=true`,
    valid.sourceUrl.replace(/signature=.*/, `signature=${'0'.repeat(64)}`),
    poster(10, 'image/png', '1000000000').sourceUrl,
  ]) {
    assert.throws(() => posterSource(projectId, { ...valid, sourceUrl }, origin, secret));
  }
  assert.throws(() => posterSource(projectId, valid, '', secret));
  assert.throws(() => posterSource(projectId, valid, origin, ''));
  assert.throws(() => posterSource(projectId, valid, origin, 'different-secret'));
});

test('private, link-local, mapped, multicast and reserved network addresses are blocked', async (context) => {
  for (const address of [
    '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1', '169.254.169.254',
    '100.100.1.1', '0.0.0.0', '224.0.0.1', '198.18.0.1', '::1', 'fc00::1',
    'fe80::1', '::ffff:127.0.0.1', '2001:db8::1', '2002:7f00:1::',
  ]) assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  context.mock.method(dns, 'lookup', (host, options, callback) => callback(null, [
    { address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 },
  ]));
  await assert.rejects(new Promise((resolve, reject) => publicLookup('creator.example', {},
    (error, address) => error ? reject(error) : resolve(address))), /public network/);
  await assert.rejects(downloadPoster(new URL('https://127.0.0.1/poster'), poster()), /public/);
});

test('checked DNS result is returned to the connection rather than resolving twice', async (context) => {
  let lookups = 0;
  context.mock.method(dns, 'lookup', (host, options, callback) => {
    lookups += 1;
    callback(null, [{ address: '8.8.8.8', family: 4 }]);
  });
  const result = await new Promise((resolve, reject) => publicLookup('creator.example', { all: true },
    (error, addresses) => error ? reject(error) : resolve(addresses)));
  assert.deepEqual(result, [{ address: '8.8.8.8', family: 4 }]);
  assert.equal(lookups, 1);
});

test('download rejects redirects, response type mismatches and bounded actual byte violations', async (context) => {
  let configuration;
  let requests = 0;
  context.mock.method(https, 'get', (url, options, callback) => {
    requests += 1;
    assert.equal(options.lookup, publicLookup);
    assert.equal(options.agent, false);
    const response = new PassThrough();
    response.statusCode = configuration.status || 200;
    response.headers = configuration.headers || { 'content-type': 'image/png' };
    const request = new EventEmitter();
    setImmediate(() => {
      callback(response);
      if (!response.destroyed) response.end(configuration.bytes || Buffer.alloc(10));
    });
    return request;
  });
  const url = new URL(poster().sourceUrl);
  for (const config of [
    { status: 302, headers: { location: 'https://127.0.0.1/private' } },
    { headers: { 'content-type': 'text/html' } },
    { headers: { 'content-type': 'image/jpeg' } },
    { headers: { 'content-type': 'image/png', 'content-length': '11' } },
    { bytes: Buffer.alloc(11) },
    { bytes: Buffer.alloc(9) },
  ]) {
    configuration = config;
    await assert.rejects(downloadPoster(url, poster()));
  }
  assert.equal(requests, 6);
  configuration = { bytes: Buffer.alloc(10) };
  assert.equal((await downloadPoster(url, poster())).length, 10);
});

test('real PNG and JPEG images are decoded into durable repository poster storage', async () => {
  const storageDirectory = path.resolve(__dirname, `../.data/creator-poster-test-${crypto.randomUUID()}`);
  const storage = new CreatorPosterStore({ bucket: null, serverless: false, storageDirectory, publicBaseUrl: 'https://catalog.example/api' });
  try {
    for (const format of ['png', 'jpeg']) {
      const bytes = await sharp({ create: { width: 8, height: 10, channels: 3, background: '#112233' } })
        .toFormat(format).toBuffer();
      const source = poster(bytes.length, `image/${format}`);
      const url = await transferPoster(projectId, source, { origin, secret, storage, download: async () => bytes });
      assert.match(url, /^https:\/\/catalog\.example\/api\/posters\/creator-[a-f0-9]{64}\.(png|jpg)$/);
      const stored = await fs.readFile(path.join(storageDirectory, new URL(url).pathname.split('/').at(-1)));
      assert.equal((await sharp(stored).metadata()).format, format);
      assert.equal(url.includes('signature'), false);
    }
  } finally {
    await fs.rm(storageDirectory, { recursive: true, force: true });
  }
});

test('invalid, corrupt, wrong-format and oversized image transfers fail closed at Creator limits', async () => {
  const png = await sharp({ create: { width: 8, height: 10, channels: 3, background: '#112233' } }).png().toBuffer();
  const storage = { durableFileStorage: true };
  for (const [bytes, mimeType, declared] of [
    [Buffer.from('<html>fake</html>'), 'image/png'],
    [png, 'image/jpeg'],
    [png.subarray(0, png.length - 20), 'image/png'],
    [png, 'image/png', png.length - 1],
  ]) {
    await assert.rejects(transferPoster(projectId, poster(declared || bytes.length, mimeType), {
      origin, secret, storage, download: async () => bytes,
    }));
  }
  assert.throws(() => validatePromotional({ poster: poster(10 * 1024 * 1024 + 1) }), /10 MiB/);
  assert.doesNotThrow(() => validatePromotional({ credits: 'a'.repeat(5000), poster: poster(10 * 1024 * 1024) }));
  assert.throws(() => validatePromotional({ credits: 'a'.repeat(5001) }), /5000/);
});

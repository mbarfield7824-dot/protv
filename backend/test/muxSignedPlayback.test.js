const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

function mockEnv(context, name, value) {
  const previous = process.env[name];
  process.env[name] = value;
  context.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test('scheduled and trailer Mux uploads use signed-only playback and signed tokens verify', async (context) => {
  const { mux, createDirectUpload, createAssetFromUrl, getPlaybackId, signPlayback } = require('../src/mux');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  mockEnv(context, 'MUX_SIGNING_KEY_ID', 'test-key-id');
  mockEnv(context, 'MUX_SIGNING_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString('base64'));

  const uploads = [];
  context.mock.method(mux.video.uploads, 'create', async (settings) => {
    uploads.push(settings);
    return { id: 'upload-id', url: 'https://mux.example/upload' };
  });
  await createDirectUpload('https://watchprotv.com', { playbackPolicy: 'signed' });
  assert.deepEqual(uploads[0].new_asset_settings.playback_policies, ['signed']);

  const assets = [];
  context.mock.method(mux.video.assets, 'create', async (settings) => {
    assets.push(settings);
    return { id: 'asset-id' };
  });
  await createAssetFromUrl('https://media.example/movie.mp4', { playbackPolicy: 'signed' });
  assert.deepEqual(assets[0].playback_policies, ['signed']);
  assert.equal(getPlaybackId({
    playback_ids: [
      { policy: 'public', id: 'public-id' },
      { policy: 'signed', id: 'signed-id' },
    ],
  }, 'signed'), 'signed-id');

  const token = await signPlayback('signed-id', 7200);
  const [header, body, signature] = token.split('.');
  assert.equal(JSON.parse(Buffer.from(body, 'base64url')).sub, 'signed-id');
  assert.equal(crypto.verify(
    'RSA-SHA256', Buffer.from(`${header}.${body}`), publicKey, Buffer.from(signature, 'base64url'),
  ), true);
});

test('signed Mux uploads fail closed when signing credentials are missing', async (context) => {
  const { createDirectUpload, createAssetFromUrl } = require('../src/mux');
  mockEnv(context, 'MUX_SIGNING_KEY_ID', '');
  mockEnv(context, 'MUX_SIGNING_PRIVATE_KEY', '');
  await assert.rejects(createDirectUpload('https://watchprotv.com', { playbackPolicy: 'signed' }), /requires MUX_SIGNING/);
  await assert.rejects(createAssetFromUrl('https://media.example/movie.mp4', { playbackPolicy: 'signed' }), /requires MUX_SIGNING/);
});

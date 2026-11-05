const Mux = require('@mux/mux-node');
const fs = require('fs');
const fsPromises = require('fs/promises');

// Mux client for creating direct uploads and assets, and verifying webhooks.
// Requires MUX_ACCESS_TOKEN / MUX_SECRET_KEY in the environment (.env).
const mux = new Mux({
  tokenId: process.env.MUX_ACCESS_TOKEN,
  tokenSecret: process.env.MUX_SECRET_KEY,
});

/**
 * Creates a Mux direct upload URL. The frontend PUTs the raw video file bytes
 * straight to this URL (never touching our server), then we poll/webhook for
 * the resulting asset + playback ID.
 */
async function createDirectUpload(corsOrigin, { playbackPolicy = 'public' } = {}) {
  if (!['public', 'signed'].includes(playbackPolicy)) {
    throw new Error('Mux playback policy must be public or signed.');
  }
  if (playbackPolicy === 'signed') requirePlaybackSigning();
  const upload = await mux.video.uploads.create({
    cors_origin: corsOrigin || '*',
    new_asset_settings: {
      playback_policies: [playbackPolicy],
      video_quality: 'basic',
    },
  });
  return upload; // { id, url, ... }
}

/** Looks up an upload by ID to find its resulting asset once it's done. */
async function getUpload(uploadId) {
  return mux.video.uploads.retrieve(uploadId);
}

/**
 * Creates a Mux asset directly from a publicly reachable video URL
 * (e.g. an existing S3/GCS/CDN link) — no file upload needed.
 */
async function createAssetFromUrl(inputUrl, { playbackPolicy = 'public' } = {}) {
  if (!['public', 'signed'].includes(playbackPolicy)) {
    throw new Error('Mux playback policy must be public or signed.');
  }
  if (playbackPolicy === 'signed') requirePlaybackSigning();
  const asset = await mux.video.assets.create({
    inputs: [{ url: inputUrl }],
    playback_policies: [playbackPolicy],
    video_quality: 'basic',
  });
  return asset;
}

// No playback policy means no playback ID: the asset cannot be streamed until one is added.
async function createPrivateAssetFromUrl(inputUrl, { passthrough } = {}) {
  return mux.video.assets.create({
    inputs: [{ url: inputUrl }],
    video_quality: 'basic',
    ...(passthrough ? { passthrough } : {}),
  });
}

async function addPublicPlaybackId(assetId) {
  return mux.video.assets.createPlaybackId(assetId, { policy: 'public' });
}

async function deletePlaybackId(assetId, playbackId) {
  return mux.video.assets.deletePlaybackId(assetId, playbackId);
}

async function deleteAsset(assetId) {
  return mux.video.assets.delete(assetId);
}

async function getAsset(assetId) {
  return mux.video.assets.retrieve(assetId);
}

async function uploadLocalFile(filePath, corsOrigin) {
  const upload = await createDirectUpload(corsOrigin);
  const file = await fsPromises.stat(filePath);
  const response = await fetch(upload.url, {
    method: 'PUT',
    headers: {
      'Content-Length': String(file.size),
      'Content-Type': 'application/octet-stream',
    },
    body: fs.createReadStream(filePath),
    duplex: 'half',
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!response.ok) {
    throw new Error(`Mux upload failed (${response.status}).`);
  }
  return upload;
}

async function waitForAssetReady({ uploadId, assetId, timeoutMs = 15 * 60 * 1000, pollMs = 5000 }) {
  const deadline = Date.now() + timeoutMs;
  let currentAssetId = assetId || null;
  while (Date.now() < deadline) {
    if (!currentAssetId && uploadId) {
      const upload = await getUpload(uploadId);
      currentAssetId = upload.asset_id || null;
      if (upload.status === 'errored' || upload.status === 'cancelled') {
        throw new Error('Mux could not accept the video upload.');
      }
    }
    if (currentAssetId) {
      const asset = await getAsset(currentAssetId);
      if (asset.status === 'ready') return asset;
      if (asset.status === 'errored') throw new Error('Mux could not transcode the video.');
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error('Mux is still processing the movie. Run the Admin Bot again to resume publishing.');
}

/** Extracts the public playback ID from a Mux asset object, if ready. */
function getPlaybackId(asset, policy = 'public') {
  const playbackIds = asset?.playback_ids || [];
  return playbackIds.find((playback) => playback.policy === policy)?.id || null;
}

function requirePlaybackSigning() {
  if (!process.env.MUX_SIGNING_KEY_ID || !process.env.MUX_SIGNING_PRIVATE_KEY) {
    throw new Error('Signed playback requires MUX_SIGNING_KEY_ID and MUX_SIGNING_PRIVATE_KEY.');
  }
}

async function signPlayback(playbackId, duration = 0) {
  requirePlaybackSigning();
  return mux.jwt.signPlaybackId(playbackId, {
    keyId: process.env.MUX_SIGNING_KEY_ID,
    keySecret: process.env.MUX_SIGNING_PRIVATE_KEY,
    type: 'video',
    expiration: `${Math.max(3600, Math.ceil(Number(duration) || 0) + 900)}s`,
  });
}


// Creator intake: a direct upload whose asset has NO playback ID, so nothing can be played until release adds one.
// The passthrough binds the asset to the Creator Portal project, slot and upload session that requested it.
async function createIntakeUpload(corsOrigin, { passthrough, timeoutSeconds = 24 * 60 * 60, test = false }) {
  if (!corsOrigin || !/^https?:\/\/[^/]+$/.test(corsOrigin)) throw new Error('A Creator Portal origin is required for intake uploads.');
  if (typeof passthrough !== 'string' || !passthrough.startsWith('intake:') || passthrough.length > 255) {
    throw new Error('A valid intake passthrough is required.');
  }
  return mux.video.uploads.create({
    cors_origin: corsOrigin,
    timeout: Math.max(3600, Math.min(7 * 24 * 60 * 60, Math.floor(timeoutSeconds))),
    ...(test ? { test: true } : {}),
    new_asset_settings: { video_quality: 'basic', passthrough },
  });
}

async function cancelUpload(uploadId) {
  return mux.video.uploads.cancel(uploadId);
}

async function addSignedPlaybackId(assetId) {
  requirePlaybackSigning();
  return mux.video.assets.createPlaybackId(assetId, { policy: 'signed' });
}

/** Verifies an incoming Mux webhook request signature. */
async function verifyWebhook(rawBody, headers) {
  if (!process.env.MUX_WEBHOOK_SECRET) {
    throw new Error('Mux webhook verification is not configured.');
  }
  await mux.webhooks.verifySignature(rawBody, headers, process.env.MUX_WEBHOOK_SECRET);
}

module.exports = {
  mux,
  mux,
  createDirectUpload,
  createIntakeUpload,
  cancelUpload,
  addSignedPlaybackId,
  getUpload,
  createAssetFromUrl,
  createPrivateAssetFromUrl,
  addPublicPlaybackId,
  deletePlaybackId,
  deleteAsset,
  getAsset,
  getPlaybackId,
  requirePlaybackSigning,
  signPlayback,
  uploadLocalFile,
  waitForAssetReady,
  verifyWebhook,
};

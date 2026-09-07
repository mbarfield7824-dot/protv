const Mux = require('@mux/mux-node');

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
async function createDirectUpload(corsOrigin) {
  const upload = await mux.video.uploads.create({
    cors_origin: corsOrigin || '*',
    new_asset_settings: {
      playback_policies: ['public'],
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
async function createAssetFromUrl(inputUrl) {
  const asset = await mux.video.assets.create({
    inputs: [{ url: inputUrl }],
    playback_policies: ['public'],
    video_quality: 'basic',
  });
  return asset;
}

async function getAsset(assetId) {
  return mux.video.assets.retrieve(assetId);
}

/** Extracts the public playback ID from a Mux asset object, if ready. */
function getPlaybackId(asset) {
  const playbackIds = asset?.playback_ids || [];
  const publicId = playbackIds.find((p) => p.policy === 'public');
  return publicId?.id || null;
}

/** Verifies an incoming Mux webhook request signature. */
async function verifyWebhook(rawBody, headers) {
  await mux.webhooks.verifySignature(rawBody, headers, process.env.MUX_WEBHOOK_SECRET);
}

module.exports = {
  mux,
  createDirectUpload,
  getUpload,
  createAssetFromUrl,
  getAsset,
  getPlaybackId,
  verifyWebhook,
};

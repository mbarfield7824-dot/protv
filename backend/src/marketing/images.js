// Marketing Studio image library: App Store / Google Play badges, app screenshots, partner and sponsor logos used as
// image layers in commercials. Images are re-encoded on upload (no metadata, bounded size) and stored in Firestore
// with the rest of the Studio's records. The render worker and the Admin preview fetch them through short-lived signed
// links (HMAC with the shared publishing secret, domain-separated), so no image is publicly listed.
const crypto = require('node:crypto');

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_STORED_BYTES = 700 * 1024; // keeps a Firestore document under its 1 MiB limit after base64
const MAX_SIDE = 2000;
const KINDS = ['badge', 'screenshot', 'logo', 'photo', 'other'];

class ImageError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

// Re-encodes an uploaded PNG/JPEG/WebP: PNG when it has transparency (badges, logos), otherwise JPEG.
async function normalizeImage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new ImageError('The image is empty.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ImageError('Images are limited to 3 MB. The Studio shrinks large images before uploading.');
  const sharp = require('sharp');
  let metadata;
  try { metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata(); } catch { throw new ImageError('That file is not a readable image.'); }
  if (!['png', 'jpeg', 'webp'].includes(metadata.format)) throw new ImageError('Use a PNG, JPEG or WebP image.');
  const alpha = Boolean(metadata.hasAlpha);
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const pipeline = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true });
    const output = alpha ? await pipeline.png({ compressionLevel: 9, palette: attempt > 1 }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: Math.max(60, 88 - attempt * 6), mozjpeg: true }).toBuffer({ resolveWithObject: true });
    if (output.data.length <= MAX_STORED_BYTES) {
      return { bytes: output.data, mime: alpha ? 'image/png' : 'image/jpeg', width: output.info.width, height: output.info.height };
    }
    side = Math.round(side * 0.8);
  }
  throw new ImageError('The image is too detailed to store; crop it or use a simpler version.');
}

const extension = (mime) => (mime === 'image/png' ? 'png' : 'jpg');
function imageSignature(secret, id, expires) {
  return crypto.createHmac('sha256', secret).update(`protv-marketing-image-v1\n${id}\n${expires}`).digest('hex');
}
function imageUrl({ id, mime }, { secret, base = 'https://watchprotv.com', now = Date.now(), ttlMs = 6 * 3600_000 } = {}) {
  if (!secret) throw new ImageError('Image links need the publishing secret (PROTV_PUBLISHING_SECRET).', 503);
  const expires = now + ttlMs;
  return `${base.replace(/\/+$/, '')}/api/marketing/images/${encodeURIComponent(id)}.${extension(mime)}?expires=${expires}&signature=${imageSignature(secret, id, expires)}`;
}
function verifyImageRequest({ id, expires, signature }, { secret, now = Date.now() }) {
  if (!secret || !/^mi_[a-f0-9]{20}$/.test(id) || !/^\d{13}$/.test(String(expires)) || Number(expires) < now || !/^[0-9a-f]{64}$/.test(String(signature))) return false;
  const expected = imageSignature(secret, id, expires);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
}

module.exports = { MAX_UPLOAD_BYTES, KINDS, ImageError, normalizeImage, imageUrl, imageSignature, verifyImageRequest, extension };

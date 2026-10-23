const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const { PosterService } = require('../adminBot/posterService');

const MAX_STORED_POSTER_BYTES = 4 * 1024 * 1024;
const POSTER_PREFIX = 'creator-posters/';
// Creator Studio transfers use creator-*; Administrator uploads use title-*.
const PREFIXES = { creator: POSTER_PREFIX, title: 'title-posters/' };
const FILE_NAME = /^(creator|title)-([a-f0-9]{64})\.(png|jpg)$/;

async function validateStoredImage(bytes, mimeType) {
  const image = require('sharp')(bytes, { failOn: 'warning', limitInputPixels: 1_000_000 });
  const metadata = await image.metadata();
  if (metadata.format !== (mimeType === 'image/png' ? 'png' : 'jpeg') || (metadata.pages || 1) !== 1
    || metadata.width > 1000 || metadata.height > 1000) throw new Error('Stored poster image type or dimensions are invalid.');
  await image.raw().toBuffer();
}

class CreatorPosterStore {
  constructor({
    bucket = require('../firebase').getCreatorPosterBucket(),
    serverless = Boolean(process.env.VERCEL),
    storageDirectory = path.resolve(process.env.PD_POSTER_DIRECTORY || path.join(__dirname, '../../.data/posters')),
    publicBaseUrl = serverless ? 'https://watchprotv.com/api' : process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
  } = {}) {
    this.bucket = bucket;
    this.local = !serverless && process.env.NODE_ENV !== 'production';
    this.storageDirectory = storageDirectory;
    this.urls = new PosterService({ publicBaseUrl });
  }

  assertAvailable() {
    if (!this.bucket && !this.local) throw new Error('Explicit Firebase Storage poster bucket is not configured.');
  }

  async save(bytes, mimeType, kind = 'creator') {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_STORED_POSTER_BYTES
      || !['image/png', 'image/jpeg'].includes(mimeType) || !Object.hasOwn(PREFIXES, kind)) {
      throw new Error('Invalid durable poster bytes or type.');
    }
    await validateStoredImage(bytes, mimeType);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const fileName = `${kind}-${hash}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
    this.assertAvailable();
    if (this.bucket) {
      if (await this.read(fileName)) return this.urls.publicUrl(fileName);
      const file = this.bucket.file(`${PREFIXES[kind]}${fileName}`);
      try {
        await file.save(bytes, {
          resumable: false, validation: 'crc32c',
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType: mimeType, cacheControl: 'public, max-age=31536000, immutable',
            metadata: { sha256: hash },
          },
        });
      } catch (error) {
        if (Number(error.code) !== 412) throw error;
        // A concurrent create won; never overwrite it, and verify its bytes before reuse.
      }
      const stored = await this.read(fileName);
      if (!stored || !stored.bytes.equals(bytes)) throw new Error('Stored poster verification failed.');
    } else {
      if (!this.local) throw new Error('Persistent Creator poster storage is unavailable.');
      await fs.mkdir(this.storageDirectory, { recursive: true });
      await fs.writeFile(path.join(this.storageDirectory, fileName), bytes);
    }
    return this.urls.publicUrl(fileName);
  }

  async read(fileName) {
    const match = FILE_NAME.exec(fileName);
    if (!match) return null;
    if (!this.bucket) {
      if (!this.local) throw new Error('Persistent Creator poster storage is unavailable.');
      return null; // The existing local express.static poster route handles development files.
    }
    const [, kind, hash, extension] = match;
    const objectName = `${PREFIXES[kind]}${fileName}`;
    const file = this.bucket.file(objectName);
    let metadata;
    try { [metadata] = await file.getMetadata(); } catch (error) {
      if (Number(error.code) === 404) return null;
      throw error;
    }
    const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
    const size = Number(metadata.size);
    if (metadata.contentType !== mimeType || metadata.metadata?.sha256 !== hash
      || !/^\d+$/.test(String(metadata.size)) || !Number.isSafeInteger(size) || size <= 0
      || size > MAX_STORED_POSTER_BYTES || !/^\d+$/.test(String(metadata.generation))) {
      throw new Error('Stored poster metadata is invalid.');
    }
    const stream = this.bucket.file(objectName, { generation: metadata.generation })
      .createReadStream({ validation: 'crc32c', decompress: false });
    const timer = setTimeout(() => stream.destroy(new Error('Poster storage read timed out.')), 30_000);
    const chunks = [];
    let actual = 0;
    try {
      for await (const chunk of stream) {
        actual += chunk.length;
        if (actual > size || actual > MAX_STORED_POSTER_BYTES) {
          stream.destroy();
          throw new Error('Stored poster exceeded its byte limit.');
        }
        chunks.push(chunk);
      }
    } finally { clearTimeout(timer); }
    if (actual !== size) throw new Error('Stored poster byte count is invalid.');
    const bytes = Buffer.concat(chunks, size);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== hash) {
      throw new Error('Stored poster integrity check failed.');
    }
    await validateStoredImage(bytes, mimeType);
    return { bytes, mimeType };
  }
}

function posterNotFound(response) {
  return response.status(404).set('Cache-Control', 'no-store').json({ error: 'Poster not found.' });
}

function createCreatorPosterRouter({ store } = {}) {
  const router = express.Router();
  router.get('/:fileName', async (request, response, next) => {
    if (!FILE_NAME.test(request.params.fileName)) return next();
    try {
      const current = store || new CreatorPosterStore();
      const image = await current.read(request.params.fileName);
      if (!image) return current.local ? next() : posterNotFound(response);
      return response.set({
        'Content-Type': image.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      }).send(image.bytes);
    } catch {
      return response.status(503).set('Cache-Control', 'no-store').json({ error: 'Poster storage is temporarily unavailable.' });
    }
  });
  return router;
}

function createCreatorPosterStorageCheckRouter({
  store,
  verifyAdmin = require('../middleware/auth').verifyAdmin,
} = {}) {
  const router = express.Router();
  router.post('/storage-check', verifyAdmin, async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!request.is('application/json') || !request.body || Array.isArray(request.body)
      || typeof request.body !== 'object' || Object.keys(request.body).length) {
      return response.status(400).json({ error: 'Use an empty JSON object; only the fixed synthetic poster may be tested.' });
    }
    try {
      const current = store || new CreatorPosterStore();
      if (!current.bucket) throw new Error('An explicit Firebase Storage bucket is required for this check.');
      const bytes = await require('sharp')({
        create: { width: 16, height: 24, channels: 3, background: '#174b62' },
      }).png().toBuffer();
      const posterUrl = await current.save(bytes, 'image/png');
      const fileName = new URL(posterUrl).pathname.split('/').pop();
      const image = await current.read(fileName);
      if (!image || image.mimeType !== 'image/png' || !image.bytes.equals(bytes)) {
        throw new Error('Synthetic poster round trip verification failed.');
      }
      console.info('[Creator poster storage check]', { actorId: request.user.uid, status: 'passed' });
      return response.json({
        status: 'passed',
        synthetic: true,
        posterUrl,
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        catalogChanged: false,
        publishingStarted: false,
      });
    } catch (error) {
      console.error('[Creator poster storage check]', {
        actorId: request.user.uid,
        status: 'failed',
        code: Number.isInteger(Number(error.code)) ? Number(error.code) : 'STORAGE_CHECK_FAILED',
      });
      return response.status(503).json({ error: 'Private poster storage verification failed. Check service-account configuration and bucket access; no publishing was started.' });
    }
  });
  return router;
}

module.exports = {
  CreatorPosterStore, createCreatorPosterRouter, createCreatorPosterStorageCheckRouter,
  posterNotFound, MAX_STORED_POSTER_BYTES, POSTER_PREFIX,
};

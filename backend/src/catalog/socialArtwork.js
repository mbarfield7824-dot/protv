const https = require('node:https');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const { publicLookup, publicAddress } = require('../integrations/creatorPromotional');
const { getApprovedVideos } = require('../firebase');
const { publicArtworkUrl, artworkCandidates, previewContent } = require('./socialMetadata');

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function downloadArtwork(source) {
  const safe = publicArtworkUrl(source);
  if (!safe) return Promise.reject(new Error('Artwork must be a public HTTPS image without access credentials.'));
  const url = new URL(safe);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname) && !publicAddress(hostname)) {
    return Promise.reject(new Error('Artwork host must be public.'));
  }
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      lookup: publicLookup, agent: false, signal: AbortSignal.timeout(8000),
      headers: { Accept: [...TYPES].join(', '), 'User-Agent': 'PROtv-Social-Artwork/1.0' },
    }, response => {
      const fail = message => { response.destroy(); reject(new Error(message)); };
      const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (response.statusCode !== 200 || !TYPES.has(type)) return fail('Artwork must return HTTP 200 and an image MIME type; redirects are not allowed.');
      const declared = response.headers['content-length'];
      if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) {
        return fail('Artwork exceeds its byte limit.');
      }
      const chunks = [];
      let size = 0;
      response.on('error', () => reject(new Error('Artwork download was interrupted.')));
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BYTES) return fail('Artwork exceeds its byte limit.');
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (!size || (declared !== undefined && size !== Number(declared))) return reject(new Error('Artwork byte count is invalid.'));
        return resolve({ bytes: Buffer.concat(chunks, size), type });
      });
    });
    request.on('error', () => reject(new Error('Artwork download failed or timed out.')));
  });
}

// Outlined lettering avoids missing system fonts in serverless image rendering.
const FALLBACK = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#071326"/><stop offset="1" stop-color="#153f79"/></linearGradient>
<linearGradient id="fire" x2="0" y2="1"><stop stop-color="#79caff"/><stop offset="1" stop-color="#2587ff"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#bg)"/><circle cx="1090" cy="20" r="310" fill="#2587ff" opacity=".12"/>
<rect x="48" y="48" width="1104" height="534" rx="28" fill="none" stroke="#458bd1" stroke-opacity=".4" stroke-width="2"/>
<path d="M150 420V210H227Q292 210 292 273Q292 337 227 337H190V420ZM190 250V298H226Q252 298 252 274Q252 250 226 250Z
M322 420V210H398Q464 210 464 271Q464 309 432 326L480 420H433L390 335H362V420ZM362 250V297H397Q424 297 424 273Q424 250 397 250Z
M589 205Q682 205 682 315Q682 425 589 425Q496 425 496 315Q496 205 589 205ZM589 245Q538 245 538 315Q538 385 589 385Q640 385 640 315Q640 245 589 245Z
M716 226H754V270H791V307H754V365Q754 385 775 385H794V420H774Q716 420 716 367V307H696V270H716Z
M810 270H852L886 369L920 270H962L906 420H867Z" fill="white" fill-rule="evenodd"/>
<path d="M1030 361C995 323 1038 302 1047 272C1072 293 1078 309 1071 323C1090 312 1094 297 1092 286C1124 326 1115 369 1080 381C1082 355 1060 354 1059 334C1043 344 1038 355 1045 374Z" fill="url(#fire)"/>
<rect x="150" y="465" width="190" height="7" rx="3" fill="#57b5ff"/>
<path d="M997 462L1029 480L997 498Z" fill="#79caff"/>
</svg>`);

async function renderFallback(format = 'jpeg') {
  return sharp(FALLBACK).toFormat(format, format === 'jpeg' ? { quality: 88 } : {}).toBuffer();
}

async function renderArtwork(bytes, type) {
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 40_000_000 }).rotate();
  const info = await image.metadata();
  const formats = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
  if (info.format !== formats[type] || (info.pages || 1) !== 1 || !info.width || !info.height) {
    throw new Error('Artwork is not a valid static image of its declared type.');
  }
  const foreground = await image.clone().resize(WIDTH - 60, HEIGHT - 60, {
    fit: 'inside',
  }).png().toBuffer({ resolveWithObject: true });
  const background = await image.clone().resize(WIDTH, HEIGHT, { fit: 'cover' })
    .blur(24).modulate({ brightness: 0.35 }).toBuffer();
  return sharp(background).composite([{
    input: foreground.data,
    left: Math.floor((WIDTH - foreground.info.width) / 2),
    top: Math.floor((HEIGHT - foreground.info.height) / 2),
  }]).flatten({ background: '#071326' }).jpeg({ quality: 88 }).toBuffer();
}

function createSocialArtworkRouter({
  loadApproved = getApprovedVideos, download = downloadArtwork,
  readFeatured = () => fs.readFile(path.resolve(__dirname, '../../../frontend/src/assets/me-and-my-white-friend-banner.png')),
} = {}) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' });
    next();
  });
  const send = (res, bytes, fallback) => res.set('X-PROtv-Artwork', fallback ? 'branded-fallback' : 'approved').type('jpeg').send(bytes);
  router.get('/artwork/brand', async (_req, res, next) => {
    try { return send(res, await renderFallback(), true); } catch (error) { return next(error); }
  });
  router.get('/artwork/featured', async (_req, res, next) => {
    try { return send(res, await renderArtwork(await readFeatured(), 'image/png'), false); } catch (error) { return next(error); }
  });
  router.get('/artwork/:kind/:id', async (req, res, next) => {
    if (!['title', 'series', 'podcast'].includes(req.params.kind)
      || !/^[A-Za-z0-9_-]{1,200}$/.test(req.params.id)) return res.status(404).end();
    try {
      // Recheck publication even for an old, versioned image URL after a title is withdrawn.
      const content = previewContent(await loadApproved(), req.params.kind, req.params.id);
      if (!content) return res.status(404).set('X-Robots-Tag', 'noindex').end();
      const candidates = artworkCandidates(content).slice(0, 3);
      for (const source of candidates) {
        try {
          const image = source === 'https://watchprotv.com/api/short-links/artwork/mmwf'
            ? { bytes: await readFeatured(), type: 'image/png' } : await download(source);
          return send(res, await renderArtwork(image.bytes, image.type), false);
        } catch (error) {
          // A broken approved source is visible in logs, but does not create a broken card.
          console.warn('Approved social artwork unavailable:', { kind: req.params.kind, id: req.params.id, message: error.message });
        }
      }
      console.warn('Using branded social artwork fallback:', { kind: req.params.kind, id: req.params.id, candidates: candidates.length });
      return send(res, await renderFallback(), true);
    } catch (error) { return next(error); }
  });
  router.use((error, _req, res, _next) => {
    console.error('Social artwork unavailable:', error.message);
    return res.status(503).set('X-Robots-Tag', 'noindex').type('text').send('Social artwork is temporarily unavailable.');
  });
  return router;
}

module.exports = { createSocialArtworkRouter, downloadArtwork, renderArtwork, renderFallback, WIDTH, HEIGHT };

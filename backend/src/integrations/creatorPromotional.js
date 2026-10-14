const crypto = require('crypto');
const https = require('https');
const dns = require('dns');
const net = require('net');
const sharp = require('sharp');
const { CreatorPosterStore, MAX_STORED_POSTER_BYTES } = require('./creatorPosterStore');

const MAX_POSTER_BYTES = 10 * 1024 * 1024;
const MAX_CREDITS_LENGTH = 5000;
const ASSET_ID = /^[a-zA-Z0-9_-]{1,200}$/;

function validatePromotional(value) {
  if (value === undefined || value === null || value === '') return { credits: '' };
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Promotional details must be an object.');
  const credits = value.credits ?? '';
  if (typeof credits !== 'string' || credits.length > MAX_CREDITS_LENGTH) {
    throw new Error(`Promotional credits must be a string of at most ${MAX_CREDITS_LENGTH} characters.`);
  }
  const poster = value.poster;
  if (poster === undefined || poster === null || poster === '') return { credits };
  if (typeof poster !== 'object' || Array.isArray(poster)
    || !ASSET_ID.test(poster.assetId || '') || typeof poster.assetId !== 'string'
    || !['image/png', 'image/jpeg'].includes(poster.mimeType)
    || !Number.isSafeInteger(poster.bytes) || poster.bytes <= 0 || poster.bytes > MAX_POSTER_BYTES
    || typeof poster.sourceUrl !== 'string' || poster.sourceUrl.length > 4000) {
    throw new Error('Promotional poster requires an asset ID, PNG/JPEG type, source URL and positive byte size up to 10 MiB.');
  }
  return { credits, poster };
}

function posterSource(projectId, poster, origin, secret, now = Date.now()) {
  if (!origin || !secret) throw new Error('Creator Agent poster origin and publishing secret must be configured.');
  let url;
  let allowed;
  try { url = new URL(poster.sourceUrl); allowed = new URL(origin); } catch {
    throw new Error('Invalid Creator Agent poster URL.');
  }
  if (allowed.protocol !== 'https:' || url.protocol !== 'https:' || url.origin !== allowed.origin
    || url.username || url.password || url.hash
    || url.pathname !== `/api/integrations/protv/promotional/${projectId}/${poster.assetId}`
    || [...url.searchParams.keys()].some((key) => !['expires', 'signature'].includes(key))
    || url.searchParams.getAll('expires').length !== 1 || url.searchParams.getAll('signature').length !== 1) {
    throw new Error('Poster URL must match the protected Creator Agent project and asset.');
  }
  const expires = url.searchParams.get('expires');
  const signature = url.searchParams.get('signature') || '';
  if (!/^(?:\d{10}|\d{13})$/.test(expires || '')) throw new Error('Poster URL expiry is invalid.');
  const expiry = Number(expires);
  // Accept Unix seconds or milliseconds; preserve the exact signed representation.
  if ((expires.length === 10 ? expiry * 1000 : expiry) <= now) throw new Error('Poster URL has expired.');
  const expected = crypto.createHmac('sha256', secret)
    .update(`${projectId}:${poster.assetId}:poster:${expires}`).digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(signature)
    || !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('Poster URL signature is invalid.');
  }
  return url;
}

const blocked = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
]) blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('3fff::', 20, 'ipv6');

function publicAddress(address) {
  const family = net.isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
      return callback(new Error('Poster host must resolve only to public network addresses.'));
    }
    const selected = addresses.filter((entry) => !options.family || entry.family === options.family);
    if (!selected.length) return callback(new Error('Poster host has no supported public address.'));
    return options.all ? callback(null, selected) : callback(null, selected[0].address, selected[0].family);
  });
}

function downloadPoster(url, poster) {
  // Pin the checked DNS result to the TLS connection. Native HTTPS does not follow redirects.
  return new Promise((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(hostname) && !publicAddress(hostname)) {
      reject(new Error('Poster host must be public.'));
      return;
    }
    const request = https.get(url, {
      lookup: publicLookup, agent: false, signal: AbortSignal.timeout(30_000),
      headers: { Accept: poster.mimeType },
    }, (response) => {
      const fail = (message) => { response.destroy(); reject(new Error(message)); };
      if (response.statusCode !== 200) return fail('Poster download failed; redirects are not allowed.');
      if ((response.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== poster.mimeType) {
        return fail('Poster response type does not match the declared image type.');
      }
      const length = response.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) !== poster.bytes)) {
        return fail('Poster response size does not match the declared bytes.');
      }
      const chunks = [];
      let size = 0;
      response.on('error', () => reject(new Error('Poster download was interrupted.')));
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > poster.bytes || size > MAX_POSTER_BYTES) return fail('Poster exceeded the permitted byte size.');
        chunks.push(chunk);
      });
      response.on('end', () => size === poster.bytes
        ? resolve(Buffer.concat(chunks, size)) : reject(new Error('Poster bytes do not match the declared size.')));
    });
    request.on('error', () => reject(new Error('Poster download failed or timed out.')));
  });
}

async function transferPoster(projectId, poster, {
  origin, secret, download = downloadPoster,
  storage = new CreatorPosterStore(),
} = {}) {
  const url = posterSource(projectId, poster, origin, secret);
  if (typeof storage.assertAvailable === 'function') storage.assertAvailable();
  const bytes = await download(url, poster);
  if (!Buffer.isBuffer(bytes) || bytes.length !== poster.bytes || bytes.length > MAX_POSTER_BYTES) {
    throw new Error('Poster bytes do not match the declared size.');
  }
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  const format = poster.mimeType === 'image/png' ? 'png' : 'jpeg';
  if (metadata.format !== format || (metadata.pages || 1) !== 1) throw new Error('Poster is not the declared static image format.');
  // Full decode and re-encode rejects corrupt images and strips embedded metadata.
  // Bound the public response below Vercel's payload limit, including worst-case RGBA PNGs.
  const clean = await image.resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .toFormat(format).toBuffer();
  if (clean.length > MAX_STORED_POSTER_BYTES) throw new Error('Decoded poster exceeds the storage limit.');
  return storage.save(clean, poster.mimeType);
}

function promotionalBinding({ credits, poster }) {
  return crypto.createHash('sha256').update(JSON.stringify({
    credits, poster: poster ? { assetId: poster.assetId, mimeType: poster.mimeType, bytes: poster.bytes } : null,
  })).digest('hex');
}

function transferMatches(video, expected) {
  return Boolean(video && video.approvalStatus === 'draft' && !video.muxAssetId
    && video.status === expected.status && video.posterTransferToken === expected.posterTransferToken);
}

module.exports = {
  validatePromotional, posterSource, publicAddress, publicLookup, downloadPoster, transferPoster,
  promotionalBinding, transferMatches, MAX_POSTER_BYTES,
};

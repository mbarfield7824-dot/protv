const { isIP } = require('node:net');

const SHARED_VERCEL_ADDRESS = 'vercel-shared-client';
const HEADER = 'x-vercel-forwarded-for';

function canonicalAddress(value) {
  if (typeof value !== 'string' || value.includes('%')) return null;
  const address = value.trim();
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function reportingClientAddress(req, vercel = process.env.VERCEL === '1') {
  if (!vercel) return canonicalAddress(req.socket?.remoteAddress) || 'unknown';
  const value = req.headers?.[HEADER];
  if (Array.isArray(value)) return SHARED_VERCEL_ADDRESS;
  // Node can discard or join duplicate headers; inspect raw occurrences as well.
  if (Array.isArray(req.rawHeaders)) {
    let occurrences = 0;
    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      if (String(req.rawHeaders[index]).toLowerCase() === HEADER) occurrences += 1;
    }
    if (occurrences !== 1) return SHARED_VERCEL_ADDRESS;
  }
  return canonicalAddress(value) || SHARED_VERCEL_ADDRESS;
}

module.exports = { reportingClientAddress };

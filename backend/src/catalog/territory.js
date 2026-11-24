// Viewer territory for rights that are limited by country (DEVELOPMENT; see docs/samsung-us-territory-2026-11-23.md).
//
// Deny by default: a request has a country only when Vercel's edge geolocated it to a real ISO country. A missing or
// malformed header, the anonymizer / unknown codes some geolocation databases use, and a TV whose own reported region
// disagrees with its network location (a common VPN or proxy sign) all count as "unknown", and unknown never unlocks a
// country-limited title. Vercel sets x-vercel-ip-country at its edge; a client cannot supply it.

const NOT_A_COUNTRY = new Set(['XX', 'ZZ', 'T1', 'A1', 'A2', 'AP', 'EU', 'O1']);
const UNKNOWN = Object.freeze({ country: null, reason: 'unknown' });

function code(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(text) ? text : '';
}

function requestTerritory(req) {
  if (!req || typeof req.get !== 'function') return UNKNOWN;
  const country = code(req.get('x-vercel-ip-country'));
  if (!country || NOT_A_COUNTRY.has(country)) return UNKNOWN;
  // Optional signal from an app that can read its device's configured region. A mismatch is treated as uncertain.
  const declared = req.get('X-PROtv-Device-Region');
  if (declared !== undefined && String(declared).trim() !== '' && code(declared) !== country) {
    return Object.freeze({ country: null, reason: 'region-mismatch' });
  }
  return Object.freeze({ country, reason: 'ip' });
}

const inUnitedStates = (territory) => Boolean(territory && territory.country === 'US');

module.exports = { NOT_A_COUNTRY, UNKNOWN, requestTerritory, inUnitedStates };

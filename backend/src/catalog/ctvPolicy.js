// One rights-eligibility policy for PROtv's connected-TV apps (DEVELOPMENT; not wired into production).
// docs/unified-ctv-policy-2026-11-23.md. Roku and Samsung share it; Apple TV and Fire TV are added as profiles.
//
// A title is evaluated from its rights record (ctvRightsRegistry.json: facts verified against executed agreements,
// evidence records and Mux) plus the catalog record, for one platform, at one moment, for one viewer territory.
// Every check that cannot be established denies. The result lists each reason, so a deny is always explainable.
//
//   deny    the title must not be offered (no rights record, unconfirmed signer, outside the term, outside the territory,
//           rating above the platform's store rating, unresolved copyright, unverified element review, a hold, ...)
//   review  offered, but a documented open item remains (for example a counsel check on signer authority)
const registry = require('./ctvRightsRegistry.json');
const { rightsHeld, deviceAppHeld } = require('./rightsHolds');
const { inUnitedStates } = require('./territory');

// Store age classification each app is published under. Unknown is denied for rated content above the lowest bar.
const PLATFORMS = Object.freeze({
  roku: { id: 'roku', storeTerritories: ['US'], maxAge: 18, signedPlayback: true, hold: 'rokuHold' },
  samsung: { id: 'samsung', storeTerritories: ['US'], maxAge: 16, signedPlayback: true, hold: 'samsungHold' },
  // Apple apps (iPhone/iPad and Apple TV): App Store availability United States only, age rating 18+.
  ios: { id: 'ios', storeTerritories: ['US'], maxAge: 18, signedPlayback: true, hold: 'appleHold' },
  appletv: { id: 'appletv', storeTerritories: ['US'], maxAge: 18, signedPlayback: true, hold: 'appleHold' },
  // Profile to fill in before Fire TV uses the policy (its store rating is not chosen yet).
  firetv: { id: 'firetv', storeTerritories: ['US'], maxAge: null, signedPlayback: true, hold: 'firetvHold' },
});

const RATING_AGE = Object.freeze({
  G: 0, 'TV-Y': 0, 'TV-Y7': 7, 'TV-G': 0, PG: 10, 'TV-PG': 10, 'PG-13': 13, 'TV-14': 14, R: 17, 'TV-MA': 17, 'NC-17': 18,
});

// Strictness for public-domain and open-licence titles. "element-review" is the owner's evidence standard: the film's
// status AND its soundtrack and other elements AND the source of PROtv's copy must be established.
const DEFAULT_STANDARD = 'element-review';

const day = (date) => date.toISOString().slice(0, 10);
// A territory-limited title's signed Mux playback ID: on the catalog record, or recorded with its rights entry (added to
// the existing Mux asset; no re-upload). Tokens for it are signed per request by the server.
const signedIdFor = (video, entry) => String((video && video.muxSignedPlaybackId) || (entry && entry.signedPlaybackId) || '');

function evaluate(video, platformId, { now = new Date(), territory = null, standard = DEFAULT_STANDARD, rights = registry } = {}) {
  const platform = PLATFORMS[platformId];
  const deny = [];
  const review = [];
  const result = () => ({ eligible: deny.length === 0, deny, review, usOnly: Boolean(entry && entry.territory === 'US') });
  const entry = video && rights[video.id];
  if (!platform) { deny.push('unknown-platform'); return result(); }
  if (!video) { deny.push('no-title'); return result(); }
  if (!entry) { deny.push('no-rights-record'); return result(); }

  // Existing creator-specific and platform exclusions always win.
  if (rightsHeld(video)) deny.push('rights-hold');
  if (deviceAppHeld(video)) deny.push('device-app-hold');
  if (platform.hold && video[platform.hold] === true) deny.push(`${platform.id}-hold`);

  // Territory: the store must be limited to the title's territory, and the viewer must be inside it.
  if (entry.territory === 'US') {
    if (!platform.storeTerritories.every((country) => country === 'US')) deny.push('store-not-us-only');
    if (!inUnitedStates(territory)) deny.push('viewer-not-confirmed-in-us');
    if (!platform.signedPlayback) deny.push('platform-cannot-play-signed-streams');
    if (!/^[A-Za-z0-9]{10,128}$/.test(signedIdFor(video, entry))) deny.push('no-signed-playback-id');
  } else if (entry.territory !== 'WORLDWIDE') deny.push('territory-unknown');

  // Maturity: the title's rating must fit the store classification the app is published under.
  const age = entry.rating ? RATING_AGE[entry.rating] : undefined;
  if (entry.rating && age === undefined) deny.push('rating-unrecognized');
  else if (age !== undefined && (platform.maxAge === null || age > platform.maxAge)) deny.push('rating-exceeds-platform');
  else if (age === undefined && platform.maxAge !== 18) review.push('rating-unconfirmed');

  if (entry.kind === 'agreement') {
    if (entry.signer === 'unconfirmed') deny.push('signer-authority-unconfirmed');
    else if (entry.signer !== 'confirmed') review.push('signer-authority-counsel-check');
    if (entry.services === 'counsel-check') review.push('platform-scope-counsel-check');
    else if (entry.services !== 'all-protv-apps') deny.push('platform-not-granted');
    if (!entry.signed || day(now) < entry.signed) deny.push('before-term');
    if (entry.ends && day(now) > entry.ends) deny.push('term-expired');
    if (entry.master !== 'verified') review.push('master-not-traced');
  } else if (entry.kind === 'public-domain') {
    if (entry.film !== 'public-domain-us') deny.push('copyright-unresolved');
    if (entry.flag) deny.push('conflicting-licence-label');
    if (standard === 'element-review') {
      if (entry.music !== 'reviewed') deny.push('soundtrack-not-reviewed');
      if (entry.sourceCopy !== 'confirmed') deny.push('source-copy-unconfirmed');
    }
  } else if (entry.kind === 'open-licence') {
    if (entry.version !== 'verified') deny.push('licence-version-unverified');
    if (entry.sourceCopy !== 'confirmed') review.push('source-copy-unconfirmed');
  } else deny.push('unknown-rights-kind');
  return result();
}

// What an app receives for an eligible U.S.-only title: only the signed playback ID, never the public one.
function ctvView(video, decision, { rights = registry } = {}) {
  if (!decision || !decision.usOnly) return video;
  return { ...video, muxPlaybackId: signedIdFor(video, rights[video.id]), muxPlaybackPolicy: 'signed' };
}

module.exports = { PLATFORMS, RATING_AGE, DEFAULT_STANDARD, evaluate, ctvView, registry };

// PROtv LIVE in the device apps: one master schedule, filtered per app by that app's own content eligibility.
//
// Every app sees the same synchronized schedule as the website (same entries, same times, same commercials). A program
// an app is not cleared for airs there as a branded PROtv LIVE fallback for exactly its scheduled time: no title, no
// artwork, no synopsis and no playback ID reach that app. The master schedule is never changed.
//
// Fail-closed: an app gets a feed only if it is listed here, and a program reaches it only when the same rule that
// governs that app's on-demand catalog allows it (catalog/platformEligibility.js and catalog/rightsHolds.js), on top of
// the channel's own linear-rights check. A premiere that has not been delivered yet is never shown to an app, because
// its clearance can only be read from the delivered title. Fire TV and iOS are deliberately not listed.
const { rokuEligible, samsungEligible } = require('../catalog/platformEligibility');
const { deviceAppHeld, rightsHeld } = require('../catalog/rightsHolds');

const APP_POLICIES = new Map([
  ['roku', { platform: 'roku', policy: 'roku-live-v1', allows: (video) => rokuEligible(video) }],
  ['samsung', { platform: 'samsung', policy: 'samsung-live-v1', allows: (video, at) => samsungEligible(video, new Date(at)) }],
  // The Google Play app's on-demand catalog is the website catalog less device-app holds; LIVE follows the same rule.
  ['android', { platform: 'android', policy: 'android-live-v1', allows: (video) => !deviceAppHeld(video) }],
]);

// The app's policy, or null when that app has no PROtv LIVE feed.
function appPolicy(platform) {
  return APP_POLICIES.get(String(platform || '').trim().toLowerCase()) || null;
}

// Whether a scheduled program's title may air in an app. A missing (undelivered) title is never allowed.
function appAllows(app, video, at) {
  if (!app || !video || video.pending === true) return false;
  if (rightsHeld(video)) return false;
  return app.allows(video, at) === true;
}

module.exports = { APP_POLICIES, appAllows, appPolicy };

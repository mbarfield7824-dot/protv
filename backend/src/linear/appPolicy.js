// PROtv LIVE in the device apps: one master schedule, filtered per app by that app's own content eligibility.
//
// Every app sees the same synchronized schedule as the website (same entries, same times, same commercials). A program
// an app is not cleared for airs there as a branded PROtv LIVE fallback for exactly its scheduled time: no title, no
// artwork, no synopsis and no playback ID reach that app. The master schedule is never changed.
//
// Fail-closed: an app gets a feed only if it is listed here, and a program reaches it only when the same rule that
// governs that app's on-demand catalog allows it (catalog/platformEligibility.js and catalog/rightsHolds.js), on top of
// the channel's own linear-rights check. A premiere that has not been delivered yet is never shown to an app, because
// its clearance can only be read from the delivered title.
const { firetvEligible, firetvView, rokuEligible, samsungEligible, samsungView } = require('../catalog/platformEligibility');
const { deviceAppHeld, rightsHeld } = require('../catalog/rightsHolds');

const APP_POLICIES = new Map([
  // Fire TV: U.S.-limited creator grants play only for U.S. requests, by signed playback ID.
  ['firetv', { platform: 'firetv', policy: 'firetv-live-v1', allows: (video, at, territory) => firetvEligible(video, new Date(at), territory), view: (video) => firetvView(video, new Date(), { country: 'US', reason: 'ip' }) }],
  ['roku', { platform: 'roku', policy: 'roku-live-v1', allows: (video) => rokuEligible(video) }],
  // Samsung also applies the viewer's territory (U.S.-only tier) and plays U.S.-only titles only by signed playback ID.
  ['samsung', { platform: 'samsung', policy: 'samsung-live-v1', allows: (video, at, territory) => samsungEligible(video, new Date(at), territory), view: (video) => samsungView(video) }],
  // The Google Play app's on-demand catalog is the website catalog less device-app holds; LIVE follows the same rule.
  ['android', { platform: 'android', policy: 'android-live-v1', allows: (video) => !deviceAppHeld(video) }],
  // Apple apps: the shared connected-TV policy (fail closed, territory-aware, signed-only for U.S.-limited titles).
  ...['ios', 'appletv'].map((platform) => [platform, {
    platform, policy: `${platform}-live-v1`,
    allows: (video, at, territory) => require('../catalog/ctvPolicy').evaluate(video, platform, { now: new Date(at), territory }).eligible,
    view: (video) => {
      const { evaluate, ctvView } = require('../catalog/ctvPolicy');
      return ctvView(video, evaluate(video, platform, { now: new Date(), territory: { country: 'US', reason: 'ip' } }));
    },
  }]),
]);

// The app's policy, or null when that app has no PROtv LIVE feed.
// territory (catalog/territory.js) is the viewer's; unknown denies every country-limited title.
function appPolicy(platform, territory = null) {
  const app = APP_POLICIES.get(String(platform || '').trim().toLowerCase()) || null;
  return app ? { ...app, territory } : null;
}

// Whether a scheduled program's title may air in an app. A missing (undelivered) title is never allowed.
function appAllows(app, video, at) {
  if (!app || !video || video.pending === true) return false;
  if (rightsHeld(video)) return false;
  return app.allows(video, at, app.territory || null) === true;
}

module.exports = { APP_POLICIES, appAllows, appPolicy };

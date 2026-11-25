// Platform eligibility for the shared viewer catalog.
const { deviceAppHeld } = require('./rightsHolds');
//
// Fire TV is fail-closed: a Fire TV client sees only titles whose rights
// evidence covers the copy PROtv streams (Group A in
// tv/roku/store/ROKU-LAUNCH-CATALOG.md on release/roku-1.0-rc9, reused for the
// Amazon launch). Every other client, Roku included, keeps the full approved
// catalog. Adding a title here is a reviewed code change, so a rights decision
// and its deployment travel together.
const FIRETV_LAUNCH_TITLE_IDS = new Set([
  'gbcxmtl6mAHQeBxx8Dgs', // Tears of Steel (2012)
  'sCWQqVE5WIoNNN5wAGQ2', // Sintel (2010)
  'hKPU3JNJ4faWLgWE6ZSq', // Big Buck Bunny (2008)
  '6wWGoL2qWRqtCmCTSRQY', // Elephants Dream (2006)
  'creator_20752565-9909-4c2b-9f53-c9719ca26769', // The Lost Camp
  'creator_89303465-51e3-46bb-bd21-ff5ed2db2c49', // Dead Air
  'u3dXF1OlGIXiRPAHz3hE', // A Day in the Life of a Coal Miner (1910)
  'LiMNMZWXBxJj3LoP73kU', // His Girl Friday (1940)
  'KS5fwSoYxy8h3FkrTWW3', // Angel on My Shoulder (1946)
  'evCYYCPlc23BKzpmt2ug', // The Amazing Mr. X (1948)
  'uvRcBLWVKxLyHsswVZOo', // Africa Screams (1949)
  'aIZ4FeTCPjuTlycMgxiK', // Angel and the Badman (1947)
  'CmN3oev0txAoerdvsjCb', // Captain Kidd (1945)
  'WMmLodEvI2gpEVW9v6yL', // D.O.A. (1950)
  'aFRblRPxcp3LEm1lf4ye', // Jungle Book (1942)
  'goOpjlfjJF3YWw5dlHqe', // The Bronze Buckaroo (1939)
  'PqGsChF8xtTQdaQFEWQI', // The Blood of Jesus (1941)
  'dKxiQCeBcuT92BKv9dgJ', // Big Timers (1945)
  '2OTfk1MA9SNAJcXQajCl', // The Battle of Midway (1942)
  '1l1uGB4v8CaUr9p4TTGv', // The Duke Is Tops (1938)
  '6h3blkiA6LTeLv66jj1v', // Murder in Harlem (1935)
  'Ts881xyfGAz4E4TZHIeg', // The Girl from Chicago (1932)
  'uzZVSNOg0sOZaTk4tlV6', // The Exile (1931)
  '3NAU6BldsmCNs9wjM08a', // The Little Shop of Horrors (1960)
  'RwDe3WkIWoHQ1EUzfWn9', // The Brain That Wouldn't Die (1962)
  'ZIWIKF2lyh7hJCcRkPLr', // Attack of the Giant Leeches (1959)
  'B2MDEH2b25NknMQMEhoM', // Plan 9 from Outer Space (1957)
  'MZ6Q6DI2S62pP8laH9Ku', // The Incredible Petrified World (1959)
]);

// A scheduled episode carries its own Fire TV clearance: an Administrator ticks it, per season, when
// scheduling a series with verified ownership and a signed agreement. It is never set by default.
function clearedEpisode(video) {
  return (video.contentType === 'EPISODE' && Boolean(video.creatorEpisodeId) && video.firetvCleared === true)
    // A Creator Portal series' show record follows its episodes: it carries firetvCleared once a cleared episode is released.
    || (video.contentType === 'SERIES' && Boolean(video.creatorSeriesProjectId) && video.firetvCleared === true);
}

// Creator titles reach Fire TV from the shared rights registry (catalog/ctvRightsRegistry.json, evaluated by
// catalog/ctvPolicy.js with the Fire TV profile): a signed agreement covering every PROtv app, inside its term, with a
// confirmed signer. Fire TV's store rating is not confirmed, so rated titles (TV-MA) stay off; a U.S.-only grant plays
// only for U.S. requests and only by its signed playback ID. Holds always win.
function registryDecision(video, platform, now, territory) {
  const { evaluate, registry } = require('./ctvPolicy');
  const entry = video && registry[video.id];
  return entry && entry.kind === 'agreement' ? evaluate(video, platform, { now, territory }) : null;
}

function firetvEligible(video, now = new Date(), territory = null) {
  if (!video || video.firetvHold === true || deviceAppHeld(video)) return false;
  if (FIRETV_LAUNCH_TITLE_IDS.has(video.id) || clearedEpisode(video)) return true;
  const decision = registryDecision(video, 'firetv', now, territory);
  return Boolean(decision && decision.eligible);
}

// What Fire TV receives for an eligible title: a U.S.-only grant carries only its signed playback ID.
function firetvView(video, now = new Date(), territory = null) {
  if (!video || FIRETV_LAUNCH_TITLE_IDS.has(video.id)) return video;
  const decision = registryDecision(video, 'firetv', now, territory);
  return decision && decision.eligible ? require('./ctvPolicy').ctvView(video, decision) : video;
}

// Only an explicit header selects a platform. Fire TV builds from 1.0.0 code 6
// send X-PROtv-Platform: firetv; older sideloaded builds, Roku, the website and
// Android send nothing and are unchanged. The header is self-declared, so this
// controls what the Fire TV app shows; it is not access control.
function platformFromRequest(req) {
  const declared = String(req.get('X-PROtv-Platform') || '').trim().toLowerCase();
  if (declared) return declared;
  // The released Roku app sends no platform header; Roku firmware identifies itself in the User-Agent.
  return /^Roku\//i.test(req.get('User-Agent') || '') ? 'roku' : 'default';
}

// Live before publishing recorded rokuCleared; each signed agreement was read on 2026-11-02.
const ROKU_REVIEWED_CREATOR_TITLE_IDS = new Set([
  'creator_613e215e-709f-48ee-91bb-b225d8da4a33', // The Thirst: replacement agreement (U.S.), widened to worldwide by Addendum F (92fac4b5, executed 2026-11-22)
  'creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6', // UNITED NATIONS: Schedule B naming TV apps
]);

// Roku is fail-closed. A title reaches Roku only with reviewed rights evidence for the copy PROtv streams
// (tv/roku/store/ROKU-LAUNCH-CATALOG.md and backend/docs/roku-distribution-rights.md) or a signed Schedule naming
// TV or PROtv apps, recorded as rokuCleared when the title is published. rokuHold withdraws a title whatever else applies.
function rokuEligible(video) {
  if (video.rokuHold === true || deviceAppHeld(video)) return false;
  return FIRETV_LAUNCH_TITLE_IDS.has(video.id) || ROKU_REVIEWED_CREATOR_TITLE_IDS.has(video.id) || video.rokuCleared === true;
}

// Samsung Smart TV (Tizen) uses the shared connected-TV policy (catalog/ctvPolicy.js) with its own profile: U.S.-only
// store, 16+ store rating, fail closed. Agreements must cover every PROtv app inside their term; public-domain titles
// need the full element review (film, soundtrack and source copy, docs/public-domain-element-review-2026-11-25.md);
// U.S.-limited titles play only for U.S. requests and only by signed playback ID. samsungHold withdraws a title.
const SAMSUNG_POLICY = 'samsung-rights-v1';

function samsungDecision(video, now = new Date(), territory = null) {
  if (!video || video.samsungHold === true) return null;
  return require('./ctvPolicy').evaluate(video, 'samsung', { now, territory });
}

function samsungEligible(video, now = new Date(), territory = null) {
  const decision = samsungDecision(video, now, territory);
  return Boolean(decision && decision.eligible);
}

// What Samsung receives for an eligible title: a U.S.-limited title carries only its signed playback ID.
function samsungView(video, now = new Date(), territory = { country: 'US', reason: 'ip' }) {
  const decision = samsungDecision(video, now, territory);
  return decision && decision.eligible ? require('./ctvPolicy').ctvView(video, decision) : video;
}

// Apple apps use the shared connected-TV policy (catalog/ctvPolicy.js): fail closed, territory-aware, signed-only for
// U.S.-limited titles. Required lazily so the policy's registry loads only when an Apple app asks.
const APPLE_PLATFORMS = new Set(['ios', 'appletv']);
function appleEligible(videos, platform, now, territory) {
  const { evaluate, ctvView } = require('./ctvPolicy');
  return videos.flatMap((video) => {
    const decision = evaluate(video, platform, { now, territory });
    return decision.eligible ? [ctvView(video, decision)] : [];
  });
}

function eligibleForPlatform(videos, platform, now = new Date(), territory = null) {
  if (platform === 'roku') return videos.filter(rokuEligible);
  if (APPLE_PLATFORMS.has(platform)) return appleEligible(videos, platform, now, territory);
  if (platform === 'samsung') {
    return videos.filter((video) => samsungEligible(video, now, territory)).map((video) => samsungView(video, now, territory));
  }
  if (platform !== 'firetv') return videos;
  return videos.filter((video) => firetvEligible(video, now, territory)).map((video) => firetvView(video, now, territory));
}

// Responses that applied a platform's own rights policy name it, so a fail-closed client can refuse a
// catalog that was not filtered for it (for example, a backend deployed before that client existed).
function platformPolicy(platform) {
  if (platform === 'samsung') return SAMSUNG_POLICY;
  return APPLE_PLATFORMS.has(platform) ? `${platform}-rights-v1` : null;
}

module.exports = {
  APPLE_PLATFORMS,
  FIRETV_LAUNCH_TITLE_IDS,
  SAMSUNG_POLICY,
  samsungView,
  platformFromRequest,
  platformPolicy,
  eligibleForPlatform,
  firetvEligible,
  firetvView,
  rokuEligible,
  samsungEligible,
};

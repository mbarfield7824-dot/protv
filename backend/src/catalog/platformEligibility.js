// Platform eligibility for the shared viewer catalog.
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
  'creator_613e215e-709f-48ee-91bb-b225d8da4a33', // The Thirst: replacement agreement, PROtv platform and associated applications, worldwide
  'creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6', // UNITED NATIONS: Schedule B naming TV apps
]);

// Roku is fail-closed. A title reaches Roku only with reviewed rights evidence for the copy PROtv streams
// (tv/roku/store/ROKU-LAUNCH-CATALOG.md and backend/docs/roku-distribution-rights.md) or a signed Schedule naming
// TV or PROtv apps, recorded as rokuCleared when the title is published. rokuHold withdraws a title whatever else applies.
function rokuEligible(video) {
  if (video.rokuHold === true) return false;
  return FIRETV_LAUNCH_TITLE_IDS.has(video.id) || ROKU_REVIEWED_CREATOR_TITLE_IDS.has(video.id) || video.rokuCleared === true;
}

// Samsung Smart TV (Tizen) is fail-closed with its own allowlist. Roku, Fire TV and iOS clearances do not
// authorize Samsung. Only titles whose reviewed evidence is worldwide AND covers PROtv's own apps generally
// (not a list of named platforms) are included, so the Samsung app adds no new geographic exposure:
// the 2026-11-13 signed-agreement reconciliation (docs/samsung-rights-2026-11-14.md) plus three CC BY 3.0 films.
// U.S.-only grants and U.S. public-domain findings stay out until playback-level territory controls exist.
// Inclusive UTC calendar cutoffs; null means no fixed calendar expiry. samsungHold withdraws a title.
const SAMSUNG_POLICY = 'samsung-rights-v1';
const SAMSUNG_LAUNCH_TITLE_EXPIRY = new Map([
  ['creator_5a913abe-bbb5-44a5-9c8f-cc12b7496ba9', '2028-11-09'], // A Long Time Coming: PROtv apps, worldwide
  ['creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8', '2028-11-06'], // It's a Double Date a Classic: website/app streaming, worldwide
  ['creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f', '2028-11-03'], // CAESAR III JUDGEMENT: other PROtv-controlled platforms, worldwide
  ['creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d', '2028-11-03'], // Curtain Call: other PROtv-controlled platforms, worldwide
  ['creator_20752565-9909-4c2b-9f53-c9719ca26769', null], // The Lost Camp: PROtv platform and associated applications, worldwide
  ['hKPU3JNJ4faWLgWE6ZSq', null], // Big Buck Bunny: CC BY 3.0, worldwide
  ['sCWQqVE5WIoNNN5wAGQ2', null], // Sintel: CC BY 3.0, worldwide
  ['gbcxmtl6mAHQeBxx8Dgs', null], // Tears of Steel: CC BY 3.0, worldwide
]);

function samsungEligible(video, now = new Date()) {
  if (!video || video.samsungHold === true) return false;
  const expiresOn = SAMSUNG_LAUNCH_TITLE_EXPIRY.get(video.id);
  if (expiresOn === undefined) return false;
  return expiresOn === null || now.toISOString().slice(0, 10) <= expiresOn;
}

function eligibleForPlatform(videos, platform, now = new Date()) {
  if (platform === 'roku') return videos.filter(rokuEligible);
  if (platform === 'samsung') return videos.filter((video) => samsungEligible(video, now));
  if (platform !== 'firetv') return videos;
  return videos.filter((video) => FIRETV_LAUNCH_TITLE_IDS.has(video.id) || clearedEpisode(video));
}

// Responses that applied a platform's own rights policy name it, so a fail-closed client can refuse a
// catalog that was not filtered for it (for example, a backend deployed before that client existed).
function platformPolicy(platform) {
  return platform === 'samsung' ? SAMSUNG_POLICY : null;
}

module.exports = {
  FIRETV_LAUNCH_TITLE_IDS,
  SAMSUNG_LAUNCH_TITLE_EXPIRY,
  SAMSUNG_POLICY,
  platformFromRequest,
  platformPolicy,
  eligibleForPlatform,
  rokuEligible,
  samsungEligible,
};

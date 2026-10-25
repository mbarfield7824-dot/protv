// Platform eligibility for the shared viewer catalog.
//
// Roku is fail-closed: a Roku client sees only titles whose rights evidence
// covers the copy PROtv streams (tv/roku/store/ROKU-LAUNCH-CATALOG.md on
// release/roku-1.0-rc5). Every other client keeps the full approved catalog.
// Adding a title here is a reviewed code change, so a rights decision and its
// deployment travel together.
const ROKU_LAUNCH_TITLE_IDS = new Set([
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

// The shipped Roku app sends no app header, but every Roku device identifies
// itself as "Roku/DVP-<firmware> (<build>)". X-PROtv-Platform lets later builds
// and tests name the platform explicitly.
function platformFromRequest(req) {
  const declared = String(req.get('X-PROtv-Platform') || '').trim().toLowerCase();
  if (declared) return declared;
  return /^Roku\//i.test(req.get('User-Agent') || '') ? 'roku' : 'default';
}

// Fire TV launches with the same cleared list. Fire TV builds from 1.0.0 code 6
// send X-PROtv-Platform: firetv; older sideloaded builds send nothing.
const LAUNCH_TITLE_IDS = { roku: ROKU_LAUNCH_TITLE_IDS, firetv: ROKU_LAUNCH_TITLE_IDS };

function eligibleForPlatform(videos, platform) {
  const allowed = LAUNCH_TITLE_IDS[platform];
  if (!allowed) return videos;
  return videos.filter((video) => allowed.has(video.id));
}

module.exports = { ROKU_LAUNCH_TITLE_IDS, platformFromRequest, eligibleForPlatform };

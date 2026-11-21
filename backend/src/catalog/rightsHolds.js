// Reviewed rights holds (2026-11-21). Each entry withdraws a title from viewers without changing its record, so
// removing an entry (and deploying) restores it exactly. Evidence: Documents/PROtv-Launch/2026-11-21-Release-and-
// Rights-Review.md and tv/roku/store/ROKU-LAUNCH-CATALOG.md (release/roku-1.0-rc9).

// Confirmed restrictions: a protected element is documented in the copy PROtv streams. Withheld everywhere (website,
// apps, title pages, sitemap and playback). None of these is on Roku, Fire TV or Samsung, which are fail-closed.
const RIGHTS_HOLD_TITLE_IDS = new Map([
  ['p532d2Aqpb3bC2rvYkQw', 'House on Haunted Hill (1959): film renewal RE0000318809 and title-song renewal RE0000309723'],
  ['t6Ii7hflAigcefjBRz3r', "Gulliver's Travels (1939): songs renewed 1966, protected to the end of 2034"],
  ['9P2whdYluJRAJeI6cOuh', 'Woman on the Run (1950): score renewal RE0000909148'],
  ['v_1789872561270_i3svw5cbz', "Merrie Melodies short (1932): title song renewed (R236180), protected through 2027"],
  ['biitnhJJnBvHGFx8TJZC', 'Body and Soul (1925): every available copy carries a commissioned modern score'],
  ['5FHvg3BEwBlk9qqNdZT5', 'One Step Beyond - The Storm: CBS catalog assignment and series renewals'],
]);

// Contractual prerequisite unmet: withheld from PROtv's device apps (Roku and the Android app) until the evidence the
// signed agreement requires before release is received. The website listing is unchanged.
const DEVICE_APP_HOLD_TITLE_IDS = new Map([
  ['creator_3af7527e-f093-41e3-a52e-b4586d315481', 'ITAN: Schedule A requires AI-tool commercial-use evidence (Grok, Seedance, Kling, Suno) before release; not yet supplied'],
]);

const rightsHeld = (video) => Boolean(video && RIGHTS_HOLD_TITLE_IDS.has(video.id));
const deviceAppHeld = (video) => Boolean(video && DEVICE_APP_HOLD_TITLE_IDS.has(video.id));

// The Google Play app sends no platform header; React Native identifies it as "PROtv/<version>". Browsers never do.
// Used only to apply device-app holds; every other Android response is unchanged.
function androidAppRequest(req) {
  return !String(req.get('X-PROtv-Platform') || '').trim() && /^PROtv\/\d/.test(req.get('User-Agent') || '');
}

module.exports = { RIGHTS_HOLD_TITLE_IDS, DEVICE_APP_HOLD_TITLE_IDS, rightsHeld, deviceAppHeld, androidAppRequest };

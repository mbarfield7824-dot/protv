// Marketing Studio: which catalog footage may appear in PROtv marketing, and on what conditions.
//
// Promotional permission comes from each executed agreement's marketing clause (read 2026-11-25; quoted in
// docs/marketing-studio.md), public-domain status (the 2026-11-25 element review) or an open licence. The same
// rights registry that governs distribution (catalog/ctvRightsRegistry.json) supplies terms, territory and holds, so
// marketing can never use a title the apps may not carry. Every decision explains itself.
//
// Conditions applied to every creator excerpt (the strictest common clause): it promotes that title and its
// availability on PROtv, so the title is shown on screen while the excerpt plays; excerpts come from the first 60% of
// the running time (agreements forbid revealing the ending); one piece uses at most 90 seconds of a title.
const { registry } = require('../catalog/ctvPolicy');
const { rightsHeld, deviceAppHeld } = require('../catalog/rightsHolds');

// scope: 'title' = may only promote that title (it must be identified on screen); 'title-and-protv' = the agreement also
// allows marketing PROtv itself with approved excerpts.
const PROMOTION_GRANTS = Object.freeze({
  'creator_693966b2-abd3-4aa4-94a9-e3f5081a0d47': { scope: 'title', clause: 'Three Thirty STD6040-v1 e1f7a31c s.11.1-11.3: excerpts, promotional clips and social-media advertisements, on PROtv social, email, press and paid advertising' },
  'creator_5a913abe-bbb5-44a5-9c8f-cc12b7496ba9': { scope: 'title', clause: 'A Long Time Coming STD6040-v1 3e9c05e3 s.11 (same text as Three Thirty)' },
  'creator_ffb0df98-37f2-4ced-ba92-f03df9a65790': { scope: 'title', clause: 'Aunt Tut STD6040-v1 a20f8f4b s.11' },
  'creator_08283e5a-f35c-402e-9639-50e1711a5d67': { scope: 'title', clause: 'You Did Me Dirty CUSTOM-v1 ab9730ab s.11' },
  'creator_dd7efaaf-d87b-44df-93ab-5561936b6a52': { scope: 'title', clause: '2212 CUSTOM-v1 fa57d968 s.11' },
  'creator_episode_ac1c153a-2cd4-4c1e-a1ba-813fcbdacd90': { scope: 'title', clause: '2212 Season Agreement f936d40d s.13.1-13.4: excerpts, trailers, promotional clips and social-media advertisements' },
  'creator_episode_dfad5c66-a17d-41d3-9ebf-6da60fada4fa': { scope: 'title', clause: '2212 Season Agreement f936d40d s.13.1-13.4' },
  'creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f': { scope: 'title-and-protv', clause: 'CAESAR III 59a9f315 Schedule B: approved artwork, trailers, titles and limited excerpts to market the Licensed Content and PROtv' },
  'creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d': { scope: 'title-and-protv', clause: 'Curtain Call d2bf0097 Schedule B: approved artwork, trailers, titles and limited excerpts to market the Licensed Content and PROtv' },
  'creator_20752565-9909-4c2b-9f53-c9719ca26769': { scope: 'title', clause: 'The Lost Camp ee474291: approved titles, descriptions, stills, trailers, excerpts to promote The Lost Camp across PROtv, its social media accounts and marketing channels' },
  'creator_613e215e-709f-48ee-91bb-b225d8da4a33': { scope: 'title', clause: 'The Thirst f2068214: approved titles, descriptions, stills, trailers, excerpts to promote The Thirst through PROtv and its marketing channels (territory widened by Addendum F)' },
  'creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6': { scope: 'title', clause: 'UNITED NATIONS f587ce8e: approved titles, artwork, trailers, stills, excerpts to promote the Content (U.S. only)' },
  'creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8': { scope: 'title', clause: "It's a Double Date a Classic 1a959a6f: customary trailers and short promotional excerpts solely to market the Titles on PROtv" },
});

const MAX_EXCERPT_FRACTION = 0.6;
const MAX_SECONDS_PER_TITLE = 90;
const DESTINATIONS = ['live', 'website', 'social', 'paid'];

const day = (date) => date.toISOString().slice(0, 10);

// One decision for one title, use and destination. `video` is the catalog record (for runtime and holds).
function footageClearance(video, { destination = 'social', network = false, now = new Date() } = {}) {
  const deny = [];
  const conditions = [];
  const id = video?.id;
  const entry = id ? registry[id] : null;
  const result = () => ({ allowed: deny.length === 0, deny, conditions, basis, territory, scope });
  let basis = '';
  let territory = 'WORLDWIDE';
  let scope = 'title';
  if (!video || !id) { deny.push('no-title'); return result(); }
  if (!DESTINATIONS.includes(destination)) deny.push('unknown-destination');
  if (rightsHeld(video)) deny.push('rights-hold');
  if (deviceAppHeld(video) && destination !== 'website') deny.push('device-app-hold');
  if (video.approvalStatus && video.approvalStatus !== 'approved') deny.push('not-published');
  if (!entry) { deny.push('no-rights-record'); return result(); }
  territory = entry.territory;
  if (entry.kind === 'agreement') {
    const grant = PROMOTION_GRANTS[id];
    if (!grant) { deny.push('no-promotion-clause-on-record'); return result(); }
    basis = grant.clause;
    scope = grant.scope;
    if (entry.signer === 'unconfirmed') deny.push('signer-authority-unconfirmed');
    if (!entry.signed || day(now) < entry.signed) deny.push('before-term');
    if (entry.ends && day(now) > entry.ends) deny.push('term-expired');
    conditions.push('no-ending', `max-${MAX_SECONDS_PER_TITLE}s`);
    // A title-only grant promotes that title's availability, so the title is shown while its excerpt plays. A grant
    // that also covers marketing PROtv itself (CAESAR III, Curtain Call) may appear in network spots unlabelled.
    if (scope === 'title') conditions.push('title-on-screen');
    if (network && scope === 'title') conditions.push('promotes-title-availability');
  } else if (entry.kind === 'public-domain') {
    basis = `U.S. public domain (${entry.evidence?.film || 'film status recorded'})`;
    if (entry.film !== 'public-domain-us') deny.push('copyright-unresolved');
    if (entry.music !== 'reviewed') deny.push('soundtrack-not-cleared');
    if (entry.sourceCopy !== 'confirmed') deny.push('source-copy-unconfirmed');
    // A U.S. public-domain finding does not cover viewers abroad; social and paid posts reach other countries.
    if (destination === 'social' || destination === 'paid') conditions.push('target-us-only');
  } else if (entry.kind === 'open-licence') {
    basis = `${entry.licence} (attribution required)`;
    if (entry.version !== 'verified') deny.push('licence-unverified');
    conditions.push('attribution');
  } else deny.push('unknown-rights-kind');
  if (territory === 'US' && destination !== 'live') conditions.push('target-us-only');
  return result();
}

// The latest second an excerpt may come from (no endings), given the title's running time.
function excerptWindow(video) {
  const duration = Number(video?.duration) || 0;
  return { from: 0, to: Math.max(0, Math.floor(duration * MAX_EXCERPT_FRACTION)) };
}

// Checks a planned set of shots against the rules above; returns problems (empty = clear).
function checkShots(shots, videos, { destination, network = false, now = new Date() } = {}) {
  const problems = [];
  const perTitle = new Map();
  for (const [index, shot] of shots.entries()) {
    if (shot.kind !== 'footage') continue;
    const video = videos.get(shot.videoId);
    const decision = footageClearance(video, { destination, network, now });
    const label = video?.title || shot.videoId;
    if (!decision.allowed) { problems.push(`Shot ${index + 1} (${label}): ${decision.deny.join(', ')}.`); continue; }
    const window = excerptWindow(video);
    if (shot.startSeconds + shot.durationSeconds > window.to) problems.push(`Shot ${index + 1} (${label}) is past ${Math.round(MAX_EXCERPT_FRACTION * 100)}% of the running time (could reveal the ending).`);
    if (decision.conditions.includes('title-on-screen') && !shot.titleOnScreen) problems.push(`Shot ${index + 1} (${label}) must show the title on screen.`);
    perTitle.set(shot.videoId, (perTitle.get(shot.videoId) || 0) + shot.durationSeconds);
  }
  for (const [videoId, seconds] of perTitle) if (seconds > MAX_SECONDS_PER_TITLE) problems.push(`${videos.get(videoId)?.title || videoId} uses ${seconds} s (limit ${MAX_SECONDS_PER_TITLE} s).`);
  return problems;
}

module.exports = { PROMOTION_GRANTS, MAX_EXCERPT_FRACTION, MAX_SECONDS_PER_TITLE, footageClearance, excerptWindow, checkShots };

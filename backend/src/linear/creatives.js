// PROtv LIVE commercials ("spots"): network promotions, upcoming-show trailers, sponsor advertisements and PROtv
// bumpers (branded interstitials). A spot is a short Mux asset, either uploaded for the channel or an existing catalog
// trailer (no re-encoding). Breaks and premiere countdowns carry a "pod": the exact sequence of spots chosen when the
// slot is scheduled, so every viewer sees the same spot at the same second, like television.
//
// Firestore: linearCreatives/{id} (server-only).
const { channelLocalToUtc } = require('./time');

class CreativeValidationError extends Error {}

const CREATIVE_TYPES = ['promo', 'trailer', 'sponsor', 'bumper'];
const CREATIVE_LABELS = { promo: 'PROtv promotion', trailer: 'Upcoming-show trailer', sponsor: 'Sponsor advertisement', bumper: 'PROtv interstitial' };
const CREATIVE_MIN_SECONDS = 3;
const CREATIVE_MAX_SECONDS = 180;
const POD_MAX_SPOTS = 20;
const COUNTDOWN_MINUTES = [5, 10, 15, 30];
// The final stretch of a countdown is always the full-screen clock, never a commercial.
const COUNTDOWN_CLOCK_SECONDS = 60;

const text = (value, max = 2000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function creativeFields(input, { existing = null } = {}) {
  if (!input || typeof input !== 'object') throw new CreativeValidationError('Spot details are required.');
  const merged = { ...(existing || {}), ...input };
  const type = merged.type;
  if (!CREATIVE_TYPES.includes(type)) throw new CreativeValidationError('Choose a spot type: PROtv promotion, upcoming-show trailer, sponsor advertisement or PROtv interstitial.');
  const title = text(merged.title, 120);
  if (title.length < 2) throw new CreativeValidationError('Give the spot a name (at least 2 characters).');
  const advertiser = text(merged.advertiser, 120);
  if (type === 'sponsor' && advertiser.length < 2) throw new CreativeValidationError('Name the sponsor for a sponsor advertisement.');
  const flightStart = merged.flightStart ? String(merged.flightStart) : null;
  const flightEnd = merged.flightEnd ? String(merged.flightEnd) : null;
  if ((flightStart && !isoDate(flightStart)) || (flightEnd && !isoDate(flightEnd))) throw new CreativeValidationError('Flight dates must be YYYY-MM-DD.');
  if (flightStart && flightEnd && flightEnd < flightStart) throw new CreativeValidationError('The flight ends before it starts.');
  return {
    type, title, advertiser: type === 'sponsor' ? advertiser : '',
    flightStart, flightEnd, notes: text(merged.notes, 1000),
  };
}

// The Eastern-time flight window as UTC instants (start of the first day, end of the last day).
function flightWindow(creative) {
  const start = creative.flightStart ? Date.parse(channelLocalToUtc(`${creative.flightStart}T00:00`)) : -Infinity;
  const end = creative.flightEnd
    ? Date.parse(channelLocalToUtc(`${creative.flightEnd}T23:59`)) + 60_000
    : Infinity;
  return { start, end };
}

// A spot airs only if it is approved, processed, not retired, inside its flight dates, and (for a catalog trailer)
// its title still has that public trailer. Checked at air time, like programs.
function creativeAirable(creative, at = Date.now()) {
  if (!creative || creative.status !== 'approved') return false;
  if (typeof creative.muxPlaybackId !== 'string' || !creative.muxPlaybackId.trim()) return false;
  if (!(Number(creative.durationSeconds) >= CREATIVE_MIN_SECONDS)) return false;
  const { start, end } = flightWindow(creative);
  return at >= start && at < end;
}

function approvalProblems(creative) {
  const problems = [];
  if (!creative.muxPlaybackId) problems.push('The video is not processed yet. Refresh its status after the upload finishes.');
  const seconds = Number(creative.durationSeconds);
  if (!(seconds >= CREATIVE_MIN_SECONDS && seconds <= CREATIVE_MAX_SECONDS)) {
    problems.push(`A spot must run ${CREATIVE_MIN_SECONDS} seconds to ${CREATIVE_MAX_SECONDS / 60} minutes.`);
  }
  if (creative.status === 'retired') problems.push('This spot is retired.');
  return problems;
}

// Spots are stored with whole-second durations so a pod adds up exactly.
const spotSeconds = (creative) => Math.max(1, Math.round(Number(creative.durationSeconds) || 0));

function validatePod(creativeIds, creatives, capacitySeconds) {
  if (!Array.isArray(creativeIds) || creativeIds.length > POD_MAX_SPOTS) throw new CreativeValidationError(`A break holds up to ${POD_MAX_SPOTS} spots.`);
  const pod = creativeIds.map((id) => {
    const creative = creatives.get(String(id));
    if (!creative) throw new CreativeValidationError('A chosen spot no longer exists.');
    if (creative.status !== 'approved') throw new CreativeValidationError(`"${creative.title}" is not approved.`);
    return { creativeId: creative.id, durationSeconds: spotSeconds(creative) };
  });
  const total = pod.reduce((sum, spot) => sum + spot.durationSeconds, 0);
  if (total > capacitySeconds) {
    throw new CreativeValidationError(`These spots run ${total} s, longer than the ${capacitySeconds} s available.`);
  }
  return pod;
}

// Deterministic fill: sponsors first (paid), then upcoming-show trailers, then PROtv promotions, rotating by the
// slot id so neighbouring breaks differ. Each spot at most once per break. Bumpers are added only if there is room.
function autofillPod(creatives, capacitySeconds, { seed = '', at = Date.now(), prefer = ['sponsor', 'trailer', 'promo', 'bumper'] } = {}) {
  const hash = (value) => [...String(value)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  const eligible = [...creatives.values()].filter((creative) => creativeAirable(creative, at)
    && spotSeconds(creative) <= capacitySeconds);
  const ordered = prefer.flatMap((type) => {
    const group = eligible.filter((creative) => creative.type === type).sort((a, b) => a.id.localeCompare(b.id));
    if (!group.length) return [];
    const shift = hash(`${seed}:${type}`) % group.length;
    return [...group.slice(shift), ...group.slice(0, shift)];
  });
  const pod = [];
  let used = 0;
  for (const creative of ordered) {
    if (pod.length >= POD_MAX_SPOTS) break;
    const seconds = spotSeconds(creative);
    if (used + seconds > capacitySeconds) continue;
    pod.push({ creativeId: creative.id, durationSeconds: seconds });
    used += seconds;
  }
  return pod;
}

// Which spot of a pod is on air `elapsedSeconds` after the pod started, and how far into it.
function spotAt(pod, elapsedSeconds) {
  let start = 0;
  for (let index = 0; index < (pod || []).length; index += 1) {
    const spot = pod[index];
    const end = start + spot.durationSeconds;
    if (elapsedSeconds >= start && elapsedSeconds < end) return { index, spot, startSeconds: start, endSeconds: end, offsetSeconds: elapsedSeconds - start };
    start = end;
  }
  return { index: -1, spot: null, startSeconds: start, endSeconds: null, offsetSeconds: 0 };
}

const podSeconds = (pod) => (pod || []).reduce((sum, spot) => sum + spot.durationSeconds, 0);

// What viewers may learn about a spot. Sponsors are disclosed as sponsored content.
function publicSpot(creative, { index, count }) {
  return {
    creativeId: creative.id,
    type: creative.type,
    label: creative.type === 'sponsor' ? 'Sponsored' : creative.type === 'trailer' ? 'Coming up on PROtv' : 'PROtv',
    title: creative.type === 'sponsor' ? `A message from ${creative.advertiser}` : creative.title,
    index: index + 1,
    count,
  };
}

module.exports = {
  COUNTDOWN_CLOCK_SECONDS,
  COUNTDOWN_MINUTES,
  CREATIVE_LABELS,
  CREATIVE_MAX_SECONDS,
  CREATIVE_MIN_SECONDS,
  CREATIVE_TYPES,
  CreativeValidationError,
  POD_MAX_SPOTS,
  approvalProblems,
  autofillPod,
  creativeAirable,
  creativeFields,
  podSeconds,
  publicSpot,
  spotAt,
  spotSeconds,
  validatePod,
};

const { isViewerEligible, seriesKey } = require('../catalog/readModel');
const { releaseAllowed } = require('../catalog/releases');
const { channelLabel, channelLocalToUtc, ChannelTimeError } = require('./time');

const CHANNEL_ID = 'protv-live';
const MAX_ENTRY_SECONDS = 8 * 60 * 60;
const BREAK_MIN_SECONDS = 15;
const BREAK_MAX_SECONDS = 10 * 60;
const PROGRAM_TYPES = new Set(['movie', 'episode', 'premiere', 'rerun']);
const SCHEDULABLE_TYPES = new Set(['MOVIE', 'EPISODE']);
const RIGHTS_STATUSES = new Set(['confirmed', 'denied']);
const PROGRAM_LABELS = { movie: 'Movie', episode: 'Episode', premiere: 'Premiere', rerun: 'Rerun' };

// The planned primetime lineup. Weekday: 0 = Sunday ... 6 = Saturday, in channel (Eastern) time.
const DEFAULT_PRIMETIME = [
  { weekday: 2, time: '20:00', seriesTitle: 'Dreadheads' },
  { weekday: 3, time: '20:00', seriesTitle: 'Mr. Ceasefire' },
  { weekday: 4, time: '20:00', seriesTitle: 'Ironborn' },
  { weekday: 5, time: '20:00', seriesTitle: 'Sidepiece' },
];

// Commercial breaks can be scheduled now; nothing is inserted into them yet. These limits are recorded for the
// future ad decision service and are not enforced against any ad, because no ad is served.
const DEFAULT_AD_POLICY = {
  insertion: 'not-active',
  maxBreakMinutesPerHour: 8,
  maxBreaksPerProgramHour: 3,
  viewerFrequencyCapPerHour: 4,
};

class LinearValidationError extends Error {}

const text = (value, max = 2000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const ms = (iso) => Date.parse(iso);

function normalizeSeriesTitle(title) {
  return typeof title === 'string' ? title.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase() : '';
}

// Linear rights are recorded separately from on-demand rights. A title record outranks its series record,
// so one episode can be withdrawn (denied) from a series whose agreement is otherwise confirmed.
function rightsKeysFor(video) {
  if (!video?.id) return [];
  const keys = [`title_${video.id}`];
  if (video.contentType === 'EPISODE' && normalizeSeriesTitle(video.seriesTitle)) {
    keys.push(`series_${seriesKey(video.seriesTitle)}`);
  }
  return keys;
}

function linearRightsFor(video, rights, at = Date.now()) {
  for (const key of rightsKeysFor(video)) {
    const record = rights.get(key);
    if (!record) continue;
    if (record.status === 'denied') return { status: 'denied', key, basis: record.basis || '' };
    if (record.status !== 'confirmed') continue;
    if (record.expiresAt && ms(record.expiresAt) <= at) {
      return { status: 'expired', key, basis: record.basis || '', expiresAt: record.expiresAt };
    }
    return { status: 'confirmed', key, basis: record.basis || '', expiresAt: record.expiresAt || null };
  }
  return { status: 'unverified', key: null, basis: '' };
}

function rightsCover(video, rights, fromMs, toMs) {
  const start = linearRightsFor(video, rights, fromMs);
  if (start.status !== 'confirmed') return start;
  if (start.expiresAt && ms(start.expiresAt) < toMs) {
    return { ...start, status: 'expires-during-slot' };
  }
  return start;
}

// Exactly the on-demand playability rule (approved, ready, released, has a playback ID), evaluated at `at`.
function playableAt(video, at = Date.now()) {
  if (!video || !SCHEDULABLE_TYPES.has(video.contentType)) return false;
  if (!releaseAllowed(video, at)) return false;
  return isViewerEligible({ ...video, releaseStatus: 'published' });
}

// A title PROtv holds for a future release: an admin upload with a scheduled release time, or a Creator Portal
// episode that is processed and private until the Creator Portal releases it.
function pendingRelease(video, at = Date.now()) {
  if (!video || !SCHEDULABLE_TYPES.has(video.contentType)) return false;
  if (['rejected', 'rights-verification-required'].includes(video.approvalStatus)) return false;
  if (video.releaseStatus === 'scheduled') return Number.isFinite(ms(video.releaseAt)) && ms(video.releaseAt) > at;
  return Boolean(video.creatorEpisodeId) && video.releaseStatus === 'held' && video.status === 'held';
}

function knownDuration(video) {
  const seconds = Number(video?.duration);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
}

function integerInRange(value, min, max, message) {
  if (!Number.isInteger(value) || value < min || value > max) throw new LinearValidationError(message);
  return value;
}

// Admin input -> stored schedule fields. Time is entered in Eastern Time, or chained to follow another entry.
function entryFields(input, { video = null, previousEndAt = null } = {}) {
  if (!input || typeof input !== 'object') throw new LinearValidationError('A schedule entry is required.');
  const kind = input.kind === 'break' ? 'break' : 'program';
  let startAt;
  if (previousEndAt) {
    startAt = previousEndAt;
  } else {
    try {
      startAt = channelLocalToUtc(input.startAtLocal, { fold: input.fold });
    } catch (error) {
      if (error instanceof ChannelTimeError) throw new LinearValidationError(error.message);
      throw error;
    }
  }
  if (kind === 'break') {
    const durationSeconds = integerInRange(Number(input.durationSeconds), BREAK_MIN_SECONDS, BREAK_MAX_SECONDS,
      `A commercial break lasts ${BREAK_MIN_SECONDS} seconds to ${BREAK_MAX_SECONDS / 60} minutes.`);
    return {
      kind, programType: null, videoId: null, startAt, durationSeconds, sourceStartSeconds: 0,
      endAt: new Date(ms(startAt) + durationSeconds * 1000).toISOString(),
      label: text(input.label, 80) || 'Commercial break', notes: text(input.notes),
    };
  }
  if (typeof input.videoId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(input.videoId)) {
    throw new LinearValidationError('Choose a title to schedule.');
  }
  if (!PROGRAM_TYPES.has(input.programType)) {
    throw new LinearValidationError('Program type must be movie, episode, premiere or rerun.');
  }
  const sourceStartSeconds = input.sourceStartSeconds === undefined || input.sourceStartSeconds === ''
    ? 0 : integerInRange(Number(input.sourceStartSeconds), 0, MAX_ENTRY_SECONDS, 'The segment start must be a whole number of seconds.');
  const available = knownDuration(video) ? knownDuration(video) - sourceStartSeconds : 0;
  const requested = input.durationSeconds === undefined || input.durationSeconds === '' ? 0 : Number(input.durationSeconds);
  const durationSeconds = requested || available;
  integerInRange(durationSeconds, 60, MAX_ENTRY_SECONDS, 'The slot must be 1 minute to 8 hours. Enter a duration if the title has none recorded.');
  if (knownDuration(video) && sourceStartSeconds + durationSeconds > knownDuration(video) + 1) {
    throw new LinearValidationError('The slot runs past the end of the video.');
  }
  return {
    kind, programType: input.programType, videoId: input.videoId, startAt, durationSeconds, sourceStartSeconds,
    endAt: new Date(ms(startAt) + durationSeconds * 1000).toISOString(),
    label: text(input.label, 80), notes: text(input.notes),
  };
}

function overlaps(left, right) {
  return left.id !== right.id && ms(left.startAt) < ms(right.endAt) && ms(right.startAt) < ms(left.endAt);
}

// What stands between a draft and air. Blocking issues prevent approval; warnings need acknowledgement.
function approvalIssues(entry, video, rights, now = Date.now()) {
  const blocking = [];
  const warnings = [];
  if (ms(entry.endAt) <= now) blocking.push('This slot has already ended.');
  if (entry.kind === 'break') {
    warnings.push('Ad insertion is not active yet: viewers see a PROtv "We\'ll be right back" card for this break. No ad is served or counted.');
    return { blocking, warnings };
  }
  if (!video) return { blocking: [...blocking, 'The title no longer exists in the catalog.'], warnings };
  if (!SCHEDULABLE_TYPES.has(video.contentType)) blocking.push('Only movies and TV episodes can air on PROtv LIVE.');
  const coverage = rightsCover(video, rights, ms(entry.startAt), ms(entry.endAt));
  if (coverage.status === 'unverified') blocking.push('Linear (scheduled channel) rights are not confirmed for this title. On-demand rights do not count.');
  if (coverage.status === 'denied') blocking.push('Linear rights were recorded as not granted for this title.');
  if (coverage.status === 'expired') blocking.push('The recorded linear rights have expired.');
  if (coverage.status === 'expires-during-slot') blocking.push('The recorded linear rights expire before this slot ends.');
  if (entry.programType === 'premiere') {
    if (video.releaseStatus === 'scheduled' && Number.isFinite(ms(video.releaseAt)) && ms(video.releaseAt) > ms(entry.startAt)) {
      blocking.push(`The premiere slot starts before the approved release time (${channelLabel(video.releaseAt)}).`);
    } else if (!playableAt(video, now) && pendingRelease(video, now)) {
      warnings.push('Not released yet. It airs only after its approved release; until then viewers see a "Premiere starting shortly" card. Scheduling here never releases it.');
    } else if (!playableAt(video, now)) {
      blocking.push('This episode is not ready for release.');
    }
  } else if (!playableAt(video, now)) {
    // Movies, episodes and reruns must already be released on demand.
    blocking.push(pendingRelease(video, now)
      ? 'This title is not released yet. Schedule it as a premiere at or after its release time.'
      : 'This title is not available on PROtv (approved, processed and released).');
  }
  if (video.creatorContractReference && knownDuration(video)
    && (entry.sourceStartSeconds > 0 || entry.sourceStartSeconds + entry.durationSeconds < knownDuration(video) - 1)) {
    warnings.push('This slot airs only part of a creator film. Creator agreements forbid cutting the film, so schedule the rest of it straight after.');
  }
  return { blocking, warnings };
}

// What a viewer gets for an approved entry at `now`. Eligibility is checked at air time, never cached from approval.
function airState(entry, video, rights, now = Date.now()) {
  if (entry.kind === 'break') return 'break';
  if (!video || !SCHEDULABLE_TYPES.has(video.contentType)) return 'unavailable';
  if (linearRightsFor(video, rights, now).status !== 'confirmed') return 'unavailable';
  if (playableAt(video, now)) return 'playing';
  if (entry.programType === 'premiere' && pendingRelease(video, now)) return 'awaiting-release';
  return 'unavailable';
}

// Public description of a slot. An unreleased premiere shows only its series name: no episode title,
// synopsis or artwork appears anywhere before release.
function publicItem(entry, video, state) {
  const base = {
    entryId: entry.id,
    kind: entry.kind,
    startAt: entry.startAt,
    endAt: entry.endAt,
    startLabel: channelLabel(entry.startAt),
    durationSeconds: entry.durationSeconds,
  };
  if (entry.kind === 'break') return { ...base, label: 'Commercial break', title: 'We\'ll be right back' };
  const label = entry.label || PROGRAM_LABELS[entry.programType] || 'Program';
  if (state !== 'playing') {
    return {
      ...base, label: entry.programType === 'premiere' ? 'Premiere' : label,
      title: text(video?.seriesTitle, 200) || 'PROtv Premiere',
      subtitle: video?.contentType === 'EPISODE' ? 'New episode' : '',
    };
  }
  const episode = video.contentType === 'EPISODE';
  return {
    ...base, label,
    contentType: video.contentType,
    videoId: video.id,
    title: episode && text(video.seriesTitle, 200) ? text(video.seriesTitle, 200) : text(video.title, 200),
    subtitle: episode ? [
      Number.isInteger(video.seasonNumber) ? `S${video.seasonNumber}` : '',
      Number.isInteger(video.episodeNumber) ? `E${video.episodeNumber}` : '',
      text(video.episodeTitle || video.title, 200),
    ].filter(Boolean).join(' · ') : (video.year ? String(video.year) : ''),
    description: text(video.description, 600),
    artworkUrl: video.heroImageUrl || video.thumbnailUrl || video.posterUrl || '',
    maturityRating: video.maturityRating || video.ageRating || '',
  };
}

function validateRightsInput(input) {
  if (!RIGHTS_STATUSES.has(input?.status)) throw new LinearValidationError('Record linear rights as confirmed or denied.');
  const basis = text(input.basis, 4000);
  if (basis.length < 20) {
    throw new LinearValidationError('Describe the evidence (at least 20 characters): which agreement or licence clause permits scheduled linear streaming.');
  }
  // An end date means the end of that day in Eastern Time, whatever the season.
  let expiresAt = null;
  if (input.expiresOn) {
    if (typeof input.expiresOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)) throw new LinearValidationError('The end date is invalid.');
    try {
      expiresAt = new Date(Date.parse(channelLocalToUtc(`${input.expiresOn}T23:59`)) + 59_999).toISOString();
    } catch (error) {
      if (error instanceof ChannelTimeError) throw new LinearValidationError('The end date is invalid.');
      throw error;
    }
  } else if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (!Number.isFinite(parsed.getTime())) throw new LinearValidationError('The expiry date is invalid.');
    expiresAt = parsed.toISOString();
  }
  return {
    status: input.status,
    basis,
    agreementReference: text(input.agreementReference, 300),
    territory: text(input.territory, 200),
    expiresAt,
  };
}

function validateLineup(lineup) {
  if (!Array.isArray(lineup) || lineup.length > 28) throw new LinearValidationError('The primetime lineup must be a list.');
  return lineup.map((slot) => {
    if (!Number.isInteger(slot?.weekday) || slot.weekday < 0 || slot.weekday > 6
      || typeof slot.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time)
      || !text(slot.seriesTitle, 200)) {
      throw new LinearValidationError('Each primetime slot needs a weekday, an HH:mm Eastern time and a series name.');
    }
    return { weekday: slot.weekday, time: slot.time, seriesTitle: text(slot.seriesTitle, 200) };
  });
}

module.exports = {
  BREAK_MAX_SECONDS,
  BREAK_MIN_SECONDS,
  CHANNEL_ID,
  DEFAULT_AD_POLICY,
  DEFAULT_PRIMETIME,
  LinearValidationError,
  MAX_ENTRY_SECONDS,
  PROGRAM_LABELS,
  airState,
  approvalIssues,
  entryFields,
  knownDuration,
  linearRightsFor,
  normalizeSeriesTitle,
  overlaps,
  pendingRelease,
  playableAt,
  publicItem,
  rightsKeysFor,
  validateLineup,
  validateRightsInput,
};

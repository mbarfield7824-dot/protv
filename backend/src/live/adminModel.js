const { publicDate, publicEvent } = require('./readModel');

const WRITABLE = new Set([
  'title', 'description', 'artworkUrl', 'scheduledStartAt', 'scheduledEndAt',
  'status', 'accessPolicy', 'published',
]);

const TRANSITIONS = {
  draft: new Set(['draft', 'scheduled', 'cancelled']),
  scheduled: new Set(['scheduled', 'draft', 'live', 'ended', 'cancelled']),
  live: new Set(['live', 'ended', 'cancelled']),
  ended: new Set(['ended']),
  cancelled: new Set(['cancelled']),
};

class LiveValidationError extends Error {}

function validateDate(value, name) {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.exec(value)
    : null;
  if (!match) {
    throw new LiveValidationError(`${name} must be an ISO 8601 timestamp with a timezone.`);
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1
    || Number(day) > days[month - 1] || hour > 23 || minute > 59 || second > 59) {
    throw new LiveValidationError(`${name} must be a valid timestamp.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new LiveValidationError(`${name} must be a valid timestamp.`);
  return date;
}

function validateEvent(input, current = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !WRITABLE.has(key))) {
    throw new LiveValidationError('Live event contains unknown or invalid fields.');
  }
  if (current && Object.keys(input).length === 0) throw new LiveValidationError('Provide at least one field to update.');
  const event = { ...current, ...input };
  if (typeof event.title !== 'string' || !event.title.trim() || event.title.length > 200) {
    throw new LiveValidationError('title must be between 1 and 200 characters.');
  }
  if (typeof event.description !== 'string' || event.description.length > 5000) {
    throw new LiveValidationError('description must be a string of at most 5000 characters.');
  }
  if (typeof event.artworkUrl !== 'string' || event.artworkUrl.length > 2048) {
    throw new LiveValidationError('artworkUrl must be a valid HTTPS URL.');
  }
  try {
    const url = new URL(event.artworkUrl);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      throw new Error('Invalid artwork URL');
    }
  } catch {
    throw new LiveValidationError('artworkUrl must be a valid HTTPS URL.');
  }
  const start = Object.hasOwn(input, 'scheduledStartAt')
    ? validateDate(input.scheduledStartAt, 'scheduledStartAt')
    : current ? new Date(publicDate(current.scheduledStartAt)) : null;
  const end = Object.hasOwn(input, 'scheduledEndAt')
    ? validateDate(input.scheduledEndAt, 'scheduledEndAt')
    : current ? new Date(publicDate(current.scheduledEndAt)) : null;
  if (!(start instanceof Date) || !Number.isFinite(start.getTime())
    || !(end instanceof Date) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new LiveValidationError('scheduledEndAt must be after scheduledStartAt.');
  }
  if (!Object.hasOwn(TRANSITIONS, event.status)) {
    throw new LiveValidationError('Invalid Live event status.');
  }
  if (current ? !TRANSITIONS[current.status]?.has(event.status)
    : !['draft', 'scheduled'].includes(event.status)) {
    throw new LiveValidationError('Invalid Live event lifecycle transition.');
  }
  if (!['free', 'paid'].includes(event.accessPolicy)) {
    throw new LiveValidationError('accessPolicy must be free or paid.');
  }
  if (typeof event.published !== 'boolean') {
    throw new LiveValidationError('published must be a boolean.');
  }
  if (event.published && (event.status !== 'scheduled' || event.accessPolicy !== 'free')) {
    throw new LiveValidationError('Only scheduled free events may be published.');
  }
  return {
    title: event.title.trim(),
    description: event.description,
    artworkUrl: event.artworkUrl,
    scheduledStartAt: start,
    scheduledEndAt: end,
    status: event.status,
    accessPolicy: event.accessPolicy,
    published: event.published,
  };
}

function adminEvent(event) {
  return {
    ...publicEvent(event),
    published: event.published,
    createdAt: publicDate(event.createdAt),
    updatedAt: publicDate(event.updatedAt),
  };
}

module.exports = { LiveValidationError, validateEvent, adminEvent };

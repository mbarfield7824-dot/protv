const crypto = require('crypto');
const { zonedParts, channelLabel, channelLocalToUtc } = require('./time');

// PROtv LIVE audience measurement. Kept apart from on-demand views (playbackTitleMetrics): a tune-in is a viewer
// opening the channel, a video start is the player actually playing a program, and watch time is credited from
// heartbeats bounded by the server's own clock. Counters are sharded so a primetime start does not hot-spot one document.
//   linearChannelSessions/{sessionId}        one viewer visit (pseudonymous; expires after 7 days)
//   linearChannelEventKeys/{hash}            de-duplication of tune-ins, starts and unique viewers
//   linearChannelDailyMetrics/{date}_{shard} per Eastern-time day
//   linearProgramMetrics/{entryId}_{shard}   per scheduled program
const SHARDS = 10;
const HEARTBEAT_MAX_SECONDS = 60;
const MAX_ERRORS_PER_SESSION = 20;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT_TYPES = new Set(['tune_in', 'video_start', 'heartbeat', 'error']);
const ERROR_CODES = new Set(['network', 'manifest', 'media', 'token', 'schedule', 'other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTRY_ID = /^[A-Za-z0-9_-]{1,200}$/;

class LinearEventError extends Error {}

function validateLinearEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LinearEventError('An event object is required.');
  const allowed = ['eventType', 'sessionId', 'guestId', 'entryId', 'seconds', 'code'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new LinearEventError('The event contains unsupported fields.');
  if (!EVENT_TYPES.has(body.eventType)) throw new LinearEventError('Unsupported event type.');
  if (!UUID.test(String(body.sessionId || ''))) throw new LinearEventError('A valid session ID is required.');
  if (body.guestId !== undefined && !UUID.test(String(body.guestId))) throw new LinearEventError('The guest ID is invalid.');
  if (['video_start', 'heartbeat'].includes(body.eventType) && !ENTRY_ID.test(String(body.entryId || ''))) {
    throw new LinearEventError('A program is required.');
  }
  if (body.entryId !== undefined && !ENTRY_ID.test(String(body.entryId))) throw new LinearEventError('The program ID is invalid.');
  if (body.eventType === 'heartbeat'
    && (!Number.isInteger(body.seconds) || body.seconds < 1 || body.seconds > HEARTBEAT_MAX_SECONDS)) {
    throw new LinearEventError(`Heartbeats report 1 to ${HEARTBEAT_MAX_SECONDS} watched seconds.`);
  }
  if (body.eventType === 'error' && !ERROR_CODES.has(body.code)) throw new LinearEventError('Unsupported error code.');
  return {
    eventType: body.eventType,
    sessionId: body.sessionId.toLowerCase(),
    ...(body.guestId ? { guestId: body.guestId.toLowerCase() } : {}),
    ...(body.entryId ? { entryId: body.entryId } : {}),
    ...(body.eventType === 'heartbeat' ? { seconds: body.seconds } : {}),
    ...(body.eventType === 'error' ? { code: body.code } : {}),
  };
}

function ownerAccount(user) {
  const ownerEmail = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  return Boolean(ownerEmail && user?.email_verified === true && String(user.email || '').trim().toLowerCase() === ownerEmail);
}

const millis = (value) => (typeof value === 'number' ? value : value instanceof Date ? value.getTime()
  : value?.toDate ? value.toDate().getTime() : Date.parse(value) || 0);

// Pure accounting shared by the Firestore and memory recorders. Returns the counter increments and session update.
function account(event, { session, eventKeyExists, viewerKeyExists, entry, now }) {
  const daily = {};
  const program = {};
  let sessionUpdate = null;
  const result = { recorded: true };
  if (event.eventType === 'tune_in') {
    if (eventKeyExists) return { result: { recorded: false, duplicate: true } };
    daily.tuneIns = 1;
    if (event.guestId && !viewerKeyExists) daily.uniqueViewers = 1;
    if (entry) program.tuneIns = 1;
    sessionUpdate = { startedAt: now, lastCreditAt: now, errors: 0 };
  } else {
    if (!session) return { result: { recorded: false, reason: 'no-tune-in' } };
    if (event.eventType === 'video_start') {
      if (!entry) return { result: { recorded: false, reason: 'not-on-air' } };
      if (eventKeyExists) return { result: { recorded: false, duplicate: true } };
      daily.videoStarts = 1;
      program.videoStarts = 1;
      sessionUpdate = { lastCreditAt: now };
    } else if (event.eventType === 'heartbeat') {
      if (!entry) return { result: { recorded: false, reason: 'not-on-air' } };
      // Never credit more than the whole seconds that really passed since this session's last credit.
      const elapsed = Math.floor((now - millis(session.lastCreditAt || session.startedAt)) / 1000);
      const credited = Math.max(0, Math.min(event.seconds, HEARTBEAT_MAX_SECONDS, elapsed));
      if (!credited) return { result: { recorded: false, reason: 'too-soon' } };
      daily.watchSeconds = credited;
      program.watchSeconds = credited;
      sessionUpdate = { lastCreditAt: now };
      result.creditedSeconds = credited;
    } else {
      if ((session.errors || 0) >= MAX_ERRORS_PER_SESSION) return { result: { recorded: false, reason: 'error-limit' } };
      daily.errors = 1;
      daily[`errors_${event.code}`] = 1;
      if (entry) program.errors = 1;
      sessionUpdate = { errors: (session.errors || 0) + 1 };
    }
  }
  return { result, daily, program, sessionUpdate };
}

function programInfo(entry, title) {
  return { entryId: entry.id, videoId: entry.videoId || null, kind: entry.kind, startAt: entry.startAt, title: title || '' };
}

class LinearAnalytics {
  constructor({ db, secret = process.env.PLAYBACK_TRACKING_SECRET || '', now = () => Date.now(), random = Math.random } = {}) {
    this.db = db;
    this.secret = secret;
    this.now = now;
    this.random = random;
  }

  requireConfigured() {
    if (!this.db) throw new Error('PROtv LIVE analytics require Firestore.');
    if (typeof this.secret !== 'string' || this.secret.length < 32) {
      throw new Error('PROtv LIVE analytics require a 32-character PLAYBACK_TRACKING_SECRET.');
    }
  }

  digest(value) { return crypto.createHmac('sha256', this.secret).update(value).digest('hex'); }

  shard() { return Math.floor(this.random() * SHARDS); }

  async record(event, { user = null, entry = null, title = '' } = {}) {
    this.requireConfigured();
    if (user?.admin === true || ownerAccount(user)) return { recorded: false, excluded: true };
    const now = this.now();
    const day = zonedParts(now).date;
    const db = this.db;
    const sessionRef = db.collection('linearChannelSessions').doc(event.sessionId);
    const eventKey = this.digest(`${event.eventType}:${event.sessionId}:${event.entryId || ''}`);
    const eventKeyRef = db.collection('linearChannelEventKeys').doc(eventKey);
    const viewerRef = event.guestId ? db.collection('linearChannelEventKeys').doc(this.digest(`viewer:${day}:${event.guestId}`)) : null;
    const shard = this.shard();
    const dailyRef = db.collection('linearChannelDailyMetrics').doc(`${day}_${shard}`);
    const programRef = entry ? db.collection('linearProgramMetrics').doc(`${entry.id}_${shard}`) : null;
    const { FieldValue } = require('firebase-admin/firestore');

    return db.runTransaction(async (transaction) => {
      const session = await transaction.get(sessionRef);
      const eventSnapshot = await transaction.get(eventKeyRef);
      const viewer = viewerRef && event.eventType === 'tune_in' ? await transaction.get(viewerRef) : null;
      const outcome = account(event, {
        session: session.exists ? session.data() : null,
        eventKeyExists: eventSnapshot.exists,
        viewerKeyExists: Boolean(viewer?.exists),
        entry,
        now,
      });
      if (!outcome.daily) return outcome.result;
      const expiresAt = new Date(now + RETENTION_MS);
      const increments = (fields) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, FieldValue.increment(value)]));
      transaction.set(sessionRef, {
        ...Object.fromEntries(Object.entries(outcome.sessionUpdate).map(([key, value]) => [key, typeof value === 'number' && key !== 'errors' ? new Date(value) : value])),
        expiresAt,
      }, { merge: true });
      if (['tune_in', 'video_start'].includes(event.eventType)) transaction.create(eventKeyRef, { expiresAt });
      if (outcome.daily.uniqueViewers) transaction.create(viewerRef, { expiresAt: new Date(now + 2 * 86_400_000) });
      transaction.set(dailyRef, { date: day, ...increments(outcome.daily) }, { merge: true });
      if (programRef && Object.keys(outcome.program).length) {
        transaction.set(programRef, { ...programInfo(entry, title), ...increments(outcome.program) }, { merge: true });
      }
      return outcome.result;
    });
  }

  async report({ from, to }) {
    if (!this.db) throw new Error('PROtv LIVE analytics require Firestore.');
    const daily = await this.db.collection('linearChannelDailyMetrics').where('date', '>=', from).where('date', '<=', to).get();
    const range = programRange(from, to);
    const programs = await this.db.collection('linearProgramMetrics')
      .where('startAt', '>=', range.fromIso).where('startAt', '<', range.toIso).get();
    return summarize(daily.docs.map((doc) => doc.data()), programs.docs.map((doc) => doc.data()), { from, to });
  }
}

// Programs that started on the given Eastern dates (8 PM ET is already the next day in UTC).
function programRange(from, to) {
  const nextDay = new Date(Date.parse(`${to}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { fromIso: channelLocalToUtc(`${from}T00:00`), toIso: channelLocalToUtc(`${nextDay}T00:00`) };
}

const COUNTERS = ['tuneIns', 'uniqueViewers', 'videoStarts', 'watchSeconds', 'errors'];

function summarize(dailyShards, programShards, { from, to }) {
  const days = new Map();
  for (const shard of dailyShards) {
    const day = days.get(shard.date) || { date: shard.date, ...Object.fromEntries(COUNTERS.map((key) => [key, 0])), errorsByCode: {} };
    for (const key of COUNTERS) day[key] += Number(shard[key]) || 0;
    for (const [key, value] of Object.entries(shard)) {
      if (key.startsWith('errors_')) day.errorsByCode[key.slice(7)] = (day.errorsByCode[key.slice(7)] || 0) + (Number(value) || 0);
    }
    days.set(shard.date, day);
  }
  const programs = new Map();
  for (const shard of programShards) {
    const program = programs.get(shard.entryId) || {
      entryId: shard.entryId, videoId: shard.videoId, kind: shard.kind, title: shard.title, startAt: shard.startAt,
      startLabel: shard.startAt ? channelLabel(shard.startAt) : '', tuneIns: 0, videoStarts: 0, watchSeconds: 0, errors: 0,
    };
    for (const key of ['tuneIns', 'videoStarts', 'watchSeconds', 'errors']) program[key] += Number(shard[key]) || 0;
    programs.set(shard.entryId, program);
  }
  const totals = Object.fromEntries(COUNTERS.map((key) => [key, [...days.values()].reduce((sum, day) => sum + day[key], 0)]));
  const ratio = (numerator, denominator) => (denominator ? Math.round((numerator / denominator) * 100) / 100 : 0);
  const withRates = (row) => ({
    ...row,
    watchMinutes: Math.round(row.watchSeconds / 6) / 10,
    averageMinutesPerStart: ratio(row.watchSeconds / 60, row.videoStarts),
  });
  return {
    from, to,
    totals: { ...withRates(totals), startRate: ratio(totals.videoStarts, totals.tuneIns) },
    days: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)).map(withRates),
    programs: [...programs.values()].sort((left, right) => left.startAt.localeCompare(right.startAt)).map(withRates),
    note: 'PROtv LIVE figures are separate from on-demand views. Watch time is credited from once-a-minute heartbeats and never exceeds real elapsed time.',
  };
}

module.exports = { HEARTBEAT_MAX_SECONDS, LinearAnalytics, LinearEventError, account, programRange, summarize, validateLinearEvent };

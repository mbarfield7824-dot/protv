// First-party, automatic ad measurement for PROtv placements.
//
// Counting rules (see docs/DEPLOYMENT.md, "Ad measurement"):
// - A served impression is recorded only when an ad actually begins to render (display) or the video ad's first
//   frame plays (the Google IMA IMPRESSION event). Requests are counted separately and are never impressions.
// - A viewable impression needs at least 50% of the ad's pixels on screen in a visible tab for 1 continuous second
//   (display) or 2 continuous seconds of playback (video), measured in the browser with IntersectionObserver. It is
//   PROtv's own measurement, not an MRC-accredited one, and an exposure that cannot be measured is never viewable.
// - Every event is recorded at most once per ad exposure: an exposure is one signed ad session plus the ad's position
//   in the break, so re-renders, retries, refreshes and repeated SDK events cannot add to the counts, while separate
//   ads (a new page load, a second ad in a pod) count on their own.
// - Events are accepted only in a valid order, at plausible times, and from sessions this server signed. Automated
//   browsers and excessive frequency are counted as invalid traffic; test and Administrator activity is counted as
//   test traffic. Neither is ever included in the valid totals.
// No account, contact, cookie or device identifier is stored. Request addresses are used only as short-lived keyed
// hashes for rate limiting.
const crypto = require('crypto');

// When automatic measurement went live in production (deployment dpl_86X4Un5NbCodJkHjkRYrJ1AXbgcK). Reports state
// it, so a period that starts earlier is never presented as measured with zero results.
const MEASUREMENT_STARTED_AT = '2026-11-08T19:47:49Z';
const TOKEN_VERSION = 'm1';
const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const DISPLAY_VIEWABLE_MS = 1000;
const VIDEO_VIEWABLE_MS = 2000;
const MIN_COMPLETE_MS = 1000;
const MAX_POD_POSITION = 5;
const MINT_LIMIT_PER_MINUTE = 120;
const SHARED_MINT_LIMIT_PER_MINUTE = 600;
const SERVED_LIMIT_PER_HOUR = 60;
const RATE_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const VALID_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
const TEST_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const UNATTRIBUTABLE_ADDRESSES = new Set(['unknown', 'vercel-shared-client']);

const CHANNELS = Object.freeze({
  display: Object.freeze({
    placements: ['native_banner'],
    events: ['served', 'viewable', 'click', 'error'],
  }),
  video: Object.freeze({
    placements: ['preroll'],
    events: ['served', 'start', 'firstQuartile', 'midpoint', 'thirdQuartile', 'complete', 'skip', 'click', 'viewable', 'error'],
  }),
});
const PAGES = ['home', 'title', 'series', 'podcast', 'browse', 'other'];
const ERROR_REASONS = ['empty', 'script_error', 'sdk_unavailable', 'ad_error', 'playback_blocked', 'timeout'];
const TRAFFIC = ['valid', 'test', 'invalid'];
// Counter fields on each daily document. Valid traffic uses the bare name; other traffic is prefixed.
const COUNTERS = ['requests', 'served', 'measurable', 'viewable', 'clicks', 'starts', 'firstQuartiles', 'midpoints',
  'thirdQuartiles', 'completes', 'skips', 'errors', 'interrupted'];
const EVENT_COUNTER = {
  served: 'served', viewable: 'viewable', click: 'clicks', start: 'starts', firstQuartile: 'firstQuartiles',
  midpoint: 'midpoints', thirdQuartile: 'thirdQuartiles', complete: 'completes', skip: 'skips',
};
// Crawlers, monitors, headless and scripted clients. Their activity is counted as invalid, never as delivery.
const AUTOMATED_AGENT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl\/|wget\/|python-|aiohttp|httpx|axios\/|node-fetch|undici|go-http-client|okhttp|java\/|libwww|phantomjs|selenium|puppeteer|playwright|webdriver|facebookexternalhit|preview|scrapy|postman/i;

class AdMeasurementInputError extends Error {}
class AdMeasurementOrderError extends Error {}
class AdMeasurementRateLimitError extends Error {
  constructor(retryAfter) {
    super('Too many ad measurement sessions.');
    this.retryAfter = retryAfter;
  }
}

function measurementKey(env = process.env) {
  const explicit = String(env.AD_MEASUREMENT_SECRET || '');
  if (explicit.length >= 32) return explicit;
  const playback = String(env.PLAYBACK_TRACKING_SECRET || '');
  if (playback.length < 32) return '';
  // Domain-separated from playback tracking: tokens of one can never be used as the other.
  return crypto.createHmac('sha256', playback).update('protv-ad-measurement-v1').digest('hex');
}

function sign(value, key) {
  return crypto.createHmac('sha256', key).update(value).digest('base64url');
}

function sameText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function automatedAgent(userAgent) {
  const agent = String(userAgent || '').trim();
  return !agent || AUTOMATED_AGENT.test(agent);
}

function utcDay(milliseconds) {
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function validateSessionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdMeasurementInputError('A measurement session request is required.');
  if (Object.keys(body).some((key) => !['channel', 'placement', 'page', 'automated'].includes(key))) {
    throw new AdMeasurementInputError('The measurement session request contains unsupported fields.');
  }
  if (body.channel !== 'display' || !CHANNELS.display.placements.includes(body.placement)) {
    throw new AdMeasurementInputError('Unsupported ad placement.');
  }
  if (!PAGES.includes(body.page)) throw new AdMeasurementInputError('Unsupported page type.');
  if (body.automated !== undefined && typeof body.automated !== 'boolean') throw new AdMeasurementInputError('automated must be true or false.');
  return { channel: 'display', placement: body.placement, scope: body.page, automated: body.automated === true };
}

function validateEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdMeasurementInputError('An ad measurement event is required.');
  const allowed = ['token', 'position', 'eventType', 'measurable', 'reason', 'automated'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new AdMeasurementInputError('The ad event contains unsupported fields.');
  if (typeof body.token !== 'string' || body.token.length > 1024) throw new AdMeasurementInputError('A measurement session is required.');
  if (!Number.isSafeInteger(body.position) || body.position < 0 || body.position > MAX_POD_POSITION) {
    throw new AdMeasurementInputError('Unsupported ad position.');
  }
  if (typeof body.eventType !== 'string' || !Object.hasOwn(EVENT_COUNTER, body.eventType) && body.eventType !== 'error') {
    throw new AdMeasurementInputError('Unsupported ad event.');
  }
  if (body.measurable !== undefined && typeof body.measurable !== 'boolean') throw new AdMeasurementInputError('measurable must be true or false.');
  if (body.automated !== undefined && typeof body.automated !== 'boolean') throw new AdMeasurementInputError('automated must be true or false.');
  if (body.eventType === 'error' ? !ERROR_REASONS.includes(body.reason) : body.reason !== undefined) {
    throw new AdMeasurementInputError('A supported failure reason is required for, and only for, failures.');
  }
  return {
    token: body.token,
    position: body.position,
    eventType: body.eventType,
    measurable: body.measurable === true,
    automated: body.automated === true,
    ...(body.reason ? { reason: body.reason } : {}),
  };
}

function emptyCounters() {
  return Object.fromEntries(COUNTERS.map((name) => [name, 0]));
}

function counterField(traffic, name) {
  return traffic === 'valid' ? name : `${traffic}_${name}`;
}

class AdMeasurementService {
  constructor({
    db,
    key = measurementKey(),
    now = () => Date.now(),
    increment = (value) => require('firebase-admin').firestore.FieldValue.increment(value),
  } = {}) {
    this.db = db;
    this.key = key;
    this.now = now;
    this.increment = increment;
  }

  get configured() {
    return Boolean(this.db && typeof this.key === 'string' && this.key.length >= 32);
  }

  digest(value) {
    return crypto.createHmac('sha256', this.key).update(value).digest('hex').slice(0, 40);
  }

  createToken({ channel, placement, scope, traffic }) {
    const payload = { v: 1, sid: crypto.randomUUID(), ch: channel, pl: placement, sc: scope, tr: traffic, exp: this.now() + TOKEN_LIFETIME_MS };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${TOKEN_VERSION}.${encoded}.${sign(`${TOKEN_VERSION}.${encoded}`, this.key)}`;
  }

  verifyToken(token) {
    const [version, encoded, signature, extra] = String(token || '').split('.');
    if (version !== TOKEN_VERSION || !encoded || !signature || extra !== undefined
      || !sameText(sign(`${version}.${encoded}`, this.key), signature)) {
      throw new AdMeasurementInputError('The ad measurement session is invalid.');
    }
    let payload;
    try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch {
      throw new AdMeasurementInputError('The ad measurement session is invalid.');
    }
    if (payload?.v !== 1 || !Object.hasOwn(CHANNELS, payload.ch) || !CHANNELS[payload.ch].placements.includes(payload.pl)
      || typeof payload.sid !== 'string' || typeof payload.sc !== 'string' || !TRAFFIC.includes(payload.tr)
      || !Number.isFinite(payload.exp) || payload.exp <= this.now()) {
      throw new AdMeasurementInputError('The ad measurement session has expired or is invalid.');
    }
    return payload;
  }

  // Traffic class is fixed when the session is signed: automated clients are invalid; test and Administrator
  // sessions are test traffic. Nothing about the viewer is placed in the token beyond that class.
  classify({ userAgent, automated = false, test = false, user = null }) {
    if (automated || automatedAgent(userAgent)) return 'invalid';
    if (test || user?.admin === true || ownerAccount(user)) return 'test';
    return 'valid';
  }

  async consumeMintLimit(clientAddress) {
    const now = this.now();
    const minute = Math.floor(now / 60_000) * 60_000;
    const shared = UNATTRIBUTABLE_ADDRESSES.has(clientAddress || 'unknown');
    const maximum = shared ? SHARED_MINT_LIMIT_PER_MINUTE : MINT_LIMIT_PER_MINUTE;
    const ref = this.db.collection('adRateLimits').doc(`mint_${this.digest(`address:${clientAddress || 'unknown'}`)}_${minute}`);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const count = snapshot.exists ? Number(snapshot.data().count) || 0 : 0;
      if (count >= maximum) throw new AdMeasurementRateLimitError(Math.max(1, Math.ceil((minute + 60_000 - now) / 1000)));
      transaction.set(ref, { count: count + 1, expiresAt: new Date(now + RATE_RETENTION_MS) });
    });
  }

  // Signs a measurement session for one ad request and counts the request (never as an impression).
  async startSession({ channel, placement, scope, userAgent, automated, test, user, clientAddress }) {
    if (!this.configured) throw new Error('Ad measurement is not configured.');
    if (!Object.hasOwn(CHANNELS, channel) || !CHANNELS[channel].placements.includes(placement)) {
      throw new AdMeasurementInputError('Unsupported ad placement.');
    }
    if (channel === 'video' ? !/^[A-Za-z0-9_-]{1,200}$/.test(scope) : !PAGES.includes(scope)) {
      throw new AdMeasurementInputError('Unsupported ad attribution.');
    }
    await this.consumeMintLimit(clientAddress);
    const traffic = this.classify({ userAgent, automated, test, user });
    const now = this.now();
    await this.db.collection('adDailyMetrics').doc(dailyId(utcDay(now), channel, placement, scope)).set({
      day: utcDay(now), channel, placement, platform: 'web', scope,
      [counterField(traffic, 'requests')]: this.increment(1),
      updatedAt: new Date(now),
    }, { merge: true });
    return { token: this.createToken({ channel, placement, scope, traffic }), traffic };
  }

  async recordEvent({ event, userAgent, clientAddress }) {
    if (!this.configured) throw new Error('Ad measurement is not configured.');
    const session = this.verifyToken(event.token);
    const channel = CHANNELS[session.ch];
    if (!channel.events.includes(event.eventType)) throw new AdMeasurementInputError('This event does not apply to this placement.');
    // Display units hold one ad; position 0 identifies a video break that failed before any ad was chosen.
    const position = event.position;
    if (session.ch === 'display' ? position !== 1 : position === 0 && event.eventType !== 'error' || position > MAX_POD_POSITION) {
      throw new AdMeasurementInputError('Unsupported ad position.');
    }
    const now = this.now();
    const exposureRef = this.db.collection('adExposures').doc(this.digest(`exposure:${session.sid}:${position}`));
    const servedLimitRef = !UNATTRIBUTABLE_ADDRESSES.has(clientAddress || 'unknown') && (event.eventType === 'served' || event.eventType === 'start')
      ? this.db.collection('adRateLimits').doc(`served_${this.digest(`address:${clientAddress}`)}_${Math.floor(now / 3_600_000)}`)
      : null;

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(exposureRef);
      const limit = servedLimitRef ? await transaction.get(servedLimitRef) : null;
      const exposure = snapshot.exists ? snapshot.data() : null;
      const events = exposure?.events || {};
      if (events[event.eventType]) return { recorded: false, duplicate: true };
      rejectOutOfOrder(session.ch, event, events, exposure?.measurable === true, now);

      // The first accepted event classifies the exposure; later events stay in the same class.
      let traffic = exposure?.traffic || session.tr;
      let invalidReason = exposure?.invalidReason || null;
      let limitCount = null;
      if (!exposure) {
        if (traffic !== 'invalid' && (event.automated || automatedAgent(userAgent))) { traffic = 'invalid'; invalidReason = 'automated'; }
        if (limit) {
          limitCount = (limit.exists ? Number(limit.data().count) || 0 : 0) + 1;
          if (traffic === 'valid' && limitCount > SERVED_LIMIT_PER_HOUR) { traffic = 'invalid'; invalidReason = 'frequency'; }
        }
      }

      const counters = {};
      const add = (name) => { counters[counterField(traffic, name)] = this.increment(1); };
      if (event.eventType === 'error') add(events.served || events.start ? 'interrupted' : 'errors');
      else add(EVENT_COUNTER[event.eventType]);
      // Viewability is decided once per exposure: with the render (display) or the ad's start (video).
      const measuringEvent = session.ch === 'display' ? 'served' : 'start';
      let measurable = exposure?.measurable === true;
      const deciding = event.eventType === measuringEvent && !exposure?.measurabilityKnown;
      if (deciding) {
        measurable = event.measurable;
        if (measurable) add('measurable');
      }

      const day = utcDay(now);
      transaction.set(exposureRef, {
        channel: session.ch,
        placement: session.pl,
        platform: 'web',
        scope: session.sc,
        position,
        traffic,
        ...(invalidReason ? { invalidReason } : {}),
        measurable,
        ...(deciding ? { measurabilityKnown: true } : {}),
        ...(event.reason ? { failureReason: event.reason } : {}),
        events: { ...events, [event.eventType]: now },
        createdAt: exposure?.createdAt || new Date(now),
        expiresAt: new Date(now + (traffic === 'test' ? TEST_RETENTION_MS : VALID_RETENTION_MS)),
      }, { merge: true });
      if (limitCount !== null) transaction.set(servedLimitRef, { count: limitCount, expiresAt: new Date(now + RATE_RETENTION_MS) });
      transaction.set(this.db.collection('adDailyMetrics').doc(dailyId(day, session.ch, session.pl, session.sc)), {
        day, channel: session.ch, placement: session.pl, platform: 'web', scope: session.sc, ...counters, updatedAt: new Date(now),
      }, { merge: true });
      return { recorded: true, traffic };
    });
  }

  async report({ from, to }) {
    if (!this.db) throw new Error('Ad measurement requires Firestore.');
    const snapshot = await this.db.collection('adDailyMetrics').where('day', '>=', from).where('day', '<=', to).get();
    const placements = new Map();
    const titles = new Map();
    for (const document of snapshot.docs) {
      const row = document.data();
      const key = `${row.channel}:${row.placement}`;
      const placement = placements.get(key) || { channel: row.channel, placement: row.placement, platform: row.platform || 'web', valid: emptyCounters(), test: emptyCounters(), invalid: emptyCounters() };
      for (const traffic of TRAFFIC) for (const name of COUNTERS) {
        const value = Number(row[counterField(traffic, name)]);
        if (Number.isSafeInteger(value) && value > 0) placement[traffic][name] += value;
      }
      placements.set(key, placement);
      if (row.channel === 'video') {
        const title = titles.get(row.scope) || { videoId: row.scope, ...emptyCounters() };
        for (const name of COUNTERS) {
          const value = Number(row[name]);
          if (Number.isSafeInteger(value) && value > 0) title[name] += value;
        }
        titles.set(row.scope, title);
      }
    }
    const measuredFrom = `${to}T23:59:59Z` < MEASUREMENT_STARTED_AT ? null
      : `${from}T00:00:00Z` < MEASUREMENT_STARTED_AT ? MEASUREMENT_STARTED_AT : `${from}T00:00:00Z`;
    return { from, to, measurementStartedAt: MEASUREMENT_STARTED_AT, measuredFrom, placements: [...placements.values()], titles: [...titles.values()] };
  }

  // Counts recorded before automatic measurement, reported exactly as stored. They are never reclassified:
  // earlier player impressions are not served or viewable impressions under these rules.
  async legacyTotals() {
    if (!this.db) return { playerImpressions: 0, providerImpressions: 0 };
    const snapshot = await this.db.collection('adTitleMetrics').get();
    let playerImpressions = 0;
    let providerImpressions = 0;
    for (const document of snapshot.docs) {
      const row = document.data();
      if (Number.isSafeInteger(row.playerImpressions) && row.playerImpressions > 0) playerImpressions += row.playerImpressions;
      if (Number.isSafeInteger(row.providerImpressions) && row.providerImpressions > 0) providerImpressions += row.providerImpressions;
    }
    return { playerImpressions, providerImpressions };
  }
}

function dailyId(day, channel, placement, scope) {
  return `${day}__${channel}__${placement}__${scope}`;
}

function ownerAccount(user) {
  const ownerEmail = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  return Boolean(ownerEmail && user?.email_verified === true && String(user.email || '').trim().toLowerCase() === ownerEmail);
}

// Events that make no sense yet (or any more) are refused rather than counted.
function rejectOutOfOrder(channel, event, events, measurable, now) {
  const refuse = (message) => { throw new AdMeasurementOrderError(message); };
  const since = (name) => now - Number(events[name]);
  switch (event.eventType) {
    case 'served':
      if (events.error) refuse('A failed ad cannot be served.');
      break;
    case 'start':
      if (events.error) refuse('A failed ad cannot start.');
      break;
    case 'viewable':
      if (!measurable) refuse('This ad exposure could not be measured for viewability.');
      if (channel === 'display') {
        if (!events.served) refuse('A viewable impression requires a served impression.');
        if (since('served') < DISPLAY_VIEWABLE_MS) refuse('A display ad must be on screen for one continuous second.');
      } else {
        if (!events.start) refuse('A viewable video impression requires the ad to start.');
        if (since('start') < VIDEO_VIEWABLE_MS) refuse('A video ad must play on screen for two continuous seconds.');
      }
      break;
    case 'firstQuartile': case 'midpoint': case 'thirdQuartile': case 'skip':
      if (!events.start) refuse('Video progress requires the ad to start.');
      if (event.eventType === 'skip' && events.complete) refuse('A completed ad cannot be skipped.');
      break;
    case 'complete':
      if (!events.start) refuse('A completion requires the ad to start.');
      if (events.skip) refuse('A skipped ad cannot complete.');
      if (since('start') < MIN_COMPLETE_MS) refuse('The ad completed implausibly quickly.');
      break;
    case 'click':
      if (!events.served && !events.start) refuse('A click requires a rendered ad.');
      break;
    case 'error':
      break;
    default:
      refuse('Unsupported ad event.');
  }
}

module.exports = {
  AdMeasurementInputError,
  AdMeasurementOrderError,
  AdMeasurementRateLimitError,
  AdMeasurementService,
  CHANNELS,
  COUNTERS,
  DISPLAY_VIEWABLE_MS,
  ERROR_REASONS,
  MEASUREMENT_STARTED_AT,
  PAGES,
  SERVED_LIMIT_PER_HOUR,
  VIDEO_VIEWABLE_MS,
  automatedAgent,
  measurementKey,
  validateEvent,
  validateSessionRequest,
};

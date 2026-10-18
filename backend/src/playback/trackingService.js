const crypto = require('crypto');
const { isViewerEligible } = require('../catalog/readModel');

const QUALIFIED_VIEW_SECONDS = 30;
const EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;

class PlaybackInputError extends Error {}
class PlaybackNotEligibleError extends Error {}
class PlaybackRateLimitError extends Error {
  constructor(retryAfter) {
    super('Playback event rate limit exceeded.');
    this.retryAfter = retryAfter;
  }
}

function validUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validatePlaybackEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PlaybackInputError('A playback event object is required.');
  }
  const allowedKeys = body.eventType === 'qualified_view'
    ? ['videoId', 'sessionId', 'guestId', 'eventType', 'playedSeconds']
    : ['videoId', 'sessionId', 'guestId', 'eventType'];
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    throw new PlaybackInputError('The playback event contains unsupported fields.');
  }
  if (typeof body.videoId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.videoId)) {
    throw new PlaybackInputError('A valid title ID is required.');
  }
  if (!validUuid(body.sessionId) || !validUuid(body.guestId)) {
    throw new PlaybackInputError('Valid playback session and guest IDs are required.');
  }
  if (!['play_start', 'qualified_view'].includes(body.eventType)) {
    throw new PlaybackInputError('Unsupported playback event type.');
  }
  if (body.eventType === 'qualified_view'
    && body.playedSeconds !== QUALIFIED_VIEW_SECONDS) {
    throw new PlaybackInputError('A qualified-view event must represent the 30-second threshold.');
  }
  return {
    videoId: body.videoId,
    sessionId: body.sessionId,
    guestId: body.guestId,
    eventType: body.eventType,
    ...(body.eventType === 'qualified_view' ? { playedSeconds: body.playedSeconds } : {}),
  };
}

function dateMilliseconds(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeCount(value, label) {
  if (value === undefined || value === null) return 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Stored ${label} count is invalid.`);
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ownerAccount(user) {
  const ownerEmail = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  return Boolean(ownerEmail && user?.email_verified === true
    && String(user.email || '').trim().toLowerCase() === ownerEmail);
}

class PlaybackTrackingService {
  constructor({
    db,
    secret = process.env.PLAYBACK_TRACKING_SECRET || '',
    now = () => Date.now(),
    ipLimit = 600,
    viewerLimit = 90,
  } = {}) {
    this.db = db;
    this.secret = secret;
    this.now = now;
    this.ipLimit = ipLimit;
    this.viewerLimit = viewerLimit;
  }

  requireConfigured() {
    if (!this.db) throw new Error('Playback tracking requires Firestore.');
    if (typeof this.secret !== 'string' || this.secret.length < 32) {
      throw new Error('Playback tracking requires a 32-character PLAYBACK_TRACKING_SECRET.');
    }
  }

  guestIdentityKey(guestId) {
    return `guest:${this.digest(`guest:${guestId}`)}`;
  }

  identityKeys({ user, guestId }) {
    if (user) {
      if (typeof user.uid !== 'string' || !user.uid) {
        throw new PlaybackInputError('The signed-in viewer identity is invalid.');
      }
      return [`account:${this.digest(`account:${user.uid}`)}`];
    }
    return [this.guestIdentityKey(guestId)];
  }

  digest(value) {
    return crypto.createHmac('sha256', this.secret).update(value).digest('hex');
  }

  async consumeRateLimit(clientAddress, identityKey) {
    const now = this.now();
    const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
    const expiresAt = new Date(now + EVENT_RETENTION_MS);
    const ipHash = this.digest(`address:${clientAddress || 'unknown'}`);
    const viewerHash = this.digest(identityKey);
    const limits = [
      { id: `${ipHash}_${windowStart}`, maximum: this.ipLimit },
      { id: `${viewerHash}_${windowStart}`, maximum: this.viewerLimit },
    ];
    const refs = limits.map(({ id }) => this.db.collection('playbackRateLimits').doc(id));
    await this.db.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const counts = snapshots.map((snapshot) => snapshot.exists ? safeCount(snapshot.data().count, 'rate limit') : 0);
      const exceeded = counts.findIndex((count, index) => count >= limits[index].maximum);
      if (exceeded !== -1) {
        throw new PlaybackRateLimitError(Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000)));
      }
      refs.forEach((ref, index) => transaction.set(ref, {
        count: counts[index] + 1,
        expiresAt,
      }));
    });
  }

  async recordEvent({ event, user = null, clientAddress = '' }) {
    this.requireConfigured();
    const identityKeys = this.identityKeys({ user, guestId: event.guestId });
    await this.consumeRateLimit(clientAddress, identityKeys[identityKeys.length - 1]);

    const videoRef = this.db.collection('videos').doc(event.videoId);
    const sessionRef = this.db.collection('playbackViewSessions').doc(event.sessionId);
    const eventId = sha256(`${event.sessionId}:${event.eventType}`);
    const eventRef = this.db.collection('playbackViewEvents').doc(eventId);
    const metricsRef = this.db.collection('playbackTitleMetrics').doc(event.videoId);
    const dedupRefs = identityKeys.map((key) => this.db.collection('playbackViewDedup')
      .doc(sha256(`${event.videoId}:${key}`)));
    const now = this.now();

    const result = await this.db.runTransaction(async (transaction) => {
      const videoSnapshot = await transaction.get(videoRef);
      const sessionSnapshot = await transaction.get(sessionRef);
      const eventSnapshot = await transaction.get(eventRef);
      const metricsSnapshot = event.eventType === 'play_start'
        ? await transaction.get(metricsRef) : null;
      const dedupSnapshots = event.eventType === 'qualified_view'
        ? await Promise.all(dedupRefs.map((ref) => transaction.get(ref))) : [];
      let parentSnapshot = null;
      let parentRef = null;
      let video = videoSnapshot.exists ? { id: videoSnapshot.id, ...videoSnapshot.data() } : null;
      if (video?.contentType === 'PODCAST_EPISODE'
        && typeof video.podcastShowId === 'string'
        && /^[A-Za-z0-9_-]{1,200}$/.test(video.podcastShowId)) {
        parentRef = this.db.collection('videos').doc(video.podcastShowId);
        parentSnapshot = await transaction.get(parentRef);
        if (parentSnapshot.exists) {
          video = { ...video, podcastShow: { id: parentSnapshot.id, ...parentSnapshot.data() } };
        }
      }
      if (!videoSnapshot.exists || !isViewerEligible(
        video,
        video?.podcastShow ? [video, video.podcastShow] : [video].filter(Boolean),
      ) || video.muxPlaybackId.startsWith('demo-playback')) {
        throw new PlaybackNotEligibleError('Playback tracking is available only for published, playable titles.');
      }

      const currentViews = safeCount(video.views, 'view');
      if (user?.admin === true || ownerAccount(user)) {
        return { excluded: true, recorded: false, views: currentViews };
      }

      const expectedKeys = new Set(identityKeys);
      if (eventSnapshot.exists) {
        const storedEvent = eventSnapshot.data();
        if (storedEvent.videoId !== event.videoId || storedEvent.eventType !== event.eventType) {
          throw new PlaybackInputError('The playback event ID conflicts with an existing event.');
        }
        const qualifiedAfterMs = event.eventType === 'play_start' && sessionSnapshot.exists
          ? Math.max(0, dateMilliseconds(sessionSnapshot.data().startedAt)
            + QUALIFIED_VIEW_SECONDS * 1000 - now)
          : event.eventType === 'play_start' ? QUALIFIED_VIEW_SECONDS * 1000 : undefined;
        return {
          duplicate: true,
          qualified: event.eventType === 'qualified_view' && storedEvent.qualified === true,
          views: currentViews,
          ...(event.eventType === 'play_start' ? { qualifiedAfterMs } : {}),
        };
      }

      if (event.eventType === 'play_start') {
        if (sessionSnapshot.exists) {
          const existing = sessionSnapshot.data();
          if (existing.videoId !== event.videoId
            || !existing.viewerKeys?.some((key) => expectedKeys.has(key))) {
            throw new PlaybackInputError('The playback session does not match this title or viewer.');
          }
          transaction.set(sessionRef, {
            viewerKeys: [...new Set([...existing.viewerKeys, ...identityKeys])],
            expiresAt: new Date(now + EVENT_RETENTION_MS),
          }, { merge: true });
        } else {
          transaction.set(sessionRef, {
            videoId: event.videoId,
            viewerKeys: identityKeys,
            startedAt: new Date(now),
            expiresAt: new Date(now + EVENT_RETENTION_MS),
          });
        }
        transaction.create(eventRef, {
          videoId: event.videoId,
          eventType: event.eventType,
          sessionId: event.sessionId,
          expiresAt: new Date(now + EVENT_RETENTION_MS),
        });
        const metrics = metricsSnapshot.exists ? metricsSnapshot.data() : {};
        transaction.set(metricsRef, {
          playStarts: safeCount(metrics.playStarts, 'play-start') + 1,
          updatedAt: new Date(now),
        }, { merge: true });
        const session = sessionSnapshot.exists ? sessionSnapshot.data() : null;
        return {
          recorded: true,
          views: currentViews,
          qualifiedAfterMs: Math.max(0, (session
            ? dateMilliseconds(session.startedAt) : now) + QUALIFIED_VIEW_SECONDS * 1000 - now),
        };
      }

      if (!sessionSnapshot.exists) {
        throw new PlaybackInputError('A playback start is required before a qualified view.');
      }
      const session = sessionSnapshot.data();
      const guestKey = this.guestIdentityKey(event.guestId);
      const transitionKeys = user ? new Set([...expectedKeys, guestKey]) : expectedKeys;
      if (session.videoId !== event.videoId
        || !session.viewerKeys?.some((key) => transitionKeys.has(key))) {
        throw new PlaybackInputError('The playback session does not match this title or viewer.');
      }
      if (now - dateMilliseconds(session.startedAt) < QUALIFIED_VIEW_SECONDS * 1000) {
        throw new PlaybackInputError('A qualified view requires at least 30 seconds after playback starts.');
      }

      const dedupKeys = user && session.viewerKeys.includes(guestKey)
        ? [...new Set([...identityKeys, guestKey])]
        : identityKeys;
      const effectiveDedupRefs = dedupKeys.map((key) => this.db.collection('playbackViewDedup')
        .doc(sha256(`${event.videoId}:${key}`)));
      const effectiveDedupSnapshots = dedupKeys.length === dedupRefs.length
        ? dedupSnapshots
        : await Promise.all(effectiveDedupRefs.map((ref) => transaction.get(ref)));
      const activeDedup = effectiveDedupSnapshots.find((snapshot) =>
        snapshot.exists && dateMilliseconds(snapshot.data().expiresAt) > now);
      const dedupExpiresAt = activeDedup
        ? activeDedup.data().expiresAt
        : new Date(now + 24 * 60 * 60 * 1000);
      effectiveDedupRefs.forEach((ref, index) => {
        const snapshot = effectiveDedupSnapshots[index];
        if (!snapshot.exists || dateMilliseconds(snapshot.data().expiresAt) <= now) {
          transaction.set(ref, {
            qualifiedAt: activeDedup ? activeDedup.data().qualifiedAt : new Date(now),
            expiresAt: dedupExpiresAt,
          });
        }
      });
      transaction.set(sessionRef, {
        viewerKeys: [...new Set([...session.viewerKeys, ...identityKeys])],
        expiresAt: new Date(now + EVENT_RETENTION_MS),
      }, { merge: true });
      transaction.create(eventRef, {
        videoId: event.videoId,
        eventType: event.eventType,
        sessionId: event.sessionId,
        qualified: !activeDedup,
        expiresAt: new Date(now + EVENT_RETENTION_MS),
      });
      const qualified = !activeDedup;
      if (qualified) {
        transaction.update(videoRef, { views: currentViews + 1 });
      }
      return {
        recorded: true,
        qualified,
        duplicateView: Boolean(activeDedup),
        views: currentViews + (qualified ? 1 : 0),
      };
    });
    if (event.eventType === 'play_start' && Number.isFinite(result.qualifiedAfterMs)) {
      return {
        ...result,
        qualifiedAfterMs: Math.max(0, result.qualifiedAfterMs - Math.max(0, this.now() - now)),
      };
    }
    return result;
  }
}

module.exports = {
  EVENT_RETENTION_MS,
  PlaybackInputError,
  PlaybackNotEligibleError,
  PlaybackRateLimitError,
  PlaybackTrackingService,
  QUALIFIED_VIEW_SECONDS,
  validatePlaybackEvent,
};

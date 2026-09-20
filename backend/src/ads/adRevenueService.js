const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const TELEMETRY_EVENTS = new Set(['impression', 'started', 'completed', 'skipped', 'error']);

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function verifySignedBody(rawBody, signature, secret) {
  if (!secret) throw new Error('Ad revenue webhook authentication is not configured.');
  const expected = hmac(rawBody, secret);
  if (!timingSafeEqualText(expected, signature)) {
    throw new Error('Ad revenue webhook signature is invalid.');
  }
}

function createAdSessionToken({ videoId, secret, lifetimeMs = 30 * 60 * 1000 }) {
  if (!secret) throw new Error('Ad event signing is not configured.');
  const payload = {
    sessionId: crypto.randomUUID(),
    videoId,
    expiresAt: Date.now() + lifetimeMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${hmac(encoded, secret)}`;
}

function verifyAdSessionToken(token, secret) {
  if (!secret) throw new Error('Ad event signing is not configured.');
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra || !timingSafeEqualText(hmac(encoded, secret), signature)) {
    throw new Error('The ad session is invalid.');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('The ad session is invalid.');
  }
  if (
    typeof payload.sessionId !== 'string'
    || typeof payload.videoId !== 'string'
    || !Number.isFinite(payload.expiresAt)
    || payload.expiresAt <= Date.now()
  ) {
    throw new Error('The ad session has expired or is invalid.');
  }
  return payload;
}

function emptyState() {
  return { telemetryEvents: {}, revenueEvents: {}, titles: {} };
}

class AdRevenueStore {
  constructor({ db, filePath }) {
    this.db = db;
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async readFileState() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return emptyState();
      throw error;
    }
  }

  async writeFileState(state) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temporary, this.filePath);
  }

  async updateFile(mutator) {
    const operation = this.writeQueue.then(async () => {
      const state = await this.readFileState();
      const result = mutator(state);
      await this.writeFileState(state);
      return result;
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async recordTelemetry({ sessionId, videoId, eventType, occurredAt }) {
    if (!TELEMETRY_EVENTS.has(eventType)) throw new Error('Unsupported ad telemetry event.');
    const eventId = `${sessionId}:${eventType}`;
    if (this.db) {
      return this.db.runTransaction(async (transaction) => {
        const eventRef = this.db.collection('adTelemetryEvents').doc(eventId);
        const titleRef = this.db.collection('adTitleMetrics').doc(videoId);
        const [existing, title] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(titleRef),
        ]);
        if (existing.exists) return { duplicate: true };
        transaction.set(eventRef, { sessionId, videoId, eventType, occurredAt });
        const current = title.exists ? title.data() : {};
        transaction.set(titleRef, {
          videoId,
          playerImpressions: Number(current.playerImpressions || 0) + (eventType === 'impression' ? 1 : 0),
          updatedAt: occurredAt,
        }, { merge: true });
        return { duplicate: false };
      });
    }
    return this.updateFile((state) => {
      if (state.telemetryEvents[eventId]) return { duplicate: true };
      state.telemetryEvents[eventId] = { sessionId, videoId, eventType, occurredAt };
      const title = state.titles[videoId] || { playerImpressions: 0, providerImpressions: 0, grossRevenueCents: 0 };
      if (eventType === 'impression') title.playerImpressions += 1;
      title.updatedAt = occurredAt;
      state.titles[videoId] = title;
      return { duplicate: false };
    });
  }

  async recordProviderRevenue(event) {
    if (this.db) {
      return this.db.runTransaction(async (transaction) => {
        const eventRef = this.db.collection('adRevenueEvents').doc(event.providerEventId);
        const titleRef = this.db.collection('adTitleMetrics').doc(event.catalogId);
        const [existing, title] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(titleRef),
        ]);
        if (existing.exists) return { duplicate: true, event: existing.data() };
        transaction.set(eventRef, event);
        const current = title.exists ? title.data() : {};
        transaction.set(titleRef, {
          videoId: event.catalogId,
          providerImpressions: Number(current.providerImpressions || 0) + event.impressions,
          grossRevenueCents: Number(current.grossRevenueCents || 0) + event.grossRevenueCents,
          currency: event.currency,
          updatedAt: event.receivedAt,
        }, { merge: true });
        return { duplicate: false, event };
      });
    }
    return this.updateFile((state) => {
      const existing = state.revenueEvents[event.providerEventId];
      if (existing) return { duplicate: true, event: existing };
      state.revenueEvents[event.providerEventId] = event;
      const title = state.titles[event.catalogId] || { playerImpressions: 0, providerImpressions: 0, grossRevenueCents: 0 };
      title.providerImpressions += event.impressions;
      title.grossRevenueCents += event.grossRevenueCents;
      title.currency = event.currency;
      title.updatedAt = event.receivedAt;
      state.titles[event.catalogId] = title;
      return { duplicate: false, event };
    });
  }

  async getTitleMetrics(videoId) {
    if (this.db) {
      const document = await this.db.collection('adTitleMetrics').doc(videoId).get();
      return document.exists ? document.data() : null;
    }
    const state = await this.readFileState();
    return state.titles[videoId] || null;
  }
}

async function forwardCreatorRevenue({ event, video, endpoint, secret }) {
  if (!video.creatorProjectId) return { status: 'unlinked' };
  if (!endpoint || !secret) return { status: 'not-configured' };
  const payload = JSON.stringify({
    eventId: event.providerEventId,
    projectId: video.creatorProjectId,
    catalogId: video.id,
    title: video.title,
    periodStart: event.periodStart,
    periodEnd: event.periodEnd,
    currency: event.currency,
    grossRevenueCents: event.grossRevenueCents,
    impressions: event.impressions,
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PROtv-Signature': hmac(payload, secret),
    },
    body: payload,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Creator revenue synchronization failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return { status: 'synced' };
}

module.exports = {
  AdRevenueStore,
  TELEMETRY_EVENTS,
  createAdSessionToken,
  forwardCreatorRevenue,
  hmac,
  verifyAdSessionToken,
  verifySignedBody,
};

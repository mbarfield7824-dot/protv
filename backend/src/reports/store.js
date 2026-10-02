const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { FieldValue } = require('firebase-admin/firestore');
const { ReportInputError } = require('./validation');

const queues = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;

class ReportRateLimitError extends Error {
  constructor(retryAfter) {
    super('Too many reports. Please try again later.');
    this.retryAfter = retryAfter;
  }
}

function timestamp(value) {
  if (value?.toDate) return value.toDate().toISOString();
  return value ?? null;
}

function record(id, data) {
  return {
    ...data, id, createdAt: timestamp(data.createdAt), updatedAt: timestamp(data.updatedAt),
    reviewedAt: timestamp(data.reviewedAt),
  };
}

class ReportStore {
  constructor({
    db, filePath, production = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production',
    now = () => Date.now(), perClientLimit = 5, globalLimit = 120,
  }) {
    this.db = db;
    this.filePath = path.resolve(filePath);
    this.production = production;
    this.now = now;
    this.perClientLimit = perClientLimit;
    this.globalLimit = globalLimit;
  }

  requireLocal() {
    if (this.production) throw new Error('Production report storage requires Firestore.');
  }

  async readLocal() {
    this.requireLocal();
    let state;
    try { state = JSON.parse(await fs.readFile(this.filePath, 'utf8')); } catch (error) {
      if (error.code === 'ENOENT') return { reports: {}, rateLimits: {} };
      throw error;
    }
    if (!state || typeof state !== 'object' || !state.reports || !state.rateLimits
      || typeof state.reports !== 'object' || typeof state.rateLimits !== 'object'
      || Array.isArray(state.reports) || Array.isArray(state.rateLimits)) {
      throw new Error('Report storage is invalid.');
    }
    return state;
  }

  async updateLocal(mutate) {
    this.requireLocal();
    const previous = queues.get(this.filePath) || Promise.resolve();
    const operation = previous.then(async () => {
      const state = await this.readLocal();
      const result = mutate(state);
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${crypto.randomUUID()}.tmp`;
      try {
        const handle = await fs.open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify(state, null, 2), 'utf8');
          await handle.sync();
        } finally { await handle.close(); }
        await fs.rename(temporary, this.filePath);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return result;
    });
    // Keep the queue usable after failure; the caller still receives the rejection.
    const tail = operation.catch(() => {});
    queues.set(this.filePath, tail);
    try { return await operation; } finally {
      if (queues.get(this.filePath) === tail) queues.delete(this.filePath);
    }
  }

  async consumeRateLimit(clientAddress) {
    const now = this.now();
    const clientKey = crypto.createHash('sha256').update(clientAddress).digest('hex');
    const limits = [
      { key: `client_${clientKey}`, windowMs: RATE_WINDOW_MS, maximum: this.perClientLimit },
      { key: 'global', windowMs: 60 * 1000, maximum: this.globalLimit },
    ];
    const increment = (existing) => limits.map((limit, index) => {
      const start = Math.floor(now / limit.windowMs) * limit.windowMs;
      const stored = existing[index];
      const count = stored?.windowStart === start ? stored.count : 0;
      if (count >= limit.maximum) {
        throw new ReportRateLimitError(Math.max(1, Math.ceil((start + limit.windowMs - now) / 1000)));
      }
      return { count: count + 1, windowStart: start, expiresAt: new Date(start + limit.windowMs) };
    });
    if (this.db) {
      const refs = limits.map(({ key }) => this.db.collection('safetyReportRateLimits').doc(key));
      await this.db.runTransaction(async (transaction) => {
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        const updates = increment(snapshots.map((snapshot) => snapshot.exists ? snapshot.data() : null));
        refs.forEach((ref, index) => transaction.set(ref, updates[index]));
      });
      return;
    }
    await this.updateLocal((state) => {
      for (const [key, entry] of Object.entries(state.rateLimits)) {
        if (new Date(entry.expiresAt).getTime() <= now) delete state.rateLimits[key];
      }
      const updates = increment(limits.map(({ key }) => state.rateLimits[key]));
      limits.forEach(({ key }, index) => { state.rateLimits[key] = updates[index]; });
    });
  }

  async create(data) {
    const id = crypto.randomUUID();
    const date = this.db ? FieldValue.serverTimestamp() : new Date(this.now()).toISOString();
    const report = {
      ...data, status: 'pending', createdAt: date, updatedAt: date,
      reviewedAt: null, reviewedBy: null, reviewNotes: '',
    };
    if (this.db) {
      await this.db.collection('safetyReports').doc(id).create(report);
    } else {
      await this.updateLocal((state) => { state.reports[id] = report; });
    }
    return id;
  }

  async get(id) {
    if (this.db) {
      const snapshot = await this.db.collection('safetyReports').doc(id).get();
      return snapshot.exists ? record(id, snapshot.data()) : null;
    }
    const state = await this.readLocal();
    return state.reports[id] ? record(id, state.reports[id]) : null;
  }

  async list({ limit, cursor }) {
    let items;
    if (this.db) {
      let query = this.db.collection('safetyReports').orderBy('createdAt', 'desc');
      if (cursor) {
        const snapshot = await this.db.collection('safetyReports').doc(cursor).get();
        if (!snapshot.exists) throw new ReportInputError('Report cursor not found.');
        query = query.startAfter(snapshot);
      }
      const snapshot = await query.limit(limit + 1).get();
      items = snapshot.docs.map((doc) => record(doc.id, doc.data()));
    } else {
      const state = await this.readLocal();
      items = Object.entries(state.reports).map(([id, data]) => record(id, data))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
      if (cursor) {
        const index = items.findIndex((item) => item.id === cursor);
        if (index === -1) throw new ReportInputError('Report cursor not found.');
        items = items.slice(index + 1);
      }
    }
    return { items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null };
  }

  async review(id, changes, actor) {
    const update = () => ({
      ...changes, reviewedBy: actor,
      reviewedAt: this.db ? FieldValue.serverTimestamp() : new Date(this.now()).toISOString(),
      updatedAt: this.db ? FieldValue.serverTimestamp() : new Date(this.now()).toISOString(),
    });
    if (this.db) {
      return this.db.runTransaction(async (transaction) => {
        const ref = this.db.collection('safetyReports').doc(id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return false;
        transaction.update(ref, update());
        return true;
      });
    }
    return this.updateLocal((state) => {
      if (!state.reports[id]) return false;
      state.reports[id] = { ...state.reports[id], ...update() };
      return true;
    });
  }
}

module.exports = { ReportStore, ReportRateLimitError };

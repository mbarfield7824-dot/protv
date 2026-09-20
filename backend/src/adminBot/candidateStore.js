const fs = require('fs/promises');
const path = require('path');

function emptyState() {
  return { candidates: {}, lastDiscoveryAt: null };
}

function normalizedCandidateTitle(candidate) {
  return String(candidate.title || '')
    .toLowerCase()
    .replace(/\b(18|19|20)\d{2}\b/g, ' ')
    .replace(/\b(public domain|full movie|complete film|official|hd|4k)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function candidatePriority(candidate) {
  const decisionPriority = {
    processing: 50,
    approved: 40,
    pending: 30,
    failed: 20,
    rejected: 10,
  };
  const sourcePriority = {
    'internet-archive': 20,
    wikimedia: 15,
    'public-domain-movie': 5,
    youtube: 0,
  };
  return (candidate.ingestionAvailable ? 100 : 0)
    + (decisionPriority[candidate.decision] || 0)
    + (sourcePriority[candidate.source] || 0)
    + (candidate.description ? 2 : 0)
    + (candidate.thumbnailUrl ? 1 : 0);
}

function deduplicateCandidates(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.contentKind || 'movie'}:${normalizedCandidateTitle(candidate) || candidate.id}`;
    const current = groups.get(key);
    if (!current || candidatePriority(candidate) > candidatePriority(current.primary)) {
      groups.set(key, {
        primary: candidate,
        alternatives: current
          ? [current.primary, ...current.alternatives]
          : [],
      });
    } else {
      current.alternatives.push(candidate);
    }
  }
  return [...groups.values()].map(({ primary, alternatives }) => ({
    ...primary,
    alternateSources: [...new Set(alternatives
      .map((candidate) => candidate.sourceLabel || candidate.source)
      .filter((source) => source && source !== (primary.sourceLabel || primary.source)))],
  }));
}

function candidateSnapshot(state) {
  const items = deduplicateCandidates(Object.values(state.candidates))
    .sort((left, right) => String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || '')));
  return {
    items,
    status: {
      lastDiscoveryAt: state.lastDiscoveryAt,
      pending: items.filter((item) => item.decision === 'pending').length,
      processing: items.filter((item) => item.decision === 'processing').length,
      approved: items.filter((item) => item.decision === 'approved').length,
      rejected: items.filter((item) => item.decision === 'rejected').length,
      failed: items.filter((item) => item.decision === 'failed').length,
    },
  };
}

class CandidateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return emptyState();
      throw new Error(`Unable to read the Public Domain discovery queue: ${error.message}`);
    }
  }

  async save(state) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }

  async update(operation) {
    const queued = this.writeQueue.then(async () => {
      const state = await this.load();
      const result = await operation(state);
      await this.save(state);
      return result;
    });
    this.writeQueue = queued.catch(() => {});
    return queued;
  }

  async upsert(candidates) {
    return this.update((state) => {
      const now = new Date().toISOString();
      for (const candidate of candidates) {
        const previous = state.candidates[candidate.id];
        state.candidates[candidate.id] = {
          ...previous,
          ...candidate,
          decision: previous?.decision || 'pending',
          discoveredAt: previous?.discoveredAt || now,
          lastSeenAt: now,
        };
      }
      state.lastDiscoveryAt = now;
      return Object.values(state.candidates);
    });
  }

  async setDecision(id, decision, details = {}) {
    if (!['pending', 'processing', 'approved', 'rejected', 'failed'].includes(decision)) {
      throw new Error('Unsupported candidate decision.');
    }
    return this.update((state) => {
      const candidate = state.candidates[id];
      if (!candidate) throw new Error('Discovery candidate was not found.');
      state.candidates[id] = {
        ...candidate,
        decision,
        ...details,
        decidedAt: new Date().toISOString(),
      };
      return state.candidates[id];
    });
  }

  async get(id) {
    return (await this.load()).candidates[id] || null;
  }

  async list({ decision = 'pending', limit = 100 } = {}) {
    const { items } = await this.snapshot();
    return items
      .filter((candidate) => !decision || candidate.decision === decision)
      .slice(0, limit);
  }

  async status() {
    return (await this.snapshot()).status;
  }

  async snapshot() {
    return candidateSnapshot(await this.load());
  }
}

function firestoreValue(value) {
  return JSON.parse(JSON.stringify(value));
}

class FirestoreCandidateStore {
  constructor(db, options = {}) {
    if (!db) throw new Error('Firestore is required for the Public Domain discovery queue.');
    this.db = db;
    this.legacyCollection = db.collection(options.collectionName || 'publicDomainCandidates');
    this.stateDocument = db.collection('adminAutomation').doc('publicDomainDiscovery');
  }

  async load() {
    const snapshot = await this.stateDocument.get();
    const saved = snapshot.exists ? snapshot.data() : null;
    if (saved?.candidates && typeof saved.candidates === 'object') {
      return {
        candidates: saved.candidates,
        lastDiscoveryAt: saved.lastDiscoveryAt || null,
      };
    }
    const legacy = await this.legacyCollection.get();
    const state = {
      candidates: Object.fromEntries(legacy.docs
        .map((document) => document.data())
        .filter((candidate) => candidate?.id)
        .map((candidate) => [candidate.id, candidate])),
      lastDiscoveryAt: saved?.lastDiscoveryAt || null,
    };
    await this.stateDocument.set(firestoreValue(state), { merge: true });
    return state;
  }

  async update(operation) {
    await this.load();
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.stateDocument);
      const saved = snapshot.exists ? snapshot.data() : emptyState();
      const state = {
        candidates: saved.candidates || {},
        lastDiscoveryAt: saved.lastDiscoveryAt || null,
      };
      const result = await operation(state);
      const serialized = firestoreValue(state);
      if (Buffer.byteLength(JSON.stringify(serialized), 'utf8') > 900_000) {
        throw new Error('The Public Domain review queue is full. Reject or approve older candidates before running discovery again.');
      }
      transaction.set(this.stateDocument, serialized, { merge: true });
      return result;
    });
  }

  async upsert(candidates) {
    return this.update((state) => {
      const now = new Date().toISOString();
      for (const candidate of candidates) {
        const previous = state.candidates[candidate.id];
        state.candidates[candidate.id] = {
          ...previous,
          ...candidate,
          decision: previous?.decision || 'pending',
          discoveredAt: previous?.discoveredAt || now,
          lastSeenAt: now,
        };
      }
      state.lastDiscoveryAt = now;
      return Object.values(state.candidates);
    });
  }

  async setDecision(id, decision, details = {}) {
    if (!['pending', 'processing', 'approved', 'rejected', 'failed'].includes(decision)) {
      throw new Error('Unsupported candidate decision.');
    }
    return this.update((state) => {
      const previous = state.candidates[id];
      if (!previous) throw new Error('Discovery candidate was not found.');
      const candidate = {
        ...previous,
        decision,
        ...details,
        decidedAt: new Date().toISOString(),
      };
      state.candidates[id] = candidate;
      return candidate;
    });
  }

  async get(id) {
    return (await this.load()).candidates[id] || null;
  }

  async list({ decision = 'pending', limit = 100 } = {}) {
    const { items } = await this.snapshot();
    return items
      .filter((candidate) => !decision || candidate.decision === decision)
      .slice(0, limit);
  }

  async status() {
    return (await this.snapshot()).status;
  }

  async snapshot() {
    return candidateSnapshot(await this.load());
  }
}

function createCandidateStore({ db, filePath, useFirestore = Boolean(process.env.VERCEL) }) {
  if (useFirestore) return new FirestoreCandidateStore(db);
  return new CandidateStore(filePath);
}

module.exports = {
  CandidateStore,
  FirestoreCandidateStore,
  createCandidateStore,
  candidateSnapshot,
  deduplicateCandidates,
  normalizedCandidateTitle,
};

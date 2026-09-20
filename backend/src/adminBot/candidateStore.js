const fs = require('fs/promises');
const crypto = require('crypto');
const path = require('path');

function emptyState() {
  return { candidates: {}, lastDiscoveryAt: null };
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
    const state = await this.load();
    return Object.values(state.candidates)
      .filter((candidate) => !decision || candidate.decision === decision)
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .slice(0, limit);
  }

  async status() {
    const state = await this.load();
    const candidates = Object.values(state.candidates);
    return {
      lastDiscoveryAt: state.lastDiscoveryAt,
      pending: candidates.filter((item) => item.decision === 'pending').length,
      processing: candidates.filter((item) => item.decision === 'processing').length,
      approved: candidates.filter((item) => item.decision === 'approved').length,
      rejected: candidates.filter((item) => item.decision === 'rejected').length,
      failed: candidates.filter((item) => item.decision === 'failed').length,
    };
  }
}

function candidateDocumentId(id) {
  return crypto.createHash('sha256').update(id).digest('hex');
}

function firestoreValue(value) {
  return JSON.parse(JSON.stringify(value));
}

class FirestoreCandidateStore {
  constructor(db, options = {}) {
    if (!db) throw new Error('Firestore is required for the Public Domain discovery queue.');
    this.db = db;
    this.collection = db.collection(options.collectionName || 'publicDomainCandidates');
    this.metadata = db.collection('adminAutomation').doc('publicDomainDiscovery');
  }

  async upsert(candidates) {
    const now = new Date().toISOString();
    const refs = candidates.map((candidate) => this.collection.doc(candidateDocumentId(candidate.id)));
    const existing = await Promise.all(refs.map((ref) => ref.get()));
    const records = candidates.map((candidate, index) => {
      const previous = existing[index].exists ? existing[index].data() : null;
      return firestoreValue({
        ...candidate,
        decision: previous?.decision || 'pending',
        discoveredAt: previous?.discoveredAt || now,
        lastSeenAt: now,
      });
    });
    for (let offset = 0; offset < Math.max(records.length, 1); offset += 400) {
      const batch = this.db.batch();
      records.slice(offset, offset + 400).forEach((record, index) => {
        batch.set(refs[offset + index], record, { merge: true });
      });
      if (offset + 400 >= records.length) {
        batch.set(this.metadata, { lastDiscoveryAt: now }, { merge: true });
      }
      await batch.commit();
    }
    return this.list({ decision: null, limit: Number.MAX_SAFE_INTEGER });
  }

  async setDecision(id, decision, details = {}) {
    if (!['pending', 'processing', 'approved', 'rejected', 'failed'].includes(decision)) {
      throw new Error('Unsupported candidate decision.');
    }
    const ref = this.collection.doc(candidateDocumentId(id));
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data().id !== id) {
        throw new Error('Discovery candidate was not found.');
      }
      const candidate = {
        ...snapshot.data(),
        decision,
        ...details,
        decidedAt: new Date().toISOString(),
      };
      transaction.set(ref, firestoreValue(candidate));
      return candidate;
    });
  }

  async get(id) {
    const snapshot = await this.collection.doc(candidateDocumentId(id)).get();
    if (!snapshot.exists || snapshot.data().id !== id) return null;
    return snapshot.data();
  }

  async list({ decision = 'pending', limit = 100 } = {}) {
    const snapshot = await this.collection.get();
    return snapshot.docs
      .map((document) => document.data())
      .filter((candidate) => !decision || candidate.decision === decision)
      .sort((left, right) => String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || '')))
      .slice(0, limit);
  }

  async status() {
    const [candidates, metadata] = await Promise.all([
      this.list({ decision: null, limit: Number.MAX_SAFE_INTEGER }),
      this.metadata.get(),
    ]);
    return {
      lastDiscoveryAt: metadata.exists ? metadata.data().lastDiscoveryAt || null : null,
      pending: candidates.filter((item) => item.decision === 'pending').length,
      processing: candidates.filter((item) => item.decision === 'processing').length,
      approved: candidates.filter((item) => item.decision === 'approved').length,
      rejected: candidates.filter((item) => item.decision === 'rejected').length,
      failed: candidates.filter((item) => item.decision === 'failed').length,
    };
  }
}

function createCandidateStore({ db, filePath, useFirestore = Boolean(process.env.VERCEL) }) {
  if (useFirestore) return new FirestoreCandidateStore(db);
  return new CandidateStore(filePath);
}

module.exports = {
  CandidateStore,
  FirestoreCandidateStore,
  candidateDocumentId,
  createCandidateStore,
};

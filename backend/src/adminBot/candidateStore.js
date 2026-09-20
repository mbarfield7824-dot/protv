const fs = require('fs/promises');
const path = require('path');

class CandidateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { candidates: {}, lastDiscoveryAt: null };
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

module.exports = { CandidateStore };

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { slugKey, LinkConflictError } = require('./validation');
const queues = new Map();

class ShortLinkStore {
  constructor({ db, filePath, production = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production' }) {
    this.db = db;
    this.filePath = path.resolve(filePath);
    this.production = production;
  }
  async local() {
    if (this.production) throw new Error('Production short links require Firestore.');
    try {
      const state = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid short-link storage.');
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }
  async get(key) {
    slugKey(key);
    if (this.db) {
      const snapshot = await this.db.collection('shortLinks').doc(key.toLowerCase()).get();
      return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
    }
    const state = await this.local();
    return Object.hasOwn(state, key.toLowerCase()) ? state[key.toLowerCase()] : null;
  }
  async list({ cursor, limit = 50 } = {}) {
    if (cursor) cursor = slugKey(cursor);
    let items;
    if (this.db) {
      let query = this.db.collection('shortLinks').orderBy('__name__');
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.limit(limit + 1).get();
      items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    } else {
      items = Object.values(await this.local()).sort((a, b) => a.id.localeCompare(b.id));
      if (cursor) items = items.filter(item => item.id.localeCompare(cursor) > 0);
    }
    return { items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null };
  }
  async save(data, actor, { key, version } = {}) {
    const id = slugKey(data.slug);
    if (key && slugKey(key) !== id) throw new LinkConflictError('A saved slug cannot be renamed. Create a new link instead; existing bookmarks remain intact.');
    const update = (existing) => {
      if (!key && existing) throw new LinkConflictError('This slug is already assigned, including inactive links.');
      if (key && (!existing || existing.version !== version)) throw new LinkConflictError('This link changed. Refresh before editing.');
      const now = new Date().toISOString();
      return { ...data, id, version: (existing?.version || 0) + 1,
        createdAt: existing?.createdAt || now, createdBy: existing?.createdBy || actor,
        updatedAt: now, updatedBy: actor };
    };
    if (this.db) {
      return this.db.runTransaction(async transaction => {
        const ref = this.db.collection('shortLinks').doc(id);
        const snapshot = await transaction.get(ref);
        const record = update(snapshot.exists ? snapshot.data() : null);
        transaction.set(ref, record);
        return record;
      });
    }
    const previous = queues.get(this.filePath) || Promise.resolve();
    const operation = previous.then(async () => {
      const state = await this.local();
      const record = update(Object.hasOwn(state, id) ? state[id] : null);
      state[id] = record;
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, this.filePath);
      } finally { await fs.rm(temporary, { force: true }); }
      return record;
    });
    const tail = operation.catch(() => {});
    queues.set(this.filePath, tail);
    try { return await operation; } finally { if (queues.get(this.filePath) === tail) queues.delete(this.filePath); }
  }
}
module.exports = { ShortLinkStore };

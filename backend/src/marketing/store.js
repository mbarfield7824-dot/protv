// Marketing Studio storage. Firestore in production (server-only collections, denied to clients by firestore.rules'
// default deny); an in-memory store for tests. Every record carries createdAt/updatedAt; the audit log is append-only.
const crypto = require('node:crypto');

const COLLECTIONS = Object.freeze({
  campaigns: 'marketingCampaigns',
  commercials: 'marketingCommercials',
  assets: 'marketingAssets',
  posts: 'marketingPosts',
  accounts: 'marketingSocialAccounts',
  ads: 'marketingAdCampaigns',
  audit: 'marketingAudit',
  settings: 'marketingSettings',
  oauth: 'marketingOAuthStates',
  stats: 'marketingDailyStats',
  templates: 'marketingTemplates',
  images: 'marketingImages',
  aiUsage: 'marketingAiUsage',
});

class MemoryMarketingStore {
  constructor() { this.data = new Map(Object.keys(COLLECTIONS).map((name) => [name, new Map()])); }
  async get(kind, id) { const value = this.data.get(kind).get(id); return value ? structuredClone(value) : null; }
  async put(kind, id, value) { this.data.get(kind).set(id, structuredClone({ ...value, id })); return structuredClone({ ...value, id }); }
  async remove(kind, id) { this.data.get(kind).delete(id); }
  async list(kind, { where = {}, limit = 500 } = {}) {
    return [...this.data.get(kind).values()].filter((item) => Object.entries(where).every(([key, value]) => item[key] === value))
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, limit).map((item) => structuredClone(item));
  }
  async increment(kind, id, fields) {
    const current = this.data.get(kind).get(id) || { id };
    for (const [key, value] of Object.entries(fields)) current[key] = (current[key] || 0) + value;
    this.data.get(kind).set(id, current);
  }
}

class FirestoreMarketingStore {
  constructor(db) { this.db = db; }
  ref(kind, id) { return this.db.collection(COLLECTIONS[kind]).doc(id); }
  async get(kind, id) { const snapshot = await this.ref(kind, id).get(); return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null; }
  // Records are plain JSON: undefined fields are dropped (Firestore rejects them).
  async put(kind, id, value) { const record = JSON.parse(JSON.stringify({ ...value, id })); await this.ref(kind, id).set(record); return record; }
  async remove(kind, id) { await this.ref(kind, id).delete(); }
  async list(kind, { where = {}, limit = 500 } = {}) {
    let query = this.db.collection(COLLECTIONS[kind]);
    for (const [key, value] of Object.entries(where)) query = query.where(key, '==', value);
    const snapshot = await query.limit(limit).get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  }
  async increment(kind, id, fields) {
    const { FieldValue } = require('firebase-admin/firestore');
    const patch = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, FieldValue.increment(value)]));
    await this.ref(kind, id).set(patch, { merge: true });
  }
}

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

module.exports = { COLLECTIONS, MemoryMarketingStore, FirestoreMarketingStore, newId };

const crypto = require('crypto');
const { CHANNEL_ID, DEFAULT_AD_POLICY, DEFAULT_PRIMETIME, LinearValidationError, MAX_ENTRY_SECONDS, overlaps } = require('./model');

// Firestore layout (server-only; firestore.rules denies all client access):
//   linearChannels/{channelId}                    channel settings and a schedule version used to serialize edits
//   linearChannels/{channelId}/schedule/{entryId} schedule entries (UTC ISO times)
//   linearRights/{title_<videoId>|series_<key>}   linear-rights evidence, separate from on-demand rights
const lookbackMs = MAX_ENTRY_SECONDS * 1000;

function defaultSettings() {
  return {
    channelId: CHANNEL_ID,
    name: 'PROtv LIVE',
    status: 'off',
    timeZone: 'America/New_York',
    primetime: DEFAULT_PRIMETIME,
    adPolicy: DEFAULT_AD_POLICY,
    updatedAt: null,
    updatedBy: null,
  };
}

function readSettings(data = {}) {
  const defaults = defaultSettings();
  return {
    ...defaults,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : defaults.name,
    status: data.status === 'public' ? 'public' : 'off',
    primetime: Array.isArray(data.primetime) ? data.primetime : defaults.primetime,
    adPolicy: { ...defaults.adPolicy, ...(data.adPolicy || {}), insertion: 'not-active' },
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
    ...(data.launchedAt ? { launchedAt: data.launchedAt, launchedBy: data.launchedBy || null } : {}),
  };
}

function assertFree(entry, neighbours) {
  const conflict = neighbours.find((other) => overlaps(entry, other));
  if (conflict) {
    throw new LinearValidationError(`This slot overlaps another entry starting ${conflict.startAt}. Move or shorten one of them.`);
  }
}

class FirestoreLinearStore {
  constructor(db) { this.db = db; }

  requireDb() {
    if (!this.db) throw new Error('PROtv LIVE requires Firestore.');
    return this.db;
  }

  channelRef() { return this.requireDb().collection('linearChannels').doc(CHANNEL_ID); }

  scheduleRef() { return this.channelRef().collection('schedule'); }

  async getSettings() {
    const snapshot = await this.channelRef().get();
    return readSettings(snapshot.exists ? snapshot.data() : {});
  }

  async saveSettings(patch) {
    await this.channelRef().set({ ...patch, channelId: CHANNEL_ID }, { merge: true });
    return this.getSettings();
  }

  async listEntries(fromIso, toIso) {
    const snapshot = await this.scheduleRef()
      .where('startAt', '>=', new Date(Date.parse(fromIso) - lookbackMs).toISOString())
      .where('startAt', '<', toIso)
      .orderBy('startAt')
      .get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
      .filter((entry) => Date.parse(entry.endAt) > Date.parse(fromIso));
  }

  async getEntry(id) {
    const snapshot = await this.scheduleRef().doc(id).get();
    return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
  }

  async findEntriesByVideoIds(videoIds) {
    const results = [];
    for (let index = 0; index < videoIds.length; index += 30) {
      const snapshot = await this.scheduleRef().where('videoId', 'in', videoIds.slice(index, index + 30)).get();
      results.push(...snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    }
    return results;
  }

  // Every schedule write reads and bumps the channel document, so concurrent edits serialize and
  // the overlap check cannot be raced.
  async writeEntry(id, mutate) {
    const db = this.requireDb();
    const channelRef = this.channelRef();
    const ref = id ? this.scheduleRef().doc(id) : this.scheduleRef().doc(crypto.randomUUID());
    return db.runTransaction(async (transaction) => {
      const channel = await transaction.get(channelRef);
      const current = await transaction.get(ref);
      if (id && !current.exists) return null;
      const next = await mutate(current.exists ? { ...current.data(), id: ref.id } : null);
      if (!next) return null;
      const neighbours = await transaction.get(this.scheduleRef()
        .where('startAt', '>=', new Date(Date.parse(next.startAt) - lookbackMs).toISOString())
        .where('startAt', '<', next.endAt));
      assertFree({ ...next, id: ref.id }, neighbours.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
      transaction.set(channelRef, { scheduleVersion: (channel.data()?.scheduleVersion || 0) + 1 }, { merge: true });
      const { id: ignored, ...stored } = next;
      transaction.set(ref, stored);
      return { ...stored, id: ref.id };
    });
  }

  async deleteEntry(id) {
    const db = this.requireDb();
    const ref = this.scheduleRef().doc(id);
    return db.runTransaction(async (transaction) => {
      const channel = await transaction.get(this.channelRef());
      const current = await transaction.get(ref);
      if (!current.exists) return null;
      transaction.set(this.channelRef(), { scheduleVersion: (channel.data()?.scheduleVersion || 0) + 1 }, { merge: true });
      transaction.delete(ref);
      return { ...current.data(), id: current.id };
    });
  }

  async getVideos(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const db = this.requireDb();
    const snapshots = await db.getAll(...unique.map((id) => db.collection('videos').doc(id)));
    return new Map(snapshots.filter((snapshot) => snapshot.exists)
      .map((snapshot) => [snapshot.id, { ...snapshot.data(), id: snapshot.id }]));
  }

  async listCatalog() {
    const snapshot = await this.requireDb().collection('videos').get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  async getRights(keys) {
    const unique = [...new Set(keys.filter(Boolean))];
    if (!unique.length) return new Map();
    const db = this.requireDb();
    const snapshots = await db.getAll(...unique.map((key) => db.collection('linearRights').doc(key)));
    return new Map(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data()]));
  }

  async listRights() {
    const snapshot = await this.requireDb().collection('linearRights').get();
    return new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
  }

  async setRights(key, record) {
    await this.requireDb().collection('linearRights').doc(key).set(record);
    return record;
  }

  async listRightsEvidence() {
    const snapshot = await this.requireDb().collection('titleRightsEvidence').get();
    return new Map(snapshot.docs.map((doc) => [doc.data().videoId || doc.id, doc.data()]));
  }
}

class MemoryLinearStore {
  constructor({ videos = [], rights = {}, settings = {}, entries = [], evidence = {} } = {}) {
    this.settings = { ...settings };
    this.videos = new Map(videos.map((video) => [video.id, { ...video }]));
    this.rights = new Map(Object.entries(rights));
    this.entries = new Map(entries.map((entry) => [entry.id, { ...entry }]));
    this.evidence = new Map(Object.entries(evidence));
    this.reads = 0;
  }

  async getSettings() { return readSettings(this.settings); }

  async saveSettings(patch) { this.settings = { ...this.settings, ...patch }; return this.getSettings(); }

  async listEntries(fromIso, toIso) {
    this.reads += 1;
    return [...this.entries.values()]
      .filter((entry) => Date.parse(entry.endAt) > Date.parse(fromIso) && entry.startAt < toIso)
      .sort((left, right) => left.startAt.localeCompare(right.startAt))
      .map((entry) => ({ ...entry }));
  }

  async getEntry(id) { return this.entries.has(id) ? { ...this.entries.get(id) } : null; }

  async findEntriesByVideoIds(ids) {
    return [...this.entries.values()].filter((entry) => ids.includes(entry.videoId)).map((entry) => ({ ...entry }));
  }

  async writeEntry(id, mutate) {
    if (id && !this.entries.has(id)) return null;
    const next = await mutate(id ? { ...this.entries.get(id) } : null);
    if (!next) return null;
    const entryId = id || crypto.randomUUID();
    assertFree({ ...next, id: entryId }, [...this.entries.values()]);
    const stored = { ...next, id: entryId };
    this.entries.set(entryId, stored);
    return { ...stored };
  }

  async deleteEntry(id) {
    const current = this.entries.get(id) || null;
    this.entries.delete(id);
    return current;
  }

  async getVideos(ids) {
    return new Map(ids.filter((id) => this.videos.has(id)).map((id) => [id, { ...this.videos.get(id) }]));
  }

  async listCatalog() { return [...this.videos.values()].map((video) => ({ ...video })); }

  async getRights(keys) { return new Map(keys.filter((key) => this.rights.has(key)).map((key) => [key, this.rights.get(key)])); }

  async listRights() { return new Map(this.rights); }

  async setRights(key, record) { this.rights.set(key, record); return record; }

  async listRightsEvidence() { return new Map(this.evidence); }
}

module.exports = { FirestoreLinearStore, MemoryLinearStore, defaultSettings, readSettings };

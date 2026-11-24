const crypto = require('crypto');
const { CHANNEL_ID, DEFAULT_AD_POLICY, DEFAULT_PRIMETIME, LinearValidationError, MAX_ENTRY_SECONDS, overlaps } = require('./model');

// Firestore layout (server-only; firestore.rules denies all client access):
//   linearChannels/{channelId}                    channel settings and a schedule version used to serialize edits
//   linearChannels/{channelId}/schedule/{entryId} schedule entries (UTC ISO times)
//   linearRights/{title_<videoId>|series_<key>}   linear-rights evidence, separate from on-demand rights
//   linearCreatives/{id}                          the channel's own commercials (spots), see creatives.js
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
    // Breaks play the scheduled spots ("pods") chosen in Admin; no third-party ad server is involved.
    adPolicy: { ...defaults.adPolicy, ...(data.adPolicy || {}), insertion: 'scheduled-spots' },
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
    ...(data.launchedAt ? { launchedAt: data.launchedAt, launchedBy: data.launchedBy || null } : {}),
    autoContinue: readAutoContinue(data.autoContinue),
  };
}

// Keeps the channel on the air: copies an approved template week onto upcoming weeks. Off unless the Administrator
// switches it on.
function readAutoContinue(value = {}) {
  const weeksAhead = Number(value?.weeksAhead);
  return {
    enabled: value?.enabled === true,
    templateWeekOf: typeof value?.templateWeekOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.templateWeekOf) ? value.templateWeekOf : null,
    weeksAhead: Number.isInteger(weeksAhead) && weeksAhead >= 1 && weeksAhead <= 4 ? weeksAhead : 3,
    filledWeeks: Array.isArray(value?.filledWeeks) ? value.filledWeeks.filter((week) => typeof week === 'string').slice(-60) : [],
    lastRunAt: value?.lastRunAt || null,
    lastRun: value?.lastRun || null,
    updatedAt: value?.updatedAt || null,
    updatedBy: value?.updatedBy || null,
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

  appleScheduleRef() { return this.channelRef().collection('appleSchedule'); }

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

  async listAppleEntries(fromIso, toIso) {
    const snapshot = await this.appleScheduleRef()
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

  async listCreatives() {
    const snapshot = await this.requireDb().collection('linearCreatives').get();
    return new Map(snapshot.docs.map((doc) => [doc.id, { ...doc.data(), id: doc.id }]));
  }

  async getCreative(id) {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(String(id))) return null;
    const snapshot = await this.requireDb().collection('linearCreatives').doc(id).get();
    return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
  }

  async getCreatives(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const db = this.requireDb();
    const snapshots = await db.getAll(...unique.map((id) => db.collection('linearCreatives').doc(id)));
    return new Map(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, { ...snapshot.data(), id: snapshot.id }]));
  }

  async saveCreative(id, record) {
    const ref = this.requireDb().collection('linearCreatives').doc(id || crypto.randomUUID());
    const { id: ignored, ...stored } = record;
    await ref.set(stored);
    return { ...stored, id: ref.id };
  }
}

class MemoryLinearStore {
  constructor({
    videos = [], rights = {}, settings = {}, entries = [], appleEntries = [], evidence = {}, creatives = [],
  } = {}) {
    this.creatives = new Map(creatives.map((creative) => [creative.id, { ...creative }]));
    this.settings = { ...settings };
    this.videos = new Map(videos.map((video) => [video.id, { ...video }]));
    this.rights = new Map(Object.entries(rights));
    this.entries = new Map(entries.map((entry) => [entry.id, { ...entry }]));
    this.appleEntries = new Map(appleEntries.map((entry) => [entry.id, { ...entry }]));
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

  async listAppleEntries(fromIso, toIso) {
    this.reads += 1;
    return [...this.appleEntries.values()]
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

  async listCreatives() { return new Map([...this.creatives].map(([id, creative]) => [id, { ...creative }])); }

  async getCreative(id) { return this.creatives.has(id) ? { ...this.creatives.get(id) } : null; }

  async getCreatives(ids) {
    return new Map(ids.filter((id) => this.creatives.has(id)).map((id) => [id, { ...this.creatives.get(id) }]));
  }

  async saveCreative(id, record) {
    const creativeId = id || crypto.randomUUID();
    const { id: ignored, ...stored } = record;
    this.creatives.set(creativeId, { ...stored, id: creativeId });
    return { ...stored, id: creativeId };
  }
}

module.exports = { FirestoreLinearStore, MemoryLinearStore, defaultSettings, readSettings };

const { validateEvent } = require('./adminModel');

function createAdminLiveService({ getDb = () => require('../firebase').db, now = () => new Date() } = {}) {
  function database() {
    const db = getDb();
    if (!db) throw new Error('Firestore is unavailable for Live administration.');
    return db;
  }

  return {
    async list() {
      const snapshot = await database().collection('liveEvents').get();
      return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    },
    async get(id) {
      const snapshot = await database().collection('liveEvents').doc(id).get();
      return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
    },
    async create(input) {
      const fields = validateEvent(input);
      const ref = database().collection('liveEvents').doc();
      const timestamp = now();
      const event = { ...fields, createdAt: timestamp, updatedAt: timestamp };
      await ref.create(event);
      return { ...event, id: ref.id };
    },
    async update(id, input) {
      const db = database();
      const ref = db.collection('liveEvents').doc(id);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return null;
        const current = snapshot.data();
        const fields = validateEvent(input, current);
        const updated = { ...fields, updatedAt: now() };
        transaction.update(ref, updated);
        return { ...current, ...updated, id: snapshot.id };
      });
    },
  };
}

module.exports = { createAdminLiveService };

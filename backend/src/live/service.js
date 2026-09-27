function createLiveService({ getDb = () => require('../firebase').db } = {}) {
  function collection() {
    const db = getDb();
    if (!db) throw new Error('Firestore is unavailable for Live events.');
    return db.collection('liveEvents');
  }

  return {
    async list() {
      const snapshot = await collection().where('published', '==', true).get();
      return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    },
    async get(id) {
      const snapshot = await collection().doc(id).get();
      return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
    },
  };
}

module.exports = { createLiveService };

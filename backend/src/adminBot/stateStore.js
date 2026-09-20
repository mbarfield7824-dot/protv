const fs = require('fs/promises');
const path = require('path');

class IngestionStateStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { files: {} };
      throw new Error(`Unable to read the Public Domain ingestion state: ${error.message}`);
    }
  }

  async get(hash) {
    return (await this.load()).files[hash] || null;
  }

  async set(hash, value) {
    const state = await this.load();
    state.files[hash] = {
      ...(state.files[hash] || {}),
      ...value,
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temporaryPath, this.filePath);
    return state.files[hash];
  }
}

class FirestoreIngestionStateStore {
  constructor(db, collectionName = 'publicDomainIngestionState') {
    if (!db) throw new Error('Firestore is required for Public Domain ingestion state.');
    this.db = db;
    this.collection = db.collection(collectionName);
  }

  async get(key) {
    const snapshot = await this.collection.doc(key).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async set(key, value) {
    const ref = this.collection.doc(key);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const state = {
        ...(snapshot.exists ? snapshot.data() : {}),
        ...JSON.parse(JSON.stringify(value)),
        updatedAt: new Date().toISOString(),
      };
      transaction.set(ref, state);
      return state;
    });
  }
}

function createIngestionStateStore({
  db,
  filePath,
  collectionName,
  useFirestore = Boolean(process.env.VERCEL),
}) {
  if (useFirestore) return new FirestoreIngestionStateStore(db, collectionName);
  return new IngestionStateStore(filePath);
}

module.exports = {
  FirestoreIngestionStateStore,
  IngestionStateStore,
  createIngestionStateStore,
};

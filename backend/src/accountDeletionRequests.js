const COLLECTION = 'accountDeletionRequests';

function timestampToIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
}

function publicRequest(snapshot) {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  return {
    status: data.status,
    requestedAt: timestampToIso(data.requestedAt),
  };
}

function createAccountDeletionRequestService({ getDb, now = () => Date.now() }) {
  function requireDb() {
    const db = getDb();
    if (!db) {
      const error = new Error('Account deletion requests are temporarily unavailable.');
      error.status = 503;
      throw error;
    }
    return db;
  }

  async function getRequest(uid) {
    const snapshot = await requireDb().collection(COLLECTION).doc(uid).get();
    return publicRequest(snapshot);
  }

  async function submitRequest(uid) {
    const db = requireDb();
    const reference = db.collection(COLLECTION).doc(uid);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) return { request: publicRequest(snapshot), created: false };
      const requestedAt = new Date(now());
      const record = {
        uid,
        status: 'received',
        requestedAt,
        updatedAt: requestedAt,
      };
      transaction.create(reference, record);
      return {
        request: { status: record.status, requestedAt: requestedAt.toISOString() },
        created: true,
      };
    });
  }

  return { getRequest, submitRequest };
}

module.exports = { createAccountDeletionRequestService };

const crypto = require('crypto');

const COLLECTION = 'accountDeletionRequests';

function timestampToIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
}

// What the requester may see about their own request. Admin identities, review
// notes and fulfillment evidence stay internal.
function publicRequest(snapshot) {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  return {
    status: data.status,
    requestedAt: timestampToIso(data.requestedAt),
    updatedAt: timestampToIso(data.updatedAt),
    adminMessage: data.status === 'additional_information_required' ? data.adminMessage || '' : '',
  };
}

function createAccountDeletionRequestService({
  getDb,
  now = () => Date.now(),
  createId = () => crypto.randomUUID(),
}) {
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

  // One request per account, keyed by UID, so repeat submissions are idempotent.
  // The record holds no email address; the admin queue reads it from Firebase Auth.
  async function submitRequest(uid) {
    const db = requireDb();
    const reference = db.collection(COLLECTION).doc(uid);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) return { request: publicRequest(snapshot), created: false };
      const requestedAt = new Date(now());
      const record = {
        uid,
        channel: 'web',
        status: 'pending_review',
        requestedAt,
        updatedAt: requestedAt,
      };
      transaction.create(reference, record);
      transaction.create(reference.collection('decisionHistory').doc(createId()), {
        requestId: uid,
        action: 'request_submitted',
        toStatus: record.status,
        actorUid: uid,
        createdAt: requestedAt,
      });
      return {
        request: {
          status: record.status,
          requestedAt: requestedAt.toISOString(),
          updatedAt: requestedAt.toISOString(),
          adminMessage: '',
        },
        created: true,
      };
    });
  }

  return { getRequest, submitRequest };
}

module.exports = { COLLECTION, createAccountDeletionRequestService };

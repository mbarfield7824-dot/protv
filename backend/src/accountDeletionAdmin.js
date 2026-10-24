const crypto = require('crypto');

const COLLECTION = 'accountDeletionRequests';
const STATUSES = new Set([
  'pending_review',
  'additional_information_required',
  'approved_for_processing',
  'on_hold',
  'completed',
]);
const TRANSITIONS = {
  pending_review: new Set(['additional_information_required', 'approved_for_processing', 'on_hold']),
  additional_information_required: new Set(['pending_review', 'on_hold']),
  approved_for_processing: new Set(['on_hold', 'completed']),
  on_hold: new Set(['pending_review', 'additional_information_required', 'approved_for_processing', 'completed']),
  completed: new Set(),
};

class DeletionRequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function timestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return typeof value === 'string' ? value : null;
}

function statusOf(value) {
  return value === 'received' ? 'pending_review' : value;
}

function publicRequest(id, data) {
  return {
    id,
    status: statusOf(data.status),
    requestedAt: timestamp(data.requestedAt),
    updatedAt: timestamp(data.updatedAt),
    adminMessage: data.status === 'additional_information_required' ? data.adminMessage || '' : '',
  };
}

function fulfillmentPlan() {
  return {
    personalData: {
      status: 'review_required',
      details: 'Review Firebase Authentication and the account’s Firestore profile, favorites, and watch progress before identifying eligible data.',
    },
    retainedRecords: {
      status: 'legal_review_required',
      details: 'No retention basis or deletion exception has been approved in this workflow. Record the applicable legal basis before retaining records.',
    },
    creatorDependencies: {
      status: 'verification_required',
      projects: [],
      publishedContent: [],
      contracts: [],
      details: 'No verified mapping from this account UID to Creator Portal projects, published content, or contracts is available in this application.',
    },
    sessionsAndTokens: {
      status: 'review_required',
      details: 'Plan Firebase session/token revocation and verify its effect only when an authorized fulfillment process is established.',
    },
    externalSystems: {
      status: 'verification_required',
      systems: ['Creator Portal', 'streaming provider', 'hosting/provider logs', 'backups'],
      details: 'Provider-side data, retention behavior, and deletion evidence have not been verified.',
    },
    statutoryDeadline: {
      status: 'owner_legal_review_required',
      dueAt: null,
      details: 'No statutory deadline is inferred. Determine any applicable deadline with the owner or counsel.',
    },
    completionEvidence: {
      status: 'not_started',
      items: [],
      details: 'Record evidence for each authorized action and verify every dependency before marking the request completed.',
    },
  };
}

function createAccountDeletionAdminService({
  getDb,
  getAuth,
  now = () => Date.now(),
  createId = () => crypto.randomUUID(),
  verifyFulfillment = async () => false,
}) {
  function requireDb() {
    const db = getDb();
    if (!db) throw new DeletionRequestError('Account deletion review is temporarily unavailable.', 503);
    return db;
  }

  function requireAuth() {
    const auth = getAuth();
    if (!auth) throw new DeletionRequestError('Account identity details are temporarily unavailable.', 503);
    return auth;
  }

  async function readHistory(reference) {
    const snapshot = await reference.collection('decisionHistory').get();
    return snapshot.docs.map((entry) => {
      const decision = entry.data();
      return {
        id: entry.id,
        action: decision.action,
        fromStatus: decision.fromStatus || null,
        toStatus: decision.toStatus,
        reason: decision.reason || '',
        adminDecision: decision.adminDecision || '',
        actorUid: decision.actorUid,
        createdAt: timestamp(decision.createdAt),
      };
    }).sort((left, right) => (left.createdAt || '').localeCompare(right.createdAt || ''));
  }

  async function accountDetails(uid) {
    try {
      const account = await requireAuth().getUser(uid);
      const claimType = account.customClaims?.accountType;
      const verifiedTypes = new Set(['viewer', 'creator']);
      return {
        email: account.email || null,
        emailVerified: account.emailVerified === true,
        accountType: verifiedTypes.has(claimType)
          ? { value: claimType, source: 'firebase_custom_claims', status: 'verified' }
          : { value: null, source: null, status: 'verification_required' },
      };
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return {
          email: null,
          emailVerified: false,
          accountType: { value: null, source: null, status: 'verification_required' },
          authAccountStatus: 'not_found',
        };
      }
      throw error;
    }
  }

  async function detail(reference, id, data) {
    const [account, history] = await Promise.all([
      accountDetails(data.uid || id),
      readHistory(reference),
    ]);
    return {
      ...publicRequest(id, data),
      uid: data.uid || id,
      account,
      creatorLinkage: {
        status: 'verification_required',
        projects: [],
        publishedContent: [],
        contracts: [],
      },
      adminDecision: data.adminDecision || '',
      reason: data.reason || '',
      decidedAt: timestamp(data.decidedAt),
      decidedBy: data.decidedBy || null,
      decisionHistory: history,
      fulfillmentPlan: fulfillmentPlan(),
    };
  }

  async function listRequests() {
    const db = requireDb();
    const snapshot = await db.collection(COLLECTION).get();
    const requests = await Promise.all(snapshot.docs.map(async (document) => (
      detail(document.ref, document.id, document.data())
    )));
    requests.sort((left, right) => (right.requestedAt || '').localeCompare(left.requestedAt || ''));
    return {
      pendingCount: requests.filter((request) => (
        request.status === 'pending_review' || request.status === 'additional_information_required'
      )).length,
      requests,
    };
  }

  async function getRequest(id) {
    const reference = requireDb().collection(COLLECTION).doc(id);
    const snapshot = await reference.get();
    return snapshot.exists ? detail(reference, id, snapshot.data()) : null;
  }

  async function reviewRequest(id, { status, reason }, actorUid) {
    if (!STATUSES.has(status)) throw new DeletionRequestError('A valid review status is required.');
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
      throw new DeletionRequestError('A review reason of 1–2000 characters is required.');
    }
    if (typeof actorUid !== 'string' || !actorUid) {
      throw new DeletionRequestError('The authenticated administrator identity is unavailable.', 401);
    }
    if (status === 'completed') {
      const evidence = await verifyFulfillment({ requestId: id, actorUid, reason: reason.trim() });
      if (evidence !== true) {
        throw new DeletionRequestError(
          'This request cannot be marked completed until authorized fulfillment is actually verified.',
          409,
        );
      }
    }

    const db = requireDb();
    const reference = db.collection(COLLECTION).doc(id);
    const audit = reference.collection('decisionHistory').doc(createId());
    const nowDate = new Date(now());
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return null;
      const current = snapshot.data();
      const currentStatus = statusOf(current.status);
      if (currentStatus === status) throw new DeletionRequestError('The request is already in that status.', 409);
      if (!TRANSITIONS[currentStatus]?.has(status)) {
        throw new DeletionRequestError(`The transition from ${currentStatus} to ${status} is not allowed.`, 409);
      }

      const normalizedReason = reason.trim();
      const update = {
        status,
        reason: normalizedReason,
        adminDecision: normalizedReason,
        decidedAt: nowDate,
        decidedBy: actorUid,
        updatedAt: nowDate,
        adminMessage: status === 'additional_information_required' ? normalizedReason : '',
      };
      transaction.update(reference, update);
      transaction.create(audit, {
        requestId: id,
        requestId: id,
        uid: current.uid || id,
        action: 'status_changed',
        fromStatus: currentStatus,
        toStatus: status,
        reason: normalizedReason,
        adminDecision: normalizedReason,
        actorUid,
        createdAt: nowDate,
      });
      return { id, ...publicRequest(id, { ...current, ...update }) };
    });
  }

  return { listRequests, getRequest, reviewRequest };
}

module.exports = {
  createAccountDeletionAdminService,
  DeletionRequestError,
  fulfillmentPlan,
};

const crypto = require('crypto');
const { COLLECTION } = require('./accountDeletionRequests');

const STATUSES = new Set([
  'pending_review',
  'additional_information_required',
  'approved_for_processing',
  'on_hold',
  'completed',
]);
const TRANSITIONS = {
  pending_review: new Set(['additional_information_required', 'approved_for_processing', 'on_hold']),
  additional_information_required: new Set(['pending_review', 'approved_for_processing', 'on_hold']),
  approved_for_processing: new Set(['on_hold', 'completed']),
  on_hold: new Set(['pending_review', 'additional_information_required', 'approved_for_processing']),
  completed: new Set(),
};
const CHANNELS = new Set(['web', 'email']);
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

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

function publicRequest(id, data) {
  return {
    id,
    status: data.status,
    channel: CHANNELS.has(data.channel) ? data.channel : 'web',
    requestedAt: timestamp(data.requestedAt),
    updatedAt: timestamp(data.updatedAt),
    adminMessage: data.status === 'additional_information_required' ? data.adminMessage || '' : '',
  };
}

function remainingFulfillmentSteps(fulfillment) {
  const steps = [];
  if (fulfillment.profile !== 'deleted') steps.push('the users profile document still exists');
  if (fulfillment.deviceSessions > 0) steps.push(`${fulfillment.deviceSessions} TV sign-in link(s) remain in deviceSessions`);
  if (fulfillment.authAccount !== 'deleted') steps.push('the Firebase sign-in account still exists');
  return steps;
}

function createAccountDeletionAdminService({
  getDb,
  getAuth,
  now = () => Date.now(),
  createId = () => crypto.randomUUID(),
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
        actorUid: decision.actorUid,
        createdAt: timestamp(decision.createdAt),
      };
    }).sort((left, right) => (left.createdAt || '').localeCompare(right.createdAt || ''));
  }

  async function accountDetails(uid) {
    try {
      const account = await requireAuth().getUser(uid);
      const claimType = account.customClaims?.accountType;
      return {
        exists: true,
        email: account.email || null,
        emailVerified: account.emailVerified === true,
        providers: (account.providerData || []).map((provider) => provider.providerId).filter(Boolean),
        accountType: claimType === 'viewer' || claimType === 'creator' ? claimType : null,
      };
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return { exists: false, email: null, emailVerified: false, providers: [], accountType: null };
      }
      throw error;
    }
  }

  // Read-only checks against the stores the manual runbook deletes from. Nothing here
  // deletes data; it only reports what is still present.
  async function liveChecks(uid) {
    const db = requireDb();
    const [account, profile, sessions] = await Promise.all([
      accountDetails(uid),
      db.collection('users').doc(uid).get(),
      db.collection('deviceSessions').where('approvedByUid', '==', uid).get(),
    ]);
    const safetyReports = account.email
      ? (await db.collection('safetyReports').where('contactEmail', '==', account.email).get()).size
      : null;
    const fulfillment = {
      authAccount: account.exists ? 'present' : 'deleted',
      profile: profile.exists ? 'present' : 'deleted',
      deviceSessions: sessions.size,
    };
    fulfillment.remaining = remainingFulfillmentSteps(fulfillment);
    fulfillment.complete = fulfillment.remaining.length === 0;
    return { account, fulfillment, safetyReports };
  }

  async function detail(reference, id, data) {
    const uid = data.uid || id;
    const [checks, history] = await Promise.all([liveChecks(uid), readHistory(reference)]);
    return {
      ...publicRequest(id, data),
      uid,
      account: checks.account,
      fulfillment: data.status === 'completed' && data.fulfillmentEvidence
        ? { ...data.fulfillmentEvidence, verifiedAt: timestamp(data.fulfillmentEvidence.verifiedAt), complete: true, remaining: [] }
        : checks.fulfillment,
      safetyReportsFromAccountEmail: checks.safetyReports,
      reason: data.reason || '',
      decidedAt: timestamp(data.decidedAt),
      decidedBy: data.decidedBy || null,
      decisionHistory: history,
    };
  }

  async function listRequests() {
    const snapshot = await requireDb().collection(COLLECTION).get();
    const requests = await Promise.all(snapshot.docs.map((document) => (
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

  // Logs a request that arrived by email (for example from a Roku viewer following the
  // Account screen instructions) after the admin has matched the sender to the account.
  async function recordEmailRequest({ uid, reason }, actorUid) {
    if (typeof uid !== 'string' || !UID_PATTERN.test(uid)) {
      throw new DeletionRequestError('A valid Firebase account UID is required.');
    }
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
      throw new DeletionRequestError('Describe how the sender was verified (1–2000 characters).');
    }
    if (typeof actorUid !== 'string' || !actorUid) {
      throw new DeletionRequestError('The authenticated administrator identity is unavailable.', 401);
    }
    const account = await accountDetails(uid);
    if (!account.exists) throw new DeletionRequestError('No PROtv sign-in account has that UID.', 404);

    const db = requireDb();
    const reference = db.collection(COLLECTION).doc(uid);
    const requestedAt = new Date(now());
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) throw new DeletionRequestError('This account already has a deletion request.', 409);
      const record = { uid, channel: 'email', status: 'pending_review', requestedAt, updatedAt: requestedAt };
      transaction.create(reference, record);
      transaction.create(reference.collection('decisionHistory').doc(createId()), {
        requestId: uid,
        action: 'request_recorded_from_email',
        toStatus: record.status,
        reason: reason.trim(),
        actorUid,
        createdAt: requestedAt,
      });
      return publicRequest(uid, record);
    });
  }

  async function reviewRequest(id, { status, reason }, actorUid) {
    if (!STATUSES.has(status)) throw new DeletionRequestError('A valid review status is required.');
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
      throw new DeletionRequestError('A review reason of 1–2000 characters is required.');
    }
    if (typeof actorUid !== 'string' || !actorUid) {
      throw new DeletionRequestError('The authenticated administrator identity is unavailable.', 401);
    }

    const db = requireDb();
    const reference = db.collection(COLLECTION).doc(id);
    const initial = await reference.get();
    if (!initial.exists) return null;

    let fulfillmentEvidence = null;
    if (status === 'completed') {
      const { fulfillment } = await liveChecks(initial.data().uid || id);
      if (!fulfillment.complete) {
        throw new DeletionRequestError(
          `Finish the deletion runbook before marking this completed: ${fulfillment.remaining.join('; ')}.`,
          409,
        );
      }
      fulfillmentEvidence = {
        authAccount: fulfillment.authAccount,
        profile: fulfillment.profile,
        deviceSessions: fulfillment.deviceSessions,
        verifiedAt: new Date(now()),
        verifiedBy: actorUid,
      };
    }

    const audit = reference.collection('decisionHistory').doc(createId());
    const nowDate = new Date(now());
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return null;
      const current = snapshot.data();
      if (current.status === status) throw new DeletionRequestError('The request is already in that status.', 409);
      if (!TRANSITIONS[current.status]?.has(status)) {
        throw new DeletionRequestError(`The transition from ${current.status} to ${status} is not allowed.`, 409);
      }

      const normalizedReason = reason.trim();
      const update = {
        status,
        reason: normalizedReason,
        decidedAt: nowDate,
        decidedBy: actorUid,
        updatedAt: nowDate,
        adminMessage: status === 'additional_information_required' ? normalizedReason : '',
        ...(fulfillmentEvidence ? { fulfillmentEvidence } : {}),
      };
      transaction.update(reference, update);
      transaction.create(audit, {
        requestId: id,
        uid: current.uid || id,
        action: 'status_changed',
        fromStatus: current.status,
        toStatus: status,
        reason: normalizedReason,
        actorUid,
        createdAt: nowDate,
        ...(fulfillmentEvidence ? { fulfillmentEvidence } : {}),
      });
      return publicRequest(id, { ...current, ...update });
    });
  }

  return { listRequests, getRequest, recordEmailRequest, reviewRequest };
}

module.exports = {
  createAccountDeletionAdminService,
  DeletionRequestError,
  TRANSITIONS,
};

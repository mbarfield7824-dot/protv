import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import '../styles/AdminAccountDeletionRequests.css';

const STATUS_LABELS = {
  pending_review: 'Pending Review',
  additional_information_required: 'Additional Information Required',
  approved_for_processing: 'Approved for Processing',
  on_hold: 'On Hold',
  completed: 'Completed',
};

// Mirrors backend/src/accountDeletionAdmin.js. Completed is only accepted by the server
// after its read-only check confirms the runbook deletions were done.
const TRANSITIONS = {
  pending_review: ['additional_information_required', 'approved_for_processing', 'on_hold'],
  additional_information_required: ['pending_review', 'approved_for_processing', 'on_hold'],
  approved_for_processing: ['on_hold', 'completed'],
  on_hold: ['pending_review', 'additional_information_required', 'approved_for_processing'],
  completed: [],
};

function displayTime(value) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function Check({ done, children }) {
  return (
    <li className={done ? 'account-deletion-admin__check--done' : 'account-deletion-admin__check--open'}>
      {done ? '✓ ' : '○ '}{children}
    </li>
  );
}

function Runbook({ request }) {
  const fulfillment = request.fulfillment || {};
  const reports = request.safetyReportsFromAccountEmail;
  return (
    <>
      <h4>Deletion runbook</h4>
      <p className="account-deletion-admin__notice">
        Do these steps in the Firebase console, in this order. This page only checks the result.
      </p>
      <ol className="account-deletion-admin__runbook">
        <li>
          Copy the account email into the support thread: it cannot be shown after step 3.
          Safety reports from that email: {reports === null || reports === undefined ? 'unknown (email unavailable)' : reports}.
          Delete them only if the person asked and none is still under review.
        </li>
        <li>
          Creator Portal: search the Creator Agent for this UID or email (anyone who opened the portal
          has a record; {request.account?.accountType === 'creator' ? 'creator claim present' : 'no creator claim found'}).
          Keep signed agreements and get an owner decision on licensed titles.
        </li>
        <Check done={fulfillment.authAccount === 'deleted'}>
          Delete the Firebase Authentication account.
        </Check>
        <li>
          Wait at least one hour. Sign-in tokens already issued to TVs and browsers stay valid until
          they expire, and could re-create watch progress if you delete it sooner.
        </li>
        <Check done={fulfillment.profile === 'deleted'}>
          Delete Firestore <code>users/{request.uid}</code> (My List, watch progress and history).
        </Check>
        <Check done={fulfillment.deviceSessions === 0}>
          Delete <code>deviceSessions</code> where <code>approvedByUid == {request.uid}</code>
          {fulfillment.deviceSessions > 0 ? ` (${fulfillment.deviceSessions} remaining)` : ''}.
        </Check>
        <li>Email the person from support@watchprotv.com confirming deletion, then mark Completed below.</li>
      </ol>
      {request.status === 'completed' && fulfillment.verifiedAt && (
        <p className="account-deletion-admin__notice">
          Fulfillment verified {displayTime(fulfillment.verifiedAt)} by admin UID {fulfillment.verifiedBy}.
        </p>
      )}
    </>
  );
}

function AccountDeletionDetail({ request, onSaved }) {
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const availableStatuses = TRANSITIONS[request.status] || [];

  const save = async (event) => {
    event.preventDefault();
    if (!status || !reason.trim() || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.reviewAccountDeletionRequest(request.id, { status, reason: reason.trim() });
      setNotice(`Recorded: ${STATUS_LABELS[status]}.`);
      setStatus('');
      setReason('');
      try {
        await onSaved(request.id);
      } catch (refreshError) {
        setError(`Decision saved, but the list could not refresh. Refresh before another review. ${refreshError.message}`);
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the review.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="account-deletion-admin__detail" aria-label="Deletion request details">
      <h3>Request review</h3>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-reference-notice" role="status">{notice}</p>}
      <dl className="account-deletion-admin__metadata">
        <div><dt>Account UID</dt><dd>{request.uid}</dd></div>
        <div><dt>Received via</dt><dd>{request.channel === 'email' ? 'Email (recorded by admin)' : 'Website (recent sign-in verified)'}</dd></div>
        <div><dt>Submitted</dt><dd>{displayTime(request.requestedAt)}</dd></div>
        <div><dt>Current status</dt><dd>{STATUS_LABELS[request.status] || request.status}</dd></div>
        <div><dt>Account email</dt><dd>{request.account?.email || 'Unavailable (sign-in account deleted or no email)'}</dd></div>
        <div><dt>Sign-in providers</dt><dd>{request.account?.providers?.join(', ') || 'Unavailable'}</dd></div>
      </dl>

      <Runbook request={request} />

      <h4>Decision history</h4>
      {request.decisionHistory?.length ? (
        <ol className="account-deletion-admin__history">
          {request.decisionHistory.map((decision) => (
            <li key={decision.id}>
              <strong>
                {decision.action === 'request_submitted' && 'Submitted on the website'}
                {decision.action === 'request_recorded_from_email' && 'Recorded from email'}
                {decision.action === 'status_changed' && (STATUS_LABELS[decision.toStatus] || decision.toStatus)}
              </strong>
              <span>{displayTime(decision.createdAt)} · UID: {decision.actorUid || 'Not available'}</span>
              {decision.reason && <p>{decision.reason}</p>}
            </li>
          ))}
        </ol>
      ) : <p>No decision history is available.</p>}

      {availableStatuses.length > 0 ? (
        <form onSubmit={save} className="account-deletion-admin__form" aria-busy={saving}>
          <label>
            Review action
            <select value={status} onChange={(event) => setStatus(event.target.value)} required disabled={saving}>
              <option value="">Select a decision</option>
              {availableStatuses.map((value) => (
                <option value={value} key={value}>{STATUS_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label>
            {status === 'additional_information_required' ? 'Message shown to the requester' : 'Internal reason'}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)}
              maxLength={2000} rows={4} required disabled={saving} />
          </label>
          {status === 'completed' && !request.fulfillment?.complete && (
            <p className="account-deletion-admin__notice">
              The server will refuse this until the open runbook steps above are done.
            </p>
          )}
          <button type="submit" disabled={saving || !status || !reason.trim()}>
            {saving ? 'Saving…' : 'Record decision'}
          </button>
        </form>
      ) : (
        <p className="account-deletion-admin__notice">This request is completed. No further changes are possible.</p>
      )}
    </article>
  );
}

function RecordEmailRequest({ onRecorded }) {
  const [uid, setUid] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!uid.trim() || !reason.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const request = await api.recordEmailAccountDeletionRequest({ uid: uid.trim(), reason: reason.trim() });
      setUid('');
      setReason('');
      await onRecorded(request.id);
    } catch (saveError) {
      setError(saveError.message || 'Unable to record the email request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="account-deletion-admin__email-form">
      <summary>Record a request received by email</summary>
      <form onSubmit={submit} className="account-deletion-admin__form" aria-busy={saving}>
        <p className="account-deletion-admin__notice">
          Only record requests sent from the account's own email address. Find the UID in
          Firebase console › Authentication by searching that address.
        </p>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <label>
          Account UID
          <input value={uid} onChange={(event) => setUid(event.target.value)} maxLength={128} required disabled={saving} />
        </label>
        <label>
          How the sender was verified
          <textarea value={reason} onChange={(event) => setReason(event.target.value)}
            maxLength={2000} rows={3} required disabled={saving} />
        </label>
        <button type="submit" disabled={saving || !uid.trim() || !reason.trim()}>
          {saving ? 'Recording…' : 'Record email request'}
        </button>
      </form>
    </details>
  );
}

export default function AdminAccountDeletionRequests() {
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (preferredId) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getAccountDeletionRequests();
      setRequests(result.requests);
      setPendingCount(result.pendingCount);
      setSelectedId((current) => {
        const wanted = preferredId || current;
        return result.requests.some((item) => item.id === wanted) ? wanted : result.requests[0]?.id || null;
      });
    } catch (loadError) {
      setError(loadError.message || 'Unable to load account deletion requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Refreshes after a save without the loading state, so the detail panel keeps its notice.
  const refreshQuietly = async (id) => {
    const result = await api.getAccountDeletionRequests();
    setRequests(result.requests);
    setPendingCount(result.pendingCount);
    setSelectedId(id);
  };

  const selected = requests.find((request) => request.id === selectedId);

  return (
    <section className="account-deletion-admin" aria-label="Account deletion requests" aria-busy={loading}>
      <header className="account-deletion-admin__header">
        <div>
          <h2>ACCOUNT DELETION REQUESTS</h2>
          <p>
            Requests from watchprotv.com/delete-account and from email. Deletion itself is done by
            hand in the Firebase console; this queue tracks each request and verifies the result.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh requests'}
        </button>
      </header>
      <RecordEmailRequest onRecorded={load} />
      <p className="account-deletion-admin__count" aria-live="polite">
        Awaiting review: <strong>{pendingCount}</strong>
      </p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading && <p role="status">Loading deletion requests…</p>}
      {!loading && !error && requests.length === 0 && <p>No account deletion requests are recorded.</p>}
      {!loading && requests.length > 0 && (
        <div className="account-deletion-admin__layout">
          <ul className="account-deletion-admin__queue">
            {requests.map((request) => (
              <li key={request.id}>
                <button type="button" aria-current={request.id === selectedId ? 'true' : undefined}
                  onClick={() => setSelectedId(request.id)}>
                  <strong>{request.account?.email || request.uid}</strong>
                  <span>{displayTime(request.requestedAt)} · {request.channel === 'email' ? 'Email' : 'Website'}</span>
                  <span>{STATUS_LABELS[request.status] || request.status}</span>
                </button>
              </li>
            ))}
          </ul>
          {selected && <AccountDeletionDetail key={selected.id} request={selected} onSaved={refreshQuietly} />}
        </div>
      )}
    </section>
  );
}

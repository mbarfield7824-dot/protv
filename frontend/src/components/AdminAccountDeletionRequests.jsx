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

const TRANSITIONS = {
  pending_review: ['additional_information_required', 'approved_for_processing', 'on_hold'],
  additional_information_required: ['pending_review', 'on_hold'],
  approved_for_processing: ['on_hold'],
  on_hold: ['pending_review', 'additional_information_required', 'approved_for_processing'],
  completed: [],
};

function submittedTime(value) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function AccountDeletionDetail({ request, onSaved }) {
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const availableStatuses = TRANSITIONS[request.status] || [];
  const [reason, setReason] = useState(request.reason || '');

  const save = async (event) => {
    event.preventDefault();
    if (!status || !reason.trim() || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.reviewAccountDeletionRequest(request.id, { status, reason: reason.trim() });
      setNotice('Decision recorded. No account or content was deleted.');
      try {
        await onSaved(request.id);
      } catch (refreshError) {
        setError(`Decision saved, but the request list could not refresh. Refresh before another review. ${refreshError.message}`);
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
        <div><dt>Request ID</dt><dd>{request.id}</dd></div>
        <div><dt>Authenticated UID</dt><dd>{request.uid}</dd></div>
        <div><dt>Submitted</dt><dd>{submittedTime(request.requestedAt)}</dd></div>
        <div><dt>Current status</dt><dd>{STATUS_LABELS[request.status] || request.status}</dd></div>
        <div><dt>Account email</dt><dd>{request.account?.email || 'Unavailable'}</dd></div>
        <div><dt>Email verified</dt><dd>{request.account?.emailVerified ? 'Yes' : 'No / unavailable'}</dd></div>
        <div><dt>Verified account type</dt><dd>
          {request.account?.accountType?.status === 'verified'
            ? `${request.account.accountType.value} (Firebase custom claim)`
            : 'Verification required'}
        </dd></div>
        <div><dt>Creator linkage</dt><dd>
          {request.creatorLinkage?.status === 'verified' ? 'Verified' : 'Verification required'}
        </dd></div>
      </dl>

      <h4>Creator-linked records</h4>
      <p className="account-deletion-admin__notice">
        {request.creatorLinkage?.status === 'verified'
          ? 'Verified records are listed below.'
          : 'Verification required. Do not infer creator status from email or activity.'}
      </p>
      <ul>
        <li>Projects: {(request.creatorLinkage?.projects || []).join(', ') || 'Verification required'}</li>
        <li>Published content: {(request.creatorLinkage?.publishedContent || []).join(', ') || 'Verification required'}</li>
        <li>Contract references: {(request.creatorLinkage?.contracts || []).join(', ') || 'Verification required'}</li>
      </ul>

      <h4>Decision history</h4>
      {request.decisionHistory?.length ? (
        <ol className="account-deletion-admin__history">
          {request.decisionHistory.map((decision) => (
            <li key={decision.id}>
              <strong>{decision.action === 'request_submitted'
                ? 'Request submitted'
                : `${STATUS_LABELS[decision.toStatus] || decision.toStatus}`}</strong>
              <span>{submittedTime(decision.createdAt)} · Admin UID: {decision.actorUid || 'Not available'}</span>
              {decision.reason && <p>{decision.reason}</p>}
            </li>
          ))}
        </ol>
      ) : <p>No decision history is available.</p>}

      <h4>Proposed fulfillment plan</h4>
      <p className="account-deletion-admin__notice">
        Approval does not trigger deletion. Resolve all verification and legal-review items
        through an authorized fulfillment process before completion.
      </p>
      <ul className="account-deletion-admin__plan">
        <li><strong>Eligible personal data:</strong> {request.fulfillmentPlan?.personalData?.details || 'Review required'}</li>
        <li><strong>Retained records and legal basis:</strong> {request.fulfillmentPlan?.retainedRecords?.details || 'Legal review required'}</li>
        <li><strong>Creator dependencies:</strong> {request.fulfillmentPlan?.creatorDependencies?.details || 'Verification required'}</li>
        <li><strong>Sessions and token revocation:</strong> {request.fulfillmentPlan?.sessionsAndTokens?.details || 'Review required'}</li>
        <li><strong>External systems:</strong> {request.fulfillmentPlan?.externalSystems?.details || 'Verification required'}</li>
        <li><strong>Statutory deadline:</strong> {request.fulfillmentPlan?.statutoryDeadline?.details || 'Owner/legal review required'}</li>
        <li><strong>Completion evidence:</strong> {request.fulfillmentPlan?.completionEvidence?.details || 'Not started'}</li>
      </ul>

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
            Decision reason / user message
            <textarea value={reason} onChange={(event) => setReason(event.target.value)}
              maxLength={2000} rows={4} required disabled={saving} />
          </label>
          <button type="submit" disabled={saving || !status || !reason.trim()}>
            {saving ? 'Saving review…' : 'Record review decision'}
          </button>
        </form>
      ) : (
        <p className="account-deletion-admin__notice">
          This request has no available status transitions. Completion remains unavailable
          until authorized fulfillment evidence can be verified.
        </p>
      )}
    </article>
  );
}

export default function AdminAccountDeletionRequests() {
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getAccountDeletionRequests();
      setRequests(result.requests);
      setPendingCount(result.pendingCount);
      setSelectedId((current) => (
        result.requests.some((item) => item.id === current) ? current : result.requests[0]?.id || null
      ));
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

  const selected = requests.find((request) => request.id === selectedId);
  const refreshSelected = async (id) => {
    const result = await api.getAccountDeletionRequests();
    setRequests(result.requests);
    setPendingCount(result.pendingCount);
    setSelectedId(id);
  };

  return (
    <section className="account-deletion-admin" aria-label="Account deletion requests" aria-busy={loading}>
      <header className="account-deletion-admin__header">
        <div>
          <h2>ACCOUNT DELETION REQUESTS</h2>
          <p>Administrator review only. Decisions record review status; they never delete accounts or creator content.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh requests'}
        </button>
      </header>
      <p className="account-deletion-admin__count" aria-live="polite">
        Pending review: <strong>{pendingCount}</strong>
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
                  <span>{submittedTime(request.requestedAt)}</span>
                  <span>{STATUS_LABELS[request.status] || request.status}</span>
                  <span>{request.creatorLinkage?.status === 'verified' ? 'Creator linkage verified' : 'Creator verification required'}</span>
                </button>
              </li>
            ))}
          </ul>
          {selected && <AccountDeletionDetail key={selected.id} request={selected} onSaved={refreshSelected} />}
        </div>
      )}
    </section>
  );
}

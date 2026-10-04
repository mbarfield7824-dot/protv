import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import {
  appendReportPage, reportReason, reportType, REVIEW_STATUSES, reviewPayload, safeReportUrl,
} from '../admin/safetyReports';
import '../styles/AdminSafetyReports.css';

function submittedTime(value) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function TargetReference({ report }) {
  const url = safeReportUrl(report.targetUrl);
  return (
    <div className="safety-queue__text">
      {report.targetId && <p>Target ID: {report.targetId}</p>}
      {report.targetUrl && <p>Target URL: {url
        ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{report.targetUrl}</a>
        : <span>{report.targetUrl} (not a safe HTTP(S) link)</span>}</p>}
      {report.targetDescription && <p>{report.targetDescription}</p>}
      {!report.targetId && !report.targetUrl && !report.targetDescription && <p>No target reference supplied.</p>}
    </div>
  );
}

function ReportReview({ id, onAccepted, refreshQueue, busyChanged }) {
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState({ status: 'pending', reviewNotes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const active = useRef(false);
  const request = useRef(0);
  const controller = useRef(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    const current = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError('');
    try {
      const report = await api.getAdminSafetyReport(id, { signal: controller.current.signal });
      if (active.current && request.current === current) {
        setDetail(report);
        setDraft({ status: report.status, reviewNotes: report.reviewNotes });
      }
    } catch (requestError) {
      if (active.current && request.current === current) setError(requestError.message);
    } finally {
      if (active.current && request.current === current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    active.current = true;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      active.current = false;
      request.current += 1;
      controller.current?.abort();
      window.clearTimeout(timer);
    };
  }, [load]);

  const dirty = detail && (draft.status !== detail.status || draft.reviewNotes !== detail.reviewNotes);
  const save = async (event) => {
    event.preventDefault();
    if (busy.current || loading || needsRefresh || !dirty) return;
    let payload;
    try {
      payload = reviewPayload(draft);
    } catch (validationError) {
      setError(validationError.message);
      return;
    }
    busy.current = true;
    const current = ++request.current;
    setSaving(true);
    busyChanged(true);
    setError('');
    setNotice('');
    controller.current = new AbortController();
    try {
      await api.reviewAdminSafetyReport(id, payload, { signal: controller.current.signal });
      if (!active.current || request.current !== current) return;
      const saved = { ...detail, ...payload };
      setDetail(saved);
      setDraft(payload);
      onAccepted(saved);
      setNotice('Review saved. Refreshing report data...');
      const results = await Promise.allSettled([
        api.getAdminSafetyReport(id, { signal: controller.current.signal }),
        refreshQueue(),
      ]);
      if (!active.current || request.current !== current) return;
      if (results[0].status === 'fulfilled') {
        const report = results[0].value;
        setDetail(report);
        setDraft({ status: report.status, reviewNotes: report.reviewNotes });
      }
      if (results[0].status === 'rejected'
        || results[1].status === 'rejected' || results[1].value !== true) {
        setNeedsRefresh(true);
        setNotice('Review saved, but displayed report or queue data could not refresh. Refresh before making further changes; do not repeat the save.');
      } else {
        setNotice('Review saved and displayed data refreshed.');
      }
    } catch (requestError) {
      if (active.current && request.current === current) {
        setError(requestError.message);
        if (requestError.uncertain) {
          setNeedsRefresh(true);
          setNotice('Save delivery is uncertain. Refresh the report before deciding whether to save again.');
        }
      }
    } finally {
      busy.current = false;
      if (active.current) {
        setSaving(false);
        busyChanged(false);
      }
    }
  };

  const refresh = async () => {
    if (busy.current || loading) return;
    busy.current = true;
    busyChanged(true);
    setLoading(true);
    setError('');
    const current = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const results = await Promise.allSettled([
        api.getAdminSafetyReport(id, { signal: controller.current.signal }),
        refreshQueue(),
      ]);
      if (!active.current || request.current !== current) return;
      if (results[0].status === 'fulfilled') {
        const report = results[0].value;
        setDetail(report);
        if (!detail) setDraft({ status: report.status, reviewNotes: report.reviewNotes });
        onAccepted(report);
      }
      if (results[0].status === 'rejected'
        || results[1].status === 'rejected' || results[1].value !== true) {
        setNeedsRefresh(true);
        setError('Displayed report or queue data could not refresh. Your draft is retained. Refresh before further changes; this refresh did not send another save.');
      } else {
        setNeedsRefresh(false);
        setNotice('Report and queue refreshed. Compare saved data with your retained draft before saving.');
      }
    } finally {
      busy.current = false;
      if (active.current && request.current === current) {
        setLoading(false);
        busyChanged(false);
      }
    }
  };

  return (
    <section className="safety-queue__detail" aria-label="Safety report detail" aria-busy={loading || saving}>
      <h3>Report detail</h3>
      {loading && <p role="status">Loading report detail...</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-reference-notice" role="status">{notice}</p>}
      <button type="button" className="admin-secondary" disabled={loading || saving}
        onClick={() => void refresh()}>Refresh report</button>
      {detail && (
        <>
          <dl className="safety-queue__metadata">
            <div><dt>Receipt ID</dt><dd>{detail.id}</dd></div>
            <div><dt>Type</dt><dd>{reportType(detail.type)}</dd></div>
            <div><dt>Reason</dt><dd>{reportReason(detail.reason)}</dd></div>
            <div><dt>Saved status</dt><dd>{detail.status}</dd></div>
            <div><dt>Submitted</dt><dd>{submittedTime(detail.createdAt)}</dd></div>
            <div><dt>Updated</dt><dd>{submittedTime(detail.updatedAt)}</dd></div>
            <div><dt>Contact email</dt><dd>{detail.contactEmail || 'Not provided'}</dd></div>
            <div><dt>Last reviewed</dt><dd>{submittedTime(detail.reviewedAt)}</dd></div>
            <div><dt>Reviewed by</dt><dd>{detail.reviewedBy || 'Not available'}</dd></div>
          </dl>
          <h4>Description</h4>
          <p className="safety-queue__text">{detail.description}</p>
          <h4>Target references</h4>
          <TargetReference report={detail} />
          <h4>Saved review notes</h4>
          <p className="safety-queue__text">{detail.reviewNotes || 'No review notes yet.'}</p>
          {needsRefresh && <p role="status">Displayed data may be stale. Saving is disabled until refreshed.</p>}
          <form onSubmit={save} noValidate>
            <fieldset disabled={loading || saving || needsRefresh}>
              <legend>Review edits</legend>
              <label htmlFor="safety-review-status">Review status (draft)</label>
              <select id="safety-review-status" value={draft.status}
                onChange={(event) => {
                  if (!busy.current && !loading && !needsRefresh) setDraft((value) => ({ ...value, status: event.target.value }));
                }}>
                {REVIEW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <label htmlFor="safety-review-notes">Review notes (required, maximum 5000 characters)</label>
              <textarea id="safety-review-notes" rows="6" required maxLength="5000" value={draft.reviewNotes}
                onChange={(event) => {
                  if (!busy.current && !loading && !needsRefresh) setDraft((value) => ({ ...value, reviewNotes: event.target.value }));
                }} />
            </fieldset>
            <p role="status">{dirty ? 'Unsaved review edits.' : 'No unsaved review edits.'}</p>
            <button className="admin-submit" type="submit"
              disabled={loading || saving || needsRefresh || !dirty}>{saving ? 'Saving review...' : 'Save review'}</button>
          </form>
        </>
      )}
    </section>
  );
}

function SafetyQueue() {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(undefined);
  const [selectedId, setSelectedId] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [failedCursor, setFailedCursor] = useState(undefined);
  const reviewBusy = useRef(false);
  const active = useRef(false);
  const request = useRef(0);
  const controller = useRef(null);
  const queueBusy = useRef(false);
  const cursors = useRef(new Set());

  const loadQueue = useCallback(async (cursor) => {
    const current = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    queueBusy.current = true;
    setPending(cursor ? 'more' : 'refresh');
    setError('');
    try {
      const page = await api.getAdminSafetyReports({ cursor, signal: controller.current.signal });
      if (!active.current || current !== request.current) return false;
      if (page.nextCursor && cursors.current.has(page.nextCursor) && cursor) {
        throw new Error('The queue cursor did not advance. Refresh the queue.');
      }
      if (!cursor) cursors.current.clear();
      if (page.nextCursor) cursors.current.add(page.nextCursor);
      setItems((existing) => appendReportPage(cursor ? existing : [], page.items));
      setNextCursor(page.nextCursor);
      return true;
    } catch (requestError) {
      if (active.current && current === request.current) {
        setError(requestError.message);
        setFailedCursor(cursor);
      }
      return false;
    } finally {
      if (active.current && current === request.current) {
        queueBusy.current = false;
        setPending('');
      }
    }
  }, []);

  useEffect(() => {
    active.current = true;
    const timer = window.setTimeout(() => { void loadQueue(); }, 0);
    return () => {
      active.current = false;
      request.current += 1;
      controller.current?.abort();
      window.clearTimeout(timer);
    };
  }, [loadQueue]);

  const runQueue = (cursor) => {
    if (queueBusy.current || reviewBusy.current) return;
    void loadQueue(cursor);
  };
  const busyChanged = (value) => {
    reviewBusy.current = value;
    setSaving(value);
  };
  const accepted = (saved) => {
    if (active.current) setItems((existing) => existing.map((item) => item.id === saved.id ? saved : item));
  };

  return (
    <section className="safety-queue" aria-labelledby="safety-queue-title">
      <div className="admin-tool-intro">
      <h2 id="safety-queue-title">Safety Reports</h2>
      <p>Newest submissions first. Review updates do not remove content, ban accounts, or trigger notifications or legal reporting.</p>
      <button type="button" className="admin-secondary" disabled={Boolean(pending) || saving}
        onClick={() => runQueue()}>Refresh queue</button>
      </div>
      {pending && <p role="status">{pending === 'more' ? 'Loading more reports...' : 'Loading safety reports...'}</p>}
      {error && <div className="admin-error" role="alert"><p>{error}</p>
        <button type="button" disabled={Boolean(pending) || saving}
          onClick={() => runQueue(failedCursor)}>Retry queue</button></div>}
      {!pending && !error && items.length === 0 && nextCursor === null && <p role="status">No safety reports.</p>}
      <div className="safety-queue__layout">
        <div>
          <ol className="safety-queue__list">
            {items.map((report) => (
              <li key={report.id}>
                {report.reason === 'csam_child_sexual_exploitation'
                  && <strong className="safety-queue__priority">CSAM / child sexual exploitation</strong>}
                <p>{reportType(report.type)} - {reportReason(report.reason)}</p>
                <p><span className="admin-status-pill" data-review-status={report.status}>Status: {report.status}</span> | Submitted: {submittedTime(report.createdAt)}</p>
                <TargetReference report={report} />
                <button type="button" className="admin-secondary" disabled={saving}
                  aria-pressed={selectedId === report.id}
                  onClick={() => {
                    if (!reviewBusy.current) setSelectedId(report.id);
                  }}>Review report {report.id}</button>
              </li>
            ))}
          </ol>
          {nextCursor && <button type="button" className="admin-secondary"
            disabled={Boolean(pending) || saving} onClick={() => runQueue(nextCursor)}>Load More</button>}
          {!pending && !error && items.length > 0 && nextCursor === null
            && <p role="status">All reports in this queue have been loaded.</p>}
          {!selectedId && <p>Select a report to view its details and review it.</p>}
        </div>
        {selectedId && <ReportReview key={selectedId} id={selectedId} onAccepted={accepted}
          refreshQueue={loadQueue} busyChanged={busyChanged} />}
      </div>
    </section>
  );
}

export default function AdminSafetyReports() {
  const { user, loading, isAdmin, adminLoading } = useAuth();
  if (loading || adminLoading) return <p role="status">Checking Admin authorization...</p>;
  if (!user || !isAdmin) return <p role="alert">An authorized Admin sign-in is required to view safety reports.</p>;
  return <SafetyQueue key={user.uid} />;
}

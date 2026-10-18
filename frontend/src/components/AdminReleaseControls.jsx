import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { scheduleInZone, scheduleToUtc } from '../admin/releaseSchedule';
import '../styles/AdminReleaseControls.css';

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = [...new Set([localZone, 'UTC', ...Intl.supportedValuesOf('timeZone')])];

function ReleaseEditor({ record, kind, disabled, onSave }) {
  const [status, setStatus] = useState(record.releaseStatus);
  const [timeZone, setTimeZone] = useState(record.releaseTimeZone || localZone);
  const [date, setDate] = useState(scheduleInZone(record.releaseAt, record.releaseTimeZone || localZone));
  const [error, setError] = useState('');
  const isSeries = kind === 'series';
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const releaseAt = status === 'scheduled' ? scheduleToUtc(date, timeZone) : null;
      if (releaseAt && Date.parse(releaseAt) <= Date.now()) throw new Error('Choose a future release time.');
      const action = status === 'held' ? 'Hold / unpublish'
        : status === 'published' ? 'Release now' : `Schedule for ${date} (${timeZone})`;
      if (!window.confirm(`${action}: ${record.title}?${isSeries
        ? ' This changes the series gate, not individual episode release settings.'
        : ' Approval, processing readiness, and the series gate still apply.'}`)) return;
      await onSave(kind, isSeries ? record.seriesId : record.id, {
        releaseStatus: status, releaseAt, releaseTimeZone: status === 'scheduled' ? timeZone : null,
      });
    } catch (reason) {
      setError(reason.message);
    }
  };
  return (
    <article className="release-card">
      <h4>{record.title}</h4>
      {isSeries ? <p>Series gate: {record.releaseStatus}. Episode release settings still apply.</p> : <>
        <p>{record.seriesTitle && `${record.seriesTitle} / Season ${record.seasonNumber}, Episode ${record.episodeNumber} / `}
          {record.live ? 'Live' : 'Not live'} | Media: {record.status} | Approval: {record.approvalStatus}
          {' '}| Release: {record.releaseStatus}</p>
        {!record.protectedPlayback && <p className="release-warning">
          Legacy public media: holding removes PROtv access, but previously shared Mux URLs cannot be revoked by this control.
        </p>}
      </>}
      {record.releaseAt && <p>Release time: {new Date(record.releaseAt).toLocaleString(undefined, {
        timeZone: record.releaseTimeZone || 'UTC',
      })} ({record.releaseTimeZone || 'UTC'})</p>}
      <form onSubmit={submit} aria-label={`Release settings for ${record.title}`}>
        <fieldset disabled={disabled}>
          <label>Release action
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="held">Hold / unpublish / cancel schedule</option>
              <option value="published">{isSeries ? 'Open series gate now' : 'Release now'}</option>
              <option value="scheduled">Schedule release</option>
            </select>
          </label>
          {status === 'scheduled' && <>
            <label>Release date and time
              <input type="datetime-local" value={date} required onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>Time zone
              <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
                {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </label>
          </>}
          <button className="ptv-btn ptv-btn--primary" type="submit">Save release</button>
        </fieldset>
      </form>
      {error && <p className="admin-error" role="alert">{error}</p>}
    </article>
  );
}

export default function AdminReleaseControls() {
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setQueue(await api.getReleaseQueue());
    } catch (reason) {
      setError(reason.message);
      setQueue(null);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => { if (!disposed) void load(); });
    return () => { disposed = true; };
  }, [load]);
  const save = async (kind, id, body) => {
    setBusy(true);
    setNotice('');
    try {
      await api.updateRelease(kind, id, body);
      setNotice('Release settings saved. Visibility still requires approval, ready media, and an open series gate.');
      await load();
    } finally {
      setBusy(false);
    }
  };
  const matches = (record) => `${record.title} ${record.seriesTitle || ''}`.toLowerCase().includes(query.toLowerCase());
  return (
    <section className="release-controls" aria-label="Release controls">
      <div className="admin-tool-intro">
        <p>Creators can upload and sign without going live. New creator titles start on hold.
          Release individual episodes and optionally hold or schedule the entire series gate.
          A series gate starts open; this never releases an episode that is on hold.
          Closing a series gate hides every episode without changing episode schedules.</p>
        <p>Schedules use the selected time zone and are enforced on each public request.
          Late processing never bypasses a hold. Existing live titles retain their release settings.</p>
        <p>Unpublishing stops new signed playback authorizations; already issued playback tokens
          remain valid until they expire.</p>
        <button className="ptv-btn ptv-btn--ghost" type="button" disabled={busy} onClick={() => void load()}>Refresh releases</button>
      </div>
      <label>Search releases<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Updating release queue...</p>}
      {queue && <>
        <h3>Series gates</h3>
        {queue.series.filter(matches).map((series) => <ReleaseEditor key={`${series.seriesId}-${series.releaseStatus}-${series.releaseAt}`}
          record={series} kind="series" disabled={busy} onSave={save} />)}
        {!queue.series.length && <p>No series gates yet. Series appear after their first authorized episode ingestion.</p>}
        <h3>Episodes &amp; creator titles</h3>
        {queue.titles.filter(matches).map((title) => <ReleaseEditor key={`${title.id}-${title.releaseStatus}-${title.releaseAt}`}
          record={title} kind="titles" disabled={busy} onSave={save} />)}
        {!queue.titles.length && <p>No eligible titles in the release queue.</p>}
      </>}
    </section>
  );
}

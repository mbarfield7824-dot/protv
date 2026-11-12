import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { channelDate, channelDayLabel, channelMinutes, formatChannelTime } from '../data/linearChannel';
import '../styles/AdminLinear.css';

const TABS = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'rights', label: 'Linear rights' },
  { id: 'primetime', label: 'Primetime' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'channel', label: 'Channel' },
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LAUNCH_CONFIRMATION = 'LAUNCH PROtv LIVE';
const PX_PER_MINUTE = 1.2;

const todayEastern = () => channelDate(new Date().toISOString());
const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (date) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
const minutes = (seconds) => `${Math.round(seconds / 60)} min`;
const hours = (seconds) => {
  const totalMinutes = Math.round(seconds / 60);
  const whole = Math.floor(totalMinutes / 60);
  const rest = totalMinutes % 60;
  return whole ? `${whole}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
};
const easternTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const programName = (program) => (program.contentType === 'EPISODE'
  ? `${program.seriesTitle || 'Series'} · S${program.seasonNumber ?? '?'} E${program.episodeNumber ?? '?'} · ${program.episodeTitle || program.title}`
  : program.title);

// Loads on mount and whenever `key` changes; `reload` re-runs the latest loader.
function useAsync(loader, key) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; });
  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      setState({ loading: false, data: await loaderRef.current(), error: '' });
    } catch (error) {
      setState({ loading: false, data: null, error: error.message });
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload, key]);
  return [state, reload];
}

function IssueList({ issues }) {
  if (!issues) return null;
  return (
    <>
      {issues.blocking.map((issue) => <p key={issue} className="linear-issue linear-issue--blocking">{issue}</p>)}
      {issues.warnings.map((issue) => <p key={issue} className="linear-issue linear-issue--warning">{issue}</p>)}
    </>
  );
}

function EntryForm({ programs, dayEntries, date, editing, prefill, onSaved, onCancel }) {
  const [form, setForm] = useState(() => (editing ? {
    kind: editing.kind, videoId: editing.videoId || '', programType: editing.programType || 'movie',
    date: channelDate(editing.startAt), time: new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(editing.startAt)),
    afterEntryId: '', durationSeconds: String(editing.durationSeconds || ''), sourceStartSeconds: String(editing.sourceStartSeconds || 0),
    label: editing.label || '', notes: editing.notes || '', fold: '',
  } : {
    kind: 'program', videoId: '', programType: 'movie', date: prefill?.date || date, time: prefill?.time || '20:00', afterEntryId: prefill?.afterEntryId || '',
    durationSeconds: '', sourceStartSeconds: '0', label: '', notes: '', fold: '',
  }));
  const [clearedOnly, setClearedOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const selected = programs.find((program) => program.id === form.videoId);
  const choices = clearedOnly
    ? programs.filter((program) => (program.linearRights === 'confirmed' && program.released) || program.id === form.videoId)
    : programs;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      kind: form.kind,
      ...(form.afterEntryId ? { afterEntryId: form.afterEntryId } : { startAtLocal: `${form.date}T${form.time}` }),
      ...(form.fold ? { fold: form.fold } : {}),
      ...(form.durationSeconds ? { durationSeconds: Number(form.durationSeconds) } : {}),
      label: form.label, notes: form.notes,
      ...(form.kind === 'program' ? { videoId: form.videoId, programType: form.programType, sourceStartSeconds: Number(form.sourceStartSeconds || 0) } : {}),
    };
    try {
      if (editing) await api.adminLinear(`schedule/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body });
      else await api.adminLinear('schedule', { method: 'POST', body });
      onSaved();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="linear-form" onSubmit={submit}>
      <h4>{editing ? 'Change entry (it returns to draft)' : 'Add to the schedule'}</h4>
      <div className="linear-form__row">
        <label>Type
          <select value={form.kind} onChange={set('kind')}>
            <option value="program">Program</option>
            <option value="break">Commercial break (placeholder)</option>
          </select>
        </label>
        {form.kind === 'program' && (
          <label>Program type
            <select value={form.programType} onChange={set('programType')}>
              <option value="movie">Movie</option>
              <option value="episode">TV episode</option>
              <option value="premiere">Premiere</option>
              <option value="rerun">Rerun</option>
            </select>
          </label>
        )}
      </div>
      {form.kind === 'program' && (
        <>
          <label className="linear-check">
            <input type="checkbox" checked={clearedOnly} onChange={(event) => setClearedOnly(event.target.checked)} />
            Only released titles with confirmed linear rights ({programs.filter((program) => program.linearRights === 'confirmed' && program.released).length})
          </label>
          <label>Title
            <select value={form.videoId} onChange={set('videoId')} required>
              <option value="">{choices.length ? 'Choose a title…' : 'No titles cleared for linear yet (see Linear rights)'}</option>
              {choices.map((program) => (
                <option key={program.id} value={program.id}>
                  {programName(program)} · {minutes(program.durationSeconds)}{program.released ? '' : ' · not released'}{program.linearRights === 'confirmed' ? '' : ` · linear rights ${program.linearRights}`}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {selected && selected.linearRights !== 'confirmed' && (
        <p className="linear-issue linear-issue--blocking">Linear rights are {selected.linearRights}. You can draft this slot, but it cannot be approved until rights are confirmed on the Linear rights tab.</p>
      )}
      <div className="linear-form__row">
        <label>Start right after
          <select value={form.afterEntryId} onChange={set('afterEntryId')}>
            <option value="">— A set time —</option>
            {dayEntries.filter((entry) => entry.id !== editing?.id).map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.title} (ends {formatChannelTime(entry.endAt)})</option>
            ))}
          </select>
        </label>
        {!form.afterEntryId && (
          <>
            <label>Date (Eastern)<input type="date" value={form.date} onChange={set('date')} required /></label>
            <label>Time (Eastern)<input type="time" value={form.time} onChange={set('time')} required /></label>
          </>
        )}
      </div>
      <div className="linear-form__row">
        <label>{form.kind === 'break' ? 'Break length (seconds)' : 'Slot length (seconds, blank = whole video)'}
          <input type="number" min={form.kind === 'break' ? 15 : 60} value={form.durationSeconds} onChange={set('durationSeconds')} required={form.kind === 'break'} />
        </label>
        {form.kind === 'program' && (
          <label>Start the video at (seconds)
            <input type="number" min="0" value={form.sourceStartSeconds} onChange={set('sourceStartSeconds')} />
          </label>
        )}
        <label>If the time repeats when clocks fall back
          <select value={form.fold} onChange={set('fold')}>
            <option value="">Not applicable</option>
            <option value="first">First (EDT)</option>
            <option value="second">Second (EST)</option>
          </select>
        </label>
      </div>
      <div className="linear-form__row">
        <label>Guide label (optional)<input value={form.label} maxLength={80} onChange={set('label')} placeholder="e.g. Season finale" /></label>
        <label>Internal notes<input value={form.notes} onChange={set('notes')} /></label>
      </div>
      {form.kind === 'break' && <p className="linear-note">Ad insertion is not active. Viewers see a PROtv &ldquo;We&rsquo;ll be right back&rdquo; card for the break; no ad is served or counted.</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="linear-actions">
        <button type="submit" className="admin-secondary admin-button-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save as draft' : 'Add as draft'}</button>
        {onCancel && <button type="button" className="admin-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function ScheduleTab() {
  const [date, setDate] = useState(todayEastern);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const week = mondayOf(date);
  const [schedule, reload] = useAsync(() => api.adminLinear(`schedule?${new URLSearchParams({
    from: new Date(Date.parse(`${week}T00:00:00-05:00`) - 3_600_000).toISOString(),
    to: new Date(Date.parse(`${addDays(week, 7)}T00:00:00-05:00`) + 3_600_000).toISOString(),
  })}`), week);
  const [programs] = useAsync(() => api.adminLinear('programs'), 'programs');
  const [coverage, reloadCoverage] = useAsync(() => api.adminLinear(`coverage?weekOf=${week}`), week);
  const [prefill, setPrefill] = useState(null);
  const entries = useMemo(() => schedule.data?.items || [], [schedule.data]);
  const dayEntries = entries.filter((entry) => channelDate(entry.startAt) === date);
  const dayCoverage = coverage.data?.days.find((day) => day.date === date);
  const dayGaps = (dayCoverage?.gaps || []).map((gap) => ({ ...gap, id: `gap-${gap.startAt}`, kind: 'gap' }));
  const dayRows = [...dayEntries, ...dayGaps].sort((left, right) => left.startAt.localeCompare(right.startAt));
  const refresh = async () => { await Promise.all([reload(), reloadCoverage()]); };
  // A gap after a program starts at that program's exact end (rarely a whole minute), so chain to it; otherwise
  // round up to the next minute so the new slot never overlaps what came before.
  const fillGap = (gap) => {
    setEditing(null);
    const previous = dayEntries.find((entry) => entry.endAt === gap.startAt);
    const start = new Date(Math.ceil(Date.parse(gap.startAt) / 60_000) * 60_000).toISOString();
    setPrefill({ date: channelDate(start), time: easternTime(start), afterEntryId: previous?.id || '', key: gap.startAt });
  };

  const act = async (entry, action) => {
    setMessage('');
    try {
      if (action === 'approve') {
        let acknowledgeWarnings = false;
        if (entry.issues.warnings.length) {
          if (!window.confirm(`Approve "${entry.title}" for ${entry.startLabel}?\n\n${entry.issues.warnings.join('\n\n')}`)) return;
          acknowledgeWarnings = true;
        }
        await api.adminLinear(`schedule/${encodeURIComponent(entry.id)}/approve`, { method: 'POST', body: { acknowledgeWarnings } });
      } else if (action === 'withdraw') {
        await api.adminLinear(`schedule/${encodeURIComponent(entry.id)}/withdraw`, { method: 'POST', body: {} });
      } else if (action === 'delete') {
        if (!window.confirm(`Remove "${entry.title}" at ${entry.startLabel}? If it is on air now, it stops for every viewer.`)) return;
        await api.adminLinear(`schedule/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      }
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="linear-schedule">
      <div className="linear-week" role="tablist" aria-label="Week">
        <button type="button" className="admin-secondary" onClick={() => setDate(addDays(week, -7))}>← Previous week</button>
        {Array.from({ length: 7 }, (_, index) => addDays(week, index)).map((day) => {
          const count = entries.filter((entry) => channelDate(entry.startAt) === day).length;
          const covered = coverage.data?.days.find((item) => item.date === day);
          return (
            <button key={day} type="button" role="tab" aria-selected={day === date} className={`linear-week__day ${day === date ? 'is-selected' : ''}`} onClick={() => setDate(day)}>
              <strong>{channelDayLabel(`${day}T17:00:00Z`)}</strong>
              <span>{count} {count === 1 ? 'entry' : 'entries'}</span>
              {covered && <span className={covered.gapSeconds ? 'linear-week__gap' : 'linear-week__full'}>{hours(covered.onAirSeconds)} on air{covered.gapSeconds ? ` · ${hours(covered.gapSeconds)} gap` : ' · full day'}</span>}
            </button>
          );
        })}
        <button type="button" className="admin-secondary" onClick={() => setDate(addDays(week, 7))}>Next week →</button>
      </div>
      {schedule.error && <p className="admin-error" role="alert">{schedule.error}</p>}
      {message && <p className="admin-error" role="alert">{message}</p>}
      <div className="linear-day">
        <div className="linear-timeline" style={{ height: 24 * 60 * PX_PER_MINUTE }} aria-hidden="true">
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="linear-timeline__hour" style={{ top: hour * 60 * PX_PER_MINUTE }}>
              {new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, hour)))}
            </span>
          ))}
          {dayEntries.map((entry) => {
            const start = channelMinutes(entry.startAt);
            const length = Math.max(12, Math.min(24 * 60 - start, entry.durationSeconds / 60));
            return (
              <button key={entry.id} type="button" onClick={() => setEditing(entry)}
                className={`linear-block linear-block--${entry.kind} linear-block--${entry.status} ${entry.issues.blocking.length ? 'has-blocking' : ''}`}
                style={{ top: start * PX_PER_MINUTE, height: length * PX_PER_MINUTE }}>
                <strong>{formatChannelTime(entry.startAt)} · {entry.title}</strong>
                <span>{entry.typeLabel} · {entry.status}</span>
              </button>
            );
          })}
        </div>
        <div className="linear-list">
          <h3>{channelDayLabel(`${date}T17:00:00Z`)}</h3>
          {schedule.loading && <p>Loading…</p>}
          {!schedule.loading && dayEntries.length === 0 && <p className="linear-note">Nothing is scheduled. Viewers see an &ldquo;Up next&rdquo; card during gaps.</p>}
          {dayRows.map((entry) => (entry.kind === 'gap' ? (
            <article key={entry.id} className="linear-gap">
              <strong>Gap · {formatChannelTime(entry.startAt)}–{formatChannelTime(entry.endAt)}</strong>
              <span>{hours((Date.parse(entry.endAt) - Date.parse(entry.startAt)) / 1000)} with nothing cleared to air. Viewers see the off-air card; nothing unauthorised plays.</span>
              <button type="button" className="admin-secondary" onClick={() => fillGap(entry)}>Fill this gap</button>
            </article>
          ) : (
            <article key={entry.id} className={`linear-entry linear-entry--${entry.status}`}>
              <header>
                <span className={`admin-status-pill ${entry.status === 'approved' ? 'is-on' : ''}`}>{entry.status === 'approved' ? 'Approved' : 'Draft'}</span>
                <strong>{formatChannelTime(entry.startAt)}–{formatChannelTime(entry.endAt)}</strong>
                <span>{entry.typeLabel}{entry.origin === 'primetime' ? ' · from primetime lineup' : ''}</span>
              </header>
              <h4>{entry.title}</h4>
              {entry.kind === 'program' && (
                <p className="linear-note">
                  Linear rights: {entry.linearRights} · {entry.released ? 'Released on demand' : 'Not released yet'}
                  {entry.status === 'approved' && entry.airState && entry.airState !== 'playing' ? ` · At air time: ${entry.airState}` : ''}
                </p>
              )}
              <IssueList issues={entry.issues} />
              <div className="linear-actions">
                {entry.status === 'draft' && <button type="button" className="admin-secondary admin-button-primary" disabled={entry.issues.blocking.length > 0} onClick={() => act(entry, 'approve')}>Approve for air</button>}
                {entry.status === 'approved' && <button type="button" className="admin-secondary" onClick={() => act(entry, 'withdraw')}>Withdraw approval</button>}
                <button type="button" className="admin-secondary" onClick={() => setEditing(entry)}>Edit</button>
                <button type="button" className="admin-secondary" onClick={() => act(entry, 'delete')}>Remove</button>
              </div>
            </article>
          )))}
          {programs.error && <p className="admin-error">{programs.error}</p>}
          {programs.data && (
            <EntryForm key={editing?.id || `new-${date}-${prefill?.key || ''}`} programs={programs.data.items} dayEntries={dayEntries} date={date} editing={editing}
              prefill={prefill?.date === date ? prefill : null}
              onSaved={() => { setEditing(null); setPrefill(null); void refresh(); }} onCancel={editing ? () => setEditing(null) : null} />
          )}
        </div>
      </div>
      <RepeatWeek key={week} sourceWeekOf={week} onApplied={refresh} />
    </div>
  );
}

function RepeatWeek({ sourceWeekOf, onApplied }) {
  const [targetWeekOf, setTargetWeekOf] = useState(() => addDays(sourceWeekOf, 7));
  const [weeks, setWeeks] = useState('1');
  const [keepPrimetimeOpen, setKeepPrimetimeOpen] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (apply) => {
    if (apply && !window.confirm(`Copy ${result.planned} approved entries from the week of ${sourceWeekOf}? They are created approved and will air.`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.adminLinear('schedule/repeat', { method: 'POST', body: { sourceWeekOf, targetWeekOf, weeks: Number(weeks), keepPrimetimeOpen, apply } });
      setResult(response);
      if (apply) await onApplied();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const change = (setter) => (event) => { setter(event.target.type === 'checkbox' ? event.target.checked : event.target.value); setResult(null); };
  return (
    <section className="linear-repeat" aria-labelledby="linear-repeat-title">
      <h3 id="linear-repeat-title">Repeat this week</h3>
      <p className="linear-note">Copies the approved programming of the week of {sourceWeekOf} to later weeks at the same Eastern times. Every copy is re-checked at its new time (linear rights, release, overlaps). Drafts are not copied, premieres repeat as reruns, and anything that fails a check is listed and left as a gap.</p>
      <div className="linear-form__row">
        <label>First target week (Monday)<input type="date" value={targetWeekOf} onChange={change(setTargetWeekOf)} /></label>
        <label>Number of weeks
          <select value={weeks} onChange={change(setWeeks)}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </label>
        <label className="linear-check"><input type="checkbox" checked={keepPrimetimeOpen} onChange={change(setKeepPrimetimeOpen)} />Keep primetime lineup slots open for new episodes</label>
      </div>
      <div className="linear-actions">
        <button type="button" className="admin-secondary" disabled={busy} onClick={() => run(false)}>{busy && !result ? 'Checking…' : 'Check for conflicts'}</button>
        {result && !result.applied && result.planned > 0 && (
          <button type="button" className="admin-secondary admin-button-primary" disabled={busy} onClick={() => run(true)}>Repeat and approve {result.planned} {result.planned === 1 ? 'entry' : 'entries'}</button>
        )}
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {result && (
        <>
          <p className="linear-note">{result.applied ? `${result.created} created and approved.` : `${result.planned} ready to copy.`} {result.skipped} skipped.</p>
          <ul className="linear-results">
            {result.items.map((item) => (
              <li key={`${item.sourceEntryId}-${item.targetWeekOf}`} className={item.action === 'create' ? 'is-created' : 'is-skipped'}>
                <strong>{item.startLabel || item.targetWeekOf}</strong> · {item.title} — {item.action === 'create' ? (result.applied ? 'Created' : 'Will be copied') + (item.note ? ` (${item.note})` : '') : item.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function RightsForm({ item, onSaved }) {
  const suggestion = !item.record && item.agreement?.finding === 'supports' ? item.agreement : null;
  const [form, setForm] = useState({
    status: item.record?.status || 'confirmed',
    basis: item.record?.basis || suggestion?.basis || '',
    agreementReference: item.record?.agreementReference || suggestion?.agreementReference || '',
    territory: item.record?.territory || suggestion?.territory || '',
    expiresOn: item.record?.expiresAt ? channelDate(item.record.expiresAt) : suggestion?.expiresOn || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (form.status === 'confirmed' && !window.confirm(`Confirm that the agreement for "${item.title}" permits scheduled linear streaming on PROtv LIVE? This is a legal rights decision.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.adminLinear(`rights/${encodeURIComponent(item.key)}`, { method: 'PUT', body: { ...form, expiresOn: form.expiresOn || null } });
      onSaved();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="linear-form linear-form--inline" onSubmit={submit}>
      <div className="linear-form__row">
        <label>Decision
          <select value={form.status} onChange={set('status')}>
            <option value="confirmed">Linear streaming permitted</option>
            <option value="denied">Not permitted</option>
          </select>
        </label>
        <label>Agreement / licence reference<input value={form.agreementReference} onChange={set('agreementReference')} /></label>
        <label>Territory<input value={form.territory} onChange={set('territory')} placeholder="e.g. Worldwide, US only" /></label>
        <label>Rights end (optional, Eastern)<input type="date" value={form.expiresOn} onChange={set('expiresOn')} /></label>
      </div>
      <label>Evidence: the clause or licence wording that covers scheduled linear streaming
        <textarea value={form.basis} onChange={set('basis')} rows={3} required minLength={20} />
      </label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button type="submit" className="admin-secondary admin-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Record decision'}</button>
    </form>
  );
}

function RightsTab() {
  const [review, reload] = useAsync(() => api.adminLinear('rights'), 'rights');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState('');
  const match = (item) => `${item.title} ${item.seriesTitle || ''}`.toLowerCase().includes(query.trim().toLowerCase());
  const titles = (review.data?.titles || []).filter(match);
  const series = (review.data?.series || []).filter(match);
  const confirmedCount = (review.data?.titles || []).filter((item) => item.effective === 'confirmed').length;
  const row = (item) => (
    <li key={item.key} className="linear-rights__row">
      <div>
        <strong>{item.seriesTitle && item.scope === 'title' ? `${item.seriesTitle} — ` : ''}{item.title}</strong>
        <span className={`linear-rights__status is-${item.effective || item.record?.status || 'unverified'}`}>{item.effective || item.record?.status || 'unverified'}</span>
        {item.onDemandEvidence && (
          <p className="linear-note">
            On-demand: {item.onDemandEvidence.copyrightStatus || 'unknown basis'}{item.onDemandEvidence.rightsHolder ? ` · ${item.onDemandEvidence.rightsHolder}` : ''}
            {item.onDemandEvidence.contractReference ? ` · ${item.onDemandEvidence.contractReference}` : ''}
            {item.onDemandEvidence.evidenceTier ? ` · evidence tier ${item.onDemandEvidence.evidenceTier}` : ''}
            {item.onDemandEvidence.territory ? ` · recommended territory ${item.onDemandEvidence.territory}` : ''}
          </p>
        )}
        {item.record && <p className="linear-note">Recorded {item.record.status} {item.record.recordedAt?.slice(0, 10)}: {item.record.basis}</p>}
        {!item.record && item.agreement && (
          <p className={`linear-finding is-${item.agreement.finding}`}>
            {item.agreement.finding === 'supports' ? 'Agreement review: the signed wording supports linear streaming. Record decision is pre-filled for your confirmation. ' : 'Agreement review: '}
            {item.agreement.caution}
          </p>
        )}
      </div>
      <button type="button" className="admin-secondary" onClick={() => setOpen(open === item.key ? '' : item.key)}>{open === item.key ? 'Close' : 'Record decision'}</button>
      {open === item.key && <RightsForm item={item} onSaved={() => { setOpen(''); void reload(); }} />}
    </li>
  );
  return (
    <div className="linear-rights">
      <p className="linear-note">PROtv LIVE is fail-closed: a title airs only with a recorded decision that its agreement or licence permits <strong>scheduled linear streaming</strong>. On-demand approval, Roku or Fire TV clearance do not count. A series decision covers its episodes unless an episode has its own decision.</p>
      <p><strong>{confirmedCount}</strong> of {review.data?.titles.length ?? '…'} titles currently cleared for linear. {(review.data?.titles || []).filter((item) => !item.record && item.agreement?.finding === 'supports').length} awaiting your confirmation from the agreement review.</p>
      <input className="linear-search" type="search" placeholder="Filter titles" value={query} onChange={(event) => setQuery(event.target.value)} />
      {review.error && <p className="admin-error" role="alert">{review.error}</p>}
      {series.length > 0 && <><h3>Series</h3><ul>{series.map(row)}</ul></>}
      <h3>Titles</h3>
      <ul>{titles.map(row)}</ul>
    </div>
  );
}

function PrimetimeTab() {
  const [settings, reloadSettings] = useAsync(() => api.adminLinear('settings'), 'settings');
  const [lineup, setLineup] = useState(null);
  const [weekOf, setWeekOf] = useState(() => mondayOf(addDays(todayEastern(), 7)));
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const slots = lineup || settings.data?.primetime || [];
  const update = (index, field, value) => setLineup(slots.map((slot, position) => (position === index ? { ...slot, [field]: field === 'weekday' ? Number(value) : value } : slot)));

  const save = async () => {
    setError('');
    try {
      await api.adminLinear('settings', { method: 'PUT', body: { primetime: slots } });
      setLineup(null);
      await reloadSettings();
    } catch (reason) { setError(reason.message); }
  };
  const draft = async () => {
    setBusy(true);
    setError('');
    try { setResults((await api.adminLinear('primetime/draft', { method: 'POST', body: { weekOf } })).items); } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };

  return (
    <div className="linear-primetime">
      <p className="linear-note">The lineup drafts each series&rsquo; next unscheduled episode into its slot. Drafts never air until approved on the Schedule tab, an unreleased episode airs only after its own approved release, and drafting never changes a premiere or release date.</p>
      <table className="linear-table">
        <thead><tr><th>Day</th><th>Time (ET)</th><th>Series (exact catalog name)</th><th /></tr></thead>
        <tbody>
          {slots.map((slot, index) => (
            <tr key={`${slot.weekday}-${slot.time}-${slot.seriesTitle}-${index}`}>
              <td><select value={slot.weekday} onChange={(event) => update(index, 'weekday', event.target.value)}>{WEEKDAYS.map((day, value) => <option key={day} value={value}>{day}</option>)}</select></td>
              <td><input type="time" value={slot.time} onChange={(event) => update(index, 'time', event.target.value)} /></td>
              <td><input value={slot.seriesTitle} onChange={(event) => update(index, 'seriesTitle', event.target.value)} /></td>
              <td><button type="button" className="admin-secondary" onClick={() => setLineup(slots.filter((_, position) => position !== index))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="linear-actions">
        <button type="button" className="admin-secondary" onClick={() => setLineup([...slots, { weekday: 1, time: '20:00', seriesTitle: '' }])}>Add slot</button>
        {lineup && <button type="button" className="admin-secondary admin-button-primary" onClick={save}>Save lineup</button>}
      </div>
      <div className="linear-form__row">
        <label>Week starting (Monday)<input type="date" value={weekOf} onChange={(event) => setWeekOf(event.target.value)} /></label>
        <button type="button" className="admin-secondary admin-button-primary" disabled={busy || Boolean(lineup)} onClick={draft}>{busy ? 'Drafting…' : 'Draft this week'}</button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {results && (
        <ul className="linear-results">
          {results.map((result) => (
            <li key={`${result.seriesTitle}-${result.slot}`} className={result.created ? 'is-created' : 'is-skipped'}>
              <strong>{result.seriesTitle}</strong> · {result.slot.replace('T', ' ')} ET — {result.created ? `Drafted ${result.created.title} (${result.created.typeLabel}). Review and approve it on the Schedule tab.` : result.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [range, setRange] = useState(() => ({ from: addDays(todayEastern(), -6), to: todayEastern() }));
  const [report, reload] = useAsync(() => api.adminLinear(`analytics?${new URLSearchParams(range)}`), `${range.from}:${range.to}`);
  const totals = report.data?.totals;
  return (
    <div className="linear-analytics">
      <div className="linear-form__row">
        <label>From<input type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /></label>
        <label>To<input type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /></label>
        <button type="button" className="admin-secondary" onClick={reload}>Refresh</button>
      </div>
      {report.error && <p className="admin-error" role="alert">{report.error}</p>}
      {totals && (
        <>
          <div className="linear-cards">
            <div><span>Tune-ins</span><strong>{totals.tuneIns}</strong></div>
            <div><span>Unique viewers (daily)</span><strong>{totals.uniqueViewers}</strong></div>
            <div><span>Video starts</span><strong>{totals.videoStarts}</strong></div>
            <div><span>Starts per tune-in</span><strong>{totals.startRate}</strong></div>
            <div><span>Watch time</span><strong>{totals.watchMinutes} min</strong></div>
            <div><span>Avg. per start</span><strong>{totals.averageMinutesPerStart} min</strong></div>
            <div><span>Errors</span><strong>{totals.errors}</strong></div>
          </div>
          <p className="linear-note">{report.data.note}</p>
          <h3>By program</h3>
          <table className="linear-table">
            <thead><tr><th>Aired</th><th>Program</th><th>Tune-ins</th><th>Starts</th><th>Watch min</th><th>Avg/start</th><th>Errors</th></tr></thead>
            <tbody>
              {report.data.programs.length === 0 && <tr><td colSpan={7}>No channel viewing recorded in this range.</td></tr>}
              {report.data.programs.map((program) => (
                <tr key={program.entryId}><td>{program.startLabel}</td><td>{program.title}</td><td>{program.tuneIns}</td><td>{program.videoStarts}</td><td>{program.watchMinutes}</td><td>{program.averageMinutesPerStart}</td><td>{program.errors}</td></tr>
              ))}
            </tbody>
          </table>
          <h3>By day</h3>
          <table className="linear-table">
            <thead><tr><th>Day (ET)</th><th>Tune-ins</th><th>Unique</th><th>Starts</th><th>Watch min</th><th>Errors</th></tr></thead>
            <tbody>
              {report.data.days.map((day) => (
                <tr key={day.date}><td>{day.date}</td><td>{day.tuneIns}</td><td>{day.uniqueViewers}</td><td>{day.videoStarts}</td><td>{day.watchMinutes}</td><td>{day.errors}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ChannelTab() {
  const [settings, reload] = useAsync(() => api.adminLinear('settings'), 'settings');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const isPublic = settings.data?.status === 'public';
  const change = async (status) => {
    setError('');
    if (status === 'off' && !window.confirm('Take PROtv LIVE off the air for every viewer?')) return;
    try {
      await api.adminLinear('settings', { method: 'PUT', body: { status, ...(status === 'public' ? { confirmation } : {}) } });
      setConfirmation('');
      await reload();
    } catch (reason) { setError(reason.message); }
  };
  const policy = settings.data?.adPolicy;
  return (
    <div className="linear-channel">
      <article className="admin-advertising__card">
        <header>
          <h3>{settings.data?.name || 'PROtv LIVE'}</h3>
          <span className={`admin-status-pill ${isPublic ? 'is-on' : ''}`}>{settings.data ? (isPublic ? 'Public' : 'Off (not public)') : 'Loading…'}</span>
        </header>
        <p>One scheduled web channel at <code>/live</code>. It plays the existing on-demand Mux videos at the scheduled position, so it adds no encoder or live-stream cost.</p>
        <p><a href="/live?preview=1" target="_blank" rel="noreferrer">Open the Administrator preview</a> (works while the channel is off).</p>
        {settings.data?.launchedAt && <p className="linear-note">Last made public {new Date(settings.data.launchedAt).toLocaleString()}.</p>}
        {isPublic ? (
          <button type="button" className="admin-secondary" onClick={() => change('off')}>Take the channel off the air</button>
        ) : (
          <div className="linear-form__row">
            <label>Type <code>{LAUNCH_CONFIRMATION}</code> to make it public
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            <button type="button" className="admin-secondary admin-button-primary" disabled={confirmation !== LAUNCH_CONFIRMATION} onClick={() => change('public')}>Launch PROtv LIVE</button>
          </div>
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </article>
      <article className="admin-advertising__card">
        <header><h3>Commercials</h3><span className="admin-status-pill">Not active</span></header>
        <p>Commercial breaks can be placed in the schedule today (between programs, or mid-program by splitting a title into segments with &ldquo;Start the video at&rdquo;). Viewers see a PROtv &ldquo;We&rsquo;ll be right back&rdquo; card. No ad is requested, served or counted on PROtv LIVE until an ad decision service is connected and verified.</p>
        {policy && <p className="linear-note">Planned limits: up to {policy.maxBreakMinutesPerHour} break minutes and {policy.maxBreaksPerProgramHour} breaks per program hour; at most {policy.viewerFrequencyCapPerHour} ads per viewer per hour.</p>}
      </article>
      <article className="admin-advertising__card">
        <header><h3>TV apps</h3><span className="admin-status-pill">Web only</span></header>
        <p>Roku and Fire TV can use the same channel API (<code>/v1/linear/channel</code>) later. No device app has been changed; each needs its own playback and seek-lock verification before release.</p>
      </article>
    </div>
  );
}

export default function AdminLinearChannel() {
  const [tab, setTab] = useState('schedule');
  return (
    <section className="admin-linear" aria-labelledby="admin-linear-title">
      <h2 id="admin-linear-title">PROtv LIVE</h2>
      <div className="linear-tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'rights' && <RightsTab />}
      {tab === 'primetime' && <PrimetimeTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'channel' && <ChannelTab />}
    </section>
  );
}

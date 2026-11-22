import { useCallback, useEffect, useRef, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import { api } from '../api';
import { channelDate, formatChannelTime } from '../data/linearChannel';

// PROtv LIVE commercials ("spots"), break filling, premiere countdowns and programming blocks.
const TYPES = [
  { id: 'promo', label: 'PROtv promotion' },
  { id: 'trailer', label: 'Upcoming-show trailer' },
  { id: 'sponsor', label: 'Sponsor advertisement' },
  { id: 'bumper', label: 'PROtv interstitial (bumper)' },
];
const COUNTDOWN_MINUTES = [5, 10, 15, 30];
const seconds = (value) => `${Math.round(Number(value) || 0)} s`;

// Plays a spot inside Admin so it can be reviewed before approval. Watching it here never airs it or records an impression.
function SpotPreview({ spot, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let active = true;
    api.adminLinear(`creatives/${encodeURIComponent(spot.id)}/preview`)
      .then((data) => { if (active) setState({ loading: false, data, error: '' }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error: error.message }); });
    return () => { active = false; };
  }, [spot.id]);
  return (
    <div className="linear-spot-preview">
      {state.loading && <p className="linear-note">Loading the video…</p>}
      {state.error && <p className="linear-issue linear-issue--warning">{state.error}</p>}
      {state.data && (
        <MuxPlayer
          playbackId={state.data.muxPlaybackId}
          {...(state.data.playbackToken ? { tokens: { playback: state.data.playbackToken } } : {})}
          streamType="on-demand"
          autoPlay
          metadata={{ video_title: `Admin preview: ${spot.title}` }}
          style={{ width: '100%', maxWidth: 640, aspectRatio: '16 / 9' }}
        />
      )}
      <button type="button" className="admin-secondary" onClick={onClose}>Close video</button>
    </div>
  );
}

function useLoad(loader) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const ref = useRef(loader);
  useEffect(() => { ref.current = loader; });
  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { setState({ loading: false, data: await ref.current(), error: '' }); } catch (error) { setState({ loading: false, data: null, error: error.message }); }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  return [state, reload];
}

// The file goes from this browser straight to Mux; PROtv's server never handles the video bytes.
function putToMux(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status}).`)));
    request.onerror = () => reject(new Error('Upload failed. Check the connection and try again.'));
    request.send(file);
  });
}

function NewSpotForm({ onCreated }) {
  const [source, setSource] = useState('upload');
  const [form, setForm] = useState({ type: 'promo', title: '', advertiser: '', flightStart: '', flightEnd: '', videoId: '' });
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [trailers] = useLoad(() => api.adminLinear('creatives/trailer-sources'));
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    if (source === 'upload' && !file) { setMessage('Choose the video file.'); return; }
    setBusy(true);
    try {
      const body = {
        type: form.type, title: form.title, advertiser: form.advertiser,
        flightStart: form.flightStart || null, flightEnd: form.flightEnd || null,
        ...(source === 'catalog-trailer' ? { source, videoId: form.videoId } : {}),
      };
      const result = await api.adminLinear('creatives', { method: 'POST', body });
      if (result.uploadUrl) {
        setProgress(0);
        await putToMux(result.uploadUrl, file, setProgress);
        setMessage('Uploaded. Mux is processing it; use "Check processing" in a minute, then approve it.');
      } else {
        setMessage('Added. Approve it to use it in breaks.');
      }
      setForm({ type: form.type, title: '', advertiser: '', flightStart: '', flightEnd: '', videoId: '' });
      setFile(null);
      onCreated();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  return (
    <form className="linear-form" onSubmit={submit}>
      <h3>Add a spot</h3>
      <fieldset className="linear-radio">
        <legend>Video</legend>
        <label><input type="radio" checked={source === 'upload'} onChange={() => setSource('upload')} /> Upload a new video (3 s – 3 min)</label>
        <label><input type="radio" checked={source === 'catalog-trailer'} onChange={() => setSource('catalog-trailer')} /> Reuse a trailer already on PROtv</label>
      </fieldset>
      <label>Type
        <select value={form.type} onChange={set('type')}>{TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
      </label>
      <label>Name<input required minLength={2} maxLength={120} value={form.title} onChange={set('title')} placeholder="Holiday sale :30" /></label>
      {form.type === 'sponsor' && <label>Sponsor<input required minLength={2} maxLength={120} value={form.advertiser} onChange={set('advertiser')} placeholder="Business name viewers will see" /></label>}
      {source === 'upload'
        ? <label>Video file<input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        : (
          <label>Trailer
            <select required value={form.videoId} onChange={set('videoId')}>
              <option value="">Choose a title with a trailer</option>
              {(trailers.data?.items || []).map((item) => <option key={item.id} value={item.id}>{item.title} ({seconds(item.durationSeconds)})</option>)}
            </select>
          </label>
        )}
      <div className="linear-form__row">
        <label>First day (optional)<input type="date" value={form.flightStart} onChange={set('flightStart')} /></label>
        <label>Last day (optional)<input type="date" value={form.flightEnd} onChange={set('flightEnd')} /></label>
      </div>
      {progress !== null && <progress value={progress} max={100}>{progress}%</progress>}
      {message && <p className="linear-note" role="status">{message}</p>}
      <button type="submit" className="admin-secondary admin-button-primary" disabled={busy}>{busy ? 'Working…' : 'Add spot'}</button>
    </form>
  );
}

function SpotReport() {
  const today = channelDate(new Date().toISOString());
  const [range, setRange] = useState({ from: today, to: today });
  const [report, setReport] = useState({ data: null, error: '' });
  const load = async () => {
    try { setReport({ data: await api.adminLinear(`creatives/report?from=${range.from}&to=${range.to}`), error: '' }); } catch (error) { setReport({ data: null, error: error.message }); }
  };
  return (
    <section className="linear-card">
      <h3>Commercial delivery</h3>
      <div className="linear-form__row">
        <label>From<input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
        <label>To<input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
        <button type="button" className="admin-secondary" onClick={load}>Show</button>
      </div>
      {report.error && <p className="admin-error">{report.error}</p>}
      {report.data && (report.data.creatives.length === 0 ? <p className="linear-note">No spot plays in this range.</p> : (
        <table className="linear-table">
          <thead><tr><th>Spot</th><th>Starts</th><th>Completions</th><th>Completion rate</th></tr></thead>
          <tbody>{report.data.creatives.map((row) => (
            <tr key={row.creativeId}><td>{row.creativeId}</td><td>{row.starts}</td><td>{row.completes}</td><td>{Math.round(row.completionRate * 100)}%</td></tr>
          ))}</tbody>
        </table>
      ))}
      {report.data && <p className="linear-note">{report.data.note}</p>}
    </section>
  );
}

export function CommercialsTab() {
  const [spots, reload] = useLoad(() => api.adminLinear('creatives'));
  const [message, setMessage] = useState('');
  const [watching, setWatching] = useState(null);
  const act = async (spot, action) => {
    setMessage('');
    try {
      if (action === 'refresh') await api.adminLinear(`creatives/${spot.id}/refresh`, { method: 'POST', body: {} });
      if (action === 'approve') {
        const rightsConfirmation = window.prompt(`Approve "${spot.title}" for PROtv LIVE.\n\nWho made or owns this spot, and why may PROtv air it?`, spot.type === 'sponsor' ? `Supplied by ${spot.advertiser} for broadcast on PROtv.` : 'Produced by PROtv (Prophecy Entertainment LLC).');
        if (rightsConfirmation === null) return;
        await api.adminLinear(`creatives/${spot.id}/approve`, { method: 'POST', body: { rightsConfirmation } });
      }
      if (action === 'retire') {
        if (!window.confirm(`Retire "${spot.title}"? It stops airing immediately; its time in breaks shows the PROtv card.`)) return;
        await api.adminLinear(`creatives/${spot.id}/retire`, { method: 'POST', body: {} });
      }
      await reload();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const items = spots.data?.items || [];
  return (
    <div className="linear-commercials">
      <p className="linear-note">
        Spots are PROtv&rsquo;s own commercials. They play only inside scheduled commercial breaks and premiere countdowns, between programs,
        never inside a film. Every viewer sees the same spot at the same moment. Sponsored spots are labelled &ldquo;Sponsored&rdquo;.
      </p>
      {message && <p className="admin-error" role="alert">{message}</p>}
      {spots.error && <p className="admin-error">{spots.error}</p>}
      <div className="linear-spots">
        {items.length === 0 && !spots.loading && <p className="linear-note">No spots yet.</p>}
        {items.map((spot) => (
          <article key={spot.id} className={`linear-entry linear-entry--${spot.status === 'approved' ? 'approved' : 'draft'}`}>
            <header>
              <span className={`admin-status-pill ${spot.status === 'approved' ? 'is-on' : ''}`}>{spot.status}</span>
              <strong>{spot.title}</strong>
              <span>{spot.typeLabel}{spot.advertiser ? ` · ${spot.advertiser}` : ''} · {seconds(spot.durationSeconds)}</span>
            </header>
            <p className="linear-note">
              {spot.source === 'catalog-trailer' ? 'Reused catalog trailer' : `Upload · ${spot.muxStatus || 'unknown'}`}
              {spot.flightStart || spot.flightEnd ? ` · Flight ${spot.flightStart || '…'} to ${spot.flightEnd || '…'}` : ''}
              {spot.status === 'approved' ? (spot.airableNow ? ' · Can air now' : ' · Outside its flight dates') : ''}
            </p>
            {spot.rightsConfirmation && <p className="linear-note">Rights: {spot.rightsConfirmation}</p>}
            {spot.status !== 'approved' && spot.problems.map((problem) => <p key={problem} className="linear-issue linear-issue--warning">{problem}</p>)}
            {watching === spot.id && <SpotPreview spot={spot} onClose={() => setWatching(null)} />}
            <div className="linear-actions">
              {spot.muxPlaybackId && watching !== spot.id && <button type="button" className="admin-secondary" onClick={() => setWatching(spot.id)}>Watch</button>}
              {spot.source === 'upload' && !spot.muxPlaybackId && <button type="button" className="admin-secondary" onClick={() => act(spot, 'refresh')}>Check processing</button>}
              {spot.status === 'draft' && <button type="button" className="admin-secondary admin-button-primary" disabled={spot.problems.length > 0} onClick={() => act(spot, 'approve')}>Approve</button>}
              {spot.status !== 'retired' && <button type="button" className="admin-secondary" onClick={() => act(spot, 'retire')}>Retire</button>}
            </div>
          </article>
        ))}
      </div>
      <NewSpotForm onCreated={reload} />
      <SpotReport />
    </div>
  );
}

// Inside a commercial break in the schedule: shows its spots and fills it.
export function BreakSpots({ entry, onChanged, onError }) {
  const [spots, setSpots] = useState(null);
  const [choice, setChoice] = useState('');
  const loadSpots = async () => {
    try { setSpots((await api.adminLinear('creatives')).items.filter((spot) => spot.status === 'approved')); } catch (error) { onError(error.message); }
  };
  const save = async (body) => {
    try {
      await api.adminLinear(`schedule/${encodeURIComponent(entry.id)}/pod`, { method: 'PUT', body });
      onChanged();
    } catch (error) { onError(error.message); }
  };
  const pod = entry.pod || [];
  const used = pod.reduce((sum, spot) => sum + spot.durationSeconds, 0);
  return (
    <div className="linear-pod">
      {pod.length > 0 ? (
        <ol>{pod.map((spot, index) => (
          <li key={`${spot.creativeId}-${index}`} className={spot.airable ? '' : 'is-unavailable'}>
            {spot.title}{spot.advertiser ? ` (${spot.advertiser})` : ''} · {seconds(spot.durationSeconds)}{spot.airable ? '' : ' · not airable at this time'}
          </li>
        ))}</ol>
      ) : <p className="linear-note">No spots: viewers see the PROtv card for the whole break.</p>}
      <p className="linear-note">{used} of {entry.durationSeconds} s filled.</p>
      <div className="linear-actions">
        <button type="button" className="admin-secondary" onClick={() => save({ autofill: true })}>Fill automatically</button>
        {spots === null ? <button type="button" className="admin-secondary" onClick={loadSpots}>Choose spots…</button> : (
          <>
            <select value={choice} onChange={(event) => setChoice(event.target.value)} aria-label="Spot to add">
              <option value="">Add a spot</option>
              {spots.map((spot) => <option key={spot.id} value={spot.id}>{spot.title} ({seconds(spot.durationSeconds)})</option>)}
            </select>
            <button type="button" className="admin-secondary" disabled={!choice} onClick={() => save({ creativeIds: [...pod.map((spot) => spot.creativeId), choice] })}>Add</button>
          </>
        )}
        {pod.length > 0 && <button type="button" className="admin-secondary" onClick={() => save({ creativeIds: [] })}>Clear</button>}
      </div>
    </div>
  );
}

// On a program in the schedule: adds a premiere countdown in the minutes before it.
export function CountdownControl({ entry, onChanged, onError }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ minutes: 10, artworkUrl: '', showEpisodeTitle: true, autofill: true });
  if (!open) return <button type="button" className="admin-secondary" onClick={() => setOpen(true)}>Add countdown</button>;
  const submit = async () => {
    try {
      await api.adminLinear(`schedule/${encodeURIComponent(entry.id)}/countdown`, { method: 'POST', body: { ...form, minutes: Number(form.minutes) } });
      setOpen(false);
      onChanged();
    } catch (error) { onError(error.message); }
  };
  return (
    <div className="linear-countdown-form">
      <label>Countdown length
        <select value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })}>
          {COUNTDOWN_MINUTES.map((value) => <option key={value} value={value}>{value} minutes before {formatChannelTime(entry.startAt)}</option>)}
        </select>
      </label>
      <label>Poster or artwork link (PROtv artwork only)
        <input type="url" value={form.artworkUrl} onChange={(event) => setForm({ ...form, artworkUrl: event.target.value })} placeholder="https://watchprotv.com/api/posters/…" />
      </label>
      <label><input type="checkbox" checked={form.showEpisodeTitle} onChange={(event) => setForm({ ...form, showEpisodeTitle: event.target.checked })} /> Show the episode name</label>
      <label><input type="checkbox" checked={form.autofill} onChange={(event) => setForm({ ...form, autofill: event.target.checked })} /> Play approved promotions and sponsor spots before the final minute</label>
      <div className="linear-actions">
        <button type="button" className="admin-secondary admin-button-primary" onClick={submit}>Draft countdown</button>
        <button type="button" className="admin-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// Several programs back to back from one start time, with optional commercial breaks between them (never inside).
export function BlockBuilder({ programs, date, onCreated }) {
  const [time, setTime] = useState('20:00');
  const [items, setItems] = useState([]);
  const [choice, setChoice] = useState('');
  const [breakSeconds, setBreakSeconds] = useState(120);
  const [message, setMessage] = useState('');
  const available = programs.filter((program) => program.released && program.linearRights === 'confirmed');
  const add = () => {
    const program = available.find((item) => item.id === choice);
    if (program) setItems([...items, program]);
    setChoice('');
  };
  const total = items.reduce((sum, item) => sum + (item.durationSeconds || 0), 0) + Math.max(0, items.length - 1) * (Number(breakSeconds) || 0);
  const submit = async () => {
    setMessage('');
    try {
      const result = await api.adminLinear('blocks', {
        method: 'POST',
        body: { startAtLocal: `${date}T${time}`, items: items.map((item) => ({ videoId: item.id, programType: item.contentType === 'EPISODE' ? 'episode' : 'movie' })), breakSeconds: Number(breakSeconds) || 0, fillBreaks: true },
      });
      setItems([]);
      setMessage(`Drafted ${result.created.length} entries. Review and approve them in the list above.`);
      onCreated();
    } catch (error) { setMessage(error.message); }
  };
  return (
    <section className="linear-card">
      <h3>Programming block</h3>
      <p className="linear-note">Programs play back to back from the start time. Breaks go between programs, never inside one. Everything is created as a draft.</p>
      <div className="linear-form__row">
        <label>Start (Eastern)<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label>Break between programs
          <select value={breakSeconds} onChange={(event) => setBreakSeconds(event.target.value)}>
            <option value={0}>No breaks</option>
            {[30, 60, 90, 120, 180, 240].map((value) => <option key={value} value={value}>{value < 60 ? `${value} s` : `${value / 60} min`}</option>)}
          </select>
        </label>
      </div>
      <div className="linear-form__row">
        <select value={choice} onChange={(event) => setChoice(event.target.value)} aria-label="Program to add">
          <option value="">Add a released title with confirmed linear rights</option>
          {available.map((program) => <option key={program.id} value={program.id}>{program.seriesTitle ? `${program.seriesTitle} · ` : ''}{program.episodeTitle || program.title} ({Math.round(program.durationSeconds / 60)} min)</option>)}
        </select>
        <button type="button" className="admin-secondary" disabled={!choice} onClick={add}>Add</button>
      </div>
      {available.length === 0 && <p className="linear-note">No released title has confirmed linear rights yet. Record decisions in Linear rights first.</p>}
      {items.length > 0 && (
        <ol className="linear-block-list">
          {items.map((item, index) => (
            <li key={`${item.id}-${index}`}>
              {item.seriesTitle ? `${item.seriesTitle} · ` : ''}{item.episodeTitle || item.title}
              <button type="button" className="admin-secondary" onClick={() => setItems(items.filter((_, position) => position !== index))}>Remove</button>
            </li>
          ))}
        </ol>
      )}
      {items.length > 0 && <p className="linear-note">About {Math.round(total / 60)} minutes in total.</p>}
      {message && <p className="linear-note" role="status">{message}</p>}
      <button type="button" className="admin-secondary admin-button-primary" disabled={!items.length} onClick={submit}>Draft this block</button>
    </section>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import { api } from '../api';
import { StyledEditor, TemplateChoice, TemplatesManager } from './CommercialDesigner';
import '../styles/MarketingStudio.css';

// PROtv Marketing Studio: one workspace for commercials, campaigns, social, paid media, creator promotion and LIVE spots.
// Every number shown is labelled observed, reported or estimated; nothing here publishes, spends or airs without an
// explicit approval step.
const SECTIONS = [
  ['overview', 'Overview'], ['commercials', 'AI Commercial Studio'], ['templates', 'Commercial Templates'], ['hype', 'Hype Clip Studio'], ['campaigns', 'Campaign Manager'],
  ['calendar', 'Social Calendar'], ['accounts', 'Social Accounts'], ['growth', 'Audience Growth'], ['paid', 'Paid Advertising'],
  ['creators', 'Creator Promotion Center'], ['sponsors', 'Sponsor Commercials'], ['live', 'PROtv LIVE Ad Manager'], ['analytics', 'Marketing Analytics'],
  ['assets', 'Asset Library'], ['settings', 'Settings & Integrations'],
];
const CAMPAIGN_TYPES = ['network-awareness', 'film-premiere', 'new-episode', 'live-promotion', 'creator-spotlight', 'genre-discovery', 'weekend-lineup', 'free-streaming', 'sponsor', 'paid-acquisition'];
const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'manual'];
const TONES = ['cinematic', 'network', 'energetic', 'suspense', 'comedy', 'documentary', 'family', 'corporate'];
const label = (value) => String(value || '').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const et = (value) => (value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '—');
const call = (path, options) => api.adminMarketing(path, options);
const thumb = (playbackId, time) => `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${Math.max(0, Number(time) || 0)}&width=240`;

function useData(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    call(path).then((data) => { if (active) setState({ loading: false, data, error: '' }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error: error.message }); });
    return () => { active = false; };
  }, [path, version, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}
// One vocabulary for every post and campaign state.
const STATUS_LABELS = {
  draft: 'Draft', 'in-review': 'Needs approval', approved: 'Approved', scheduled: 'Scheduled', active: 'Active', paused: 'Paused', held: 'On hold',
  'queued-pss': 'Publishing', 'publishing-pss': 'Publishing', published: 'Published', failed: 'Failed', 'needs-check': 'Needs review',
  missed: 'Missed', 'test-passed': 'Test passed', cancelled: 'Cancelled', 'ready-for-manual': 'Post manually', archived: 'Archived', completed: 'Completed',
};
const STATUS_TONE = { 'queued-pss': 'rendering', 'publishing-pss': 'rendering', 'needs-check': 'failed', missed: 'held', 'in-review': 'in-review' };
function Status({ value }) {
  const tone = STATUS_TONE[value] || value;
  return <span className={`ms-status ms-status--${String(tone || 'none').replace(/[^a-z-]/g, '')}`}>{STATUS_LABELS[value] || label(value)}</span>;
}
// Eastern wall-clock value for <input type="datetime-local">.
const etInput = (iso) => {
  if (!iso) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
function Notice({ error, message }) {
  if (error) return <p className="ms-notice ms-notice--error" role="alert">{error}</p>;
  return message ? <p className="ms-notice">{message}</p> : null;
}
function useAction() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const run = async (key, fn, done) => {
    setBusy(key); setError(''); setMessage('');
    try { const result = await fn(); if (done) setMessage(typeof done === 'function' ? done(result) : done); return result; } catch (failure) { setError(failure.message); return null; } finally { setBusy(''); }
  };
  return { busy, error, message, run };
}

// ---------------------------------------------------------------- Overview + agent
function Agent({ onDone }) {
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState(null);
  const action = useAction();
  const examples = ['Create a commercial for PROtv.', 'Promote The Thirst this week.', "Promote tonight's LIVE lineup.", 'Prepare seven days of Facebook posts.', 'Which movie should we advertise next?', 'Show me what marketing generated the most viewers.'];
  const submit = async (text) => {
    const value = text ?? instruction;
    if (!value.trim()) return;
    const output = await action.run('agent', () => call('agent', { method: 'POST', body: { instruction: value } }));
    if (output) { setResult(output); onDone?.(); }
  };
  return (
    <section className="ms-card ms-agent">
      <h3>Marketing agent</h3>
      <p className="ms-muted">It drafts, plans, renders and analyses with real PROtv data. Publishing, spending and airing always wait for your approval.</p>
      <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="ms-row">
        <input value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="e.g. Promote Ironborn this week" aria-label="Instruction for the marketing agent" />
        <button type="submit" className="ms-primary" disabled={action.busy === 'agent'}>{action.busy === 'agent' ? 'Working…' : 'Run'}</button>
      </form>
      <div className="ms-chips">{examples.map((example) => <button type="button" key={example} className="ms-chip" onClick={() => { setInstruction(example); submit(example); }}>{example}</button>)}</div>
      <Notice error={action.error} />
      {result && (
        <div className="ms-agent-result">
          <ol>{result.steps.map((step, index) => <li key={index}><strong>{step.label}</strong>{step.detail ? ` — ${step.detail}` : ''}</li>)}</ol>
          {result.result?.ranked && <table className="ms-table"><thead><tr><th>Title</th><th>LIVE airings this week</th><th>Existing campaigns</th></tr></thead><tbody>{result.result.ranked.map((row) => <tr key={row.videoId}><td>{row.title}</td><td>{row.airingsThisWeek}</td><td>{row.campaigns}</td></tr>)}</tbody></table>}
          {result.result?.measuredNote && <p className="ms-muted">{result.result.measuredNote}</p>}
          {result.next?.length > 0 && <p className="ms-muted">Next: {result.next.join(' · ')}</p>}
        </div>
      )}
    </section>
  );
}

function Alerts({ alerts }) {
  if (!alerts?.length) return <p className="ms-notice">All clear: no failed, missed or unreviewed posts, and Facebook/Instagram are healthy.</p>;
  return (
    <section className="ms-card"><h3>Needs your attention</h3>
      <ul className="ms-alerts">{alerts.map((alert, index) => <li key={index} className={`ms-alert ms-alert--${alert.level}`}>{alert.message}</li>)}</ul>
    </section>
  );
}
function MetaHealth({ pss }) {
  if (!pss) return <section className="ms-card"><h3>Facebook &amp; Instagram</h3><p className="ms-muted">PROtv Social Studio has not linked yet.</p></section>;
  const { online } = pss;
  return (
    <section className="ms-card"><h3>Facebook &amp; Instagram (via PROtv Social Studio)</h3>
      <dl className="ms-specs">
        <dt>Accounts</dt><dd>{pss.page?.name || '—'} · @{pss.instagram?.username || '—'} {pss.facebookReady && pss.instagramReady ? <span className="ms-good">ready</span> : <span className="ms-bad">not ready</span>}</dd>
        <dt>Studio PC</dt><dd>{online ? <span className="ms-good">online</span> : <span className="ms-bad">offline</span>} · last check-in {et(pss.lastSeenAt)}</dd>
        <dt>Publishing access</dt><dd>until {et(pss.connectionExpiresAt)}{pss.pageTokenNeverExpires ? ' (Page token never expires; Meta data access window)' : ''}</dd>
        <dt>Verified</dt><dd>{pss.healthCheckedAt ? et(pss.healthCheckedAt) : 'not yet'}</dd>
        {pss.appSecretAccepted === false && <><dt>App secret</dt><dd className="ms-bad">rejected by Meta: re-enter it in PSS Settings before reconnecting</dd></>}
      </dl>
    </section>
  );
}

function Overview({ go }) {
  const { data, error, loading, reload } = useData('overview');
  return (
    <div className="ms-stack">
      <Agent onDone={reload} />
      <Notice error={error} message={loading && !data ? 'Loading…' : ''} />
      {data && (
        <>
          <Alerts alerts={data.alerts} />
          <MetaHealth pss={data.pss} />
          <div className="ms-kpis">
            {[['Draft campaigns', data.counts.draftCampaigns, 'campaigns'], ['Awaiting approval', data.counts.awaitingApproval, 'commercials'], ['Scheduled posts', data.counts.scheduledPosts, 'calendar'], ['Publishing failures', data.counts.publishingFailures, 'calendar'], ['Manual handoffs ready', data.counts.manualHandoffs, 'calendar'], ['Active paid campaigns', data.counts.activePaidCampaigns, 'paid']].map(([name, value, section]) => (
              <button type="button" key={name} className="ms-kpi" onClick={() => go(section)}><span>{name}</span><strong>{value}</strong></button>
            ))}
            <div className="ms-kpi"><span>Approved ad budget left (month)</span><strong>${data.budget.remainingUsd.toFixed(2)}</strong><em>{data.budget.monthlyCapUsd ? `of $${data.budget.monthlyCapUsd}` : 'cap is $0'}{data.budget.emergencyPause ? ' · PAUSED' : ''}</em></div>
            <div className="ms-kpi"><span>Attributed meaningful sessions (30 days, observed)</span><strong>{data.measured.meaningfulSessions}</strong><em>{data.measured.visits} tracked visits</em></div>
          </div>
          <div className="ms-grid2">
            <section className="ms-card"><h3>Upcoming creator broadcasts (PROtv LIVE)</h3>
              {data.upcomingLive.length ? <ul className="ms-list">{data.upcomingLive.map((item) => <li key={item.entryId}><strong>{item.title}</strong><span>{item.startLabel}</span></li>)}</ul> : <p className="ms-muted">No creator titles in the next 48 hours.</p>}
            </section>
            <section className="ms-card"><h3>Upcoming premieres</h3>
              {data.upcomingPremieres.length ? <ul className="ms-list">{data.upcomingPremieres.map((item) => <li key={item.entryId}><strong>{item.title}</strong><span>{item.startLabel}{item.released ? '' : ' · not yet released'}</span></li>)}</ul> : <p className="ms-muted">No premieres in the next 14 days.</p>}
            </section>
            <section className="ms-card"><h3>Recent commercials</h3>
              {data.recentCommercials.length ? <ul className="ms-list">{data.recentCommercials.map((item) => <li key={item.id}><button type="button" className="ms-link" onClick={() => go('commercials', item.id)}>{item.title}</button><Status value={item.status} /></li>)}</ul> : <p className="ms-muted">None yet.</p>}
            </section>
            <section className="ms-card"><h3>Suggested next actions</h3>
              <ul className="ms-bullets">{data.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
              {data.topCampaigns.length > 0 && <><h4>Top promotions (observed)</h4><ul className="ms-list">{data.topCampaigns.map((row) => <li key={row.campaignId}><strong>{row.name}</strong><span>{row.observed.meaningfulSessions} sessions · {row.observed.visits} visits</span></li>)}</ul></>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- AI Commercial Studio
function NewCommercial({ onCreated, sponsorMode = false }) {
  const footage = useData('footage?destination=social');
  const [form, setForm] = useState({ templateId: '', title: '', category: sponsorMode ? 'sponsor' : 'network', durationSeconds: 30, tone: sponsorMode ? 'corporate' : 'cinematic', videoId: '', audience: '', objective: '', mentionLive: true, destinations: ['live', 'social'], sponsor: { name: '', website: '', offer: '', tagline: '', cta: 'Visit', materialsConfirmed: false } });
  const action = useAction();
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const submit = async (event) => {
    event.preventDefault();
    if (form.category === 'custom' && !form.templateId) { action.run('create', async () => { throw new Error('Choose a template.'); }); return; }
    const created = await action.run('create', () => call('commercials', { method: 'POST', body: form }));
    if (created) onCreated(created.id);
  };
  return (
    <form className="ms-card ms-form" onSubmit={submit}>
      <h3>{sponsorMode ? 'New sponsor commercial' : 'New commercial'}</h3>
      {!sponsorMode && <label>Category<select value={form.category} onChange={(event) => set({ category: event.target.value, durationSeconds: event.target.value === 'network' ? 30 : form.durationSeconds })}><option value="network">PROtv network commercial</option><option value="title">Movie or series commercial</option><option value="custom">Holiday, seasonal or custom (from a template)</option></select></label>}
      {form.category === 'custom' && <label>Commercial name<input value={form.title} onChange={(event) => set({ title: event.target.value })} placeholder="e.g. Happy Thanksgiving from PROtv" /></label>}
      <label>Duration<select value={form.durationSeconds} onChange={(event) => set({ durationSeconds: Number(event.target.value) })} disabled={form.category === 'network'}>{[15, 30, 60].map((value) => <option key={value} value={value}>{value} seconds</option>)}</select></label>
      {form.category === 'custom' ? <TemplateChoice value={form.templateId} durationSeconds={form.durationSeconds} onChange={(templateId) => set({ templateId })} />
        : <label>Creative style<select value={form.tone} onChange={(event) => set({ tone: event.target.value })}>{TONES.map((tone) => <option key={tone} value={tone}>{label(tone)}</option>)}</select></label>}
      {form.category === 'title' && (
        <label>Title (cleared for marketing)<select value={form.videoId} onChange={(event) => set({ videoId: event.target.value })} required>
          <option value="">Choose…</option>
          {(footage.data || []).map((item) => <option key={item.id} value={item.id}>{item.title}{item.conditions.includes('target-us-only') ? ' (U.S. audiences only)' : ''}</option>)}
        </select></label>
      )}
      {form.category === 'title' && <label className="ms-check"><input type="checkbox" checked={form.mentionLive} onChange={(event) => set({ mentionLive: event.target.checked })} /> Mention its next PROtv LIVE airing (from the master schedule)</label>}
      {form.category === 'sponsor' && (
        <fieldset><legend>Sponsor materials (only what the sponsor supplied and approved)</legend>
          {['name', 'website', 'offer', 'tagline', 'cta'].map((key) => <label key={key}>{label(key === 'cta' ? 'call to action' : key)}<input value={form.sponsor[key]} onChange={(event) => set({ sponsor: { ...form.sponsor, [key]: event.target.value } })} required={key === 'name'} /></label>)}
          <label className="ms-check"><input type="checkbox" checked={form.sponsor.materialsConfirmed} onChange={(event) => set({ sponsor: { ...form.sponsor, materialsConfirmed: event.target.checked } })} /> The sponsor supplied and approved every material and claim above. No testimonials, endorsements or results are invented.</label>
        </fieldset>
      )}
      <label>Target audience<input value={form.audience} onChange={(event) => set({ audience: event.target.value })} placeholder="U.S. adults who love independent film" /></label>
      <label>Objective<input value={form.objective} onChange={(event) => set({ objective: event.target.value })} placeholder="Genuine viewers and repeat viewing" /></label>
      <fieldset className="ms-inline"><legend>Destinations</legend>{['live', 'social', 'paid', 'website'].map((value) => <label key={value} className="ms-check"><input type="checkbox" checked={form.destinations.includes(value)} onChange={(event) => set({ destinations: event.target.checked ? [...form.destinations, value] : form.destinations.filter((item) => item !== value) })} />{value === 'live' ? 'PROtv LIVE' : label(value)}</label>)}</fieldset>
      <p className="ms-muted">Footage is chosen from titles whose agreements allow marketing; each creator excerpt is identified on screen and taken before the ending. Music is an original bed made by the render worker. Narration: no voice provider is connected.</p>
      <Notice error={action.error} />
      <button type="submit" className="ms-primary" disabled={action.busy === 'create'}>{action.busy === 'create' ? 'Planning…' : 'Plan the commercial'}</button>
    </form>
  );
}

// Downloads a library video: the original render when the worker holds it, otherwise Mux's master copy (prepared on
// request, usually within a minute). The file is saved under a readable name when the browser allows it.
function DownloadButton({ assetId, label: text = 'Download MP4' }) {
  const [state, setState] = useState({ busy: false, note: '', error: '' });
  const start = async () => {
    setState({ busy: true, note: 'Preparing the download…', error: '' });
    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const result = await call(`assets/${encodeURIComponent(assetId)}/download`, { method: 'POST' });
        if (result.status === 'ready') {
          try {
            const response = await fetch(result.url);
            if (!response.ok) throw new Error('direct');
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = result.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
            setState({ busy: false, note: `Downloaded ${result.name}. ${result.source}.`, error: '' });
          } catch {
            window.open(result.url, '_blank', 'noopener');
            setState({ busy: false, note: `Opened in a new tab: if it plays instead of saving, use the player's ⋮ menu → Download. ${result.source}.`, error: '' });
          }
          return;
        }
        setState({ busy: true, note: result.source || 'Preparing the download…', error: '' });
        await new Promise((resolve) => { setTimeout(resolve, 4000); });
      }
      setState({ busy: false, note: '', error: 'The download is taking longer than usual. Try again in a few minutes.' });
    } catch (failure) {
      setState({ busy: false, note: '', error: failure.message });
    }
  };
  return (
    <div className="ms-download">
      <button type="button" className="ms-secondary" onClick={start} disabled={state.busy}>{state.busy ? 'Preparing…' : text}</button>
      {state.note && <span className="ms-muted">{state.note}</span>}
      {state.error && <span className="ms-bad">{state.error}</span>}
    </div>
  );
}

function RenderCard({ format, render }) {
  if (!render) return null;
  const ready = render.asset?.playbackId && render.asset.status === 'ready';
  return (
    <div className="ms-render">
      <div className="ms-row ms-between"><strong>{format === 'widescreen' ? '16:9' : format === 'vertical' ? '9:16' : '1:1'} · {render.destination === 'live' ? 'LIVE master (−24 LUFS)' : 'Social (−14 LUFS)'}</strong><Status value={ready ? 'ready' : render.status} /></div>
      {!ready && render.status !== 'failed' && <div className="ms-progress"><span style={{ width: `${render.progress || 2}%` }} /><em>{render.stage || 'queued'}</em></div>}
      {render.error && <p className="ms-notice ms-notice--error">{render.error}</p>}
      {ready && render.assetRecordId && <DownloadButton assetId={render.assetRecordId} label={`Download ${format === 'widescreen' ? '16:9' : format === 'vertical' ? '9:16' : '1:1'} MP4`} />}
      {ready && <MuxPlayer playbackId={render.asset.playbackId} streamType="on-demand" metadata={{ video_title: `Marketing preview ${format}` }} style={{ width: '100%', aspectRatio: format === 'vertical' ? '9 / 16' : format === 'square' ? '1 / 1' : '16 / 9', maxHeight: format === 'vertical' ? 560 : undefined }} />}
      {render.validation && (
        <dl className="ms-specs">
          <dt>Frame</dt><dd>{render.validation.width}×{render.validation.height} · {render.validation.frameRate} fps · {render.validation.frames} frames</dd>
          <dt>Codec</dt><dd>{render.validation.videoCodec} {render.validation.profile} · {render.validation.audioCodec} {render.validation.sampleRate / 1000} kHz {render.validation.channels}ch</dd>
          <dt>Duration</dt><dd>{render.validation.durationSeconds} s</dd>
          <dt>Loudness</dt><dd>{render.validation.integratedLufs} LUFS · peak {render.validation.truePeakDb} dBFS</dd>
          <dt>Checks</dt><dd>{render.validation.ok ? 'All passed' : render.validation.problems.join(' ')}</dd>
        </dl>
      )}
    </div>
  );
}

function CommercialDetail({ id, onBack, onOpen }) {
  const { data: commercial, error, reload } = useData(`commercials/${id}`);
  const footage = useData('footage?destination=social&network=1');
  const [draft, setStoryboard] = useState(null);
  const action = useAction();
  const [note, setNote] = useState('');
  const [designDirty, setDesignDirty] = useState(false);
  const videos = useMemo(() => new Map((footage.data || []).map((item) => [item.id, item])), [footage.data]);
  const rendering = commercial && Object.values(commercial.renders || {}).some((render) => !(render.status === 'ready' && render.asset?.status === 'ready') && !['failed', 'cancelled'].includes(render.status));
  useEffect(() => {
    if (!rendering) return undefined;
    const timer = setInterval(() => { call(`commercials/${id}/refresh`, { method: 'POST' }).then(reload).catch(() => {}); }, 8000);
    return () => clearInterval(timer);
  }, [rendering, id, reload]);
  if (error) return <Notice error={error} />;
  if (!commercial) return <p className="ms-muted">Loading…</p>;
  const storyboard = draft || commercial.storyboard;
  const starts = storyboard.reduce((list, beat) => [...list, list[list.length - 1] + beat.durationSeconds], [0]);
  const styled = Boolean(commercial.theme);
  const changed = (Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(commercial.storyboard)) || designDirty;
  const editBeat = (index, patch) => setStoryboard(storyboard.map((beat, i) => (i === index ? { ...beat, ...patch } : beat)));
  return (
    <div className="ms-stack">
      <button type="button" className="ms-link" onClick={onBack}>← All commercials</button>
      <section className="ms-card">
        <div className="ms-row ms-between"><h3>{commercial.title}</h3><div className="ms-row"><Status value={commercial.status} /><button type="button" className="ms-secondary" disabled={Boolean(action.busy)} onClick={() => action.run('duplicate', () => call(`commercials/${id}/duplicate`, { method: 'POST' }).then((copy) => onOpen?.(copy.id)), 'Duplicated.')}>Duplicate</button></div></div>
        <p className="ms-muted">{label(commercial.category)} · {commercial.durationSeconds} s · {label(commercial.tone)} · revision {commercial.revision}</p>
        <div className="ms-grid2">
          <div><h4>Brief</h4><dl className="ms-specs"><dt>Objective</dt><dd>{commercial.brief.objective}</dd><dt>Audience</dt><dd>{commercial.brief.audience}</dd><dt>Message</dt><dd>{commercial.brief.message}</dd><dt>Footage</dt><dd>{commercial.brief.footage.join(', ') || 'Graphics only'}</dd><dt>Music</dt><dd>{commercial.music.source}</dd><dt>Voiceover</dt><dd>{commercial.voiceover.note}</dd></dl></div>
          <div><h4>Rights check</h4>{commercial.rightsCheck.length ? <ul className="ms-bullets ms-bad">{commercial.rightsCheck.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="ms-good">Clear: every excerpt is from a cleared title, identified where required, before the ending, within 90 s per title.</p>}
            {commercial.liveCreativeId && <p className="ms-good">In PROtv LIVE spots as a draft ({commercial.liveCreativeId}). Approve it under PROtv LIVE → Commercials to air it.</p>}
          </div>
        </div>
      </section>
      <section className="ms-card"><h4>Script</h4>
        <table className="ms-table"><thead><tr><th>Time</th><th>Purpose</th><th>Picture</th><th>On screen</th></tr></thead>
          <tbody>{commercial.script.map((line) => <tr key={line.start}><td>{line.start.toFixed(1)}–{line.end.toFixed(1)} s</td><td>{line.purpose}</td><td>{line.picture}</td><td>{line.onScreen}</td></tr>)}</tbody></table>
        <a className="ms-link" href="#captions" onClick={async (event) => { event.preventDefault(); const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/admin/marketing/commercials/${id}/captions.srt`, { headers: { Authorization: `Bearer ${await (await import('../firebase')).firebaseAuth.currentUser.getIdToken()}` } }); const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${id}.srt`; link.click(); }}>Download captions (.srt)</a>
      </section>
      {styled ? <StyledEditor key={commercial.revision} commercial={commercial} footage={footage.data || []} onSaved={() => { setDesignDirty(false); reload(); }} onDirty={setDesignDirty} /> : <section className="ms-card"><h4>Storyboard and shot list</h4>
        <div className="ms-beats">{storyboard.map((beat, index) => {
          const start = starts[index];
          const end = starts[index + 1];
          const source = videos.get(beat.videoId);
          return (
            <div key={index} className="ms-beat">
              {beat.kind === 'footage' && source ? <img src={thumb(source.muxPlaybackId, beat.startSeconds + beat.durationSeconds / 2)} alt="" /> : <div className="ms-beat-card">{beat.kind === 'logo' ? 'PROtv logo' : beat.kind === 'cta' ? 'Call to action' : 'Card'}</div>}
              <span className="ms-beat-time">{start.toFixed(1)}–{end.toFixed(1)} s · {beat.purpose}</span>
              <span>{beat.text?.headline || beat.text?.word || beat.label || beat.text?.sub || ''}</span>
              {beat.kind === 'footage' && (
                <div className="ms-beat-edit">
                  <select value={beat.videoId} onChange={(event) => editBeat(index, { videoId: event.target.value, sourceTitle: videos.get(event.target.value)?.title, label: beat.label ? videos.get(event.target.value)?.title : beat.label })}>
                    {(footage.data || []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                  <label>In (s)<input type="number" min="0" max={source?.excerptUntil || 99999} value={beat.startSeconds} onChange={(event) => editBeat(index, { startSeconds: Number(event.target.value) })} /></label>
                  <label>9:16 focus<input type="range" min="0" max="1" step="0.05" value={beat.focusX ?? 0.5} onChange={(event) => editBeat(index, { focusX: Number(event.target.value) })} /></label>
                </div>
              )}
            </div>
          );
        })}</div>
        {changed && <div className="ms-row"><button type="button" className="ms-primary" onClick={() => action.run('save', () => call(`commercials/${id}/storyboard`, { method: 'PUT', body: { storyboard } }).then(() => { setStoryboard(null); reload(); }), 'Saved as a new revision; render again to see it.')}>Save storyboard</button><button type="button" className="ms-secondary" onClick={() => setStoryboard(null)}>Discard</button></div>}
      </section>}
      <section className="ms-card"><h4>Render, review and deliver</h4>
        {changed && <p className="ms-muted">Save or discard your changes before rendering.</p>}
        <div className="ms-row ms-wrap">
          <button type="button" className="ms-primary" disabled={Boolean(action.busy) || changed || commercial.rightsCheck.length > 0} onClick={() => action.run('render', () => call(`commercials/${id}/render`, { method: 'POST', body: { formats: ['widescreen', 'vertical'] } }).then(reload), 'Sent to the render worker. Previews appear here when they are processed.')}>Render 16:9 + 9:16</button>
          <button type="button" className="ms-secondary" disabled={Boolean(action.busy) || changed} onClick={() => action.run('square', () => call(`commercials/${id}/render`, { method: 'POST', body: { formats: ['square'] } }).then(reload))}>Render 1:1</button>
          <button type="button" className="ms-secondary" onClick={() => action.run('refresh', () => call(`commercials/${id}/refresh`, { method: 'POST' }).then(reload))}>Refresh status</button>
        </div>
        <div className="ms-renders">{['widescreen', 'vertical', 'square'].map((format) => <RenderCard key={format} format={format} render={commercial.renders?.[format]} />)}</div>
        {commercial.category === 'sponsor' && (
          <div className="ms-card ms-sub"><h4>Sponsor approval</h4><p>Status: <Status value={commercial.sponsor?.approvalStatus} /> {commercial.sponsor?.approvalBy ? `· ${commercial.sponsor.approvalBy}` : ''}</p>
            <p className="ms-muted">Send the preview to the sponsor yourself; record their written answer here. Nothing is sent from the Studio.</p>
            <div className="ms-row"><button type="button" className="ms-secondary" onClick={() => { const by = window.prompt('Who approved it, and how (e.g. "Jane Doe, email 12/1")?'); if (by) action.run('sponsor', () => call(`commercials/${id}/sponsor-approval`, { method: 'POST', body: { approved: true, by } }).then(reload)); }}>Record sponsor approval</button></div>
          </div>
        )}
        <label>Review note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you checked, or what to change" /></label>
        <div className="ms-row ms-wrap">
          <button type="button" className="ms-primary" disabled={Boolean(action.busy)} onClick={() => action.run('approve', () => call(`commercials/${id}/review`, { method: 'POST', body: { decision: 'approve', note } }).then(reload), 'Approved. It is not on air or published until you schedule it.')}>Approve</button>
          <button type="button" className="ms-danger" disabled={Boolean(action.busy)} onClick={() => action.run('reject', () => call(`commercials/${id}/review`, { method: 'POST', body: { decision: 'reject', note } }).then(reload))}>Reject</button>
          <button type="button" className="ms-secondary" disabled={commercial.status !== 'approved' || Boolean(commercial.liveCreativeId)} onClick={() => action.run('live', () => call(`commercials/${id}/live`, { method: 'POST', body: {} }).then(reload), 'Added to PROtv LIVE spots as a draft. Approve it there to let breaks use it; the program timeline is unchanged.')}>Add to PROtv LIVE spots (draft)</button>
        </div>
        <Notice error={action.error} message={action.message} />
      </section>
    </div>
  );
}

function Commercials({ initial, sponsorMode = false }) {
  const [selected, setSelected] = useState(initial || null);
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useData('commercials');
  if (selected) return <CommercialDetail key={selected} id={selected} onBack={() => { setSelected(null); reload(); }} onOpen={setSelected} />;
  const list = (data || []).filter((item) => (sponsorMode ? item.category === 'sponsor' : true));
  return (
    <div className="ms-stack">
      {sponsorMode && <p className="ms-muted">Sponsors and deals are managed in the existing sponsorship pipeline (<a href="https://creators.watchprotv.com/#sponsorships" target="_blank" rel="noreferrer">Creator Portal → Sponsorships</a>). Build their commercials here from the materials they approved.</p>}
      <div className="ms-row"><button type="button" className="ms-primary" onClick={() => setCreating(!creating)}>{creating ? 'Close' : sponsorMode ? 'New sponsor commercial' : 'New commercial'}</button></div>
      {creating && <NewCommercial sponsorMode={sponsorMode} onCreated={(id) => { setCreating(false); setSelected(id); }} />}
      <Notice error={error} />
      <table className="ms-table"><thead><tr><th>Commercial</th><th>Category</th><th>Length</th><th>Status</th><th>Renders</th><th>Updated</th></tr></thead>
        <tbody>{list.map((item) => <tr key={item.id}><td><button type="button" className="ms-link" onClick={() => setSelected(item.id)}>{item.title}</button></td><td>{item.category === 'custom' ? `Template${item.templateName ? `: ${item.templateName}` : ''}` : label(item.category)}</td><td>{item.durationSeconds} s</td><td><Status value={item.status} /></td><td>{Object.entries(item.renders || {}).map(([format, render]) => `${format}: ${render.status}`).join(' · ') || '—'}</td><td>{et(item.updatedAt)}</td></tr>)}</tbody></table>
      {!list.length && <p className="ms-muted">No commercials yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Campaigns, calendar, accounts
function Campaigns() {
  const { data, error, reload } = useData('campaigns');
  const [form, setForm] = useState({ name: '', type: 'network-awareness', platforms: ['facebook', 'instagram'], audience: '', startDate: '', endDate: '', landingPage: 'https://watchprotv.com/' });
  const [creating, setCreating] = useState(false);
  const action = useAction();
  const verbs = { draft: ['approve-all', 'archive'], 'in-review': ['approve-all', 'archive'], approved: ['approve-all', 'pause', 'archive'], active: ['approve-all', 'pause'], paused: ['resume', 'archive'], archived: ['reopen'] };
  const run = (campaign, verb) => action.run(campaign.id + verb, () => call(verb === 'approve-all' ? `campaigns/${campaign.id}/approve-all` : `campaigns/${campaign.id}/${verb}`, { method: 'POST', body: {} }).then((result) => { reload(); return result; }),
    (result) => (verb === 'approve-all' ? `Approved "${campaign.name}" and ${(result?.results || []).filter((item) => !item.error).length} post(s).${(result?.results || []).some((item) => item.error) ? ` Not approved: ${(result.results || []).filter((item) => item.error).map((item) => `${item.platform} (${item.error})`).join('; ')}` : ''}` : 'Done.'));
  return (
    <div className="ms-stack">
      <div className="ms-row"><button type="button" className="ms-secondary" onClick={() => setCreating(!creating)}>{creating ? 'Close' : 'New campaign'}</button></div>
      {creating && (
        <form className="ms-card ms-form" onSubmit={(event) => { event.preventDefault(); action.run('create', () => call('campaigns', { method: 'POST', body: form }).then(reload), 'Campaign drafted. Add posts in the Social Calendar.'); }}>
          <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{CAMPAIGN_TYPES.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
          <label>Landing page<input value={form.landingPage} onChange={(event) => setForm({ ...form, landingPage: event.target.value })} /></label>
          <fieldset className="ms-inline"><legend>Platforms</legend>{PLATFORMS.map((platform) => <label key={platform} className="ms-check"><input type="checkbox" checked={form.platforms.includes(platform)} onChange={(event) => setForm({ ...form, platforms: event.target.checked ? [...form.platforms, platform] : form.platforms.filter((item) => item !== platform) })} />{label(platform)}</label>)}</fieldset>
          <button type="submit" className="ms-primary">Create draft</button>
        </form>
      )}
      <Notice error={error || action.error} message={action.message} />
      {(data || []).filter((campaign) => campaign.status !== 'archived').map((campaign) => (
        <section key={campaign.id} className="ms-card">
          <div className="ms-row ms-between"><h4>{campaign.name}</h4><Status value={campaign.status} /></div>
          <p className="ms-muted">{label(campaign.type)} · {campaign.platforms.join(', ') || 'no platforms'}{campaign.notes ? ` · ${campaign.notes}` : ''}</p>
          <div className="ms-row ms-wrap">{(verbs[campaign.status] || []).map((verb) => <button key={verb} type="button" className={verb === 'approve-all' ? 'ms-primary' : 'ms-secondary'} onClick={() => run(campaign, verb)}>{verb === 'approve-all' ? 'Approve campaign + all posts' : label(verb)}</button>)}
            <button type="button" className="ms-link" onClick={() => action.run('dup', () => call(`campaigns/${campaign.id}/duplicate`, { method: 'POST' }).then(reload))}>Duplicate</button></div>
        </section>
      ))}
    </div>
  );
}

function PostRow({ post, asset, campaign, onDone }) {
  const action = useAction();
  const meta = ['facebook', 'instagram'].includes(post.platform);
  const go = (path, body, done) => action.run(post.id, () => call(path, { method: 'POST', body: body || {} }).then(onDone), done);
  const reschedule = () => {
    const value = window.prompt('New time, Eastern Time (YYYY-MM-DDTHH:mm):', etInput(post.scheduledAt) || '');
    if (value) go(`posts/${post.id}/reschedule`, { scheduledAtLocal: value.trim() }, 'Rescheduled; the approval is kept.');
  };
  const edit = () => {
    const caption = window.prompt('Caption (editing needs a new approval):', post.caption);
    if (caption !== null && caption !== post.caption) action.run(post.id, () => call(`posts/${post.id}`, { method: 'PATCH', body: { caption } }).then(onDone), 'Saved as a draft; approve it again.');
  };
  const formatOk = !asset || !meta || (post.platform === 'instagram' ? asset.format === 'vertical' : asset.format === 'widescreen');
  return (
    <div className="ms-post-card">
      <div className="ms-post-media">
        {asset?.playbackId ? <img src={`https://image.mux.com/${asset.playbackId}/thumbnail.jpg?time=8&width=${asset.format === 'vertical' ? 180 : 320}`} alt="" className={asset.format === 'vertical' ? 'is-vertical' : ''} /> : <div className="ms-beat-card">{meta ? 'No video' : 'Text'}</div>}
        {asset && <span className={formatOk ? 'ms-good' : 'ms-bad'}>{asset.format === 'vertical' ? '9:16' : asset.format === 'widescreen' ? '16:9' : asset.format}{formatOk ? '' : ' · wrong shape'}</span>}
      </div>
      <div className="ms-post-body">
        <div className="ms-row ms-between"><strong>{label(post.platform)}{campaign ? ` · ${campaign.name}` : ''}</strong><Status value={post.status} /></div>
        <p className="ms-muted">{post.scheduledAt ? `Scheduled ${et(post.scheduledAt)}` : 'Not scheduled'}{post.latestPublishAt ? ` · deadline ${et(post.latestPublishAt)}` : ''}{post.purpose ? ` · ${post.purpose}` : ''}</p>
        <p className="ms-caption">{post.caption}</p>
        {post.error && <p className="ms-bad">{post.error}</p>}
        {post.receipt && <p className="ms-good">{post.receipt.test ? 'Test passed' : 'Published'} {et(post.receipt.at)}{post.receipt.platformPostId ? ` · ID ${post.receipt.platformPostId}` : ''} {post.receipt.url && <a href={post.receipt.url} target="_blank" rel="noreferrer">View post</a>}{post.receipt.note ? ` · ${post.receipt.note}` : ''}</p>}
        {post.metrics && <p className="ms-muted">Meta (reported {et(post.metrics.fetchedAt)}): {Object.entries(post.metrics.values).map(([key, value]) => `${value} ${key}`).join(' · ') || 'no counts yet'}{Object.keys(post.metrics.unavailable || {}).length ? ` · not available: ${Object.keys(post.metrics.unavailable).join(', ')}` : ''}</p>}
        <div className="ms-actions">
          {post.status === 'draft' && <button type="button" className="ms-primary" onClick={() => go(`posts/${post.id}/approve`, {}, post.scheduledAt ? 'Approved and scheduled.' : 'Approved.')}>Approve{post.scheduledAt ? ' & schedule' : ''}</button>}
          {meta && ['approved', 'scheduled', 'test-passed', 'failed'].includes(post.status) && <button type="button" className="ms-secondary" onClick={() => go(`posts/${post.id}/test`, {}, 'Queued a non-public test for PROtv Social Studio.')}>Test (not public)</button>}
          {['approved', 'test-passed'].includes(post.status) && <button type="button" className="ms-primary" onClick={() => { if (window.confirm(`Publish this post publicly to ${post.platform} now?`)) go(`posts/${post.id}/publish`); }}>Publish now</button>}
          {['draft', 'approved', 'scheduled', 'missed', 'failed', 'test-passed'].includes(post.status) && <button type="button" className="ms-secondary" onClick={reschedule}>{post.scheduledAt ? 'Reschedule' : 'Schedule'}</button>}
          {['draft', 'approved', 'scheduled', 'missed', 'failed', 'test-passed'].includes(post.status) && <button type="button" className="ms-link" onClick={edit}>Edit caption</button>}
          {post.status === 'needs-check' && <>
            <button type="button" className="ms-secondary" onClick={() => { const url = window.prompt('It was published. Paste the post address:'); if (url) go(`posts/${post.id}/manual`, { url }); }}>It was published</button>
            <button type="button" className="ms-secondary" onClick={() => go(`posts/${post.id}/manual`, { url: 'not-published' }, 'Marked as not published; reschedule it if needed.')}>It was not published</button>
          </>}
          {post.status === 'ready-for-manual' && <button type="button" className="ms-secondary" onClick={() => { navigator.clipboard?.writeText(post.caption); const url = window.prompt('Caption copied. After posting, paste the post address:'); if (url) go(`posts/${post.id}/manual`, { url }); }}>Post manually</button>}
          {!post.receipt && !['cancelled', 'published', 'queued-pss', 'publishing-pss'].includes(post.status) && <button type="button" className="ms-link" onClick={() => go(`posts/${post.id}/cancel`)}>Cancel</button>}
        </div>
        <Notice error={action.error} message={action.message} />
      </div>
    </div>
  );
}

function Calendar() {
  const posts = useData('posts');
  const assets = useData('assets');
  const campaigns = useData('campaigns');
  const [view, setView] = useState('week');
  const [platform, setPlatform] = useState('all');
  const [show, setShow] = useState('upcoming');
  const [today] = useState(() => Date.now());
  const [form, setForm] = useState({ platform: 'facebook', campaignId: '', assetId: '', line: '', scheduledAtLocal: '', latestPublishAtLocal: '' });
  const action = useAction();
  const assetMap = useMemo(() => new Map((assets.data?.items || []).map((asset) => [asset.id, asset])), [assets.data]);
  const campaignMap = useMemo(() => new Map((campaigns.data || []).map((campaign) => [campaign.id, campaign])), [campaigns.data]);
  const visible = (posts.data || []).filter((post) => (platform === 'all' || post.platform === platform)
    && (show === 'all' || (show === 'attention' ? ['failed', 'needs-check', 'missed'].includes(post.status) : !['cancelled', 'published'].includes(post.status))))
    .sort((a, b) => String(a.scheduledAt || 'z').localeCompare(String(b.scheduledAt || 'z')));
  const days = view === 'day' ? 1 : view === 'week' ? 7 : 31;
  const buckets = Array.from({ length: days }, (_, index) => new Date(today + index * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  const reload = () => posts.reload();
  const fit = () => { const asset = assetMap.get(form.assetId); return !asset || (form.platform === 'instagram' ? asset.format === 'vertical' : form.platform === 'facebook' ? asset.format === 'widescreen' : true); };
  return (
    <div className="ms-stack">
      <p className="ms-muted">All times are Eastern Time. Approved, scheduled Facebook and Instagram posts publish automatically through PROtv Social Studio; a post that cannot go out before its deadline is marked Missed instead of publishing late.</p>
      <div className="ms-row ms-wrap">
        {['day', 'week', 'month'].map((value) => <button key={value} type="button" className={view === value ? 'ms-primary' : 'ms-secondary'} onClick={() => setView(value)}>{label(value)}</button>)}
        <select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Platform filter"><option value="all">All platforms</option>{PLATFORMS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
        <select value={show} onChange={(event) => setShow(event.target.value)} aria-label="Which posts"><option value="upcoming">Upcoming and in progress</option><option value="attention">Needs attention</option><option value="all">All, including published</option></select>
        <button type="button" className="ms-secondary" onClick={() => action.run('plan', () => call('plan/seven-days', { method: 'POST', body: {} }).then(reload), (result) => `Drafted ${result?.posts?.length || 0} posts from the LIVE schedule. Nothing is scheduled until approved.`)}>Draft the 7-day plan</button>
      </div>
      <Notice error={posts.error || action.error} message={action.message} />
      <div className={`ms-calendar ms-calendar--${view}`}>{buckets.map((day) => (
        <div key={day} className="ms-day"><h5>{new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h5>
          {(posts.data || []).filter((post) => post.scheduledAt && (platform === 'all' || post.platform === platform) && post.status !== 'cancelled' && new Date(post.scheduledAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === day).map((post) => <div key={post.id} className={`ms-post ms-post--${post.status}`}>{label(post.platform)} · {new Date(post.scheduledAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}<Status value={post.status} /></div>)}
        </div>))}</div>
      <details className="ms-card"><summary><strong>New post</strong></summary>
        <form className="ms-form" onSubmit={(event) => { event.preventDefault(); action.run('post', () => call('posts', { method: 'POST', body: { ...form, scheduledAtLocal: form.scheduledAtLocal || undefined, latestPublishAtLocal: form.latestPublishAtLocal || undefined } }).then(reload), 'Draft post created. Approve it to schedule.'); }}>
          <label>Platform<select value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}>{PLATFORMS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
          <label>Campaign<select value={form.campaignId} onChange={(event) => setForm({ ...form, campaignId: event.target.value })}><option value="">None</option>{(campaigns.data || []).filter((campaign) => campaign.status !== 'archived').map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          <label>Video ({form.platform === 'instagram' ? 'vertical 9:16 for Reels' : form.platform === 'facebook' ? 'horizontal 16:9' : 'optional'})<select value={form.assetId} onChange={(event) => setForm({ ...form, assetId: event.target.value })}><option value="">None</option>{(assets.data?.items || []).filter((asset) => asset.status === 'approved').map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>
          {!fit() && <p className="ms-bad">That video is the wrong shape for {form.platform}.</p>}
          <label>Opening line (a caption with the tracked link and hashtags is generated; edit it after)<input value={form.line} onChange={(event) => setForm({ ...form, line: event.target.value })} placeholder="Your next favorite movie is FREE." /></label>
          <div className="ms-row"><label>Publish at (Eastern Time)<input type="datetime-local" value={form.scheduledAtLocal} onChange={(event) => setForm({ ...form, scheduledAtLocal: event.target.value })} /></label>
            <label>Deadline (optional; default 6 hours later)<input type="datetime-local" value={form.latestPublishAtLocal} onChange={(event) => setForm({ ...form, latestPublishAtLocal: event.target.value })} /></label></div>
          <button type="submit" className="ms-primary">Create draft</button>
        </form>
      </details>
      <div className="ms-stack">{visible.map((post) => <PostRow key={post.id} post={post} asset={assetMap.get(post.assetId)} campaign={campaignMap.get(post.campaignId)} onDone={reload} />)}</div>
      {!visible.length && <p className="ms-muted">No posts in this view.</p>}
    </div>
  );
}

function Accounts() {
  const { data, error, reload } = useData('accounts');
  const overview = useData('overview');
  const action = useAction();
  return (
    <div className="ms-stack">
      <MetaHealth pss={overview.data?.pss} />
      <p className="ms-muted">Facebook and Instagram are connected in PROtv Social Studio on the studio PC, which keeps the credentials and publishes for Marketing Studio. YouTube and TikTok have no connection yet; their posts use the manual handoff.</p>
      <Notice error={error || action.error} message={action.message} />
      <div className="ms-grid2">{(data || []).filter((item) => item.id !== 'manual').map((item) => (
        <section key={item.id} className="ms-card">
          <div className="ms-row ms-between"><h4>{item.name}</h4><Status value={item.state} /></div>
          {item.account && <p>{item.via ? `${item.account.label} · ${item.account.online ? 'PSS online' : `PSS last seen ${et(item.account.lastSeenAt)}`}` : `Connected: ${item.account.label}`}</p>}
          {!item.via && item.missingSettings?.length > 0 && <p className="ms-muted">Not connected. Needs a developer app (not created, per your instruction).</p>}
          {!item.via && item.state === 'connected' && <button type="button" className="ms-secondary" onClick={() => action.run(item.id, () => call(`accounts/${item.id}/disconnect`, { method: 'POST' }).then(reload))}>Disconnect</button>}
        </section>))}</div>
    </div>
  );
}

function Growth() {
  const report = useData('analytics?days=30');
  return (
    <div className="ms-stack">
      <section className="ms-card"><h3>Recommendations</h3><p className="ms-muted">Built from observed PROtv viewing only: no follower counts, no purchased reach, no scraping.</p>
        <ul className="ms-bullets">{(report.data?.recommendations || []).map((item) => <li key={item}>{item}</li>)}</ul></section>
      <Agent />
    </div>
  );
}

function Paid() {
  const ads = useData('ads');
  const campaigns = useData('campaigns');
  const settings = useData('settings');
  const [form, setForm] = useState({ campaignId: '', objective: 'video-views', dailyBudgetUsd: 10, totalBudgetUsd: 50, primaryText: 'Your next favorite movie is FREE on PROtv.', headline: 'Watch free on PROtv' });
  const action = useAction();
  const cap = settings.data?.settings.ads;
  return (
    <div className="ms-stack">
      <section className="ms-card"><h3>Spending controls</h3>
        <p>Monthly cap: <strong>${cap?.monthlyCapUsd ?? 0}</strong>{cap?.emergencyPause ? ' · EMERGENCY PAUSE ON' : ''}. Change it in Settings. Campaigns are created in Meta only after approval and always paused; activating is a second approval.</p>
        <button type="button" className="ms-danger" onClick={() => { const first = (ads.data || [])[0]; if (first && window.confirm('Pause every paid campaign now and block new spending?')) action.run('pause', () => call(`ads/${first.id}/emergency-pause`, { method: 'POST' }).then(() => { ads.reload(); settings.reload(); })); }}>Emergency pause</button>
      </section>
      <form className="ms-card ms-form" onSubmit={(event) => { event.preventDefault(); action.run('ad', () => call('ads', { method: 'POST', body: form }).then(ads.reload), 'Drafted. Nothing was sent to Meta.'); }}>
        <h3>New Meta campaign draft</h3>
        <label>Campaign<select value={form.campaignId} onChange={(event) => setForm({ ...form, campaignId: event.target.value })} required><option value="">Choose…</option>{(campaigns.data || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Objective<select value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })}><option value="video-views">Video views (ThruPlay)</option><option value="traffic">Visits to watchprotv.com</option><option value="awareness">Reach</option></select></label>
        <div className="ms-row"><label>Daily budget ($)<input type="number" min="1" value={form.dailyBudgetUsd} onChange={(event) => setForm({ ...form, dailyBudgetUsd: Number(event.target.value) })} /></label><label>Total cap ($)<input type="number" min="1" value={form.totalBudgetUsd} onChange={(event) => setForm({ ...form, totalBudgetUsd: Number(event.target.value) })} /></label></div>
        <label>Primary text<input value={form.primaryText} onChange={(event) => setForm({ ...form, primaryText: event.target.value })} /></label>
        <label>Headline<input value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })} /></label>
        <button type="submit" className="ms-primary">Save draft</button>
      </form>
      <Notice error={ads.error || action.error} message={action.message} />
      <table className="ms-table"><thead><tr><th>Campaign</th><th>Budget</th><th>Estimate (not a result)</th><th>Status</th><th /></tr></thead>
        <tbody>{(ads.data || []).map((item) => <tr key={item.id}><td>{item.name}</td><td>${item.dailyBudgetUsd}/day · cap ${item.totalBudgetUsd}</td><td>{item.estimate ? `${item.estimate.impressions.low.toLocaleString()}–${item.estimate.impressions.high.toLocaleString()} impressions` : '—'}</td><td><Status value={item.status} />{item.reported && <div>Reported spend ${item.reported.spendUsd}</div>}</td>
          <td className="ms-actions">{['approve', 'prepare', 'activate', 'pause'].map((verb) => <button key={verb} type="button" className="ms-secondary" onClick={() => action.run(item.id + verb, () => call(`ads/${item.id}/${verb}`, { method: 'POST' }).then(ads.reload))}>{label(verb)}</button>)}</td></tr>)}</tbody></table>
    </div>
  );
}

function Creators() {
  const { data, error } = useData('creators');
  return (
    <div className="ms-stack"><Notice error={error} />
      <div className="ms-grid2">{(data || []).map((kit) => (
        <section key={kit.videoId} className="ms-card ms-kit">
          {kit.poster && <img src={kit.poster} alt="" />}
          <div><h4>{kit.title}</h4>
            <p className="ms-muted">Next on PROtv LIVE: {kit.nextAirings.length ? kit.nextAirings.join(' · ') : 'not scheduled this week'}</p>
            <p className="ms-muted">Promotion basis: {kit.rightsBasis}</p>
            <details><summary>Caption options</summary><ul className="ms-bullets">{kit.captions.map((caption) => <li key={caption}>{caption} <button type="button" className="ms-link" onClick={() => navigator.clipboard?.writeText(caption)}>Copy</button></li>)}</ul></details>
            <details><summary>Clip suggestions (cut in Hype Clip Studio)</summary><ul className="ms-bullets">{kit.clipSuggestions.map((clip) => <li key={clip.startSeconds}>{Math.floor(clip.startSeconds / 60)}:{String(clip.startSeconds % 60).padStart(2, '0')} · {clip.seconds} s</li>)}</ul></details>
            <p className="ms-mono">Shareable link: https://watchprotv.com/title/{kit.videoId}</p>
          </div>
        </section>))}</div>
    </div>
  );
}

function LiveAds() {
  const { data } = useData('commercials');
  const approved = (data || []).filter((item) => item.status === 'approved');
  return (
    <div className="ms-stack">
      <p className="ms-muted">Approved commercials enter the existing PROtv LIVE spot inventory as drafts. Approval and break filling happen in PROtv LIVE → Commercials, which only uses spots in commercial breaks, checks each break's exact length, and never moves a program, premiere or playback offset.</p>
      <table className="ms-table"><thead><tr><th>Commercial</th><th>16:9 LIVE master</th><th>In LIVE inventory</th></tr></thead>
        <tbody>{approved.map((item) => <tr key={item.id}><td>{item.title}</td><td>{item.renders?.widescreen?.validation ? `${item.renders.widescreen.validation.durationSeconds} s · ${item.renders.widescreen.validation.integratedLufs} LUFS` : 'not rendered'}</td><td>{item.liveCreativeId ? `Draft spot ${item.liveCreativeId}` : 'Not yet (open the commercial to add it)'}</td></tr>)}</tbody></table>
      {!approved.length && <p className="ms-muted">No approved commercials yet.</p>}
    </div>
  );
}

function Analytics() {
  const [days, setDays] = useState(30);
  const { data, error } = useData(`analytics?days=${days}`, [days]);
  const posts = useData('posts');
  const campaigns = useData('campaigns');
  const engagement = useMemo(() => {
    const rows = new Map();
    for (const post of (posts.data || []).filter((item) => item.metrics && item.status === 'published')) {
      const row = rows.get(post.campaignId) || { campaignId: post.campaignId, posts: 0, values: {}, unavailable: new Set(), fetchedAt: '' };
      row.posts += 1;
      for (const [key, value] of Object.entries(post.metrics.values)) row.values[`${post.platform} ${key}`] = (row.values[`${post.platform} ${key}`] || 0) + value;
      for (const key of Object.keys(post.metrics.unavailable || {})) row.unavailable.add(`${post.platform} ${key}`);
      if (post.metrics.fetchedAt > row.fetchedAt) row.fetchedAt = post.metrics.fetchedAt;
      rows.set(post.campaignId, row);
    }
    return [...rows.values()];
  }, [posts.data]);
  const names = new Map((campaigns.data || []).map((campaign) => [campaign.id, campaign.name]));
  return (
    <div className="ms-stack">
      <section className="ms-card"><h3>Engagement on Facebook and Instagram (reported by Meta)</h3>
        <p className="ms-muted">Counts come from Meta through PROtv Social Studio every six hours. Metrics Meta withholds without extra permissions are listed as not available, never shown as zero: views, reach, impressions and link clicks need read_insights (Facebook) or instagram_manage_insights (Instagram); Facebook reactions and comments need pages_read_user_content.</p>
        {engagement.length ? <table className="ms-table"><thead><tr><th>Campaign</th><th>Published posts</th><th>Counts</th><th>Not available</th><th>Updated</th></tr></thead>
          <tbody>{engagement.map((row) => <tr key={row.campaignId}><td>{names.get(row.campaignId) || 'No campaign'}</td><td>{row.posts}</td><td>{Object.entries(row.values).map(([key, value]) => `${value} ${key}`).join(' · ') || '—'}</td><td>{[...row.unavailable].join(', ')}</td><td>{et(row.fetchedAt)}</td></tr>)}</tbody></table>
          : <p className="ms-muted">No published Marketing Studio posts with Meta counts yet.</p>}
      </section>
      <div className="ms-row"><select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Period">{[7, 30, 90].map((value) => <option key={value} value={value}>Last {value} days</option>)}</select></div>
      <Notice error={error} message={data?.note} />
      {data && <table className="ms-table"><thead><tr><th>Campaign</th><th>Visits</th><th>Play starts</th><th>Meaningful sessions (2+ min)</th><th>Returning</th><th>Visit→play</th></tr></thead>
        <tbody>{data.campaigns.map((row) => <tr key={row.campaignId}><td>{row.name}</td><td>{row.observed.visits}</td><td>{row.observed.playStarts}</td><td>{row.observed.meaningfulSessions}</td><td>{row.observed.returningVisits}</td><td>{row.rates.visitToPlay ?? '—'}%</td></tr>)}</tbody></table>}
      {data && !data.campaigns.length && <p className="ms-muted">No tracked visits to watchprotv.com from campaign links yet (observed counts start when people click the tracked links).</p>}
    </div>
  );
}

function Assets({ hypeOnly = false }) {
  const { data, error, reload } = useData('assets');
  const action = useAction();
  return (
    <div className="ms-stack">
      <Notice error={error || action.error || data?.hypeError} message={action.message} />
      <section className="ms-card"><h3>Hype Clip Studio exports</h3>
        <p className="ms-muted">Clips cut in <a href="https://creators.watchprotv.com/#hype-clips" target="_blank" rel="noreferrer">Hype Clip Studio</a> (scene finding, captions, branding). Import one to use it in posts, ads, LIVE or sponsor pitches; each clip is imported once.</p>
        <table className="ms-table"><thead><tr><th>Clip</th><th>Format</th><th>Length</th><th>Rights</th><th /></tr></thead>
          <tbody>{(data?.hypeClips || []).map((clip) => <tr key={clip.id}><td>{clip.title}</td><td>{clip.format}</td><td>{clip.durationSeconds} s</td><td>{clip.rights?.summary || clip.rights?.basis || ''}</td><td>{clip.imported ? 'In library' : <button type="button" className="ms-secondary" onClick={() => action.run(clip.id, () => call(`assets/hype-clips/${clip.id}/import`, { method: 'POST' }).then(reload), 'Imported into the asset library.')}>Import</button>}</td></tr>)}</tbody></table>
      </section>
      {!hypeOnly && <div className="ms-grid3">{(data?.items || []).map((asset) => (
        <section key={asset.id} className="ms-card ms-asset">
          {asset.playbackId ? <MuxPlayer playbackId={asset.playbackId} streamType="on-demand" style={{ width: '100%', aspectRatio: asset.format === 'vertical' ? '9 / 16' : '16 / 9', maxHeight: 420 }} /> : <div className="ms-beat-card">Processing</div>}
          <h4>{asset.title}</h4><Status value={asset.status} />
          {asset.playbackId && <DownloadButton assetId={asset.id} />}
          <p className="ms-muted">{asset.source}{asset.durationSeconds ? ` · ${asset.durationSeconds} s` : ''}</p>
          {asset.provenance?.length > 0 && <details><summary>Footage provenance</summary><ul className="ms-bullets">{asset.provenance.map((item, index) => <li key={index}>{item.title} at {Math.round(item.startSeconds)} s ({item.seconds} s)</li>)}</ul></details>}
        </section>))}</div>}
    </div>
  );
}

function Settings() {
  const { data, error, reload } = useData('settings');
  const audit = useData('audit');
  const [adsDraft, setAds] = useState(null);
  const action = useAction();
  if (!data) return <Notice error={error} message="Loading…" />;
  const ads = adsDraft || data.settings.ads;
  return (
    <div className="ms-stack">
      <form className="ms-card ms-form" onSubmit={(event) => { event.preventDefault(); action.run('save', () => call('settings', { method: 'PUT', body: { ads } }).then(() => { setAds(null); reload(); }), 'Saved.'); }}>
        <h3>Advertising budget</h3>
        <label>Approved monthly cap ($)<input type="number" min="0" value={ads.monthlyCapUsd} onChange={(event) => setAds({ ...ads, monthlyCapUsd: Number(event.target.value) })} /></label>
        <label className="ms-check"><input type="checkbox" checked={ads.emergencyPause} onChange={(event) => setAds({ ...ads, emergencyPause: event.target.checked })} /> Emergency pause (blocks all paid activity)</label>
        <label>Meta ad account (act_…)<input value={ads.metaAdAccountId} onChange={(event) => setAds({ ...ads, metaAdAccountId: event.target.value })} /></label>
        <label>Meta Page ID<input value={ads.metaPageId} onChange={(event) => setAds({ ...ads, metaPageId: event.target.value })} /></label>
        <button type="submit" className="ms-primary">Save</button>
        <Notice error={action.error} message={action.message} />
      </form>
      <section className="ms-card"><h3>AI video generation providers (optional)</h3>
        <p className="ms-muted">Commercials are assembled from authorized footage and PROtv graphics without any paid provider. A provider can add generated connective visuals once its key is set and you approve an allowance; none is active.</p>
        <table className="ms-table"><thead><tr><th>Provider</th><th>Configured</th><th>Needs</th></tr></thead><tbody>{data.providers.map((provider) => <tr key={provider.id}><td>{provider.name}</td><td>{provider.configured ? 'Yes' : 'No'}</td><td>{provider.missing.join(', ') || '—'}</td></tr>)}</tbody></table>
      </section>
      <section className="ms-card"><h3>Audit log</h3>
        <table className="ms-table"><tbody>{(audit.data || []).slice(0, 60).map((entry) => <tr key={entry.id}><td>{et(entry.at)}</td><td>{entry.message}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}

export default function MarketingStudio() {
  const params = new URLSearchParams(window.location.search);
  const [section, setSection] = useState(params.get('section') || 'overview');
  const [focus, setFocus] = useState(null);
  const go = (next, id = null) => { setFocus(id); setSection(next); };
  return (
    <div className="ms-root">
      <header className="ms-header">
        <img src="/brand/protv-logo-480.webp" alt="PROtv" />
        <div><h2>Marketing Studio</h2><p>Create. Promote. Broadcast. Grow.</p></div>
      </header>
      <nav className="ms-nav" aria-label="Marketing Studio sections">
        {SECTIONS.map(([id, name]) => <button key={id} type="button" className={section === id ? 'is-active' : ''} onClick={() => go(id)}>{name}</button>)}
      </nav>
      <main className="ms-main">
        {section === 'overview' && <Overview go={go} />}
        {section === 'commercials' && <Commercials key={focus || 'list'} initial={focus} />}
        {section === 'templates' && <TemplatesManager onOpenCommercial={(id) => go('commercials', id)} />}
        {section === 'hype' && <Assets hypeOnly />}
        {section === 'campaigns' && <Campaigns />}
        {section === 'calendar' && <Calendar />}
        {section === 'accounts' && <Accounts />}
        {section === 'growth' && <Growth />}
        {section === 'paid' && <Paid />}
        {section === 'creators' && <Creators />}
        {section === 'sponsors' && <Commercials sponsorMode />}
        {section === 'live' && <LiveAds />}
        {section === 'analytics' && <Analytics />}
        {section === 'assets' && <Assets />}
        {section === 'settings' && <Settings />}
      </main>
    </div>
  );
}

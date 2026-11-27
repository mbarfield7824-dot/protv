import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { frameAt } from './commercialDesign';
import { PreviewElement, PreviewShot } from './CommercialDesigner';

// Commercial Maker: one natural-language prompt → a finished draft (concept, copy, visuals, music, pacing, layouts for
// every format), a preview strip before any render, plain-language revisions, and the AI cost against the monthly cap.
const call = (path, options) => api.adminMarketing(path, options);
const usd = (value, digits = 3) => `$${Number(value || 0).toFixed(digits)}`;
const FORMATS = [['widescreen', '16:9', 1920, 1080, 176], ['vertical', '9:16', 1080, 1920, 74], ['square', '1:1', 1080, 1080, 99]];

function useElapsed(running) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => { clearInterval(timer); setSeconds(0); };
  }, [running]);
  return running ? seconds : 0;
}

function Usage({ usage }) {
  if (!usage) return null;
  return <span className="ms-muted">AI this month: {usd(usage.actualUsd)} of {usd(usage.capUsd, 2)} cap · {usage.calls} request{usage.calls === 1 ? '' : 's'}</span>;
}

export function MakerPrompt({ onCreated }) {
  const [prompt, setPrompt] = useState('');
  const [durationSeconds, setDuration] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });
  const [usage, setUsage] = useState(null);
  const elapsed = useElapsed(state.busy);
  useEffect(() => { call('maker/usage').then(setUsage).catch(() => {}); }, []);
  const create = async (event) => {
    event.preventDefault();
    setState({ busy: true, error: '' });
    try {
      const draft = await call('maker', { method: 'POST', body: { prompt, ...(durationSeconds ? { durationSeconds: Number(durationSeconds) } : {}) } });
      setState({ busy: false, error: '' });
      onCreated?.(draft.id);
    } catch (error) { setState({ busy: false, error: error.message }); call('maker/usage').then(setUsage).catch(() => {}); }
  };
  return (
    <form className="ms-card cm-maker" onSubmit={create}>
      <div className="ms-row ms-between ms-wrap"><h3>Commercial Maker</h3><Usage usage={usage} /></div>
      <p className="ms-muted">Describe the commercial. The AI writes the concept and copy, chooses graphics, app screenshots, artwork or footage, picks music and pacing, and lays out 16:9, 9:16 and 1:1. You review a preview before anything renders.</p>
      <textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder='e.g. "30-second high-energy spot: PROtv is now on iPhone and iPad. 100% free, no subscriptions. Premiere week December 1. End on the App Store badge and watchprotv.com."' />
      <div className="ms-row ms-wrap">
        <label>Length <select value={durationSeconds} onChange={(event) => setDuration(event.target.value)}><option value="">Let the AI decide</option><option value="15">15 s</option><option value="30">30 s</option><option value="60">60 s</option></select></label>
        <button type="submit" className="ms-primary" disabled={state.busy || prompt.trim().length < 8}>{state.busy ? `Creating… ${elapsed} s` : 'Create commercial'}</button>
      </div>
      {state.busy && <p className="ms-muted">Writing the concept and copy, measuring footage moments, laying out every format. This usually takes under a minute.</p>}
      {state.error && <p className="ms-notice ms-notice--error" role="alert">{state.error}</p>}
    </form>
  );
}

// One still per segment and format, drawn from the exact render plan (no render needed).
function PreviewStrip({ commercial }) {
  const [plans, setPlans] = useState({});
  const [error, setError] = useState('');
  const times = useMemo(() => {
    const starts = commercial.storyboard.reduce((list, beat) => [...list, list[list.length - 1] + beat.durationSeconds], [0]);
    return commercial.storyboard.map((beat, index) => ({ purpose: beat.purpose, t: Math.min(starts[index + 1] - 0.05, starts[index] + beat.durationSeconds * 0.62) }));
  }, [commercial.storyboard]);
  useEffect(() => {
    let live = true;
    const body = { storyboard: commercial.storyboard, theme: commercial.theme, branding: commercial.branding, music: commercial.music, durationSeconds: commercial.durationSeconds, title: commercial.title };
    Promise.all(FORMATS.map(([format]) => call('preview', { method: 'POST', body: { ...body, format } }).then((data) => [format, data.plan])))
      .then((entries) => live && setPlans(Object.fromEntries(entries))).catch((failure) => live && setError(failure.message));
    return () => { live = false; };
  }, [commercial.revision, commercial.storyboard, commercial.theme, commercial.branding, commercial.music, commercial.durationSeconds, commercial.title]);
  if (error) return <p className="ms-notice ms-notice--error">{error}</p>;
  return (
    <div className="cm-strip" aria-label="Preview strip">
      {FORMATS.map(([format, name, W, H, width]) => {
        const plan = plans[format];
        const scale = width / W;
        return (
          <div key={format} className="cm-strip-row">
            <strong className="cm-strip-name">{name}</strong>
            <div className="cm-strip-frames">
              {times.map(({ t, purpose }, index) => {
                const now = plan ? frameAt(plan, t) : null;
                return (
                  <figure key={index} className="cm-frame">
                    <div className="cd-stage" style={{ width, height: (width * H) / W }}>
                      {now && <PreviewShot shot={now.shot} offset={now.offset} />}
                      {now && now.layers.map(({ layer }, layerIndex) => (
                        <div key={`${layer.start}-${layerIndex}`} className="cd-layer">{layer.elements.map((element, elementIndex) => <PreviewElement key={elementIndex} element={element} scale={scale} />)}</div>
                      ))}
                    </div>
                    {format === 'widescreen' && <figcaption>{purpose}</figcaption>}
                  </figure>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="ms-muted">Stills at each segment once its text is on screen. Use the live preview in the editor below to play it with motion.</p>
    </div>
  );
}

export function MakerPanel({ commercial, onChanged }) {
  const state = commercial.maker;
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState({ busy: false, error: '', note: '' });
  const [usage, setUsage] = useState(null);
  const elapsed = useElapsed(status.busy);
  useEffect(() => { call('maker/usage').then(setUsage).catch(() => {}); }, [commercial.revision]);
  const editedByHand = state.storyboardRevision !== undefined && commercial.revision !== state.storyboardRevision;
  const revise = async (event) => {
    event.preventDefault();
    if (editedByHand && !window.confirm('This storyboard was edited by hand. A revision rebuilds it from the AI plan and replaces those edits. Continue?')) return;
    setStatus({ busy: true, error: '', note: '' });
    try {
      await call(`commercials/${commercial.id}/maker/revise`, { method: 'POST', body: { message } });
      setMessage('');
      setStatus({ busy: false, error: '', note: 'Revised. Render again to see it in motion.' });
      onChanged?.();
    } catch (error) { setStatus({ busy: false, error: error.message, note: '' }); }
  };
  const render = async (formats) => {
    setStatus({ busy: false, error: '', note: '' });
    try { await call(`commercials/${commercial.id}/render`, { method: 'POST', body: { formats } }); setStatus({ busy: false, error: '', note: 'Sent to the render worker. Each format takes about 7 minutes; results and quality checks appear below.' }); onChanged?.(); } catch (error) { setStatus({ busy: false, error: error.message, note: '' }); }
  };
  const checks = [...(state.checks || []), ...(commercial.rightsCheck?.length ? commercial.rightsCheck.map((text) => ({ level: 'warning', text })) : [{ level: 'ok', text: 'Rights: every excerpt is cleared, identified where required, before the ending, within 90 s per title.' }])];
  return (
    <section className="ms-card cm-panel">
      <div className="ms-row ms-between ms-wrap"><h4>Made with the Commercial Maker</h4><Usage usage={usage} /></div>
      <p><strong>Concept:</strong> {state.concept || '—'}</p>
      <p className="ms-muted">Approach: {state.approach} · palette: {state.palette} · this commercial’s AI cost: {usd(state.cost?.actualUsd, 4)} actual (estimated {usd(state.cost?.estimatedUsd, 4)}) over {state.cost?.calls || 0} request{state.cost?.calls === 1 ? '' : 's'}</p>
      <ul className="cm-checks">{checks.map((check, index) => <li key={index} className={check.level === 'ok' ? 'ms-good' : 'ms-bad'}>{check.level === 'ok' ? '✓' : '!'} {check.text}</li>)}</ul>
      <PreviewStrip commercial={commercial} />
      <div className="cm-history">
        {(state.history || []).map((item, index) => (
          <div key={index} className="cm-turn">
            <p className="cm-you">{item.kind === 'draft' ? 'Prompt' : 'You'}: {item.request}</p>
            <p className="cm-ai">{item.summary} <span className="ms-muted">({usd(item.cost?.actualUsd, 4)})</span></p>
          </div>
        ))}
      </div>
      <form className="cm-revise" onSubmit={revise}>
        {editedByHand && <p className="ms-muted">You have edited this storyboard by hand since the last AI version; a revision rebuilds it from the AI plan.</p>}
        <textarea rows={2} value={message} onChange={(event) => setMessage(event.target.value)} placeholder='Revise in plain words, e.g. "punchier opening", "swap the clips in the montage", "hold the end card longer"' />
        <div className="ms-row ms-wrap">
          <button type="submit" className="ms-primary" disabled={status.busy || message.trim().length < 3}>{status.busy ? `Revising… ${elapsed} s` : 'Revise'}</button>
          <button type="button" className="ms-secondary" disabled={status.busy || commercial.rightsCheck?.length > 0} onClick={() => render(['widescreen', 'vertical'])}>Render 16:9 + 9:16</button>
          <button type="button" className="ms-secondary" disabled={status.busy || commercial.rightsCheck?.length > 0} onClick={() => render(['widescreen', 'vertical', 'square'])}>Render all formats</button>
        </div>
      </form>
      {status.error && <p className="ms-notice ms-notice--error" role="alert">{status.error}</p>}
      {status.note && <p className="ms-notice">{status.note}</p>}
    </section>
  );
}

// Quality of the finished file (from the render worker) and the label check of its plan.
export function RenderQuality({ render }) {
  const qa = render?.validation?.qa;
  const labels = render?.labels;
  if (!qa && !labels) return null;
  return (
    <div className="cm-quality">
      <strong>Quality checks on the finished file</strong>
      <ul className="cm-checks">
        {(qa?.checks || []).map((text, index) => <li key={`c${index}`} className="ms-good">✓ {text}</li>)}
        {(qa?.problems || []).map((text, index) => <li key={`p${index}`} className="ms-bad">! {text}</li>)}
        {labels && (labels.ok ? <li className="ms-good">✓ Labels: {labels.labelled ? `${labels.labelled} on-screen title(s), each naming the footage under it` : 'no on-screen titles needed'}.</li> : labels.problems.map((text, index) => <li key={`l${index}`} className="ms-bad">! {text}</li>))}
      </ul>
    </div>
  );
}

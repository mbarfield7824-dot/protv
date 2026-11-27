import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { clipFor, COLOR_PRESETS, frameAt, isHex, moveItem, newSegment, segmentSeconds, tenth, textFillStyle, totalSeconds } from './commercialDesign';

// Marketing Studio commercial designer: holiday, seasonal and custom templates; every word, timing, position, size,
// colour, animation, logo and music setting is editable; a live preview draws the exact render plan the worker gets.
const call = (path, options) => api.adminMarketing(path, options);
const label = (value) => String(value || '').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const thumb = (playbackId, time, width = 320) => `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${Math.max(0, Math.round(Number(time) * 2) / 2)}&width=${width}`;
const KIND_LABELS = { card: 'Text card', footage: 'Footage', logo: 'Logo reveal', cta: 'Call to action' };
const ANIMATION_FALLBACK = [{ id: 'fade', label: 'Quick fade' }];

function useOnce(path) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => { let live = true; call(path).then((data) => live && setState({ data, error: '' })).catch((error) => live && setState({ data: null, error: error.message })); return () => { live = false; }; }, [path]);
  return state;
}

function Field({ label: text, children, hint }) {
  return <label className="cd-field"><span>{text}</span>{children}{hint && <em>{hint}</em>}</label>;
}

// Colour: a brand fill, a custom colour, or (when allowed) "use the theme".
export function ColorField({ label: text, value, onChange, allowTheme = false, allowNamed = true }) {
  const named = COLOR_PRESETS.map(([id]) => id);
  const mode = !value ? 'theme' : named.includes(value) ? value : 'custom';
  return (
    <Field label={text}>
      <span className="cd-color">
        <select value={mode} aria-label={`${text} colour`} onChange={(event) => { const next = event.target.value; onChange(next === 'theme' ? undefined : next === 'custom' ? (isHex(value) ? value : '#ffffff') : next); }}>
          {allowTheme && <option value="theme">Theme colour</option>}
          {allowNamed && COLOR_PRESETS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          <option value="custom">Custom colour…</option>
        </select>
        {mode === 'custom' && <input type="color" value={isHex(value) ? value : '#ffffff'} aria-label={`${text} custom colour`} onChange={(event) => onChange(event.target.value)} />}
      </span>
    </Field>
  );
}

function Slider({ label: text, value, min, max, step, onChange, format = (v) => v }) {
  return <Field label={`${text}: ${format(value)}`}><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></Field>;
}

// ---------------------------------------------------------------- live preview (the exact render plan)
export function CommercialPreview({ draft, durationSeconds, onRights }) {
  const [format, setFormat] = useState('widescreen');
  const [result, setResult] = useState({ plan: null, error: '', rightsCheck: [] });
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  const body = useMemo(() => JSON.stringify({ storyboard: draft.storyboard, theme: draft.theme, branding: draft.branding, music: draft.music, durationSeconds, format, title: draft.title }), [draft, durationSeconds, format]);
  const mismatch = totalSeconds(draft.storyboard) !== durationSeconds ? `The segments add up to ${totalSeconds(draft.storyboard)} s; the commercial is ${durationSeconds} s.` : '';
  useEffect(() => {
    let live = true;
    if (mismatch) return undefined;
    const timer = setTimeout(() => {
      call('preview', { method: 'POST', body: JSON.parse(body) }).then((data) => { if (live) { setResult({ plan: data.plan, error: '', rightsCheck: data.rightsCheck }); onRights?.(data.rightsCheck); } })
        .catch((error) => live && setResult((current) => ({ ...current, error: error.message })));
    }, 450);
    return () => { live = false; clearTimeout(timer); };
  }, [body, mismatch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now();
    const tick = (now) => {
      setT((current) => { const next = current + (now - last) / 1000; return next >= durationSeconds ? 0 : next; });
      last = now;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, durationSeconds]);
  const plan = result.plan;
  const W = format === 'vertical' ? 1080 : format === 'square' ? 1080 : 1920;
  const H = format === 'vertical' ? 1920 : 1080;
  const boxWidth = format === 'vertical' ? 270 : format === 'square' ? 360 : 560;
  const scale = boxWidth / W;
  const now = plan ? frameAt(plan, Math.min(t, durationSeconds - 0.001)) : null;
  return (
    <section className="ms-card cd-preview" aria-label="Live storyboard preview">
      <div className="ms-row ms-between ms-wrap">
        <h4>Live preview</h4>
        <div className="ms-row">
          {[['widescreen', '16:9'], ['vertical', '9:16'], ['square', '1:1']].map(([id, name]) => <button key={id} type="button" className={format === id ? 'ms-primary' : 'ms-secondary'} onClick={() => setFormat(id)}>{name}</button>)}
        </div>
      </div>
      <div className="cd-stage" style={{ width: boxWidth, height: boxWidth * H / W }}>
        {now && <PreviewShot shot={now.shot} offset={now.offset} />}
        {now && now.layers.map(({ layer, state }, index) => (
          <div key={`${layer.start}-${index}`} className="cd-layer" style={{ opacity: state.opacity, transform: `translate(${state.dx * scale}px, ${state.dy * scale}px)` }}>
            {layer.elements.map((element, elementIndex) => <PreviewElement key={elementIndex} element={element} scale={scale} />)}
          </div>
        ))}
        {!plan && <p className="cd-stage-note">{mismatch || result.error || 'Preparing the preview…'}</p>}
      </div>
      <div className="ms-row">
        <button type="button" className="ms-secondary" onClick={() => setPlaying(!playing)} disabled={!plan}>{playing ? 'Pause' : 'Play'}</button>
        <input type="range" min="0" max={durationSeconds} step="0.1" value={t} aria-label="Preview time" onChange={(event) => { setPlaying(false); setT(Number(event.target.value)); }} />
        <span className="ms-muted">{t.toFixed(1)} s</span>
      </div>
      {(mismatch || result.error) && plan && <p className="ms-notice ms-notice--error">{mismatch || result.error}</p>}
      {result.rightsCheck?.length > 0 && <ul className="ms-bullets ms-bad">{result.rightsCheck.map((item) => <li key={item}>{item}</li>)}</ul>}
      <p className="ms-muted">The preview draws the exact plan the render worker receives (text, colours, timing, motion). Footage shows still frames and the font is approximate; the render is exact. Music plays only in the render.</p>
    </section>
  );
}

export function PreviewShot({ shot, offset }) {
  if (shot.kind === 'card') return <div className="cd-shot" style={{ background: `linear-gradient(135deg, ${shot.colors[0]}, ${shot.colors[1]})` }} />;
  if (shot.token) return <div className="cd-shot cd-shot--signed">Signed footage (preview after render)</div>;
  return <img className="cd-shot" alt="" src={thumb(shot.playbackId, shot.startSeconds + offset, 640)} style={{ objectPosition: `${(shot.focusX ?? 0.5) * 100}% 50%` }} />;
}

export function PreviewElement({ element, scale }) {
  const box = { position: 'absolute', left: element.x * scale, top: element.y * scale };
  if (element.type === 'rect') return <div style={{ ...box, width: element.width * scale, height: element.height * scale, background: element.color, opacity: element.opacity, borderRadius: (element.radius || 0) * scale }} />;
  if (element.type === 'gradient') {
    const rgba = (hex, alpha) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;
    return <div style={{ ...box, width: element.width * scale, height: element.height * scale, background: `linear-gradient(${element.vertical === false ? 'to right' : 'to bottom'}, ${rgba(element.from, element.fromOpacity)}, ${rgba(element.to, element.toOpacity)})` }} />;
  }
  if (element.type === 'image') {
    const bezel = element.frame === 'phone' ? Math.max(6, Math.round(element.width * 0.04)) : element.frame === 'tablet' ? Math.max(6, Math.round(element.width * 0.03)) : 0;
    const radius = element.frame === 'phone' ? element.width * 0.13 : element.frame === 'tablet' ? element.width * 0.05 : element.radius || 0;
    return (
      <div style={{ ...box, width: element.width * scale, height: element.height * scale, borderRadius: radius * scale, padding: bezel * scale, boxSizing: 'border-box',
        background: bezel ? 'linear-gradient(135deg, #d9dee6, #7d8794 50%, #d9dee6)' : 'transparent', boxShadow: element.shadow || bezel ? `0 ${8 * scale}px ${40 * scale}px rgba(0,0,0,0.65)` : 'none' }}>
        <img alt="" src={element.url} style={{ width: '100%', height: '100%', objectFit: bezel ? 'cover' : 'contain', objectPosition: 'top', borderRadius: Math.max(0, radius - bezel) * scale, display: 'block', background: bezel ? '#05070b' : 'transparent' }} />
      </div>
    );
  }
  if (element.type === 'logo') return <img alt="PROtv" src="/brand/protv-logo-480.webp" style={{ ...box, width: element.width * scale, filter: element.glow ? `drop-shadow(0 0 ${Math.max(2, element.width * scale / 20)}px rgba(30, 144, 255, 0.7))` : undefined }} />;
  const glow = element.glow ? `drop-shadow(0 0 ${Math.max(2, element.size * scale / 6)}px ${element.glowColor || '#1e90ff'})` : '';
  const shadow = element.shadow === false ? '' : `drop-shadow(${element.size * scale / 30}px ${element.size * scale / 22}px ${Math.max(1, element.size * scale / 14)}px rgba(0, 0, 0, 0.9))`;
  return (
    <div style={{ ...box, width: element.width * scale, fontSize: element.size * scale, lineHeight: 1.18, fontWeight: element.weight === 'regular' ? 400 : 800, letterSpacing: (element.letterSpacing || 0) * scale, textAlign: element.align === 'centre' ? 'center' : element.align, whiteSpace: 'pre-wrap', fontFamily: '"Noto Sans", "Segoe UI", Arial, sans-serif', filter: [glow, shadow].filter(Boolean).join(' ') || undefined }}>
      <span style={textFillStyle(element)}>{element.text}</span>
    </div>
  );
}

// ---------------------------------------------------------------- segment editor
function TextStyle({ style, onStyle, kind, options }) {
  const set = (patch) => onStyle({ ...style, ...patch });
  return (
    <details className="cd-details">
      <summary>Text style, timing and motion</summary>
      <div className="cd-grid">
        <Field label="Position"><select value={style.position || 'centre'} onChange={(event) => set({ position: event.target.value })}>{['top', 'centre', 'bottom'].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        <Field label="Alignment"><select value={style.align || 'centre'} onChange={(event) => set({ align: event.target.value })}>{['left', 'centre', 'right'].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        <Slider label="Move up/down" value={style.offsetY ?? 0} min={-0.3} max={0.3} step={0.01} onChange={(value) => set({ offsetY: value })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Text size" value={style.scale ?? 1} min={0.6} max={1.6} step={0.05} onChange={(value) => set({ scale: value })} format={(v) => `${Math.round(v * 100)}%`} />
        <Field label="Animation"><select value={style.animation || 'fade'} onChange={(event) => set({ animation: event.target.value })}>{(options?.animations || ANIMATION_FALLBACK).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="Lines appear"><select value={style.reveal || 'together'} onChange={(event) => set({ reveal: event.target.value })}><option value="together">All together</option><option value="stagger">One sentence at a time</option></select></Field>
        <Field label="Text appears after (s)"><input type="number" min="0" max="10" step="0.1" value={style.textIn ?? 0} onChange={(event) => set({ textIn: tenth(event.target.value) })} /></Field>
        <Field label="Text leaves before the end (s)"><input type="number" min="0" max="10" step="0.1" value={style.textOut ?? 0} onChange={(event) => set({ textOut: tenth(event.target.value) })} /></Field>
        <ColorField label="Top line colour" value={style.headlineColor} allowTheme onChange={(value) => set({ headlineColor: value })} />
        <ColorField label="Main line colour" value={style.heroColor} allowTheme onChange={(value) => set({ heroColor: value })} />
        <ColorField label="Bottom line colour" value={style.subColor} allowTheme onChange={(value) => set({ subColor: value })} />
        <label className="ms-check"><input type="checkbox" checked={style.glow !== false} onChange={(event) => set({ glow: event.target.checked })} /> Glow on the main line (theme glow colour)</label>
        {kind === 'footage' && <Slider label="Darken footage behind text" value={style.shade ?? 0.5} min={0} max={0.9} step={0.05} onChange={(value) => set({ shade: value })} format={(v) => `${Math.round(v * 100)}%`} />}
        <Field label="PROtv logo with the text"><select value={style.logo || 'none'} onChange={(event) => set({ logo: event.target.value })}><option value="none">None</option><option value="above">Above the text</option><option value="below">Below the text</option></select></Field>
        {style.logo && style.logo !== 'none' && <Slider label="Logo size" value={style.logoScale ?? 1} min={0.3} max={1.6} step={0.05} onChange={(value) => set({ logoScale: value })} format={(v) => `${Math.round(v * 100)}%`} />}
        {kind !== 'footage' && (
          <div className="cd-pair">
            <label className="ms-check"><input type="checkbox" checked={!style.background} onChange={(event) => set({ background: event.target.checked ? undefined : ['#03060d', '#0a1a3a'] })} /> Theme background</label>
            {style.background && style.background.map((value, index) => <input key={index} type="color" aria-label={`Background colour ${index + 1}`} value={value} onChange={(event) => set({ background: style.background.map((item, i) => (i === index ? event.target.value : item)) })} />)}
          </div>
        )}
      </div>
    </details>
  );
}

function ClipRow({ clip, index, count, footage, onChange, onMove, onRemove }) {
  const source = footage.find((item) => item.id === clip.videoId);
  const titleOnly = source?.scope === 'title';
  const max = Math.max(0, (source?.excerptUntil || 0) - Number(clip.durationSeconds || 0));
  return (
    <div className="cd-clip">
      {source?.muxPlaybackId ? <img src={thumb(source.muxPlaybackId, Number(clip.startSeconds) + Number(clip.durationSeconds) / 2, 240)} alt="" /> : <div className="ms-beat-card">No footage</div>}
      <div className="cd-grid">
        <Field label="Footage"><select value={clip.videoId} onChange={(event) => { const next = footage.find((item) => item.id === event.target.value); onChange({ ...clipFor(next, clip.startSeconds), durationSeconds: clip.durationSeconds, focusX: clip.focusX }); }}>
          {!source && <option value={clip.videoId}>{clip.sourceTitle || 'Choose…'}</option>}
          {footage.map((item) => <option key={item.id} value={item.id}>{item.title}{item.scope === 'title' ? ' (title shown on screen)' : ''}</option>)}
        </select></Field>
        <Field label="Starts at (s)" hint={source ? `Up to ${max} s (no endings)` : ''}><input type="number" min="0" max={max} step="1" value={clip.startSeconds} onChange={(event) => onChange({ ...clip, startSeconds: Math.max(0, Math.round(Number(event.target.value))) })} /></Field>
        <Field label="Length (s)"><input type="number" min="0.5" max="20" step="0.1" value={clip.durationSeconds} onChange={(event) => onChange({ ...clip, durationSeconds: tenth(event.target.value) })} /></Field>
        <Slider label="9:16 framing" value={clip.focusX ?? 0.5} min={0} max={1} step={0.05} onChange={(value) => onChange({ ...clip, focusX: value })} format={(v) => (v < 0.4 ? 'left' : v > 0.6 ? 'right' : 'centre')} />
        <Field label={titleOnly ? 'Title on screen (required by the agreement)' : 'Title on screen (optional)'}><input value={clip.label || ''} onChange={(event) => onChange({ ...clip, label: event.target.value })} placeholder={titleOnly ? source.title : 'No label'} /></Field>
      </div>
      <div className="cd-tools">
        <button type="button" className="ms-secondary" aria-label="Move clip earlier" disabled={index === 0} onClick={() => onMove(index - 1)}>↑</button>
        <button type="button" className="ms-secondary" aria-label="Move clip later" disabled={index === count - 1} onClick={() => onMove(index + 1)}>↓</button>
        <button type="button" className="ms-danger" aria-label="Remove clip" disabled={count === 1} onClick={onRemove}>✕</button>
      </div>
    </div>
  );
}

function SegmentImages({ beat, library, onChange }) {
  const placed = beat.images || [];
  const set = (index, patch) => onChange({ ...beat, images: placed.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <details className="cd-details" open={placed.length > 0}>
      <summary>Images ({placed.length}): badges, app screenshots, logos</summary>
      {placed.map((item, index) => (item.slot ? (
        <div key={index} className="cd-grid cd-image-row">
          <p className="ms-muted">{library.find((image) => image.id === item.imageId)?.name || 'Image'}: placed automatically for each format ({item.slot}).</p>
          <button type="button" className="ms-secondary" onClick={() => set(index, { slot: undefined })}>Place by hand</button>
          <button type="button" className="ms-danger" aria-label="Remove image" onClick={() => onChange({ ...beat, images: placed.filter((_, i) => i !== index) })}>✕</button>
        </div>
      ) : (
        <div key={index} className="cd-grid cd-image-row">
          <Field label="Image"><select value={item.imageId} onChange={(event) => set(index, { imageId: event.target.value })}>
            {!library.find((image) => image.id === item.imageId) && <option value={item.imageId}>(missing image)</option>}
            {library.map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
          </select></Field>
          <Slider label="Left ↔ right" value={item.x} min={0} max={1} step={0.01} onChange={(value) => set(index, { x: value })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Top ↕ bottom" value={item.y} min={0} max={1} step={0.01} onChange={(value) => set(index, { y: value })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Width" value={item.width} min={0.04} max={1} step={0.01} onChange={(value) => set(index, { width: value })} format={(v) => `${Math.round(v * 100)}% of the frame`} />
          <Field label="Frame"><select value={item.frame || 'none'} onChange={(event) => set(index, { frame: event.target.value })}><option value="none">None</option><option value="phone">Phone</option><option value="tablet">Tablet</option></select></Field>
          <label className="ms-check"><input type="checkbox" checked={item.shadow === true} onChange={(event) => set(index, { shadow: event.target.checked })} /> Shadow</label>
          <button type="button" className="ms-danger" aria-label="Remove image" onClick={() => onChange({ ...beat, images: placed.filter((_, i) => i !== index) })}>✕</button>
        </div>
      )))}
      <button type="button" className="ms-secondary" disabled={!library.length || placed.length >= 4} onClick={() => onChange({ ...beat, images: [...placed, { imageId: library[0].id, x: 0.5, y: 0.5, width: library[0].kind === 'screenshot' ? 0.22 : 0.25, frame: library[0].kind === 'screenshot' ? 'phone' : 'none', shadow: library[0].kind === 'screenshot' }] })}>Add image</button>
      {!library.length && <p className="studio-hint ms-muted">Upload an image to the image library first.</p>}
    </details>
  );
}

// Image library: images are shrunk in the browser (longest side 2000 px) before upload; the server re-encodes them.
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image the browser can read.'));
      img.onload = () => {
        const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
export function ImageLibrary({ library, onChanged }) {
  const [form, setForm] = useState({ name: '', kind: 'screenshot', source: '' });
  const [state, setState] = useState({ busy: false, error: '', message: '' });
  const fileRef = useRef(null);
  const upload = async (event) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setState({ busy: false, error: 'Choose an image file.', message: '' }); return; }
    setState({ busy: true, error: '', message: '' });
    try {
      const dataBase64 = await shrinkImage(file);
      await call('images', { method: 'POST', body: { ...form, name: form.name || file.name.replace(/\.[^.]+$/, ''), dataBase64 } });
      setForm({ name: '', kind: form.kind, source: form.source });
      if (fileRef.current) fileRef.current.value = '';
      setState({ busy: false, error: '', message: 'Added to the image library.' });
      onChanged?.();
    } catch (error) { setState({ busy: false, error: error.message, message: '' }); }
  };
  const remove = async (image) => {
    if (!window.confirm(`Remove "${image.name}" from the image library?`)) return;
    try { await call(`images/${image.id}`, { method: 'DELETE' }); onChanged?.(); } catch (error) { setState({ busy: false, error: error.message, message: '' }); }
  };
  return (
    <details className="cd-details">
      <summary>Image library ({library.length}): App Store badge, app screenshots, logos</summary>
      <form className="cd-grid" onSubmit={upload}>
        <Field label="Image file (PNG, JPEG or WebP)"><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" /></Field>
        <Field label="Name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. App Store badge" /></Field>
        <Field label="Type"><select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>{['badge', 'screenshot', 'logo', 'photo', 'other'].map((kind) => <option key={kind} value={kind}>{label(kind)}</option>)}</select></Field>
        <Field label="Source and permission (required)"><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="e.g. Apple official badge, unmodified" /></Field>
        <button type="submit" className="ms-primary" disabled={state.busy}>{state.busy ? 'Uploading…' : 'Add image'}</button>
      </form>
      {state.error && <p className="ms-notice ms-notice--error" role="alert">{state.error}</p>}
      {state.message && <p className="ms-notice">{state.message}</p>}
      <div className="cd-image-library">{library.map((image) => (
        <figure key={image.id} className="cd-image-card">
          {image.previewUrl ? <img alt="" src={image.previewUrl} /> : <div className="ms-beat-card">No preview</div>}
          <figcaption><strong>{image.name}</strong><span className="ms-muted">{label(image.kind)} · {image.width}×{image.height}</span><span className="ms-muted">{image.source}</span>
            <button type="button" className="ms-link" onClick={() => remove(image)}>Remove</button></figcaption>
        </figure>
      ))}</div>
    </details>
  );
}

function SegmentCard({ beat, index, count, start, footage, options, library = [], onChange, onMove, onRemove }) {
  const seconds = segmentSeconds(beat);
  const setText = (key, value) => onChange({ ...beat, text: { ...(beat.text || {}), [key]: value } });
  const clips = beat.clips || [];
  return (
    <section className="cd-segment" aria-label={`Segment ${index + 1}`}>
      <div className="ms-row ms-between ms-wrap">
        <strong className="ms-beat-time">{start.toFixed(1)}–{(start + seconds).toFixed(1)} s</strong>
        <div className="ms-row ms-wrap">
          <select aria-label="Segment type" value={beat.kind} onChange={(event) => { const kind = event.target.value; const next = newSegment(kind, clipFor(footage[0] || { id: '', title: '' })); onChange({ ...next, text: beat.text, style: { ...next.style, ...beat.style }, purpose: beat.purpose, ...(kind !== 'footage' ? { durationSeconds: seconds } : {}) }); }}>
            {Object.entries(KIND_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <input aria-label="Segment name" value={beat.purpose || ''} onChange={(event) => onChange({ ...beat, purpose: event.target.value })} />
          <button type="button" className="ms-secondary" aria-label="Move segment earlier" disabled={index === 0} onClick={() => onMove(index - 1)}>↑</button>
          <button type="button" className="ms-secondary" aria-label="Move segment later" disabled={index === count - 1} onClick={() => onMove(index + 1)}>↓</button>
          <button type="button" className="ms-danger" aria-label="Remove segment" disabled={count === 1} onClick={onRemove}>✕</button>
        </div>
      </div>
      <div className="cd-grid">
        <Field label="Top line"><input value={beat.text?.headline || ''} onChange={(event) => setText('headline', event.target.value)} placeholder="Optional" /></Field>
        <Field label="Main line"><input value={beat.text?.hero || ''} onChange={(event) => setText('hero', event.target.value)} placeholder="Optional" /></Field>
        <Field label="Bottom line"><input value={beat.text?.sub || ''} onChange={(event) => setText('sub', event.target.value)} placeholder="Optional" /></Field>
        {beat.kind !== 'footage' && <Field label="Length (s)"><input type="number" min="0.5" max="20" step="0.1" value={beat.durationSeconds} onChange={(event) => onChange({ ...beat, durationSeconds: tenth(event.target.value) })} /></Field>}
      </div>
      <TextStyle style={beat.style || {}} kind={beat.kind} options={options} onStyle={(style) => onChange({ ...beat, style })} />
      <SegmentImages beat={beat} library={library} onChange={onChange} />
      {beat.kind === 'footage' && (
        <div className="cd-clips">
          {clips.map((clip, clipIndex) => (
            <ClipRow key={clipIndex} clip={clip} index={clipIndex} count={clips.length} footage={footage}
              onChange={(next) => onChange({ ...beat, clips: clips.map((item, i) => (i === clipIndex ? next : item)) })}
              onMove={(to) => onChange({ ...beat, clips: moveItem(clips, clipIndex, to) })}
              onRemove={() => onChange({ ...beat, clips: clips.filter((_, i) => i !== clipIndex) })} />
          ))}
          <button type="button" className="ms-secondary" disabled={clips.length >= 8 || !footage.length} onClick={() => onChange({ ...beat, clips: [...clips, { ...clipFor(footage[clips.length % footage.length]), durationSeconds: 2 }] })}>Add clip</button>
        </div>
      )}
    </section>
  );
}

export function ThemeFields({ theme, onTheme, branding, onBranding, music, onMusic, options }) {
  const setTheme = (patch) => onTheme({ ...theme, ...patch });
  const setMusic = (patch) => onMusic({ ...music, ...patch });
  return (
    <div className="ms-grid3">
      <fieldset className="cd-fieldset"><legend>Theme</legend>
        <Field label="Theme name"><input value={theme.name || ''} onChange={(event) => setTheme({ name: event.target.value })} /></Field>
        <div className="cd-pair"><span>Background</span>{(theme.background || ['#03060d', '#0a1a3a']).map((value, index) => <input key={index} type="color" aria-label={`Theme background ${index + 1}`} value={value} onChange={(event) => setTheme({ background: (theme.background || ['#03060d', '#0a1a3a']).map((item, i) => (i === index ? event.target.value : item)) })} />)}</div>
        <ColorField label="Top line" value={theme.headline} onChange={(value) => setTheme({ headline: value })} />
        <ColorField label="Main line" value={theme.hero} onChange={(value) => setTheme({ hero: value })} />
        <ColorField label="Bottom line" value={theme.sub} onChange={(value) => setTheme({ sub: value })} />
        <div className="cd-pair"><span>Title-bar accent</span><input type="color" aria-label="Accent colour" value={isHex(theme.accent) ? theme.accent : '#1e90ff'} onChange={(event) => setTheme({ accent: event.target.value })} /></div>
        <div className="cd-pair"><label className="ms-check"><input type="checkbox" checked={Boolean(theme.glow)} onChange={(event) => setTheme({ glow: event.target.checked ? '#1e90ff' : null })} /> Text glow</label>{theme.glow && <input type="color" aria-label="Glow colour" value={theme.glow} onChange={(event) => setTheme({ glow: event.target.value })} />}</div>
      </fieldset>
      <fieldset className="cd-fieldset"><legend>Branding</legend>
        <label className="ms-check"><input type="checkbox" checked={branding.bug !== false} onChange={(event) => onBranding({ ...branding, bug: event.target.checked })} /> PROtv logo in the corner over footage</label>
        <Field label="Corner"><select value={branding.bugPosition || 'top-right'} onChange={(event) => onBranding({ ...branding, bugPosition: event.target.value })}>{(options?.bugPositions || ['top-right']).map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        <Slider label="Corner logo size" value={branding.bugScale ?? 1} min={0.5} max={1.6} step={0.05} onChange={(value) => onBranding({ ...branding, bugScale: value })} format={(v) => `${Math.round(v * 100)}%`} />
      </fieldset>
      <fieldset className="cd-fieldset"><legend>Music</legend>
        <label className="ms-check"><input type="checkbox" checked={music.kind !== 'none'} onChange={(event) => setMusic({ kind: event.target.checked ? 'generated' : 'none' })} /> Original music bed (made by the render worker, no licence needed)</label>
        {music.kind !== 'none' && <>
          <Field label="Mood"><select value={music.mood || 'cinematic'} onChange={(event) => setMusic({ mood: event.target.value })}>{(options?.moods || ['cinematic']).map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
          <Slider label="Tempo" value={music.bpm ?? 110} min={70} max={150} step={1} onChange={(value) => setMusic({ bpm: value })} format={(v) => `${v} BPM`} />
          <Slider label="Music volume" value={music.level ?? 1} min={0.5} max={1} step={0.05} onChange={(value) => setMusic({ level: value })} format={(v) => `${Math.round(v * 100)}%`} />
          <p className="ms-muted">PROtv LIVE masters stay within the broadcast loudness range (−24 ±2 LKFS) whatever the volume setting.</p>
        </>}
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------- the editor for template-based commercials
// The parent keys it by revision, so a saved revision starts a fresh draft.
export function StyledEditor({ commercial, footage, onSaved, onDirty }) {
  const initial = useMemo(() => ({ title: commercial.title, theme: commercial.theme, branding: commercial.branding || { bug: true, bugPosition: 'top-right', bugScale: 1 }, music: commercial.music, storyboard: commercial.storyboard }), [commercial]);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState({ error: '', message: '' });
  const options = useOnce('design').data;
  const [library, setLibrary] = useState([]);
  const [libraryVersion, setLibraryVersion] = useState(0);
  useEffect(() => { let live = true; call('images').then((data) => live && setLibrary(data || [])).catch(() => {}); return () => { live = false; }; }, [libraryVersion]);
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => { onDirty?.(changed); }, [changed]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = totalSeconds(draft.storyboard);
  const starts = draft.storyboard.reduce((list, beat) => [...list, list[list.length - 1] + segmentSeconds(beat)], [0]);
  const setBeat = (index, beat) => setDraft({ ...draft, storyboard: draft.storyboard.map((item, i) => (i === index ? beat : item)) });
  const run = async (key, fn, message) => { setBusy(key); setNotice({ error: '', message: '' }); try { const result = await fn(); setNotice({ error: '', message: typeof message === 'function' ? message(result) : message }); return result; } catch (error) { setNotice({ error: error.message, message: '' }); return null; } finally { setBusy(''); } };
  const save = () => run('save', async () => { const saved = await call(`commercials/${commercial.id}/storyboard`, { method: 'PUT', body: { storyboard: draft.storyboard.map((beat) => (beat.kind === 'footage' ? { ...beat, durationSeconds: segmentSeconds(beat) } : beat)), theme: draft.theme, branding: draft.branding, music: draft.music, title: draft.title } }); onSaved?.(saved); return saved; }, 'Saved as a new revision. Render again to see it.');
  return (
    <div className="ms-stack">
      <section className="ms-card">
        <div className="ms-row ms-between ms-wrap">
          <h4>Design {commercial.templateName ? `· from the ${commercial.templateName} template` : ''}</h4>
          <div className="ms-row ms-wrap">
            <button type="button" className="ms-secondary" disabled={Boolean(busy) || changed} title={changed ? 'Save first' : ''} onClick={() => { const name = window.prompt('Name for the new template?', `${commercial.title} template`); if (name) run('tpl', () => call('templates', { method: 'POST', body: { name, fromCommercialId: commercial.id } }), `Saved as the template "${name}". Find it under Commercial Templates.`); }}>Save as template</button>
          </div>
        </div>
        <Field label="Commercial name"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
        <ThemeFields theme={draft.theme || {}} onTheme={(theme) => setDraft({ ...draft, theme })} branding={draft.branding} onBranding={(branding) => setDraft({ ...draft, branding })} music={draft.music || {}} onMusic={(music) => setDraft({ ...draft, music })} options={options} />
        <ImageLibrary library={library} onChanged={() => setLibraryVersion((value) => value + 1)} />
      </section>
      <div className="cd-layout">
        <section className="ms-card">
          <div className="ms-row ms-between ms-wrap">
            <h4>Storyboard</h4>
            <span className={total === commercial.durationSeconds ? 'ms-good' : 'ms-bad'}>{total} s of {commercial.durationSeconds} s</span>
          </div>
          <div className="ms-stack">
            {draft.storyboard.map((beat, index) => (
              <SegmentCard key={index} beat={beat} index={index} count={draft.storyboard.length} start={starts[index]} footage={footage} options={options} library={library}
                onChange={(next) => setBeat(index, next)} onMove={(to) => setDraft({ ...draft, storyboard: moveItem(draft.storyboard, index, to) })}
                onRemove={() => setDraft({ ...draft, storyboard: draft.storyboard.filter((_, i) => i !== index) })} />
            ))}
          </div>
          <div className="ms-row ms-wrap">
            {Object.entries(KIND_LABELS).map(([kind, name]) => <button key={kind} type="button" className="ms-secondary" disabled={draft.storyboard.length >= 24 || (kind === 'footage' && !footage.length)} onClick={() => setDraft({ ...draft, storyboard: [...draft.storyboard, newSegment(kind, clipFor(footage[0] || { id: '', title: '' }))] })}>Add {name.toLowerCase()}</button>)}
          </div>
        </section>
        <CommercialPreview draft={draft} durationSeconds={commercial.durationSeconds} />
      </div>
      <div className="ms-row ms-wrap cd-savebar">
        <button type="button" className="ms-primary" disabled={!changed || Boolean(busy) || total !== commercial.durationSeconds} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="ms-secondary" disabled={!changed || Boolean(busy)} onClick={() => setDraft(initial)}>Discard changes</button>
        {total !== commercial.durationSeconds && <span className="ms-bad">Adjust lengths to total exactly {commercial.durationSeconds} s.</span>}
      </div>
      {notice.error && <p className="ms-notice ms-notice--error" role="alert">{notice.error}</p>}
      {notice.message && <p className="ms-notice">{notice.message}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- template picker (new commercial) and manager
export function TemplateChoice({ value, onChange, durationSeconds }) {
  const { data, error } = useOnce('templates');
  if (error) return <p className="ms-notice ms-notice--error">{error}</p>;
  if (!data) return <p className="ms-muted">Loading templates…</p>;
  return (
    <div className="cd-templates" role="radiogroup" aria-label="Template">
      {data.map((template) => {
        const fixed = template.storyboard ? Number(template.durationSeconds) : null;
        const disabled = fixed !== null && fixed !== Number(durationSeconds);
        return (
          <button key={template.id} type="button" role="radio" aria-checked={value === template.id} disabled={disabled} className={`cd-template${value === template.id ? ' is-active' : ''}`} onClick={() => onChange(template.id)} title={disabled ? `Saved at ${fixed} seconds` : ''}>
            <span className="cd-swatch" style={{ background: `linear-gradient(135deg, ${(template.theme?.background || ['#03060d', '#0a1a3a']).join(', ')})` }} />
            <strong>{template.name}</strong>
            <em>{template.builtIn ? (template.edited ? 'Built-in · edited' : 'Built-in') : `Saved${fixed ? ` · ${fixed} s` : ''}`}</em>
            <span className="ms-muted">{template.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function TemplateEditor({ template, onDone }) {
  const [draft, setDraft] = useState(() => structuredClone(template));
  const [state, setState] = useState({ busy: false, error: '' });
  const options = useOnce('design').data;
  const fromCommercial = Boolean(template.storyboard);
  const segments = draft.segments || [];
  const setSegment = (index, patch) => setDraft({ ...draft, segments: segments.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const body = () => ({ name: draft.name, description: draft.description, occasion: draft.occasion, theme: draft.theme, music: draft.music, branding: draft.branding, ...(fromCommercial ? {} : { segments }) });
  const submit = async (asNew) => {
    setState({ busy: true, error: '' });
    try {
      if (asNew) await call('templates', { method: 'POST', body: { ...body(), name: draft.name === template.name ? `${draft.name} (my version)` : draft.name } });
      else await call(`templates/${encodeURIComponent(template.id)}`, { method: 'PUT', body: body() });
      onDone(true);
    } catch (error) { setState({ busy: false, error: error.message }); }
  };
  return (
    <section className="ms-card ms-form">
      <h3>Edit template: {template.name}</h3>
      <div className="ms-grid2">
        <Field label="Name"><input value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field label="Description"><input value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
      </div>
      <ThemeFields theme={draft.theme || {}} onTheme={(theme) => setDraft({ ...draft, theme })} branding={draft.branding || {}} onBranding={(branding) => setDraft({ ...draft, branding })} music={draft.music || {}} onMusic={(music) => setDraft({ ...draft, music })} options={options} />
      {fromCommercial ? <p className="ms-muted">This template was saved from a commercial: its segments, footage and wording come from that commercial. Edit the commercial and save it as a template again to change them.</p> : (
        <fieldset className="cd-fieldset"><legend>Segments (timed for 30 seconds; scaled for 15 and 60)</legend>
          {segments.map((segment, index) => (
            <div key={index} className="cd-template-segment">
              <select aria-label="Segment type" value={segment.kind} onChange={(event) => setSegment(index, { kind: event.target.value, ...(event.target.value === 'footage' ? { clips: segment.clips || 2 } : {}) })}>{Object.entries(KIND_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
              <input aria-label="Seconds" type="number" min="0.5" max="20" step="0.1" value={segment.seconds} onChange={(event) => setSegment(index, { seconds: tenth(event.target.value) })} />
              {segment.kind === 'footage' && <input aria-label="Number of clips" type="number" min="1" max="8" value={segment.clips || 1} onChange={(event) => setSegment(index, { clips: Number(event.target.value) })} />}
              <input aria-label="Top line" placeholder="Top line" value={segment.text?.headline || ''} onChange={(event) => setSegment(index, { text: { ...segment.text, headline: event.target.value } })} />
              <input aria-label="Main line" placeholder="Main line" value={segment.text?.hero || ''} onChange={(event) => setSegment(index, { text: { ...segment.text, hero: event.target.value } })} />
              <input aria-label="Bottom line" placeholder="Bottom line" value={segment.text?.sub || ''} onChange={(event) => setSegment(index, { text: { ...segment.text, sub: event.target.value } })} />
              <select aria-label="Animation" value={segment.style?.animation || 'fade'} onChange={(event) => setSegment(index, { style: { ...segment.style, animation: event.target.value } })}>{(options?.animations || ANIMATION_FALLBACK).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              <select aria-label="Lines appear" value={segment.style?.reveal || 'together'} onChange={(event) => setSegment(index, { style: { ...segment.style, reveal: event.target.value } })}><option value="together">Together</option><option value="stagger">One at a time</option></select>
              <button type="button" className="ms-secondary" aria-label="Move earlier" disabled={index === 0} onClick={() => setDraft({ ...draft, segments: moveItem(segments, index, index - 1) })}>↑</button>
              <button type="button" className="ms-danger" aria-label="Remove segment" disabled={segments.length === 1} onClick={() => setDraft({ ...draft, segments: segments.filter((_, i) => i !== index) })}>✕</button>
            </div>
          ))}
          <div className="ms-row ms-wrap">
            <button type="button" className="ms-secondary" onClick={() => setDraft({ ...draft, segments: [...segments, { kind: 'card', seconds: 3, purpose: 'Card', text: { hero: 'YOUR MESSAGE' }, style: { animation: 'fade' } }] })}>Add segment</button>
            <span className="ms-muted">Total {tenth(segments.reduce((sum, item) => sum + Number(item.seconds || 0), 0))} s. Use [NAME], [DATE] or [TITLE] for words to fill in per commercial; a render waits until they are replaced.</span>
          </div>
        </fieldset>
      )}
      {state.error && <p className="ms-notice ms-notice--error" role="alert">{state.error}</p>}
      <div className="ms-row ms-wrap">
        <button type="button" className="ms-primary" disabled={state.busy} onClick={() => submit(false)}>Save template</button>
        <button type="button" className="ms-secondary" disabled={state.busy} onClick={() => submit(true)}>Save as a new template</button>
        <button type="button" className="ms-secondary" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </section>
  );
}

export function TemplatesManager({ onOpenCommercial }) {
  const [version, setVersion] = useState(0);
  const [list, setList] = useState({ data: null, error: '' });
  const [editing, setEditing] = useState(null);
  const [create, setCreate] = useState({ id: '', durationSeconds: 30, title: '' });
  const [state, setState] = useState({ busy: '', error: '', message: '' });
  useEffect(() => { let live = true; call('templates').then((data) => live && setList({ data, error: '' })).catch((error) => live && setList({ data: null, error: error.message })); return () => { live = false; }; }, [version]);
  const act = async (key, fn, message) => { setState({ busy: key, error: '', message: '' }); try { const result = await fn(); setState({ busy: '', error: '', message }); setVersion((value) => value + 1); return result; } catch (error) { setState({ busy: '', error: error.message, message: '' }); return null; } };
  if (editing) return <TemplateEditor template={editing} onDone={(saved) => { setEditing(null); if (saved) { setVersion((value) => value + 1); setState({ busy: '', error: '', message: 'Template saved.' }); } }} />;
  return (
    <div className="ms-stack">
      <p className="ms-muted">Templates are starting points. Every word, colour, timing and setting can be changed per commercial, and built-in templates can be edited (and reset) here. Nothing is rendered, published or aired from this page.</p>
      {list.error && <p className="ms-notice ms-notice--error">{list.error}</p>}
      {state.error && <p className="ms-notice ms-notice--error" role="alert">{state.error}</p>}
      {state.message && <p className="ms-notice">{state.message}</p>}
      <div className="cd-template-list">
        {(list.data || []).map((template) => (
          <section key={template.id} className="ms-card cd-template-card">
            <span className="cd-swatch cd-swatch--wide" style={{ background: `linear-gradient(135deg, ${(template.theme?.background || ['#03060d', '#0a1a3a']).join(', ')})` }} />
            <div className="ms-row ms-between"><h4>{template.name}</h4><span className="ms-status">{template.builtIn ? (template.edited ? 'Built-in · edited' : 'Built-in') : 'Saved'}</span></div>
            <p className="ms-muted">{template.description}</p>
            <p className="ms-muted">{(template.segments || template.storyboard || []).map((segment) => segment.text?.hero || segment.text?.headline || KIND_LABELS[segment.kind]).filter(Boolean).join(' · ')}</p>
            {create.id === template.id ? (
              <div className="ms-row ms-wrap">
                <input aria-label="Commercial name" placeholder="Commercial name" value={create.title} onChange={(event) => setCreate({ ...create, title: event.target.value })} />
                <select aria-label="Length" value={create.durationSeconds} disabled={Boolean(template.storyboard)} onChange={(event) => setCreate({ ...create, durationSeconds: Number(event.target.value) })}>{[15, 30, 60].map((value) => <option key={value} value={value}>{value} s</option>)}</select>
                <button type="button" className="ms-primary" disabled={Boolean(state.busy)} onClick={() => act('create', () => call('commercials', { method: 'POST', body: { category: 'custom', templateId: template.id, durationSeconds: template.storyboard ? template.durationSeconds : create.durationSeconds, title: create.title } }).then((commercial) => { setCreate({ id: '', durationSeconds: 30, title: '' }); onOpenCommercial?.(commercial.id); return commercial; }), 'Commercial created.')}>Create</button>
                <button type="button" className="ms-secondary" onClick={() => setCreate({ id: '', durationSeconds: 30, title: '' })}>Cancel</button>
              </div>
            ) : (
              <div className="ms-row ms-wrap">
                <button type="button" className="ms-primary" onClick={() => setCreate({ id: template.id, durationSeconds: template.storyboard ? template.durationSeconds : 30, title: '' })}>New commercial</button>
                <button type="button" className="ms-secondary" onClick={() => setEditing(template)}>Edit</button>
                {template.builtIn && template.edited && <button type="button" className="ms-secondary" disabled={Boolean(state.busy)} onClick={() => act('reset', () => call(`templates/${encodeURIComponent(template.id)}`, { method: 'DELETE' }), 'Reset to the original.')}>Reset to original</button>}
                {!template.builtIn && <button type="button" className="ms-danger" disabled={Boolean(state.busy)} onClick={() => { if (window.confirm(`Delete the template "${template.name}"? Commercials made from it are not affected.`)) act('delete', () => call(`templates/${encodeURIComponent(template.id)}`, { method: 'DELETE' }), 'Template deleted.'); }}>Delete</button>}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

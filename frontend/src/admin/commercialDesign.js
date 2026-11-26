// Marketing Studio editor helpers (no React): the live storyboard preview reproduces what the render worker draws from
// the same render plan (shot at a moment, overlay fades, eased motion), and small storyboard editing utilities.

const STEPS = (layer) => (layer.motion ? 8 : 3);

// Opacity and movement of one overlay layer at time t, matching server/marketingRender.ts overlayIntervals().
export function layerStateAt(layer, t) {
  if (t < layer.start || t >= layer.end) return null;
  const steps = STEPS(layer);
  const fade = Math.min(layer.fade ?? 0.2, (layer.end - layer.start) / 2);
  const fromStart = fade ? Math.min(1, Math.ceil(((t - layer.start) / fade) * steps) / steps) : 1;
  const fromEnd = fade ? Math.min(1, Math.ceil(((layer.end - t) / fade) * steps) / steps) : 1;
  const shift = layer.motion && fade ? (1 - Math.min(1, (t - layer.start) / fade)) ** 2 : 0;
  return { opacity: Math.max(0.15, Math.min(fromStart, fromEnd)), dx: layer.motion ? layer.motion.dx * shift : 0, dy: layer.motion ? layer.motion.dy * shift : 0 };
}

// The picture and overlays on screen at time t.
export function frameAt(plan, t) {
  if (!plan) return null;
  let at = 0;
  let shot = plan.shots[plan.shots.length - 1];
  let offset = 0;
  for (const item of plan.shots) {
    if (t < at + item.durationSeconds) { shot = item; offset = t - at; break; }
    at += item.durationSeconds;
  }
  const layers = plan.layers.map((layer) => ({ layer, state: layerStateAt(layer, t) })).filter((item) => item.state);
  return { shot, offset, layers };
}

export const segmentSeconds = (beat) => (beat.kind === 'footage' && Array.isArray(beat.clips) && beat.clips.length
  ? Math.round(beat.clips.reduce((sum, clip) => sum + Number(clip.durationSeconds || 0), 0) * 10) / 10
  : Math.round(Number(beat.durationSeconds || 0) * 10) / 10);
export const totalSeconds = (storyboard) => Math.round(storyboard.reduce((sum, beat) => sum + segmentSeconds(beat), 0) * 10) / 10;
export const tenth = (value) => Math.round(Number(value) * 10) / 10;

export function moveItem(list, from, to) {
  if (to < 0 || to >= list.length || from === to) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function newSegment(kind, clip) {
  if (kind === 'footage') return { kind, purpose: 'Footage', text: {}, style: { animation: 'fade' }, clips: [{ ...clip, durationSeconds: 3 }], durationSeconds: 3 };
  if (kind === 'cta') return { kind, purpose: 'Call to action', durationSeconds: 3, text: { headline: 'WATCH FREE AT', hero: 'WATCHPROTV.COM' }, style: { logo: 'above', animation: 'fade' } };
  if (kind === 'logo') return { kind, purpose: 'Logo reveal', durationSeconds: 4, text: {}, style: { logo: 'above', animation: 'slow-fade' } };
  return { kind: 'card', purpose: 'Card', durationSeconds: 4, text: { hero: 'YOUR MESSAGE' }, style: { animation: 'fade' } };
}

// A clip from cleared footage: title-only grants carry their title on screen (the server enforces it too).
export function clipFor(item, startSeconds = 60) {
  const limit = Math.max(0, (item.excerptUntil || 0) - 5);
  return { videoId: item.id, sourceTitle: item.title, startSeconds: Math.min(startSeconds, limit), focusX: 0.5, label: item.scope === 'title' ? item.title : '' };
}

// CSS for a text element's fill (named metallic fills are gradients, as the worker draws them).
const FILLS = { silver: ['#ffffff', '#9aa6b8'], blue: ['#7fd3ff', '#1677ff'], gold: ['#fff1c1', '#d4a017'] };
export function textFillStyle(element) {
  const pair = FILLS[element.fill];
  if (pair) return { backgroundImage: `linear-gradient(180deg, ${pair[0]} 0%, ${pair[1]} 55%, ${pair[0]} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };
  return { color: element.fill === 'custom' && element.color ? element.color : '#ffffff' };
}

export const COLOR_PRESETS = Object.freeze([
  ['silver', 'Metallic silver'], ['blue', 'Electric blue'], ['gold', 'Gold'], ['white', 'White'],
]);
export const isHex = (value) => /^#[0-9a-fA-F]{6}$/.test(String(value || ''));

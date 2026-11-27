// Marketing Studio design layer: themes, editable on-screen text, timing, position, size, colour, animation, logo and
// music controls for "styled" commercials (templates, custom and holiday spots). The original network and title
// templates keep their own layout in planner.js unchanged; a commercial is styled when it carries a `theme` or a beat
// carries a `style`.
//
// A storyboard segment (beat) is one message on screen over one picture or several clips:
//   { kind: 'card' | 'footage' | 'logo' | 'cta', durationSeconds, purpose,
//     text: { headline, hero, sub }, style: { position, align, offsetY, scale, headlineColor, heroColor, subColor,
//     glow, animation, reveal, textIn, textOut, shade, background, logo, logoScale },
//     clips: [{ videoId, sourceTitle, startSeconds, durationSeconds, focusX, label, labelSub }] }   (footage only)
// Nothing here contains wording: every word comes from the storyboard, which the Administrator edits.
const COLOR = /^#[0-9a-fA-F]{6}$/;
const NAMED_FILLS = ['white', 'silver', 'blue', 'gold'];
// 'gold' is a gradient fill drawn by the render worker from portal version marketing-v2 on.
const POSITIONS = ['top', 'centre', 'bottom'];
const ALIGNS = ['left', 'centre', 'right'];
const ANIMATIONS = Object.freeze({
  cut: { fade: 0, label: 'Cut (no transition)' },
  fade: { fade: 0.18, label: 'Quick fade' },
  'slow-fade': { fade: 0.6, label: 'Slow fade' },
  rise: { fade: 0.45, motion: { dx: 0, dy: 0.045 }, label: 'Fade and rise' },
  'slide-left': { fade: 0.45, motion: { dx: 0.06, dy: 0 }, label: 'Fade and slide from the right' },
  'slide-right': { fade: 0.45, motion: { dx: -0.06, dy: 0 }, label: 'Fade and slide from the left' },
});
const REVEALS = ['together', 'stagger'];
const LOGO_PLACEMENTS = ['none', 'above', 'below'];
const BUG_POSITIONS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
const MUSIC_MOODS = ['warm', 'cinematic', 'energetic', 'suspense', 'corporate'];
const KINDS = ['card', 'footage', 'logo', 'cta'];
const LOGO_RATIO = 941 / 1672;

const BRAND_THEME = Object.freeze({ name: 'PROtv', background: ['#03060d', '#0a1a3a'], headline: 'silver', hero: 'blue', sub: 'white', accent: '#1e90ff', glow: '#1e90ff' });

const clamp = (value, min, max, fallback) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback);
const tenth = (value) => Math.round(Number(value) * 10) / 10;
const str = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const colorToken = (value, fallback) => (NAMED_FILLS.includes(value) || COLOR.test(String(value || '')) ? value : fallback);

function isStyled(commercial) {
  return Boolean(commercial?.theme) || (commercial?.storyboard || []).some((beat) => beat && beat.style);
}

// The clips of a footage segment (a legacy beat is one clip).
function clipsOf(beat) {
  if (beat.kind !== 'footage') return [];
  if (Array.isArray(beat.clips) && beat.clips.length) return beat.clips;
  return [{ videoId: beat.videoId, sourceTitle: beat.sourceTitle, startSeconds: beat.startSeconds, durationSeconds: beat.durationSeconds, focusX: beat.focusX, label: beat.label, labelSub: beat.labelSub, titleOnScreen: beat.titleOnScreen, framing: beat.framing, pushIn: beat.pushIn, fadeIn: beat.fadeIn, fadeOut: beat.fadeOut, rightsBasis: beat.rightsBasis }];
}

// Every footage excerpt with its place in the commercial, for the rights check. In a styled clip the title is shown
// on screen exactly when it has a label (the lower third is drawn for the whole clip).
function footageShots(storyboard) {
  const shots = [];
  let at = 0;
  for (const beat of storyboard) {
    if (beat.kind === 'footage') {
      let clipAt = at;
      const multi = Array.isArray(beat.clips) && beat.clips.length > 0;
      for (const clip of clipsOf(beat)) {
        shots.push({ kind: 'footage', videoId: clip.videoId, startSeconds: Number(clip.startSeconds) || 0, durationSeconds: Number(clip.durationSeconds) || 0, start: clipAt, titleOnScreen: multi || beat.style ? Boolean(clip.label) : Boolean(clip.titleOnScreen) });
        clipAt += Number(clip.durationSeconds) || 0;
      }
    }
    at += Number(beat.durationSeconds) || 0;
  }
  return shots;
}

// ---------------------------------------------------------------- sanitizing (everything the Admin can send)
class DesignError extends Error { constructor(message) { super(message); this.name = 'DesignError'; } }

function sanitizeTheme(input = {}) {
  const base = BRAND_THEME;
  const background = Array.isArray(input.background) && input.background.length === 2 && input.background.every((value) => COLOR.test(String(value))) ? [...input.background] : [...base.background];
  return {
    name: str(input.name, 60) || base.name,
    background,
    headline: colorToken(input.headline, base.headline),
    hero: colorToken(input.hero, base.hero),
    sub: colorToken(input.sub, base.sub),
    accent: COLOR.test(String(input.accent || '')) ? input.accent : base.accent,
    glow: input.glow === null || input.glow === false ? null : COLOR.test(String(input.glow || '')) ? input.glow : base.glow,
  };
}
function sanitizeBranding(input = {}) {
  return { bug: input.bug !== false, bugPosition: BUG_POSITIONS.includes(input.bugPosition) ? input.bugPosition : 'top-right', bugScale: clamp(input.bugScale, 0.5, 1.6, 1) };
}
function sanitizeMusic(input = {}) {
  return {
    kind: input.kind === 'none' ? 'none' : 'generated',
    mood: MUSIC_MOODS.includes(input.mood) ? input.mood : 'cinematic',
    bpm: Math.round(clamp(input.bpm, 70, 150, 110)),
    level: clamp(input.level, 0.5, 1, 1),
    source: input.kind === 'none' ? 'No music.' : 'Original music bed generated by the PROtv render worker (no third-party recording, no licence needed).',
  };
}
function sanitizeStyle(input = {}) {
  const style = {
    position: POSITIONS.includes(input.position) ? input.position : 'centre',
    align: ALIGNS.includes(input.align) ? input.align : 'centre',
    offsetY: clamp(input.offsetY, -0.3, 0.3, 0),
    scale: clamp(input.scale, 0.6, 1.6, 1),
    animation: ANIMATIONS[input.animation] ? input.animation : 'fade',
    reveal: REVEALS.includes(input.reveal) ? input.reveal : 'together',
    textIn: clamp(input.textIn, 0, 10, 0),
    textOut: clamp(input.textOut, 0, 10, 0),
    shade: clamp(input.shade, 0, 0.9, 0.5),
    glow: input.glow !== false,
    ...(input.balance === true ? { balance: true } : {}),
    logo: LOGO_PLACEMENTS.includes(input.logo) ? input.logo : 'none',
    logoScale: clamp(input.logoScale, 0.3, 1.6, 1),
  };
  for (const key of ['headlineColor', 'heroColor', 'subColor']) if (colorToken(input[key], null)) style[key] = input[key];
  if (Array.isArray(input.background) && input.background.length === 2 && input.background.every((value) => COLOR.test(String(value)))) style.background = [...input.background];
  return style;
}
function sanitizeText(input = {}) {
  const out = {};
  for (const [key, max] of [['headline', 120], ['hero', 140], ['sub', 160]]) { const value = str(input[key], max); if (value) out[key] = value; }
  return out;
}
// Image layers (badges, app screenshots, logos): centre point and width as fractions of the frame, or a slot
// ('devices', 'badge', 'feature') that is laid out automatically around the text for each format (Commercial Maker).
const FRAMES = ['none', 'phone', 'tablet'];
const SLOTS = ['devices', 'badge', 'feature'];
function sanitizeImages(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 4).filter((item) => /^mi_[a-f0-9]{20}$/.test(String(item?.imageId || ''))).map((item) => ({
    imageId: item.imageId, x: clamp(item.x, 0, 1, 0.5), y: clamp(item.y, 0, 1, 0.5), width: clamp(item.width, 0.04, 1, 0.3),
    frame: FRAMES.includes(item.frame) ? item.frame : 'none', shadow: item.shadow === true,
    ...(SLOTS.includes(item.slot) ? { slot: item.slot } : {}),
  }));
}

function sanitizeClip(input = {}) {
  const clip = {
    videoId: str(input.videoId, 200), sourceTitle: str(input.sourceTitle, 200),
    startSeconds: Math.max(0, Math.round(Number(input.startSeconds) || 0)), durationSeconds: tenth(clamp(input.durationSeconds, 0.5, 20, 2)),
    focusX: clamp(input.focusX, 0, 1, 0.5), label: str(input.label, 120),
  };
  const labelSub = str(input.labelSub, 80);
  if (labelSub) clip.labelSub = labelSub;
  if (input.framing === 'fit') clip.framing = 'fit';
  return clip;
}

// A styled storyboard from the Admin. Lengths are tenths of a second (always whole frames at 30 fps).
function sanitizeStoryboard(input, { durationSeconds }) {
  if (!Array.isArray(input) || !input.length) throw new DesignError('The storyboard is empty.');
  if (input.length > 24) throw new DesignError('A commercial can have at most 24 segments.');
  const beats = input.map((raw, index) => {
    const kind = KINDS.includes(raw?.kind) ? raw.kind : null;
    if (!kind) throw new DesignError(`Segment ${index + 1} has no type.`);
    const beat = { kind, purpose: str(raw.purpose, 60) || kind, text: sanitizeText(raw.text), style: sanitizeStyle(raw.style) };
    if (kind === 'footage') {
      const clips = (Array.isArray(raw.clips) && raw.clips.length ? raw.clips : [raw]).slice(0, 8).map(sanitizeClip);
      if (clips.some((clip) => !clip.videoId)) throw new DesignError(`Segment ${index + 1}: choose the footage for every clip.`);
      beat.clips = clips;
      beat.durationSeconds = tenth(clips.reduce((sum, clip) => sum + clip.durationSeconds, 0));
    } else beat.durationSeconds = tenth(clamp(raw.durationSeconds, 0.5, 20, 3));
    if (beat.durationSeconds > 20 && kind !== 'footage') throw new DesignError(`Segment ${index + 1} is longer than 20 seconds.`);
    if (beat.style.textIn + beat.style.textOut > beat.durationSeconds - 0.3) { beat.style.textIn = 0; beat.style.textOut = 0; }
    if (raw.impact) beat.impact = true;
    const images = sanitizeImages(raw.images);
    if (images.length) beat.images = images;
    return beat;
  });
  const total = tenth(beats.reduce((sum, beat) => sum + beat.durationSeconds, 0));
  if (Math.abs(total - durationSeconds) > 0.001) throw new DesignError(`The segments add up to ${total} s; the commercial is ${durationSeconds} s.`);
  return beats;
}

// Placeholders like [TITLE] or [DATE] in a template must be replaced before anything is rendered.
function placeholders(storyboard) {
  const found = new Set();
  for (const beat of storyboard) for (const value of Object.values(beat.text || {})) for (const match of String(value).matchAll(/\[[A-Z0-9 _'-]{2,30}\]/g)) found.add(match[0]);
  return [...found];
}

// ---------------------------------------------------------------- layout (format-aware)
function safeArea(L) {
  // Vertical apps cover the top ~10% and the bottom ~20% with their own interface; TV title-safe is ~6–8%.
  return L.W > L.H ? { top: Math.round(L.H * 0.08), bottom: Math.round(L.H * 0.1) } : L.W === L.H ? { top: Math.round(L.H * 0.08), bottom: Math.round(L.H * 0.12) } : { top: Math.round(L.H * 0.11), bottom: Math.round(L.H * 0.2) };
}
function fill(token) {
  if (COLOR.test(String(token))) return { fill: 'custom', color: token };
  return { fill: NAMED_FILLS.includes(token) ? token : 'white' };
}

// Even line lengths at the fitted size (no short last line): the longest line never grows, so the text still fits.
function balanceLines(text) {
  const lines = String(text).split('\n');
  if (lines.length < 2) return text;
  const words = lines.join(' ').split(' ').filter(Boolean);
  const count = lines.length;
  const longest = Math.max(...lines.map((line) => line.length));
  let best = null;
  const search = (start, left, acc) => {
    if (left === 1) {
      const line = words.slice(start).join(' ');
      if (!line) return;
      const all = [...acc, line];
      const width = Math.max(...all.map((item) => item.length));
      if (width <= longest && (!best || width < best.width)) best = { width, lines: all };
      return;
    }
    for (let end = start + 1; end <= words.length - left + 1; end += 1) search(end, left - 1, [...acc, words.slice(start, end).join(' ')]);
  };
  if (words.length <= 14) search(0, count, []);
  return best ? best.lines.join('\n') : text;
}

// The text block of a segment: one element per line, positioned once for the whole message so a staggered reveal
// never moves lines that are already on screen.
function textBlock(beat, L, theme, { fitText, CHAR_EM, bottomLimit }) {
  const style = beat.style || {};
  const scale = style.scale ?? 1;
  const width = L.W - 2 * L.margin;
  const text = beat.text || {};
  const items = [];
  const logoPlacement = style.logo || 'none';
  const logoWidth = Math.round(L.logoWide * (beat.kind === 'logo' ? 1 : 0.42) * (style.logoScale ?? 1));
  const logo = logoPlacement !== 'none' ? { type: 'logo', width: logoWidth, height: Math.round(logoWidth * LOGO_RATIO) } : null;
  const role = (name, value, size, lineHeight, spacing, weight) => {
    if (!value) return;
    const parts = name === 'hero' && style.reveal === 'stagger' ? value.split(/(?<=[.!?])\s+/).filter(Boolean) : [value];
    const fitted = parts.map((part) => fitText(part, Math.round(size * scale), width, { maxLines: 3, spacing }));
    const common = Math.min(...fitted.map((item) => item.size));
    parts.forEach((part) => {
      let fit = fitText(part, common, width, { maxLines: 3, spacing });
      // Balanced segments prefer one line fewer at up to 25% smaller type over a short last line.
      if (style.balance && fit.lines > 1) {
        for (let size = fit.size - 4; size >= Math.round(common * 0.75); size -= 4) {
          const tighter = fitText(part, size, width, { maxLines: fit.lines - 1, spacing });
          if (tighter.lines < fit.lines && tighter.size === size) { fit = tighter; break; }
        }
      }
      const fitted = style.balance ? balanceLines(fit.text) : fit.text;
      items.push({ role: name, text: fitted, size: fit.size, lines: fit.lines, height: Math.round(fit.size * lineHeight * fit.lines), spacing, weight });
    });
  };
  role('headline', text.headline, L.headline, 1.28, 2, 'bold');
  role('hero', text.hero, L.hero, 1.22, 4, 'bold');
  role('sub', text.sub, Math.round(L.small * 1.3), 1.4, 3, 'regular');
  const gap = Math.round(L.H * 0.012);
  const logoGap = logo ? Math.round(L.H * 0.03) : 0;
  const textHeight = items.reduce((sum, item) => sum + item.height, 0) + Math.max(0, items.length - 1) * gap;
  const total = textHeight + (logo ? logo.height + logoGap : 0);
  const safe = safeArea(L);
  const top = safe.top;
  const bottom = bottomLimit ?? L.H - safe.bottom;
  let y = style.position === 'top' ? top : style.position === 'bottom' ? bottom - total : Math.round((top + bottom) / 2 - total / 2);
  y = Math.round(y + (style.offsetY || 0) * L.H);
  const elements = [];
  const align = style.align || 'centre';
  const colors = { headline: style.headlineColor || theme.headline, hero: style.heroColor || theme.hero, sub: style.subColor || theme.sub };
  const glowColor = theme.glow;
  if (logo && logoPlacement === 'above') {
    const x = align === 'left' ? L.margin : align === 'right' ? L.W - L.margin - logo.width : Math.round((L.W - logo.width) / 2);
    elements.push({ group: 0, element: { type: 'logo', x, y, width: logo.width, glow: true } });
    y += logo.height + logoGap;
  }
  items.forEach((item, index) => {
    const glow = item.role === 'hero' && style.glow !== false && Boolean(glowColor);
    elements.push({ group: index, element: { type: 'text', text: item.text, x: L.margin, y, width, size: item.size, weight: item.weight, align, letterSpacing: item.spacing, ...fill(colors[item.role]), glow, ...(glow && glowColor !== '#1e90ff' ? { glowColor } : {}) } });
    y += item.height + gap;
  });
  if (logo && logoPlacement === 'below') {
    const x = align === 'left' ? L.margin : align === 'right' ? L.W - L.margin - logo.width : Math.round((L.W - logo.width) / 2);
    elements.push({ group: Math.max(0, items.length - 1), element: { type: 'logo', x, y: y + logoGap - gap, width: logo.width, glow: true } });
  }
  const first = elements[0]?.element;
  const blockTop = first ? first.y : null;
  return { elements, groups: Math.max(1, items.length), chars: items.reduce((sum, item) => sum + item.text.length, 0) * CHAR_EM, bounds: first ? { top: blockTop, bottom: y + (logo && logoPlacement === 'below' ? logo.height + logoGap : 0) - gap } : null };
}

// ---------------------------------------------------------------- automatic image layout (slots)
const frameOf = (image) => (image.height / image.width > 1.2 ? 'phone' : 'tablet');
const bezelShare = (frame) => (frame === 'phone' ? 0.04 : frame === 'tablet' ? 0.03 : 0);
// Height of a framed image per unit of width (bezel on both sides).
const heightPerWidth = (image, frame) => { const b = bezelShare(frame); return (image.height / image.width) * (1 - 2 * b) + 2 * b; };
function badgeHeight(L) { return Math.round(L.H * (L.W > L.H ? 0.12 : L.W === L.H ? 0.1 : 0.085)); }
// Room the badges of a segment need under the text, so the text can make space for them.
function slotReserve(beat, L, images) {
  const badges = (beat.images || []).filter((placed) => placed.slot === 'badge' && images?.get(placed.imageId));
  return badges.length ? badgeHeight(L) + Math.round(L.H * 0.05) : 0;
}
function slotElements(beat, L, images, bounds) {
  const safe = safeArea(L);
  const placed = (beat.images || []).filter((item) => item.slot);
  if (!placed.length) return [];
  const regionTop = bounds ? bounds.bottom + Math.round(L.H * 0.045) : safe.top;
  const regionBottom = L.H - safe.bottom;
  const regionWidth = L.W - 2 * L.margin;
  const out = [];
  const image = (item) => { const found = images?.get(item.imageId); if (!found) throw new Error('An image in this storyboard is no longer in the image library.'); return found; };
  const element = (item, found, frame, x, y, width) => {
    const bezel = frame === 'none' ? 0 : Math.max(6, Math.round(width * bezelShare(frame)));
    const height = Math.round((width - 2 * bezel) * (found.height / found.width) + 2 * bezel);
    return { type: 'image', url: found.url, x: Math.round(x), y: Math.round(y), width: Math.round(width), height, frame, radius: frame === 'none' ? 0 : 0, shadow: frame !== 'none' || item.shadow === true };
  };
  // Badges sit centred just under the text.
  let badgeBottom = regionTop;
  for (const item of placed.filter((entry) => entry.slot === 'badge').slice(0, 2)) {
    const found = image(item);
    const height = badgeHeight(L);
    const width = Math.min(regionWidth * 0.6, height * (found.width / found.height));
    const y = Math.min(badgeBottom, regionBottom - width * (found.height / found.width));
    out.push(element(item, found, 'none', (L.W - width) / 2, y, width));
    badgeBottom = y + width * (found.height / found.width) + Math.round(L.H * 0.03);
  }
  const top = out.length ? badgeBottom : regionTop;
  const regionHeight = Math.max(80, regionBottom - top);
  // App screenshots: one device, or a tablet with a phone in front of its right edge, as large as the space allows.
  const devices = placed.filter((entry) => entry.slot === 'devices').slice(0, 2).map((item) => ({ item, found: image(item) }));
  if (devices.length) {
    devices.sort((a, b) => (frameOf(a.found) === 'tablet' ? -1 : 0) - (frameOf(b.found) === 'tablet' ? -1 : 0));
    const cap = L.H * 0.78;
    if (devices.length === 1) {
      const { item, found } = devices[0];
      const frame = frameOf(found);
      const k = heightPerWidth(found, frame);
      const height = Math.min(regionHeight, cap, regionWidth * 0.9 * k);
      const width = height / k;
      out.push(element(item, found, frame, (L.W - width) / 2, top + (regionHeight - height) / 2, width));
    } else {
      const [back, front] = devices;
      const backFrame = frameOf(back.found), frontFrame = frameOf(front.found);
      const kb = heightPerWidth(back.found, backFrame), kf = heightPerWidth(front.found, frontFrame);
      const frontShare = 0.86, overlap = 0.35;
      const groupWidthPerHeight = 1 / kb + (1 - overlap) * frontShare / kf;
      const height = Math.min(regionHeight / 1.03, cap, (regionWidth * 0.94) / groupWidthPerHeight);
      const backWidth = height / kb, frontWidth = (height * frontShare) / kf;
      const left = (L.W - (backWidth + (1 - overlap) * frontWidth)) / 2;
      const y0 = top + (regionHeight - height * 1.03) / 2;
      out.push(element(back.item, back.found, backFrame, left, y0, backWidth));
      out.push(element(front.item, front.found, frontFrame, left + backWidth - overlap * frontWidth, y0 + height * 1.03 - height * frontShare, frontWidth));
    }
  }
  // Artwork, posters, photos and logos: contained in the space left, centred.
  for (const item of placed.filter((entry) => entry.slot === 'feature').slice(0, 1)) {
    const found = image(item);
    const ratio = found.height / found.width;
    const width = Math.min(regionWidth * 0.8, (regionHeight * 0.92) / ratio);
    out.push(element(item, found, 'none', (L.W - width) / 2, top + (regionHeight - width * ratio) / 2, width));
  }
  return out;
}

function lowerThirdFor(clip, L, theme, { fitText, CHAR_EM }) {
  const label = clip.label || '';
  if (!label) return [];
  const width = L.W - 2 * L.margin - 40;
  const title = fitText(label.toUpperCase(), L.label, width, { maxLines: 2, minSize: 30, spacing: 1 });
  const sub = clip.labelSub || 'NOW STREAMING FREE ON PROtv';
  const longest = Math.max(...title.text.split('\n').map((line) => line.length * title.size * CHAR_EM), sub.length * L.small * 0.6);
  const plateHeight = Math.round(title.size * 1.25 * title.lines + L.small * 1.2 + 36);
  return [
    { type: 'gradient', x: 0, y: L.lowerThirdY - 60, width: L.W, height: L.H - (L.lowerThirdY - 60), from: '#000000', to: '#000000', fromOpacity: 0, toOpacity: 0.65, vertical: true },
    { type: 'rect', x: L.margin - 14, y: L.lowerThirdY - 18, width: Math.min(L.W - 2 * L.margin + 28, Math.round(longest + 90)), height: plateHeight, color: '#03060d', opacity: 0.62, radius: 10 },
    { type: 'rect', x: L.margin, y: L.lowerThirdY, width: 10, height: Math.round(title.size * 1.25 * title.lines + L.small * 1.2), color: theme.accent, opacity: 1 },
    { type: 'text', text: title.text, x: L.margin + 34, y: L.lowerThirdY - 4, width, size: title.size, fill: 'white', align: 'left', letterSpacing: 1 },
    { type: 'text', text: sub, x: L.margin + 36, y: Math.round(L.lowerThirdY + title.size * 1.25 * title.lines), width, size: L.small, weight: 'regular', fill: 'silver', align: 'left', letterSpacing: 2, shadow: true },
  ];
}

function bugFor(L, branding) {
  const width = Math.round(L.bug * (branding.bugScale ?? 1));
  const height = Math.round(width * LOGO_RATIO);
  const pad = Math.round(L.margin * 0.6);
  const safe = safeArea(L);
  const right = branding.bugPosition.endsWith('right');
  const top = branding.bugPosition.startsWith('top');
  return { type: 'logo', x: right ? L.W - L.margin - width : L.margin, y: top ? (L.W > L.H ? pad : safe.top) : (L.W > L.H ? L.H - pad - height : L.H - safe.bottom - height), width, glow: false };
}

// Shots and overlay layers of a styled commercial for one format.
function styledComposition(commercial, beats, L, format, { videos, tokens, helpers }) {
  const theme = sanitizeTheme(commercial.theme || {});
  const branding = sanitizeBranding(commercial.branding || (commercial.brandBug === false ? { bug: false } : {}));
  const shots = [];
  const layers = [];
  for (const beat of beats) {
    const style = beat.style || {};
    if (beat.kind !== 'footage') {
      shots.push({ kind: 'card', durationSeconds: beat.durationSeconds, colors: style.background || theme.background });
    } else {
      for (const clip of clipsOf(beat)) {
        const video = videos.get(clip.videoId);
        if (!video?.muxPlaybackId) throw new Error(`${clip.sourceTitle || clip.videoId} has no playable source.`);
        const token = tokens.get(clip.videoId);
        shots.push({
          kind: 'footage', playbackId: token ? token.playbackId : video.muxPlaybackId, ...(token ? { token: token.token } : {}),
          startSeconds: clip.startSeconds, durationSeconds: clip.durationSeconds, framing: clip.framing || 'fill',
          focusX: format === 'widescreen' ? 0.5 : (clip.focusX ?? 0.5), pushIn: 0.05, fadeIn: 0, fadeOut: 0,
          provenance: { videoId: video.id, title: video.title || '', basis: clip.rightsBasis || '' },
        });
      }
    }
    // Text window and animation.
    const animation = ANIMATIONS[style.animation] || ANIMATIONS.fade;
    const windowStart = Math.round((beat.start + (style.textIn || 0)) * 1000) / 1000;
    const windowEnd = Math.round((beat.end - (style.textOut || 0)) * 1000) / 1000;
    const clips = clipsOf(beat);
    const labelled = beat.kind === 'footage' && clips.some((clip) => clip.label);
    const reserve = slotReserve(beat, L, helpers.images);
    const limit = labelled ? L.lowerThirdY - 40 : undefined;
    const block = textBlock(beat, L, theme, { ...helpers, bottomLimit: reserve ? Math.min(limit ?? L.H - safeArea(L).bottom, L.H - safeArea(L).bottom - reserve) : limit });
    const motion = animation.motion ? { dx: Math.round(animation.motion.dx * L.W), dy: Math.round(animation.motion.dy * L.H) } : null;
    if (beat.kind === 'footage' && block.elements.length && (style.shade ?? 0.5) > 0) {
      layers.push({ start: beat.start, end: beat.end, fade: 0.18, elements: [{ type: 'gradient', x: 0, y: 0, width: L.W, height: L.H, from: '#000000', to: '#000000', fromOpacity: Math.min(0.9, (style.shade ?? 0.5) * 0.6), toOpacity: style.shade ?? 0.5, vertical: true }] });
    }
    if (block.elements.length) {
      const groups = style.reveal === 'stagger' ? block.groups : 1;
      const span = windowEnd - windowStart;
      for (let group = 0; group < groups; group += 1) {
        const start = groups === 1 ? windowStart : Math.round((windowStart + (span * 0.6 * group) / Math.max(1, groups - 1)) * 1000) / 1000;
        const elements = block.elements.filter((item) => (groups === 1 ? true : item.group === group)).map((item) => item.element);
        if (elements.length && windowEnd - start > 0.2) layers.push({ start, end: windowEnd, fade: Math.min(animation.fade, (windowEnd - start) / 2), ...(motion ? { motion } : {}), elements });
      }
    }
    // Image layers share the segment's text timing and animation.
    const slotted = slotElements(beat, L, helpers.images, block.bounds);
    if (slotted.length && windowEnd - windowStart > 0.2) layers.push({ start: windowStart, end: windowEnd, fade: Math.min(animation.fade, (windowEnd - windowStart) / 2), ...(motion ? { motion } : {}), elements: slotted });
    for (const placed of (beat.images || []).filter((item) => !item.slot)) {
      const image = helpers.images?.get(placed.imageId);
      if (!image) throw new Error('An image in this storyboard is no longer in the image library.');
      const width = Math.round(placed.width * L.W);
      const bezel = placed.frame === 'phone' ? Math.max(6, Math.round(width * 0.04)) : placed.frame === 'tablet' ? Math.max(6, Math.round(width * 0.03)) : 0;
      const height = Math.round((width - 2 * bezel) * (image.height / image.width) + 2 * bezel);
      const element = { type: 'image', url: image.url, x: Math.round(placed.x * L.W - width / 2), y: Math.round(placed.y * L.H - height / 2), width, height, frame: placed.frame, radius: 0, shadow: placed.shadow };
      if (windowEnd - windowStart > 0.2) layers.push({ start: windowStart, end: windowEnd, fade: Math.min(animation.fade, (windowEnd - windowStart) / 2), ...(motion ? { motion } : {}), elements: [element] });
    }
    // A creator excerpt's title stays on screen for the whole clip (agreement condition).
    if (beat.kind === 'footage') {
      let clipAt = beat.start;
      for (const clip of clips) {
        const elements = lowerThirdFor(clip, L, theme, helpers);
        const end = Math.round((clipAt + clip.durationSeconds) * 1000) / 1000;
        if (elements.length) layers.push({ start: Math.round(clipAt * 1000) / 1000, end, fade: 0.12, elements });
        clipAt = end;
      }
      if (branding.bug) layers.push({ start: beat.start, end: beat.end, fade: 0, elements: [bugFor(L, branding)] });
    }
  }
  return { shots, layers };
}

// Music level is applied through the loudness target. LIVE masters stay within ATSC A/85 tolerance (−24 ±2 LKFS).
function loudnessFor(destination, music, LOUDNESS) {
  const base = destination === 'live' ? LOUDNESS.live : LOUDNESS.social;
  const level = clamp(music?.level, 0.5, 1, 1);
  const offset = Math.round(20 * Math.log10(level) * 10) / 10;
  const integrated = destination === 'live' ? Math.max(base.integrated - 2, base.integrated + offset) : base.integrated + offset;
  return { integrated: Math.round(integrated * 10) / 10, truePeak: base.truePeak };
}

module.exports = {
  BRAND_THEME, ANIMATIONS, POSITIONS, ALIGNS, REVEALS, LOGO_PLACEMENTS, BUG_POSITIONS, MUSIC_MOODS, KINDS, NAMED_FILLS,
  DesignError, sanitizeImages, isStyled, clipsOf, footageShots, sanitizeTheme, sanitizeBranding, sanitizeMusic, sanitizeStyle, sanitizeText, sanitizeStoryboard,
  placeholders, safeArea, styledComposition, loudnessFor, textBlock, slotReserve, SLOTS,
};

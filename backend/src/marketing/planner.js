// Marketing Studio planner: turns a commercial's storyboard into a script, captions and one render plan per format.
// Horizontal and vertical are separate compositions (text sizes, positions, safe areas and the framing point of each
// shot), never a blind crop. The render plan is executed by the portal worker (server/marketingRender.ts).
const crypto = require('node:crypto');
const design = require('./design');

const FPS = 30;
const FORMATS = Object.freeze({
  widescreen: { width: 1920, height: 1080, label: '16:9 (PROtv LIVE / YouTube)' },
  vertical: { width: 1080, height: 1920, label: '9:16 (Reels, TikTok, Shorts)' },
  square: { width: 1080, height: 1080, label: '1:1 (feed)' },
});
// LIVE masters follow U.S. broadcast loudness (ATSC A/85, -24 LKFS); social exports match platform normalization.
const LOUDNESS = Object.freeze({ live: { integrated: -24, truePeak: -2 }, social: { integrated: -14, truePeak: -1.5 } });
const BRAND = Object.freeze({
  name: 'PROtv', url: 'WATCHPROTV.COM', site: 'https://watchprotv.com',
  colors: { night: '#03060d', deep: '#0a1a3a', blue: '#1e90ff', electric: '#2aa8ff', silver: '#c9d1dc' },
  taglines: ['YOUR NEXT FAVORITE MOVIE IS FREE', 'NOW STREAMING ON PROtv', 'WATCH FREE AT WATCHPROTV.COM', 'TONIGHT ON PROtv LIVE', 'NEW EPISODE', 'COMING SOON', 'PROtv PRESENTS', 'SPONSORED BY'],
});
const TONES = ['cinematic', 'network', 'energetic', 'suspense', 'comedy', 'documentary', 'family', 'corporate'];
const MOOD_FOR_TONE = { cinematic: 'cinematic', network: 'cinematic', energetic: 'energetic', suspense: 'suspense', comedy: 'energetic', documentary: 'warm', family: 'warm', corporate: 'corporate' };

const round3 = (value) => Math.round(value * 1000) / 1000;
const frames = (seconds) => Math.round(seconds * FPS);

// Safe areas: vertical social apps cover the bottom ~18% and the right edge with their own controls.
function layout(format) {
  const { width: W, height: H } = FORMATS[format];
  if (format === 'vertical') {
    return { W, H, margin: 72, headline: 104, hero: 150, label: 58, small: 38, lowerThirdY: 1290, centreY: 700, logoWide: 860, bug: 150, word: 150 };
  }
  if (format === 'square') return { W, H, margin: 64, headline: 78, hero: 118, label: 48, small: 32, lowerThirdY: 820, centreY: 360, logoWide: 760, bug: 130, word: 130 };
  return { W, H, margin: 96, headline: 92, hero: 150, label: 56, small: 34, lowerThirdY: 850, centreY: 330, logoWide: 1100, bug: 170, word: 150 };
}


// Bold Noto Sans averages ~0.64 em per capital; used to wrap and fit text before it is drawn.
const CHAR_EM = 0.64;
function fitText(text, size, width, { maxLines = 2, minSize = 28, spacing = 0 } = {}) {
  const words = String(text).split(/\s+/).filter(Boolean);
  for (let current = size; current >= minSize; current -= 2) {
    const perLine = Math.max(1, Math.floor(width / (current * CHAR_EM + spacing)));
    const lines = [];
    for (const word of words) {
      const last = lines[lines.length - 1];
      if (last && (last + ' ' + word).length <= perLine) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    if (lines.length <= maxLines && lines.every((line) => line.length <= perLine)) return { text: lines.join('\n'), size: current, lines: lines.length };
  }
  return { text: words.join(' '), size: minSize, lines: maxLines };
}

// ---- Overlay elements for each beat (format-aware) ----
function headlineLayer(beat, L) {
  const width = L.W - 2 * L.margin;
  const items = [{ type: 'gradient', x: 0, y: 0, width: L.W, height: L.H, from: '#000000', to: '#000000', fromOpacity: 0.15, toOpacity: 0.7, vertical: true }];
  const head = beat.text?.headline ? fitText(beat.text.headline, L.headline, width, { maxLines: 2, spacing: 2 }) : null;
  const hero = beat.text?.hero ? fitText(beat.text.hero, L.hero, width, { maxLines: 2, spacing: 4 }) : null;
  const sub = beat.text?.sub ? fitText(beat.text.sub, Math.round(L.small * 1.3), width, { maxLines: 2 }) : null;
  const heights = [head && head.size * 1.28 * head.lines, hero && hero.size * 1.22 * hero.lines, sub && sub.size * 1.4 * sub.lines].filter(Boolean);
  let y = Math.round(L.centreY - heights.reduce((a, b) => a + b, 0) / 2 + (L.W > L.H ? 0 : 120));
  if (head) { items.push({ type: 'text', text: head.text, x: L.margin, y, width, size: head.size, fill: 'silver', align: 'centre', letterSpacing: 2 }); y += Math.round(head.size * 1.28 * head.lines); }
  if (hero) { items.push({ type: 'text', text: hero.text, x: L.margin, y, width, size: hero.size, fill: 'blue', glow: true, align: 'centre', letterSpacing: 4 }); y += Math.round(hero.size * 1.22 * hero.lines); }
  if (sub) items.push({ type: 'text', text: sub.text, x: L.margin, y, width, size: sub.size, weight: 'regular', fill: 'white', align: 'centre', letterSpacing: 3 });
  return items;
}
function lowerThird(beat, L) {
  const label = beat.label || '';
  if (!label) return [];
  const width = L.W - 2 * L.margin - 40;
  const title = fitText(label.toUpperCase(), L.label, width, { maxLines: 2, minSize: 30, spacing: 1 });
  const sub = beat.labelSub || 'NOW STREAMING FREE ON PROtv';
  const longest = Math.max(...title.text.split('\n').map((line) => line.length * title.size * CHAR_EM), sub.length * L.small * 0.6);
  const plateHeight = Math.round(title.size * 1.25 * title.lines + L.small * 1.2 + 36);
  return [
    { type: 'gradient', x: 0, y: L.lowerThirdY - 60, width: L.W, height: L.H - (L.lowerThirdY - 60), from: '#000000', to: '#000000', fromOpacity: 0, toOpacity: 0.65, vertical: true },
    // A dark plate keeps the title readable over bright footage.
    { type: 'rect', x: L.margin - 14, y: L.lowerThirdY - 18, width: Math.min(L.W - 2 * L.margin + 28, Math.round(longest + 90)), height: plateHeight, color: '#03060d', opacity: 0.62, radius: 10 },
    { type: 'rect', x: L.margin, y: L.lowerThirdY, width: 10, height: Math.round(title.size * 1.25 * title.lines + L.small * 1.2), color: '#1e90ff', opacity: 1 },
    { type: 'text', text: title.text, x: L.margin + 34, y: L.lowerThirdY - 4, width, size: title.size, fill: 'white', align: 'left', letterSpacing: 1 },
    { type: 'text', text: sub, x: L.margin + 36, y: Math.round(L.lowerThirdY + title.size * 1.25 * title.lines), width, size: L.small, weight: 'regular', fill: 'silver', align: 'left', letterSpacing: 2, shadow: true },
  ];
}
function wordLayer(beat, L) {
  if (!beat.text?.word) return [];
  return [
    { type: 'gradient', x: 0, y: 0, width: L.W, height: L.H, from: '#000000', to: '#000000', fromOpacity: 0.55, toOpacity: 0.25, vertical: true },
    ((word) => ({ type: 'text', text: word.text, x: L.margin, y: Math.round(L.centreY + (L.W > L.H ? 40 : 160) - (word.lines - 1) * word.size * 0.6), width: L.W - 2 * L.margin, size: word.size, fill: 'silver', align: 'centre', letterSpacing: 6 }))(fitText(beat.text.word, L.word, L.W - 2 * L.margin, { maxLines: 2, spacing: 6 })),
  ];
}
function logoLayer(beat, L) {
  const width = L.logoWide;
  const height = Math.round(width * 941 / 1672);
  const y = Math.round(L.H / 2 - height / 2 - (beat.text?.sub ? L.small * 1.5 : 0));
  const items = [{ type: 'logo', x: Math.round((L.W - width) / 2), y, width, glow: true }];
  if (beat.text?.sub) items.push({ type: 'text', text: beat.text.sub, x: L.margin, y: y + height + 10, width: L.W - 2 * L.margin, size: L.small * 1.35, weight: 'regular', fill: 'silver', align: 'centre', letterSpacing: 5 });
  return items;
}
function ctaLayer(beat, L) {
  const logoWidth = Math.round(L.logoWide * 0.42);
  const logoHeight = Math.round(logoWidth * 941 / 1672);
  const top = Math.round(L.H / 2 - (logoHeight + L.headline * 0.9 + L.hero * 1.2) / 2);
  return [
    { type: 'logo', x: Math.round((L.W - logoWidth) / 2), y: top, width: logoWidth, glow: true },
    { type: 'text', text: beat.text?.headline || 'WATCH FREE AT', x: L.margin, y: top + logoHeight + 10, width: L.W - 2 * L.margin, size: Math.round(L.headline * 0.8), fill: 'silver', align: 'centre', letterSpacing: 4 },
    { type: 'text', text: beat.text?.hero || BRAND.url, x: L.margin / 2, y: top + logoHeight + 10 + L.headline * 1.05, width: L.W - L.margin, size: Math.round(L.hero * (L.W > L.H ? 0.8 : 0.62)), fill: 'blue', glow: true, align: 'centre', letterSpacing: 2 },
  ];
}
function bugLayer(L) {
  return [{ type: 'logo', x: L.W - L.margin - L.bug, y: L.margin * 0.6, width: L.bug, glow: false }];
}

// ---- Storyboard → script, captions, render plans ----
function timeline(storyboard) {
  let at = 0;
  return storyboard.map((beat) => {
    const start = round3(at);
    at += beat.durationSeconds;
    return { ...beat, start, end: round3(at) };
  });
}

function pictureOf(beat) {
  if (beat.kind === 'footage') return design.clipsOf(beat).map((clip) => `${clip.sourceTitle || clip.videoId} at ${Math.round(clip.startSeconds)} s`).join(' + ');
  if (beat.kind === 'logo') return 'Official PROtv logo reveal';
  if (beat.kind === 'cta') return beat.style?.logo === 'none' ? 'Call-to-action card' : 'Call-to-action card with the official PROtv logo';
  return beat.style?.logo && beat.style.logo !== 'none' ? 'Branded card with the PROtv logo' : 'Branded card';
}
function scriptFor(commercial) {
  return timeline(commercial.storyboard).map((beat) => ({
    start: beat.start, end: beat.end, purpose: beat.purpose || '',
    picture: pictureOf(beat),
    onScreen: [beat.text?.headline, beat.text?.hero, beat.text?.word, beat.label, beat.text?.sub].filter(Boolean).join(' / '),
    narration: beat.narration || '',
  }));
}

// Burned-in and sidecar captions: on-screen messages (there is no dialogue in a montage), timed to the beats.
function captionsFor(commercial) {
  return timeline(commercial.storyboard).filter((beat) => beat.narration || beat.text?.headline || beat.text?.word || beat.text?.hero)
    .map((beat) => ({ start: beat.start, end: beat.end, text: beat.narration || [beat.text?.headline, beat.text?.hero, beat.text?.word].filter(Boolean).join(' ') }));
}
function srt(captions) {
  const stamp = (seconds) => {
    const ms = Math.round(seconds * 1000);
    const pad = (value, size = 2) => String(value).padStart(size, '0');
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return captions.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join('\n');
}

function renderPlan(commercial, format, { destination = 'social', videos = new Map(), tokens = new Map() } = {}) {
  if (!FORMATS[format]) throw new Error(`Unknown format ${format}.`);
  const L = layout(format);
  const beats = timeline(commercial.storyboard);
  const total = round3(beats.reduce((sum, beat) => sum + beat.durationSeconds, 0));
  if (frames(total) !== total * FPS && Math.abs(frames(total) / FPS - total) > 1e-6) throw new Error('The storyboard must land on whole frames.');
  if (design.isStyled(commercial)) {
    const { shots, layers } = design.styledComposition(commercial, beats, L, format, { videos, tokens, helpers: { fitText, CHAR_EM } });
    const music = design.sanitizeMusic(commercial.music || {});
    const logo = beats.find((beat) => beat.kind === 'logo' || beat.kind === 'cta');
    const body = {
      title: `${commercial.title} (${FORMATS[format].label})`, format, durationSeconds: total, shots, layers,
      music: { kind: music.kind, mood: music.mood, bpm: music.bpm, impacts: beats.filter((beat) => beat.impact).map((beat) => beat.start).slice(0, 12), riseTo: logo ? logo.start : null },
      loudness: design.loudnessFor(destination, music, LOUDNESS),
    };
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
    return { id: `${commercial.id}-${format}-${fingerprint}`, ...body };
  }
  const shots = beats.map((beat) => {
    if (beat.kind !== 'footage') return { kind: 'card', durationSeconds: beat.durationSeconds, colors: [BRAND.colors.night, BRAND.colors.deep] };
    const video = videos.get(beat.videoId);
    if (!video?.muxPlaybackId) throw new Error(`${beat.sourceTitle || beat.videoId} has no playable source.`);
    const token = tokens.get(beat.videoId);
    return {
      kind: 'footage', playbackId: token ? token.playbackId : video.muxPlaybackId, ...(token ? { token: token.token } : {}),
      startSeconds: beat.startSeconds, durationSeconds: beat.durationSeconds, framing: beat.framing || 'fill',
      focusX: format === 'widescreen' ? 0.5 : (beat.focusX ?? 0.5), pushIn: beat.pushIn ?? 0.05,
      fadeIn: beat.fadeIn ?? 0, fadeOut: beat.fadeOut ?? 0,
      provenance: { videoId: video.id, title: video.title || '', basis: beat.rightsBasis || '' },
    };
  });
  const layers = [];
  for (const beat of beats) {
    const span = { start: beat.start, end: beat.end, fade: beat.textFade ?? 0.18 };
    let elements = [];
    if (beat.kind === 'logo') elements = logoLayer(beat, L);
    else if (beat.kind === 'cta') elements = ctaLayer(beat, L);
    else if (beat.text?.word) elements = [...wordLayer(beat, L), ...lowerThird(beat, L)];
    else if (beat.text?.headline || beat.text?.hero) elements = headlineLayer(beat, L);
    else elements = lowerThird(beat, L);
    if (beat.kind === 'footage' && commercial.brandBug !== false) elements = [...elements, ...bugLayer(L)];
    if (elements.length) layers.push({ ...span, elements });
  }
  const impacts = beats.filter((beat) => beat.impact).map((beat) => beat.start);
  const logo = beats.find((beat) => beat.kind === 'logo');
  const body = {
    title: `${commercial.title} (${FORMATS[format].label})`, format, durationSeconds: total, shots, layers,
    music: { kind: commercial.music?.kind || 'generated', mood: commercial.music?.mood || MOOD_FOR_TONE[commercial.tone] || 'cinematic', bpm: commercial.music?.bpm || 120, impacts, riseTo: logo ? logo.start : null },
    loudness: destination === 'live' ? LOUDNESS.live : LOUDNESS.social,
  };
  // The job ID is a fingerprint of the whole plan (picture, overlays, music, loudness): an identical plan is never
  // rendered twice, and any change (including a layout improvement) gets its own render.
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { id: `${commercial.id}-${format}-${fingerprint}`, ...body };
}

// ---- Templates ----
// "Your Next Favorite Movie Is FREE": the network spot. Footage beats are chosen by the Administrator or the agent from
// cleared titles; this fixes the structure (0-4 hook, 4-15 highlights, 15-23 variety, 23-27 logo, 27-30 call to action).
function networkFreeStoryboard(picks) {
  const [hook, ...rest] = picks;
  const highlights = rest.slice(0, 6);
  const variety = rest.slice(6, 10);
  const words = ['MOVIES', 'SERIES', 'INDEPENDENT VOICES', 'PROtv LIVE'];
  return [
    { ...hook, kind: 'footage', durationSeconds: 4, purpose: 'Hook', text: { headline: 'YOUR NEXT FAVORITE MOVIE', hero: 'IS FREE' }, label: '', fadeIn: 0.4, pushIn: 0.06, impact: false },
    ...highlights.map((pick, index) => ({ ...pick, kind: 'footage', durationSeconds: index === highlights.length - 1 ? 11 - 1.8 * (highlights.length - 1) : 1.8, purpose: 'Highlights', label: pick.sourceTitle, titleOnScreen: true, impact: index === 0 })),
    ...variety.map((pick, index) => ({ ...pick, kind: 'footage', durationSeconds: 2, purpose: 'Variety', text: { word: words[index] }, label: pick.sourceTitle, titleOnScreen: true, ...(index === 3 ? { labelSub: 'ON PROtv LIVE · 24/7 · FREE' } : {}), impact: index === 0 })),
    { kind: 'logo', durationSeconds: 4, purpose: 'Logo reveal', text: { sub: 'FREE MOVIES · SERIES · LIVE TV' }, impact: true },
    { kind: 'cta', durationSeconds: 3, purpose: 'Call to action', text: { headline: 'WATCH FREE AT', hero: BRAND.url } },
  ];
}

// A single title's spot: hook on the title, three scenes, title card with availability, call to action.
function titleSpotStoryboard(video, picks, { durationSeconds = 30, line = 'NOW STREAMING FREE', airing = null } = {}) {
  const tail = 4 + 3;
  const body = durationSeconds - tail;
  const each = round3(Math.floor((body / picks.length) * FPS) / FPS);
  const beats = picks.map((pick, index) => ({ ...pick, kind: 'footage', durationSeconds: index === picks.length - 1 ? round3(body - each * (picks.length - 1)) : each, label: video.title, titleOnScreen: true, purpose: index === 0 ? 'Hook' : 'Scenes', impact: index === 0, ...(index === 0 ? { text: { headline: 'PROtv PRESENTS', hero: video.title.toUpperCase() } } : {}) }));
  return [
    ...beats,
    { kind: 'logo', durationSeconds: 4, purpose: 'Title card', text: { sub: airing ? `TONIGHT ON PROtv LIVE · ${airing}` : line }, impact: true },
    { kind: 'cta', durationSeconds: 3, purpose: 'Call to action', text: { headline: 'WATCH FREE AT', hero: BRAND.url } },
  ];
}

module.exports = { fitText, FPS, FORMATS, LOUDNESS, BRAND, TONES, MOOD_FOR_TONE, layout, timeline, scriptFor, captionsFor, srt, renderPlan, networkFreeStoryboard, titleSpotStoryboard };

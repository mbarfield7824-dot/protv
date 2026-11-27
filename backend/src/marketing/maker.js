// Commercial Maker: one natural-language prompt → a professionally designed, ready-to-review commercial.
//
// The AI is the creative director: concept, copy, structure, the visual approach of each segment (graphics, product
// screenshots, artwork, footage or a mix), music, pacing and energy. This module is the art director and the rules:
// it validates the AI's plan, keeps every claim factual, picks footage moments from measured frames, chooses
// transitions, colours and text sizes, lays images out for every format, and never lets the AI touch rights.
// Rights (cleared titles, excerpt windows, on-screen titles) are enforced by the existing rights module afterwards.
const design = require('./design');
const planner = require('./planner');

// Pay-per-use rates of the AI provider configured on the Creator Portal (the portal's AI_PRICES).
const PRICES = Object.freeze({ inputPerMillion: 0.15, outputPerMillion: 0.6 });
const MONTHLY_CAP_USD = 5;
const MAX_TOKENS = 2800;
const DURATIONS = [15, 30, 60];
const VISUALS = ['card', 'product', 'image', 'footage', 'cta', 'logo'];
const ENERGIES = ['calm', 'build', 'punch'];

const PALETTES = Object.freeze({
  'protv-blue': { label: 'PROtv blue: deep navy, electric blue, white (default, the brand)', theme: { name: 'PROtv blue', background: ['#02040b', '#0b1f52'], headline: '#4fc3ff', hero: '#ffffff', sub: '#d6e6ff', accent: '#1e90ff', glow: '#1e90ff' } },
  'midnight-gold': { label: 'Midnight gold: black and gold, premium, premieres and awards-season feel', theme: { name: 'Midnight gold', background: ['#05040a', '#2a1d05'], headline: 'gold', hero: '#ffffff', sub: '#f3e3b5', accent: '#d4a017', glow: '#d4a017' } },
  'crimson-night': { label: 'Crimson night: black and red, thrillers, horror, urgency', theme: { name: 'Crimson night', background: ['#0a0204', '#4a0710'], headline: '#ff5a5f', hero: '#ffffff', sub: '#ffd6d6', accent: '#e50914', glow: '#e50914' } },
  'warm-harvest': { label: 'Warm harvest: amber and brown, family, gratitude, Thanksgiving', theme: { name: 'Warm harvest', background: ['#2a0e06', '#6e2d0f'], headline: '#f6d28b', hero: '#fff3dc', sub: '#f6d28b', accent: '#e0762f', glow: null } },
  'festive-green': { label: 'Festive: evergreen, red and gold, winter holidays', theme: { name: 'Festive', background: ['#03140b', '#0d3b22'], headline: '#f2c14e', hero: '#ffffff', sub: '#d9f2e3', accent: '#c0392b', glow: '#f2c14e' } },
  'clean-silver': { label: 'Clean silver: graphite and silver, understated, corporate and sponsor spots', theme: { name: 'Clean silver', background: ['#0b0d12', '#2b3140'], headline: 'silver', hero: '#ffffff', sub: '#c9d1de', accent: '#8fa3bf', glow: null } },
});

// What PROtv can truthfully say without the prompt saying it.
const FACTS = [
  'PROtv is free to watch (100% free); no subscription is needed.',
  'PROtv shows ads. Never say "no ads", "ad-free" or "commercial-free".',
  'PROtv LIVE is a free 24/7 channel of movies, series and premieres.',
  'Apps: iPhone and iPad (App Store, "PROtv Streaming"), Android (Google Play), Roku, Amazon Fire TV, and the web at watchprotv.com.',
  'PROtv is NOT on Apple TV and NOT on Samsung TVs yet. Never imply either.',
  'PROtv features independent film, Black cinema, series, documentaries and classic films.',
];
const FACTS_TEXT = FACTS.join(' ').toLowerCase();
const BANNED = [
  { pattern: /\bno\s+ads?\b|\bad[-\s]?free\b|\bcommercial[-\s]?free\b|\bwithout\s+(any\s+)?ads\b|\bzero\s+ads\b/i, why: 'PROtv shows ads, so the copy cannot say it has none.' },
  { pattern: /\bapple\s*tv\b|\btvos\b/i, why: 'PROtv is not available on Apple TV.' },
  { pattern: /\bsamsung\b|\btizen\b/i, why: 'The Samsung app is not available yet.' },
  { pattern: /#\s?1\b|\bnumber\s+one\b|\baward[-\s]winning\b|\bmillions?\s+of\b|\bguarantee/i, why: 'Rankings, awards, audience sizes and guarantees need proof.' },
];

const clampNumber = (value, min, max, fallback) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback);
const str = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const tenth = (value) => Math.round(Number(value) * 10) / 10;
const words = (value) => String(value || '').split(/\s+/).filter(Boolean).length;
const norm = (value) => String(value || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- prompts
function systemPrompt() {
  return [
    'You are the creative director of PROtv, a free streaming network. You turn one request into a finished TV and social commercial plan.',
    'Craft: hook in the first 2 seconds; one idea per segment; copy is short and punchy (hero line 2-6 words, headline kicker 1-4 words, sub line optional and under 10 words); build energy toward the payoff; end on a clear call to action.',
    'Visual approach: decide per segment what serves the message best. "card" = bold typography on brand colour; "product" = app screenshots in device frames; "image" = artwork, poster or photo from the image library; "footage" = clips from cleared titles; "cta" = closing card with logo and optional badge images; "logo" = logo reveal.',
    'Footage is optional: use it only when the commercial is about a title, a premiere or the catalogue, or when the request asks for it. App, announcement, holiday and sponsor spots often work better with graphics, product shots or artwork.',
    'The request\'s explicit instructions always win (wording, length, what to show or avoid).',
    'Truth: use only facts from the request and from the PROtv facts list. Never invent dates, prices, rankings, awards, audience numbers, availability or features. Never use banned claims.',
    'Use only footage titles and image ids from the inventory, written exactly. Badges go in the cta segment; screenshots in product segments.',
    'Durations: segments add up to the commercial length; most segments 2-6 seconds; text-heavy segments need time to read.',
    'Return ONE JSON object, no markdown:',
    '{"title": string, "concept": one sentence, "durationSeconds": 15|30|60, "palette": one palette id, "music": {"mood": "warm|cinematic|energetic|suspense|corporate", "bpm": 70-150}, "approach": "graphics|product|artwork|footage|mixed",',
    ' "segments": [{"purpose": string, "seconds": number, "visual": "card|product|image|footage|cta|logo", "headline": string, "hero": string, "sub": string, "energy": "calm|build|punch", "logo": "none|above|below", "footage": [exact titles] (footage only), "images": [image ids] (product, image, cta only), "alternate": 0}],',
    ' "summary": what you made or changed, one sentence}',
    'To swap the clips of a footage segment during a revision, raise its "alternate" number by 1.',
  ].join('\n');
}

function inventory({ footage, images }) {
  const titles = footage.slice(0, 30).map((item) => `- ${item.title} (${item.contentType === 'EPISODE' ? 'episode' : String(item.contentType || 'title').toLowerCase()}${item.genre ? `, ${item.genre}` : ''})`);
  const library = images.slice(0, 30).map((image) => `- ${image.id}: ${image.name} (${image.kind}, ${image.height > image.width * 1.2 ? 'portrait' : image.width > image.height * 1.2 ? 'landscape' : 'square'})`);
  return [
    'PROtv facts:', ...FACTS.map((fact) => `- ${fact}`),
    'Palettes:', ...Object.entries(PALETTES).map(([id, palette]) => `- ${id}: ${palette.label}`),
    'Cleared footage titles:', ...(titles.length ? titles : ['- (none)']),
    'Image library:', ...(library.length ? library : ['- (none)']),
  ].join('\n');
}

function userPrompt({ request, durationSeconds, footage, images, today, current = null, revision = '', history = [] }) {
  const parts = [`Today: ${today}.`, inventory({ footage, images })];
  if (current) {
    parts.push(`Original request: ${request}`);
    if (history.length) parts.push(`Earlier revisions (oldest first): ${history.map((item) => `"${item}"`).join('; ')}`);
    parts.push(`Current plan: ${JSON.stringify(current)}`);
    parts.push(`Revision request: ${revision}`);
    parts.push('Return the complete updated plan. Keep everything the revision does not ask to change.');
  } else {
    parts.push(`Request: ${request}`);
    parts.push(durationSeconds ? `Length: exactly ${durationSeconds} seconds.` : 'Length: choose 15, 30 or 60 seconds (30 unless the request suggests otherwise).');
  }
  return parts.join('\n\n');
}

function repairPrompt(problems) {
  return `Your plan broke these rules:\n${problems.map((problem) => `- ${problem}`).join('\n')}\nReturn the complete corrected plan as one JSON object.`;
}

// ---------------------------------------------------------------- the AI's plan, validated
class MakerError extends Error { constructor(message) { super(message); this.name = 'MakerError'; } }

function matchTitle(name, footage) {
  const wanted = norm(name);
  if (!wanted) return null;
  return footage.find((item) => norm(item.title) === wanted) || footage.find((item) => norm(item.title).startsWith(wanted) || wanted.startsWith(norm(item.title))) || null;
}

function parsePlan(json, { footage, images }, { durationSeconds = null } = {}) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.segments)) throw new MakerError('The AI did not return a usable plan.');
  const library = new Map(images.map((image) => [image.id, image]));
  const length = DURATIONS.includes(Number(durationSeconds)) ? Number(durationSeconds) : DURATIONS.includes(Number(json.durationSeconds)) ? Number(json.durationSeconds) : 30;
  const segments = json.segments.slice(0, 12).map((raw) => {
    let visual = VISUALS.includes(raw?.visual) ? raw.visual : 'card';
    const segment = {
      purpose: str(raw?.purpose, 60) || visual, seconds: clampNumber(raw?.seconds, 1, 20, 3), visual,
      headline: str(raw?.headline, 80), hero: str(raw?.hero, 100), sub: str(raw?.sub, 120),
      energy: ENERGIES.includes(raw?.energy) ? raw.energy : 'build', logo: ['above', 'below'].includes(raw?.logo) ? raw.logo : 'none',
      alternate: Math.round(clampNumber(raw?.alternate, 0, 10, 0)),
    };
    if (visual === 'footage') {
      const titles = [...new Map((Array.isArray(raw.footage) ? raw.footage : []).map((name) => matchTitle(name, footage)).filter(Boolean).map((item) => [item.id, item])).values()].slice(0, 3);
      if (titles.length) segment.footage = titles.map((item) => item.title); else segment.visual = visual = 'card';
    }
    if (['product', 'image', 'cta'].includes(visual)) {
      const ids = (Array.isArray(raw.images) ? raw.images : []).map(String).filter((id) => library.has(id));
      const kinds = visual === 'product' ? ['screenshot'] : visual === 'cta' ? ['badge', 'logo'] : ['photo', 'logo', 'other', 'badge', 'screenshot'];
      segment.images = ids.filter((id) => kinds.includes(library.get(id).kind)).slice(0, visual === 'cta' ? 1 : 2);
      if (visual === 'product' && !segment.images.length) {
        // A product shot with no screenshot chosen: the library's own screenshots (tablet first, then phone).
        const shots = images.filter((image) => image.kind === 'screenshot').sort((a, b) => (a.height / a.width) - (b.height / b.width));
        segment.images = shots.slice(0, 2).map((image) => image.id);
        if (!segment.images.length) segment.visual = 'card';
      }
      if (visual === 'image' && !segment.images.length) segment.visual = 'card';
    }
    return segment;
  }).filter((segment) => segment.hero || segment.headline || segment.sub || segment.visual !== 'card');
  if (segments.length < 2) throw new MakerError('The AI plan had too few usable segments.');
  return {
    title: str(json.title, 100) || 'PROtv commercial', concept: str(json.concept, 300), durationSeconds: length,
    palette: PALETTES[json.palette] ? json.palette : 'protv-blue',
    music: { mood: design.MUSIC_MOODS.includes(json.music?.mood) ? json.music.mood : 'energetic', bpm: Math.round(clampNumber(json.music?.bpm, 70, 150, 120)) },
    approach: ['graphics', 'product', 'artwork', 'footage', 'mixed'].includes(json.approach) ? json.approach : 'mixed',
    segments, summary: str(json.summary, 300),
  };
}

// Claims the copy makes that PROtv cannot support. Numbers and dates must come from the request or the facts.
function claimProblems(plan, sources) {
  const allowed = `${norm(sources)} ${FACTS_TEXT}`;
  const problems = [];
  for (const [index, segment] of plan.segments.entries()) {
    for (const field of ['headline', 'hero', 'sub']) {
      const value = segment[field];
      if (!value) continue;
      for (const rule of BANNED) if (rule.pattern.test(value)) problems.push(`Segment ${index + 1} says "${value}": ${rule.why}`);
      for (const match of value.matchAll(/(?:([A-Za-z]+)\s+)?(\d[\d,.:/]*%?)/g)) {
        const phrase = norm(match[0]);
        const number = match[2].replace(/[.,]$/, '');
        const ok = allowed.includes(phrase) || (match[1] && /^(at|by|in|on|and|or|the|for|of|to|with)$/i.test(match[1]) && allowed.includes(number)) || (!match[1] && allowed.includes(number));
        if (!ok) problems.push(`Segment ${index + 1} says "${match[0].trim()}", which is not in the request or PROtv's facts.`);
      }
    }
  }
  return [...new Set(problems)];
}

// ---------------------------------------------------------------- timing
const readSeconds = (segment) => Math.min(6, 1.1 + 0.3 * (words(segment.headline) + words(segment.hero) + words(segment.sub)));
function timeSegments(segments, total) {
  const mins = segments.map((segment) => Math.max(1.5, segment.visual === 'footage' ? 2 : readSeconds(segment)));
  let secs = segments.map((segment, index) => Math.max(mins[index], segment.seconds));
  for (let round = 0; round < 8; round += 1) {
    const sum = secs.reduce((a, b) => a + b, 0);
    const diff = total - sum;
    if (Math.abs(diff) < 0.05) break;
    const flexible = secs.map((value, index) => (diff > 0 || value > mins[index] + 0.05 ? index : -1)).filter((index) => index >= 0);
    const pool = flexible.length ? flexible : secs.map((_, index) => index);
    const share = pool.reduce((a, index) => a + secs[index], 0);
    for (const index of pool) secs[index] = Math.max(flexible.length ? mins[index] : 1, secs[index] + diff * (secs[index] / share));
  }
  secs = secs.map(tenth);
  const longest = secs.indexOf(Math.max(...secs));
  secs[longest] = tenth(secs[longest] + (total - secs.reduce((a, b) => a + b, 0)));
  return secs;
}

// ---------------------------------------------------------------- footage moments
// Frame score from Mux thumbnail statistics: detailed, well-exposed frames win; dark, washed-out and flat ones lose.
function frameScore({ luma, spread, sharpness = 0 }) {
  if (luma < 30) return -1;
  const exposure = luma < 55 ? 0.55 : luma > 210 ? 0.5 : luma > 185 ? 0.8 : 1;
  return Math.round((spread + Math.min(20, sharpness) * 1.5) * exposure * 10) / 10;
}
function candidateTimes(item, count = 16) {
  const duration = Number(item.duration) || 0;
  const lo = Math.max(20, duration * 0.05);
  const hi = Math.max(lo + 30, Math.min((Number(item.excerptUntil) || duration * 0.6) - 10, duration * 0.95));
  return Array.from({ length: count }, (_, index) => Math.round(lo + ((hi - lo) * (index + 0.5)) / count));
}

function clipsFor(segment, seconds, { footage, moments, used }) {
  const titles = (segment.footage || []).map((name) => footage.find((item) => item.title === name)).filter(Boolean);
  const count = Math.max(1, Math.min(4, Math.round(seconds / 2.3)));
  const lengths = Array.from({ length: count }, () => tenth(seconds / count));
  lengths[count - 1] = tenth(seconds - lengths.slice(0, -1).reduce((a, b) => a + b, 0));
  return lengths.map((length, index) => {
    const item = titles[index % titles.length];
    const ranked = (moments.get(item.id) || []).filter((moment) => moment.score >= 0);
    const taken = used.get(item.id) || [];
    const free = ranked.filter((moment) => taken.every((time) => Math.abs(time - moment.t) > 40));
    const pick = free[Math.min(free.length - 1, segment.alternate || 0)] || ranked[0] || { t: candidateTimes(item)[4], luma: 90 };
    used.set(item.id, [...taken, pick.t]);
    const limit = (Number(item.excerptUntil) || Number(item.duration)) - length - 1;
    const startSeconds = Math.max(0, Math.min(Math.round(pick.t - length / 2), Math.floor(limit)));
    const clip = { videoId: item.id, sourceTitle: item.title, startSeconds, durationSeconds: length, focusX: 0.5, label: (item.conditions || []).includes('title-on-screen') ? item.title : '' };
    return { clip, luma: pick.luma ?? 90 };
  });
}

// ---------------------------------------------------------------- art direction
const ANIMATION_FOR = { calm: ['slow-fade', 'fade'], build: ['rise', 'fade'], punch: ['slide-left', 'slide-right', 'rise'] };

// Lines that strand one short word ("DECEMBER / 1") read as mistakes.
function strandedLine(text) {
  const lines = String(text).split('\n');
  if (lines.length < 2) return false;
  const last = lines[lines.length - 1].trim();
  const longest = Math.max(...lines.map((line) => line.length));
  return words(last) === 1 && (last.length <= 4 || last.length < longest * 0.4);
}
function textProblems(beat, theme, images) {
  const problems = [];
  for (const format of Object.keys(planner.FORMATS)) {
    const L = planner.layout(format);
    const labelled = beat.kind === 'footage' && (beat.clips || []).some((clip) => clip.label);
    const reserve = design.slotReserve(beat, L, images);
    const limit = labelled ? L.lowerThirdY - 40 : undefined;
    const bottom = L.H - design.safeArea(L).bottom;
    const block = design.textBlock(beat, L, theme, { fitText: planner.fitText, CHAR_EM: 0.64, bottomLimit: reserve ? Math.min(limit ?? bottom, bottom - reserve) : limit });
    for (const { element } of block.elements) if (element.type === 'text' && strandedLine(element.text)) problems.push({ format, text: element.text });
  }
  return problems;
}

function direct(plan, { footage, images, moments }) {
  const palette = PALETTES[plan.palette] || PALETTES['protv-blue'];
  const theme = design.sanitizeTheme(palette.theme);
  const library = new Map(images.map((image) => [image.id, image]));
  const imageSizes = new Map(images.map((image) => [image.id, { width: image.width, height: image.height, url: '' }]));
  const seconds = timeSegments(plan.segments, plan.durationSeconds);
  const used = new Map();
  const checks = [];
  let previous = '';
  const storyboard = plan.segments.map((segment, index) => {
    const options = ANIMATION_FOR[segment.energy] || ANIMATION_FOR.build;
    const animation = options.find((name) => name !== previous) || options[0];
    previous = animation;
    const text = {};
    for (const field of ['headline', 'hero', 'sub']) if (segment[field]) text[field] = segment[field];
    const sentences = String(segment.hero || '').split(/(?<=[.!?])\s+/).filter(Boolean).length;
    const style = { position: 'centre', align: 'centre', offsetY: 0, scale: 1, animation, reveal: sentences > 1 ? 'stagger' : 'together', textIn: 0, textOut: 0, shade: 0.5, glow: true, logo: segment.logo, logoScale: 1 };
    const beat = { kind: 'card', purpose: segment.purpose, text, style, durationSeconds: seconds[index] };
    if (segment.visual === 'logo') beat.kind = 'logo';
    if (segment.visual === 'cta') { beat.kind = 'cta'; if (style.logo === 'none') style.logo = 'above'; }
    if (segment.visual === 'product') { style.position = 'top'; beat.images = (segment.images || []).map((imageId) => ({ imageId, slot: 'devices', x: 0.5, y: 0.5, width: 0.3, frame: 'none', shadow: true })); }
    if (segment.visual === 'image') { style.position = 'top'; beat.images = (segment.images || []).slice(0, 1).map((imageId) => ({ imageId, slot: 'feature', x: 0.5, y: 0.5, width: 0.3, frame: 'none', shadow: true })); }
    if (segment.visual === 'cta' && segment.images?.length) beat.images = segment.images.filter((id) => library.get(id)?.kind === 'badge').slice(0, 1).map((imageId) => ({ imageId, slot: 'badge', x: 0.5, y: 0.8, width: 0.25, frame: 'none', shadow: false }));
    if (segment.visual === 'footage') {
      const picked = clipsFor(segment, seconds[index], { footage, moments, used });
      beat.kind = 'footage';
      beat.clips = picked.map((item) => item.clip);
      delete beat.durationSeconds;
      // Bright pictures get a deeper shade and white type so every word stays readable.
      const brightest = Math.max(...picked.map((item) => item.luma));
      style.shade = brightest > 95 ? 0.72 : 0.55;
      if (brightest > 95 && text.headline) style.headlineColor = '#ffffff';
    }
    if (segment.energy === 'punch') beat.impact = true;
    return beat;
  });
  // Typography: shrink a segment's text until no format strands a word on its own line.
  let adjusted = 0;
  for (const beat of storyboard) {
    for (let step = 0; step < 6 && textProblems(beat, theme, imageSizes).length; step += 1) { beat.style.scale = Math.round((beat.style.scale - 0.06) * 100) / 100; adjusted += 1; }
  }
  const stranded = storyboard.flatMap((beat) => textProblems(beat, theme, imageSizes));
  checks.push(stranded.length ? { level: 'warning', text: `Text still breaks awkwardly in ${[...new Set(stranded.map((item) => item.format))].join(', ')}: "${stranded[0].text.replace(/\n/g, ' / ')}".` } : { level: 'ok', text: `Text fits every format with no stranded words${adjusted ? ' (sizes adjusted automatically)' : ''}.` });
  const clips = storyboard.flatMap((beat) => beat.clips || []);
  checks.push(clips.length
    ? { level: 'ok', text: `Footage: ${clips.length} clip(s) from ${new Set(clips.map((clip) => clip.videoId)).size} cleared title(s), chosen from measured frames (well exposed, detailed); titles labelled on screen where agreements require.` }
    : { level: 'ok', text: 'No show footage: the AI chose graphics, product shots or artwork for this message.' });
  return {
    storyboard, theme, branding: { bug: true, bugPosition: 'top-right', bugScale: 1 },
    music: design.sanitizeMusic({ kind: 'generated', mood: plan.music.mood, bpm: plan.music.bpm, level: 1 }), checks,
  };
}

// Every lower-third title in a render plan names the footage under it (shots land frame-exact; the worker checks the
// montage's frame count), so labels in the finished file match the picture.
function labelCheck(plan) {
  let at = 0;
  const problems = [];
  let labelled = 0;
  for (const shot of plan.shots) {
    const start = Math.round(at * 1000) / 1000;
    const end = Math.round((at + shot.durationSeconds) * 1000) / 1000;
    if (shot.kind === 'footage') {
      const layer = plan.layers.find((item) => Math.abs(item.start - start) < 0.002 && Math.abs(item.end - end) < 0.002 && item.elements.some((element) => element.type === 'rect') && item.elements.some((element) => element.type === 'text'));
      if (layer) {
        labelled += 1;
        const title = layer.elements.find((element) => element.type === 'text').text.replace(/\s+/g, ' ').trim();
        if (norm(title) !== norm(shot.provenance.title)) problems.push(`The title on screen at ${start.toFixed(1)} s says "${title}" but the footage is ${shot.provenance.title}.`);
      }
    }
    at += shot.durationSeconds;
  }
  return { ok: problems.length === 0, labelled, problems };
}

// ---------------------------------------------------------------- cost
const estimateUsd = (promptChars, maxTokens = MAX_TOKENS) => Math.round(((Math.ceil(promptChars / 3.6) / 1e6) * PRICES.inputPerMillion + (maxTokens / 1e6) * PRICES.outputPerMillion) * 1e5) / 1e5;
const actualUsd = (usage) => Math.round((((usage?.promptTokens || 0) / 1e6) * PRICES.inputPerMillion + ((usage?.completionTokens || 0) / 1e6) * PRICES.outputPerMillion) * 1e5) / 1e5;
const monthKey = (date) => new Date(date).toISOString().slice(0, 7);

module.exports = {
  PRICES, MONTHLY_CAP_USD, MAX_TOKENS, PALETTES, FACTS, MakerError,
  systemPrompt, userPrompt, repairPrompt, parsePlan, claimProblems, timeSegments, frameScore, candidateTimes, direct, strandedLine, labelCheck,
  estimateUsd, actualUsd, monthKey,
};

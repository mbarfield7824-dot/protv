// Marketing Studio commercial templates. A template is a starting storyboard (segments, starter wording, theme, music
// and branding); every value is edited in Admin, and a template can be overridden or saved as a new one (stored in
// marketingTemplates). Built-ins are timed for 30 seconds and scaled to 15 or 60. Footage segments name how many
// clips they want; the Studio fills them from cleared footage and the Administrator picks the actual scenes.
// Square-bracket placeholders ([TITLE], [DATE], [NAME]) must be replaced before a render (the service refuses).
const design = require('./design');

const CTA = (theme = {}) => ({ kind: 'cta', seconds: 3, purpose: 'Call to action', text: { headline: 'WATCH FREE AT', hero: 'WATCHPROTV.COM' }, style: { logo: 'above', logoScale: 1, animation: 'fade', ...theme } });

const BUILT_IN = [
  {
    id: 'thanksgiving', name: 'Thanksgiving', occasion: 'holiday', tone: 'family',
    description: 'Warm autumn greeting: family, food and a free movie night.',
    theme: { name: 'Harvest', background: ['#2a0e06', '#6e2d0f'], headline: '#f6d28b', hero: '#fff3dc', sub: '#f6d28b', accent: '#e0762f', glow: null },
    music: { kind: 'generated', mood: 'warm', bpm: 92, level: 1 },
    segments: [
      { kind: 'card', seconds: 5, purpose: 'Greeting', text: { hero: 'HAPPY THANKSGIVING' }, style: { animation: 'slow-fade', scale: 1.1 } },
      { kind: 'footage', seconds: 5, clips: 1, purpose: 'From our family', text: { hero: 'FROM OUR FAMILY TO YOURS' }, style: { animation: 'slow-fade' } },
      { kind: 'footage', seconds: 7, clips: 3, purpose: 'Togetherness', text: { hero: 'GOOD FOOD. GREAT COMPANY. GREAT ENTERTAINMENT.' }, style: { reveal: 'stagger', scale: 0.8, animation: 'fade' } },
      { kind: 'footage', seconds: 6, clips: 2, purpose: 'Invitation', text: { hero: 'GRAB A PLATE. PRESS PLAY.' }, style: { reveal: 'stagger', animation: 'fade' } },
      { kind: 'footage', seconds: 4, clips: 2, purpose: 'Offer', text: { hero: 'MOVIES. SERIES. ALL FREE.' }, style: { reveal: 'stagger', scale: 0.9, animation: 'fade' } },
      CTA({ headlineColor: '#f6d28b', heroColor: '#fff3dc' }),
    ],
  },
  {
    id: 'christmas', name: 'Christmas', occasion: 'holiday', tone: 'family',
    description: 'Cozy holiday greeting in deep red, pine green and gold.',
    theme: { name: 'Evergreen', background: ['#3a0a0e', '#0f3b24'], headline: '#f2d27a', hero: '#ffffff', sub: '#f2d27a', accent: '#c8102e', glow: null },
    music: { kind: 'generated', mood: 'warm', bpm: 96, level: 1 },
    segments: [
      { kind: 'card', seconds: 5, purpose: 'Greeting', text: { hero: 'MERRY CHRISTMAS' }, style: { animation: 'slow-fade', scale: 1.1 } },
      { kind: 'footage', seconds: 6, clips: 2, purpose: 'Warm wishes', text: { hero: 'FROM OUR FAMILY TO YOURS' }, style: { animation: 'slow-fade' } },
      { kind: 'footage', seconds: 7, clips: 3, purpose: 'Cozy night in', text: { hero: 'COZY UP. PRESS PLAY.' }, style: { reveal: 'stagger' } },
      { kind: 'footage', seconds: 5, clips: 2, purpose: 'Offer', text: { hero: 'MOVIES. SERIES. ALL FREE.' }, style: { reveal: 'stagger', scale: 0.9 } },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: { sub: 'HAPPY HOLIDAYS FROM PROtv' }, style: { logo: 'above', animation: 'slow-fade' } },
      CTA(),
    ],
  },
  {
    id: 'new-year', name: "New Year's", occasion: 'holiday', tone: 'energetic',
    description: 'Midnight black and gold countdown energy.',
    theme: { name: 'Midnight gold', background: ['#05060a', '#2a2140'], headline: '#f5d06f', hero: '#ffffff', sub: '#f5d06f', accent: '#f5b301', glow: null },
    music: { kind: 'generated', mood: 'energetic', bpm: 124, level: 1 },
    segments: [
      { kind: 'card', seconds: 4, purpose: 'Greeting', text: { headline: 'CHEERS TO', hero: 'A NEW YEAR' }, style: { animation: 'rise', scale: 1.1 } },
      { kind: 'footage', seconds: 7, clips: 3, purpose: 'Highlights', text: { hero: 'NEW YEAR. NEW FAVORITES.' }, style: { reveal: 'stagger' } },
      { kind: 'footage', seconds: 8, clips: 4, purpose: 'Variety', text: { hero: 'MOVIES. SERIES. LIVE TV.' }, style: { reveal: 'stagger', scale: 0.9 } },
      { kind: 'card', seconds: 4, purpose: 'Wish', text: { hero: 'HAPPY NEW YEAR' }, style: { animation: 'slow-fade', scale: 1.15 } },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: { sub: 'FREE MOVIES · SERIES · LIVE TV' }, style: { logo: 'above' } },
      CTA(),
    ],
  },
  {
    id: 'valentines', name: "Valentine's Day", occasion: 'holiday', tone: 'family',
    description: 'Date-night invitation in rose and wine tones.',
    theme: { name: 'Rose', background: ['#3b0718', '#8a1538'], headline: '#ffc2d1', hero: '#ffffff', sub: '#ffc2d1', accent: '#ff4d6d', glow: null },
    music: { kind: 'generated', mood: 'warm', bpm: 88, level: 1 },
    segments: [
      { kind: 'card', seconds: 5, purpose: 'Greeting', text: { hero: "HAPPY VALENTINE'S DAY" }, style: { animation: 'slow-fade' } },
      { kind: 'footage', seconds: 7, clips: 3, purpose: 'Date night', text: { hero: 'DATE NIGHT IS ON US' }, style: { animation: 'slow-fade' } },
      { kind: 'footage', seconds: 7, clips: 3, purpose: 'Stories', text: { hero: 'LOVE. DRAMA. LAUGHS.' }, style: { reveal: 'stagger' } },
      { kind: 'card', seconds: 4, purpose: 'Offer', text: { hero: 'ALL FREE ON PROtv' }, style: { animation: 'fade' } },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: {}, style: { logo: 'above', animation: 'slow-fade' } },
      CTA(),
    ],
  },
  {
    id: 'independence-day', name: 'Independence Day', occasion: 'holiday', tone: 'energetic',
    description: 'Navy, red and white summer celebration.',
    theme: { name: 'Stars and stripes', background: ['#0a1838', '#5a0f1a'], headline: '#ffffff', hero: '#ffffff', sub: '#ffd7dc', accent: '#bf0a30', glow: null },
    music: { kind: 'generated', mood: 'energetic', bpm: 120, level: 1 },
    segments: [
      { kind: 'card', seconds: 4, purpose: 'Greeting', text: { headline: 'HAPPY', hero: '4TH OF JULY' }, style: { animation: 'rise', scale: 1.1 } },
      { kind: 'footage', seconds: 8, clips: 4, purpose: 'Highlights', text: { hero: 'CELEBRATE WITH SOMETHING GREAT' } },
      { kind: 'footage', seconds: 7, clips: 3, purpose: 'Offer', text: { hero: 'MOVIES. SERIES. ALL FREE.' }, style: { reveal: 'stagger' } },
      { kind: 'card', seconds: 4, purpose: 'Wish', text: { hero: 'FROM OUR FAMILY TO YOURS' }, style: { animation: 'fade' } },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: {}, style: { logo: 'above' } },
      CTA(),
    ],
  },
  {
    id: 'birthday', name: 'Birthday', occasion: 'celebration', tone: 'energetic',
    description: 'A birthday shout-out. Replace [NAME] with who is celebrating.',
    theme: { name: 'Party', background: ['#1b0b3a', '#0b5563'], headline: '#ffd166', hero: '#ffffff', sub: '#9be7ff', accent: '#ff6fb5', glow: null },
    music: { kind: 'generated', mood: 'energetic', bpm: 126, level: 1 },
    segments: [
      { kind: 'card', seconds: 5, purpose: 'Greeting', text: { headline: 'HAPPY BIRTHDAY', hero: '[NAME]' }, style: { animation: 'rise', scale: 1.1 } },
      { kind: 'footage', seconds: 8, clips: 4, purpose: 'Celebration', text: { hero: "IT'S YOUR DAY. PICK THE MOVIE." }, style: { reveal: 'stagger' } },
      { kind: 'card', seconds: 6, purpose: 'Wish', text: { hero: 'CELEBRATING WITH YOU', sub: 'FROM THE PROtv FAMILY' }, style: { animation: 'slow-fade' } },
      { kind: 'footage', seconds: 4, clips: 2, purpose: 'Offer', text: { hero: 'MOVIES. SERIES. ALL FREE.' }, style: { reveal: 'stagger', scale: 0.9 } },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: {}, style: { logo: 'above' } },
      CTA(),
    ],
  },
  {
    id: 'announcement', name: 'Special announcement', occasion: 'announcement', tone: 'network',
    description: 'News from PROtv. Replace the placeholders with the announcement.',
    theme: { ...design.BRAND_THEME, name: 'PROtv' },
    music: { kind: 'generated', mood: 'cinematic', bpm: 112, level: 1 },
    segments: [
      { kind: 'card', seconds: 4, purpose: 'Opening', text: { headline: 'PROtv', hero: 'SPECIAL ANNOUNCEMENT' }, style: { animation: 'rise' } },
      { kind: 'card', seconds: 7, purpose: 'The news', text: { hero: '[ANNOUNCEMENT]', sub: '[DETAILS]' }, style: { animation: 'fade' } },
      { kind: 'footage', seconds: 8, clips: 4, purpose: 'Highlights', text: { hero: 'FREE MOVIES. SERIES. LIVE TV.' }, style: { reveal: 'stagger', scale: 0.9 } },
      { kind: 'card', seconds: 4, purpose: 'When', text: { hero: '[DATE]' }, style: { animation: 'fade' } },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: {}, style: { logo: 'above' } },
      CTA(),
    ],
  },
  {
    id: 'premiere', name: 'Premiere', occasion: 'premiere', tone: 'cinematic',
    description: 'A premiere spot. Choose the premiering title for every clip, then replace [TITLE] and [DATE].',
    theme: { ...design.BRAND_THEME, name: 'PROtv premiere' },
    music: { kind: 'generated', mood: 'cinematic', bpm: 116, level: 1 },
    segments: [
      { kind: 'footage', seconds: 5, clips: 2, purpose: 'Hook', text: { headline: 'PROtv PRESENTS', hero: '[TITLE]' }, style: { animation: 'slow-fade' } },
      { kind: 'footage', seconds: 10, clips: 4, purpose: 'Scenes', text: {}, style: {} },
      { kind: 'card', seconds: 4, purpose: 'Premiere date', text: { headline: 'PREMIERES', hero: '[DATE]', sub: 'ON PROtv LIVE' }, style: { animation: 'rise' } },
      { kind: 'footage', seconds: 4, clips: 2, purpose: 'Tease', text: {}, style: {} },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: { sub: 'FREE MOVIES · SERIES · LIVE TV' }, style: { logo: 'above' } },
      CTA(),
    ],
  },
  {
    id: 'celebration', name: 'General celebration', occasion: 'celebration', tone: 'energetic',
    description: 'Any good-news moment: milestones, thank-yous, community days.',
    theme: { name: 'Celebration', background: ['#120a02', '#4a3206'], headline: '#ffd166', hero: '#ffffff', sub: '#ffd166', accent: '#f5b301', glow: null },
    music: { kind: 'generated', mood: 'energetic', bpm: 122, level: 1 },
    segments: [
      { kind: 'card', seconds: 4, purpose: 'Opening', text: { hero: "LET'S CELEBRATE" }, style: { animation: 'rise', scale: 1.1 } },
      { kind: 'footage', seconds: 8, clips: 4, purpose: 'Highlights', text: { hero: 'THANK YOU FOR WATCHING' } },
      { kind: 'footage', seconds: 7, clips: 3, purpose: 'Offer', text: { hero: 'MOVIES. SERIES. ALL FREE.' }, style: { reveal: 'stagger' } },
      { kind: 'card', seconds: 4, purpose: 'Wish', text: { hero: 'FROM OUR FAMILY TO YOURS' }, style: { animation: 'fade' } },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: {}, style: { logo: 'above' } },
      CTA(),
    ],
  },
  {
    id: 'custom', name: 'Custom (blank)', occasion: 'custom', tone: 'network',
    description: 'A simple PROtv structure to make your own: opening card, footage, logo, call to action.',
    theme: { ...design.BRAND_THEME, name: 'PROtv' },
    music: { kind: 'generated', mood: 'cinematic', bpm: 112, level: 1 },
    segments: [
      { kind: 'card', seconds: 5, purpose: 'Opening', text: { hero: 'YOUR HEADLINE' }, style: { animation: 'fade' } },
      { kind: 'footage', seconds: 9, clips: 3, purpose: 'Footage', text: { hero: 'YOUR MESSAGE' } },
      { kind: 'footage', seconds: 9, clips: 3, purpose: 'Footage', text: {} },
      { kind: 'logo', seconds: 4, purpose: 'Logo reveal', text: { sub: 'FREE MOVIES · SERIES · LIVE TV' }, style: { logo: 'above' } },
      CTA(),
    ],
  },
];

const tenth = (value) => Math.round(value * 10) / 10;

// Scales segment lengths to the chosen duration in tenths of a second; the last stretchable segment absorbs rounding.
function scaledSegments(segments, durationSeconds) {
  const base = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  const factor = durationSeconds / base;
  const out = segments.map((segment) => ({ ...segment, seconds: segment.kind === 'cta' ? Math.min(segment.seconds, Math.max(2, tenth(segment.seconds * factor))) : Math.max(1, tenth(segment.seconds * factor)) }));
  const total = tenth(out.reduce((sum, segment) => sum + segment.seconds, 0));
  const diff = tenth(durationSeconds - total);
  if (diff) {
    const index = out.map((segment) => segment.kind).lastIndexOf('footage') >= 0 ? out.map((segment) => segment.kind).lastIndexOf('footage') : out.length - 2;
    out[index] = { ...out[index], seconds: tenth(out[index].seconds + diff) };
  }
  return out;
}

// A template + a clip chooser → a styled storyboard. pickClip(index) returns { videoId, sourceTitle, startSeconds, label }.
function storyboardFromTemplate(template, { durationSeconds = 30, pickClip }) {
  if (template.storyboard) {
    // A saved template keeps its exact segments (only at the length it was saved at).
    if (Number(template.durationSeconds) !== Number(durationSeconds)) throw new design.DesignError(`This saved template is ${template.durationSeconds} seconds.`);
    return template.storyboard;
  }
  let clipIndex = 0;
  return scaledSegments(template.segments, durationSeconds).map((segment) => {
    const beat = { kind: segment.kind, purpose: segment.purpose, durationSeconds: segment.seconds, text: { ...(segment.text || {}) }, style: { ...(segment.style || {}) } };
    if (segment.kind === 'logo' && !beat.style.logo) beat.style.logo = 'above';
    if (segment.kind === 'footage') {
      const count = Math.max(1, Math.min(8, Math.round(segment.clips || 1)));
      const tenths = Math.round(segment.seconds * 10);
      const each = Math.floor(tenths / count);
      beat.clips = Array.from({ length: count }, (_, index) => ({ ...pickClip(clipIndex++), durationSeconds: (index === count - 1 ? tenths - each * (count - 1) : each) / 10 }));
    }
    return beat;
  });
}

function builtInTemplates() { return BUILT_IN.map((template) => structuredClone(template)); }

module.exports = { BUILT_IN_IDS: BUILT_IN.map((template) => template.id), builtInTemplates, storyboardFromTemplate, scaledSegments };

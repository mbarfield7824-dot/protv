// Commercial Maker: one prompt → a validated, art-directed draft; claim repair; the monthly AI cap; per-format image
// layout; measured footage moments with required on-screen titles; conversational revisions; label checks.
const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const maker = require('../src/marketing/maker');
const planner = require('../src/marketing/planner');
const { MemoryMarketingStore } = require('../src/marketing/store');
const { createMarketingService } = require('../src/marketing/service');

const THIRTY = 'creator_693966b2-abd3-4aa4-94a9-e3f5081a0d47';
const CAESAR = 'creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f';
const NOW = Date.parse('2026-11-27T15:00:00Z');
const video = (id, title) => ({ id, title, approvalStatus: 'approved', status: 'ready', duration: 5000, muxPlaybackId: `pb${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 16)}`, contentType: 'MOVIE', genre: 'Drama' });

async function png(width, height, alpha = false) {
  return sharp({ create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0.5 } : { r: 40, g: 60, b: 90 } } }).png().toBuffer();
}

async function harness(answers) {
  const store = new MemoryMarketingStore();
  const catalog = [video(CAESAR, 'CAESAR III JUDGEMENT'), video(THIRTY, 'Three Thirty')];
  const asked = [];
  const portal = {
    configured: () => true, fileUrl: () => 'https://portal.test/x',
    submitRender: async (plan) => ({ id: plan.id, status: 'queued', progress: 0 }), renderStatus: async (id) => ({ id, status: 'queued' }),
    ai: async (system, user, maxTokens) => { asked.push({ system, user, maxTokens }); const next = answers.shift(); if (!next) throw new Error('no answer'); return { json: next, usage: { promptTokens: 4000, completionTokens: 1200 } }; },
  };
  let thumbnails = 0;
  const fetcher = async (url) => {
    thumbnails += 1;
    const t = Number(new URL(url).searchParams.get('time'));
    const level = 40 + (t % 180);
    const body = await sharp({ create: { width: 192, height: 108, channels: 3, background: { r: level, g: level, b: level } } }).composite([{ input: await sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 255 - level, g: 20, b: 200 } } }).png().toBuffer(), left: 40, top: 30 }]).jpeg().toBuffer();
    return new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  const service = createMarketingService({ store, portal, loadCatalog: async () => catalog, now: () => NOW, fetcher, imageSecret: () => 'k'.repeat(43), siteBase: () => 'https://watchprotv.com' });
  const badge = await service.uploadImage({ name: 'App Store badge', kind: 'badge', source: 'Apple official badge', dataBase64: (await png(1256, 420, true)).toString('base64') }, 'admin');
  const tablet = await service.uploadImage({ name: 'iPad home', kind: 'screenshot', source: 'PROtv screenshot', dataBase64: (await png(2000, 1827)).toString('base64') }, 'admin');
  const phone = await service.uploadImage({ name: 'iPhone home', kind: 'screenshot', source: 'PROtv screenshot', dataBase64: (await png(923, 2000)).toString('base64') }, 'admin');
  return { service, store, asked, ids: { badge: badge.id, tablet: tablet.id, phone: phone.id }, thumbnailsFetched: () => thumbnails };
}

const appPlan = (ids, extra = {}) => ({
  title: 'The Wait Is Over', concept: 'PROtv arrives on iPhone and iPad.', durationSeconds: 30, palette: 'protv-blue', music: { mood: 'energetic', bpm: 128 }, approach: 'product',
  segments: [
    { purpose: 'Hook', seconds: 4, visual: 'card', hero: 'THE WAIT IS OVER.', energy: 'punch', logo: 'above' },
    { purpose: 'Devices', seconds: 6, visual: 'product', headline: 'NOW ON', hero: 'iPHONE & iPAD', energy: 'build', images: [ids.phone, ids.tablet] },
    { purpose: 'Offer', seconds: 5, visual: 'card', hero: '100% FREE.', sub: 'NO SUBSCRIPTIONS.', energy: 'build' },
    { purpose: 'Date', seconds: 5, visual: 'card', headline: 'PREMIERE WEEK', hero: 'DECEMBER 1', energy: 'punch' },
    { purpose: 'CTA', seconds: 10, visual: 'cta', headline: 'DOWNLOAD PROtv STREAMING', hero: 'TODAY', sub: 'watchprotv.com', energy: 'calm', images: [ids.badge] },
  ],
  summary: 'An app launch spot built from product shots.', ...extra,
});
const PROMPT = 'A 30-second high-energy spot: PROtv is now on iPhone and iPad. 100% free, no subscriptions. Premiere week December 1. End on the App Store badge and watchprotv.com.';

test('one prompt makes a complete, art-directed draft with product shots laid out for every format and the cost recorded', async () => {
  const answers = [];
  const h = await harness(answers);
  answers.push(appPlan(h.ids));
  const draft = await h.service.makerCreate({ prompt: PROMPT }, 'admin');
  assert.equal(h.asked.length, 1);
  assert.equal(h.asked[0].maxTokens, maker.MAX_TOKENS);
  assert.match(h.asked[0].user, /iPad home/);
  assert.equal(draft.durationSeconds, 30);
  assert.equal(draft.templateName, 'Commercial Maker');
  assert.equal(Math.round(draft.storyboard.reduce((sum, beat) => sum + beat.durationSeconds, 0) * 10) / 10, 30);
  assert.ok(draft.storyboard.every((beat) => beat.kind !== 'footage'), 'no show footage when the AI chose product and graphics');
  assert.deepEqual(draft.storyboard[1].images.map((item) => item.slot), ['devices', 'devices']);
  assert.equal(draft.storyboard[4].images[0].slot, 'badge');
  assert.ok(draft.maker.checks.every((check) => check.level === 'ok'), JSON.stringify(draft.maker.checks));
  assert.ok(draft.maker.cost.actualUsd > 0 && draft.maker.cost.estimatedUsd >= draft.maker.cost.actualUsd);
  const usage = await h.service.makerUsage();
  assert.equal(usage.calls, 1);
  assert.equal(usage.capUsd, 5);
  // Every format: the devices and the badge sit inside the frame and below the text above them.
  for (const format of ['widescreen', 'vertical', 'square']) {
    const { plan } = await h.service.previewPlan({ ...draft, format });
    const L = planner.layout(format);
    const images = plan.layers.flatMap((layer) => layer.elements.filter((element) => element.type === 'image').map((element) => ({ element, layer })));
    assert.equal(images.length, 3, format);
    for (const { element, layer } of images) {
      assert.ok(element.x >= 0 && element.y >= 0 && element.x + element.width <= L.W && element.y + element.height <= L.H, `${format} image inside the frame`);
      const texts = plan.layers.filter((other) => other.start === layer.start).flatMap((other) => other.elements).filter((other) => other.type === 'text');
      const textBottom = Math.max(...texts.map((text) => text.y + text.size * 1.2 * text.text.split('\n').length));
      assert.ok(element.y >= textBottom - 2, `${format} image below the text (${element.y} vs ${textBottom})`);
    }
    for (const text of plan.layers.flatMap((layer) => layer.elements).filter((element) => element.type === 'text')) assert.equal(maker.strandedLine(text.text), false, `${format}: ${text.text}`);
  }
});

test('copy that makes an unsupported claim is sent back once and corrected', async () => {
  const answers = [];
  const h = await harness(answers);
  const bad = appPlan(h.ids);
  bad.segments[2] = { ...bad.segments[2], sub: 'NO ADS. EVER.' };
  bad.segments[3] = { ...bad.segments[3], sub: 'ALSO ON APPLE TV' };
  answers.push(bad, appPlan(h.ids));
  const draft = await h.service.makerCreate({ prompt: PROMPT }, 'admin');
  assert.equal(h.asked.length, 2);
  assert.match(h.asked[1].user, /shows ads/);
  assert.match(h.asked[1].user, /Apple TV/);
  assert.ok(!JSON.stringify(draft.storyboard).match(/NO ADS|APPLE TV/));
  assert.equal(draft.maker.cost.calls, 2);
  assert.deepEqual(maker.claimProblems(appPlan(h.ids), PROMPT), []);
  assert.equal(maker.claimProblems({ segments: [{ hero: 'PREMIERES JANUARY 9' }] }, PROMPT).length, 1, 'a date not in the request');
});

test('the monthly cap refuses a request before anything is sent', async () => {
  const answers = [];
  const h = await harness(answers);
  await h.store.put('aiUsage', '2026-11', { month: '2026-11', actualUsd: 4.9995, estimatedUsd: 5, calls: 900 });
  await assert.rejects(() => h.service.makerCreate({ prompt: PROMPT }, 'admin'), (error) => error.status === 402 && /\$5\.00 monthly AI spending cap/.test(error.message));
  assert.equal(h.asked.length, 0);
});

test('footage segments use measured moments, label the titles agreements require, and revisions keep what they do not change', async () => {
  const answers = [];
  const h = await harness(answers);
  const footage = await h.service.eligibleFootage({ destination: 'social', network: true });
  const plan = {
    title: 'Premiere Week', concept: 'Big titles, all free.', durationSeconds: 15, palette: 'midnight-gold', music: { mood: 'cinematic', bpm: 110 }, approach: 'footage',
    segments: [
      { purpose: 'Hook', seconds: 3, visual: 'card', hero: 'PREMIERE WEEK', energy: 'punch' },
      { purpose: 'Clips', seconds: 8, visual: 'footage', hero: 'MOVIES. SERIES.', energy: 'build', footage: ['three thirty', 'CAESAR III JUDGEMENT', 'Not A Real Title'] },
      { purpose: 'CTA', seconds: 4, visual: 'cta', headline: 'WATCH FREE AT', hero: 'WATCHPROTV.COM', energy: 'calm' },
    ],
  };
  answers.push(plan);
  const draft = await h.service.makerCreate({ prompt: 'Premiere week promo with clips from our films, 15 seconds.' }, 'admin');
  const clips = draft.storyboard.find((beat) => beat.kind === 'footage').clips;
  assert.ok(clips.length >= 3);
  assert.deepEqual([...new Set(clips.map((clip) => clip.videoId))].sort(), [CAESAR, THIRTY].sort());
  for (const clip of clips) {
    const item = footage.find((entry) => entry.id === clip.videoId);
    assert.equal(Boolean(clip.label), item.conditions.includes('title-on-screen'), `${item.title} label`);
    assert.ok(clip.startSeconds + clip.durationSeconds <= item.excerptUntil, 'inside the cleared excerpt window');
  }
  assert.deepEqual(draft.rightsCheck, []);
  const fetched = h.thumbnailsFetched();
  assert.ok(fetched >= 32, 'frames measured for both titles');
  // Revision: same titles, new copy → same clips, no new measurements, history and cost grow.
  answers.push({ ...plan, segments: plan.segments.map((segment, index) => (index === 0 ? { ...segment, hero: 'THIS WEEK ON PROtv' } : segment)), summary: 'New hook line.' });
  const revised = await h.service.makerRevise(draft.id, { message: 'Make the hook say THIS WEEK ON PROtv' }, 'admin');
  assert.equal(revised.storyboard[0].text.hero, 'THIS WEEK ON PROtv');
  assert.deepEqual(revised.storyboard.find((beat) => beat.kind === 'footage').clips, clips);
  assert.equal(h.thumbnailsFetched(), fetched);
  assert.equal(revised.maker.history.length, 2);
  assert.equal(revised.maker.cost.calls, 2);
  assert.match(h.asked[1].user, /Current plan:/);
  // Label check on the render plan: every lower third names the footage under it.
  const { plan: renderPlan } = await h.service.previewPlan({ ...revised, format: 'widescreen' });
  const labels = maker.labelCheck(renderPlan);
  assert.equal(labels.ok, true, JSON.stringify(labels));
  assert.equal(labels.labelled, clips.filter((clip) => clip.label).length);
  const wrong = JSON.parse(JSON.stringify(renderPlan));
  const layer = wrong.layers.find((item) => item.elements.some((element) => element.type === 'rect'));
  layer.elements.find((element) => element.type === 'text').text = 'SOMETHING ELSE';
  assert.equal(maker.labelCheck(wrong).ok, false);
});

test('typography: a stranded word is fixed by sizing, and segment timing always adds up', () => {
  assert.equal(maker.strandedLine('DECEMBER\n1'), true);
  assert.equal(maker.strandedLine('MOVIES.\nSERIES.'), false);
  for (const total of [15, 30, 60]) {
    const secs = maker.timeSegments([{ seconds: 2, visual: 'card', hero: 'A LONG HERO LINE THAT NEEDS TIME' }, { seconds: 9, visual: 'footage' }, { seconds: 3, visual: 'cta', hero: 'WATCHPROTV.COM' }], total);
    assert.equal(Math.round(secs.reduce((a, b) => a + b, 0) * 10) / 10, total);
  }
});

test('the art-director review catches missing or merged listed messages, missing requested footage and flat pacing', () => {
  const request = 'Messages, in this order: THE WAIT IS OVER. / NOW ON iPHONE & iPAD / PREMIERE WEEK • DECEMBER 1 / DOWNLOAD PROtv STREAMING TODAY. Show real PROtv content.';
  assert.deepEqual(maker.listedMessages(request), ['THE WAIT IS OVER', 'NOW ON iPHONE & iPAD', 'PREMIERE WEEK • DECEMBER 1', 'DOWNLOAD PROtv STREAMING TODAY']);
  const flat = { segments: [['THE WAIT IS OVER', ''], ['NOW ON', 'iPHONE & iPAD'], ['PREMIERE WEEK • DECEMBER 1', 'DOWNLOAD PROtv STREAMING TODAY'], ['', 'WATCHPROTV.COM']].map(([headline, hero]) => ({ visual: 'card', seconds: 6, headline, hero, sub: '' })) };
  const problems = maker.critique(flat, request);
  assert.equal(problems.length, 3, problems.join('\n'));
  assert.match(problems.join(' '), /no footage segment/);
  assert.match(problems.join(' '), /Segment 3 holds 2 listed messages/);
  assert.match(problems.join(' '), /same length/);
  assert.deepEqual(maker.critique({ segments: [{ visual: 'card', seconds: 3, hero: 'MERRY CHRISTMAS' }, { visual: 'cta', seconds: 4, hero: 'WATCHPROTV.COM' }] }, 'A warm Christmas card from PROtv.'), []);
  // Hierarchy: the main message is always the big line.
  assert.deepEqual(maker.hierarchy({ headline: 'PREMIERE WEEK • DECEMBER 1', hero: '' }), { headline: 'PREMIERE WEEK', hero: 'DECEMBER 1' });
  assert.deepEqual(maker.hierarchy({ headline: 'NOW ON iPHONE & iPAD', hero: '' }), { headline: 'NOW ON', hero: 'iPHONE & iPAD' });
  assert.deepEqual(maker.hierarchy({ headline: 'THE WAIT IS OVER', hero: '' }), { headline: '', hero: 'THE WAIT IS OVER' });
  // Flat AI lengths become a rhythm: a quicker hook, longer content and call to action.
  const secs = maker.timeSegments([{ seconds: 6, visual: 'card', hero: 'HOOK' }, { seconds: 6, visual: 'footage' }, { seconds: 6, visual: 'card', hero: 'FREE' }, { seconds: 6, visual: 'product', hero: 'APP' }, { seconds: 6, visual: 'cta', hero: 'WATCHPROTV.COM' }], 30);
  assert.ok(secs[0] < secs[1] && secs[1] > secs[2], secs.join(','));
});

test('balanced line breaks keep the fitted size and never strand a word (maker segments only)', () => {
  const design = require('../src/marketing/design');
  const L = planner.layout('widescreen');
  const theme = design.sanitizeTheme({});
  const beat = (balance) => ({ kind: 'card', text: { hero: 'DOWNLOAD PROtv STREAMING TODAY' }, style: design.sanitizeStyle({ scale: 1, balance }) });
  const plain = design.textBlock(beat(false), L, theme, { fitText: planner.fitText, CHAR_EM: 0.64 }).elements[0].element;
  const balanced = design.textBlock(beat(true), L, theme, { fitText: planner.fitText, CHAR_EM: 0.64 }).elements[0].element;
  assert.equal(balanced.size, plain.size);
  assert.equal(balanced.text.split('\n').length, plain.text.split('\n').length);
  assert.equal(maker.strandedLine(balanced.text), false, balanced.text);
  assert.ok(Math.max(...balanced.text.split('\n').map((line) => line.length)) <= Math.max(...plain.text.split('\n').map((line) => line.length)));
});

test('promotions use PROtv originals; classic films only when the request is about classics', () => {
  const footage = [{ title: 'The Lost Camp', creator: true }, { title: 'His Girl Friday (1940)', creator: false }];
  const plan = (titles) => ({ segments: [{ visual: 'footage', seconds: 8, hero: 'MOVIES', footage: titles }, { visual: 'cta', seconds: 4, hero: 'WATCHPROTV.COM' }] });
  assert.match(maker.critique(plan(['The Lost Camp', 'His Girl Friday (1940)']), 'App launch spot with real PROtv content.', footage).join(' '), /classic public-domain films \(His Girl Friday \(1940\)\)/);
  assert.deepEqual(maker.critique(plan(['His Girl Friday (1940)']), 'A classics night promo with clips.', footage), []);
  assert.deepEqual(maker.critique(plan(['The Lost Camp']), 'App launch spot with real PROtv content.', footage), []);
});

test('words go over the picture, kickers split at a bullet, and a three-line end card drops to two lines', () => {
  const merged = maker.wordsOverFootage([
    { visual: 'card', seconds: 3, hero: 'HOOK' },
    { visual: 'footage', seconds: 6, hero: '', headline: '', footage: ['The Lost Camp'] },
    { visual: 'card', seconds: 3, hero: 'MOVIES. SERIES. LIVE TV.', energy: 'punch' },
    { visual: 'card', seconds: 3, hero: '100% FREE.' },
  ]);
  assert.equal(merged.length, 3);
  assert.deepEqual([merged[1].visual, merged[1].hero, merged[1].seconds, merged[1].energy], ['footage', 'MOVIES. SERIES. LIVE TV.', 9, 'punch']);
  assert.deepEqual(maker.hierarchy({ headline: '', hero: 'PREMIERE WEEK • DECEMBER 1' }), { headline: 'PREMIERE WEEK', hero: 'DECEMBER 1' });
  const design = require('../src/marketing/design');
  const L = planner.layout('vertical');
  const cta = { kind: 'cta', text: { hero: 'DOWNLOAD PROtv STREAMING TODAY', sub: 'watchprotv.com' }, style: design.sanitizeStyle({ logo: 'above', balance: true }) };
  const hero = design.textBlock(cta, L, design.sanitizeTheme({}), { fitText: planner.fitText, CHAR_EM: 0.64, bottomLimit: L.H - design.safeArea(L).bottom - 260 }).elements.map((item) => item.element).find((element) => element.type === 'text');
  assert.equal(maker.strandedLine(hero.text), false, hero.text);
});

test('full-size type when even lines work, and a short date becomes the big line', () => {
  const design = require('../src/marketing/design');
  const L = planner.layout('vertical');
  const el = design.textBlock({ kind: 'card', text: { hero: 'THE WAIT IS OVER.' }, style: design.sanitizeStyle({ balance: true }) }, L, design.sanitizeTheme({}), { fitText: planner.fitText, CHAR_EM: 0.64 }).elements[0].element;
  const plain = design.textBlock({ kind: 'card', text: { hero: 'THE WAIT IS OVER.' }, style: design.sanitizeStyle({}) }, L, design.sanitizeTheme({}), { fitText: planner.fitText, CHAR_EM: 0.64 }).elements[0].element;
  assert.equal(el.size, plain.size, 'no shrinking when balanced lines work');
  assert.equal(maker.strandedLine(el.text), false, el.text);
  assert.deepEqual(maker.hierarchy({ headline: '', hero: 'PREMIERE WEEK', sub: 'DECEMBER 1' }), { headline: 'PREMIERE WEEK', hero: 'DECEMBER 1', sub: '' });
  assert.deepEqual(maker.hierarchy({ headline: '', hero: '100% FREE.', sub: 'NO SUBSCRIPTIONS.' }), { headline: '', hero: '100% FREE.', sub: 'NO SUBSCRIPTIONS.' });
});

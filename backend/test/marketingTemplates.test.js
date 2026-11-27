// Marketing Studio templates and the design layer: holiday/seasonal/custom templates, editable text and styling,
// multi-clip segments, rights on every clip, placeholders, duplication, saved templates and the live preview plan.
const assert = require('node:assert/strict');
const test = require('node:test');
const planner = require('../src/marketing/planner');
const design = require('../src/marketing/design');
const templates = require('../src/marketing/templates');
const { MemoryMarketingStore } = require('../src/marketing/store');
const { createMarketingService } = require('../src/marketing/service');

const THIRTY = 'creator_693966b2-abd3-4aa4-94a9-e3f5081a0d47';
const CAESAR = 'creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f';
const CURTAIN = 'creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d';
const NOW = Date.parse('2026-11-26T15:00:00Z');
const video = (id, extra = {}) => ({ id, title: `T ${id.slice(-4)}`, approvalStatus: 'approved', status: 'ready', duration: 5000, muxPlaybackId: `pb${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 16)}`, contentType: 'MOVIE', ...extra });

function harness() {
  const store = new MemoryMarketingStore();
  const catalog = [video(CAESAR), video(CURTAIN), video(THIRTY)];
  const plans = [];
  const portal = { configured: () => true, submitRender: async (plan) => { plans.push(plan); return { id: plan.id, status: 'queued', progress: 0 }; }, renderStatus: async (id) => ({ id, status: 'queued' }), fileUrl: () => 'https://portal.test/x' };
  const service = createMarketingService({ store, portal, loadCatalog: async () => catalog, now: () => NOW });
  return { service, store, plans, videos: new Map(catalog.map((item) => [item.id, item])) };
}
const frames = (seconds) => Math.round(seconds * 30);
const words = (plan) => plan.layers.flatMap((layer) => layer.elements).filter((item) => item.type === 'text').map((item) => item.text.replace(/\n/g, ' '));

test('every built-in template builds exact 15, 30 and 60 second storyboards on whole frames', async () => {
  const { service } = harness();
  const list = await service.listTemplates();
  for (const id of ['thanksgiving', 'christmas', 'new-year', 'valentines', 'independence-day', 'birthday', 'announcement', 'premiere', 'celebration', 'custom']) assert.ok(list.find((item) => item.id === id), id);
  for (const template of list) {
    for (const durationSeconds of [15, 30, 60]) {
      const storyboard = templates.storyboardFromTemplate(template, { durationSeconds, pickClip: (index) => ({ videoId: index % 2 ? CAESAR : CURTAIN, sourceTitle: 'x', startSeconds: 100 + index, label: '' }) });
      const clean = design.sanitizeStoryboard(storyboard, { durationSeconds });
      const total = clean.reduce((sum, beat) => sum + beat.durationSeconds, 0);
      assert.equal(Math.round(total * 10) / 10, durationSeconds, `${template.id} ${durationSeconds}`);
      for (const beat of clean) {
        assert.equal(frames(beat.durationSeconds) / 30, Math.round(beat.durationSeconds * 10) / 10, 'tenths land on frames');
        for (const clip of beat.clips || []) assert.ok(clip.durationSeconds >= 0.5 && clip.durationSeconds <= 20);
      }
    }
  }
});

test('Thanksgiving: the owner wording, timings, warm theme, logo + call to action, both formats', async () => {
  const { service, plans, videos } = harness();
  const commercial = await service.createCommercial({ category: 'custom', templateId: 'thanksgiving', durationSeconds: 30, title: 'Happy Thanksgiving from PROtv' }, 'owner');
  assert.equal(commercial.category, 'custom');
  assert.deepEqual(commercial.rightsCheck, []);
  const beats = planner.timeline(commercial.storyboard);
  assert.deepEqual(beats.map((beat) => [beat.start, beat.end]), [[0, 5], [5, 10], [10, 17], [17, 23], [23, 27], [27, 30]]);
  assert.equal(beats.at(-1).kind, 'cta');
  const wide = planner.renderPlan(commercial, 'widescreen', { destination: 'live', videos });
  const tall = planner.renderPlan(commercial, 'vertical', { destination: 'social', videos });
  for (const plan of [wide, tall]) {
    assert.equal(Math.round(plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) * 1000) / 1000, 30);
    const text = words(plan).join(' | ');
    for (const line of ['HAPPY THANKSGIVING', 'FROM OUR FAMILY TO YOURS', 'GOOD FOOD.', 'GREAT COMPANY.', 'GREAT ENTERTAINMENT.', 'GRAB A PLATE.', 'PRESS PLAY.', 'MOVIES.', 'SERIES.', 'ALL FREE.', 'WATCH FREE AT', 'WATCHPROTV.COM']) assert.ok(text.includes(line), `${plan.format}: ${line}`);
    assert.equal(plan.shots[0].kind, 'card');
    assert.deepEqual(plan.shots[0].colors, ['#2a0e06', '#6e2d0f'], 'warm card');
    assert.ok(plan.layers.some((layer) => layer.start === 27 && layer.elements.some((item) => item.type === 'logo')), 'official logo on the call to action');
    assert.equal(plan.music.mood, 'warm');
    for (const layer of plan.layers) assert.ok(layer.end <= 30 && layer.end > layer.start);
    for (const item of plan.layers.flatMap((layer) => layer.elements)) if (item.type === 'text') { assert.ok(item.x >= 0 && item.x + item.width <= (plan.format === 'widescreen' ? 1920 : 1080)); assert.ok(item.y >= 0); }
  }
  assert.deepEqual(wide.loudness, { integrated: -24, truePeak: -2 });
  assert.deepEqual(tall.loudness, { integrated: -14, truePeak: -1.5 });
  // Staggered lines appear one after another, then hold together until the segment ends.
  const good = wide.layers.filter((layer) => layer.elements.some((item) => item.type === 'text' && /GOOD FOOD|GREAT COMPANY|GREAT ENTERTAINMENT/.test(item.text)));
  assert.equal(good.length, 3);
  assert.deepEqual(good.map((layer) => layer.end), [17, 17, 17]);
  assert.ok(good[0].start < good[1].start && good[1].start < good[2].start);
  const ys = good.map((layer) => layer.elements[0].y);
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2], 'lines keep their final positions');
  await service.renderCommercial(commercial.id, { formats: ['widescreen', 'vertical'] }, 'owner');
  assert.equal(plans.length, 2);
});

test('rights: each clip of a segment is checked; a title-only excerpt must carry its title for the whole clip', async () => {
  const { service, videos } = harness();
  const base = await service.createCommercial({ category: 'custom', templateId: 'custom', durationSeconds: 15 }, 'a');
  const storyboard = structuredClone(base.storyboard);
  const footage = storyboard.find((beat) => beat.kind === 'footage');
  footage.clips[0] = { ...footage.clips[0], videoId: THIRTY, sourceTitle: 'Three Thirty', label: '' };
  const unlabelled = await service.updateStoryboard(base.id, storyboard, 'a');
  assert.ok(unlabelled.rightsCheck.some((problem) => /title on screen/.test(problem)));
  await assert.rejects(service.renderCommercial(base.id, {}, 'a'), /Rights check failed/);
  footage.clips[0].label = 'Three Thirty';
  const labelled = await service.updateStoryboard(base.id, storyboard, 'a');
  assert.deepEqual(labelled.rightsCheck, []);
  const plan = planner.renderPlan(labelled, 'widescreen', { videos });
  const start = planner.timeline(labelled.storyboard).find((beat) => beat.kind === 'footage').start;
  const lower = plan.layers.find((layer) => layer.elements.some((item) => item.type === 'text' && item.text === 'THREE THIRTY'));
  assert.equal(lower.start, start);
  assert.equal(Math.round((lower.end - lower.start) * 10) / 10, footage.clips[0].durationSeconds);
  footage.clips[0].startSeconds = 4000;
  assert.ok((await service.updateStoryboard(base.id, storyboard, 'a')).rightsCheck.some((problem) => /ending/.test(problem)));
});

test('text, timing, position, size, colour, animation, logo, bug and music level are all editable', async () => {
  const { service, videos } = harness();
  const base = await service.createCommercial({ category: 'custom', templateId: 'thanksgiving', durationSeconds: 30 }, 'a');
  const storyboard = structuredClone(base.storyboard);
  storyboard[0].text = { headline: 'FROM ALL OF US', hero: 'HAPPY HOLIDAYS', sub: 'SEE YOU ON PROtv' };
  storyboard[0].style = { ...storyboard[0].style, position: 'top', align: 'left', scale: 1.4, heroColor: '#ff0000', animation: 'rise', textIn: 0.5, textOut: 0.5, logo: 'below' };
  const saved = await service.updateStoryboard(base.id, storyboard, 'a', { theme: { ...base.theme, background: ['#000000', '#123456'] }, branding: { bug: false }, music: { mood: 'cinematic', bpm: 100, level: 0.5 }, title: 'Holiday' });
  assert.equal(saved.title, 'Holiday');
  assert.equal(saved.revision, 1);
  const wide = planner.renderPlan(saved, 'widescreen', { destination: 'live', videos });
  const social = planner.renderPlan(saved, 'vertical', { destination: 'social', videos });
  const first = wide.layers.filter((layer) => layer.start === 0.5);
  const hero = first.flatMap((layer) => layer.elements).find((item) => item.text?.split('\n').join(' ') === 'HAPPY HOLIDAYS');
  assert.equal(hero.fill, 'custom');
  assert.equal(hero.color, '#ff0000');
  assert.equal(hero.align, 'left');
  assert.ok(hero.size > 150, 'scaled up');
  assert.ok(first.every((layer) => layer.end === 4.5 && layer.motion && layer.motion.dy > 0), 'timing + rise animation');
  assert.ok(first.flatMap((layer) => layer.elements).some((item) => item.type === 'logo'), 'logo below the text');
  assert.ok(first.flatMap((layer) => layer.elements).find((item) => item.text === 'FROM ALL OF US').y < 200, 'top position');
  assert.deepEqual(wide.shots[0].colors, ['#000000', '#123456']);
  assert.ok(!wide.layers.some((layer) => layer.elements.length === 1 && layer.elements[0].type === 'logo' && layer.elements[0].glow === false), 'bug switched off');
  assert.equal(wide.music.mood, 'cinematic');
  assert.equal(wide.music.bpm, 100);
  assert.equal(wide.loudness.integrated, -26, 'LIVE stays within A/85 tolerance');
  assert.equal(social.loudness.integrated, -20, 'social music level −6 dB');
  await assert.rejects(service.updateStoryboard(base.id, storyboard.slice(1), 'a'), /add up to 25/);
  const broken = structuredClone(storyboard);
  broken[1].clips[0].videoId = '';
  await assert.rejects(service.updateStoryboard(base.id, broken, 'a'), /choose the footage/);
});

test('placeholders block rendering until replaced; templates are edited, reset, saved and reused; commercials duplicate', async () => {
  const { service } = harness();
  const birthday = await service.createCommercial({ category: 'custom', templateId: 'birthday', durationSeconds: 30 }, 'a');
  assert.ok(birthday.rightsCheck.some((problem) => /\[NAME\]/.test(problem)));
  await assert.rejects(service.renderCommercial(birthday.id, {}, 'a'), /placeholder/);

  const edited = await service.updateTemplate('thanksgiving', { name: 'Thanksgiving 2027', segments: [{ kind: 'card', seconds: 15, text: { hero: 'GIVING THANKS' } }, { kind: 'card', seconds: 12, text: { hero: 'FROM PROtv' } }, { kind: 'cta', seconds: 3, text: { headline: 'WATCH AT', hero: 'WATCHPROTV.COM' }, style: { logo: 'above' } }] }, 'a');
  assert.equal(edited.overrides, 'thanksgiving');
  const thanksgiving = (await service.listTemplates()).find((item) => item.id === 'thanksgiving');
  assert.equal(thanksgiving.name, 'Thanksgiving 2027');
  assert.equal(thanksgiving.edited, true);
  const fromEdited = await service.createCommercial({ category: 'custom', templateId: 'thanksgiving', durationSeconds: 30 }, 'a');
  assert.equal(fromEdited.storyboard[0].text.hero, 'GIVING THANKS');
  await service.deleteTemplate('thanksgiving', 'a');
  assert.equal((await service.getTemplate('thanksgiving')).edited, false, 'reset to the original');

  const saved = await service.saveTemplate({ name: 'Our holiday look', fromCommercialId: fromEdited.id }, 'a');
  const reused = await service.createCommercial({ category: 'custom', templateId: saved.id, durationSeconds: 30, title: 'Reused' }, 'a');
  assert.deepEqual(reused.storyboard, fromEdited.storyboard);
  await assert.rejects(service.createCommercial({ category: 'custom', templateId: saved.id, durationSeconds: 15 }, 'a'), /30 seconds/);
  await service.deleteTemplate(saved.id, 'a');
  await assert.rejects(service.getTemplate(saved.id), /not found/);

  const copy = await service.duplicateCommercial(fromEdited.id, 'a');
  assert.notEqual(copy.id, fromEdited.id);
  assert.equal(copy.status, 'draft');
  assert.deepEqual(copy.renders, {});
  assert.deepEqual(copy.storyboard, fromEdited.storyboard);
  assert.match(copy.title, /\(copy\)$/);
});

test('the live preview returns the exact plan the worker receives, for 16:9, 9:16 and 1:1', async () => {
  const { service } = harness();
  const base = await service.createCommercial({ category: 'custom', templateId: 'christmas', durationSeconds: 15 }, 'a');
  for (const format of ['widescreen', 'vertical', 'square']) {
    const { plan, rightsCheck } = await service.previewPlan({ storyboard: base.storyboard, theme: base.theme, branding: base.branding, music: base.music, durationSeconds: 15, format });
    assert.equal(plan.format, format);
    assert.deepEqual(rightsCheck, []);
    assert.equal(Math.round(plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) * 10) / 10, 15);
  }
  const options = service.designOptions();
  assert.ok(options.animations.find((item) => item.id === 'slow-fade'));
  assert.deepEqual(options.durations, [15, 30, 60]);
});

test('legacy network commercials are not styled and keep their original layout', () => {
  const picks = Array.from({ length: 11 }, (_, index) => ({ videoId: index % 2 ? CAESAR : CURTAIN, sourceTitle: 'Title', startSeconds: 20 + index, focusX: 0.4 }));
  const commercial = { id: 'cm_legacy', title: 'Legacy', tone: 'cinematic', storyboard: planner.networkFreeStoryboard(picks) };
  assert.equal(design.isStyled(commercial), false);
  const videos = new Map([[CAESAR, video(CAESAR)], [CURTAIN, video(CURTAIN)]]);
  const plan = planner.renderPlan(commercial, 'widescreen', { destination: 'live', videos });
  assert.equal(plan.shots[0].colors, undefined);
  assert.deepEqual(plan.shots.at(-1).colors, ['#03060d', '#0a1a3a']);
});

test('after a render is handed to Mux, refresh follows Mux until the copy is processed (then the commercial is in review)', async () => {
  const store = new MemoryMarketingStore();
  const catalog = [video(CAESAR), video(CURTAIN), video(THIRTY)];
  const jobs = new Map();
  let renderStatusCalls = 0;
  const portal = { configured: () => true, submitRender: async (plan) => { jobs.set(plan.id, 'queued'); return { id: plan.id, status: 'queued', progress: 0 }; }, renderStatus: async (id) => { renderStatusCalls += 1; return { id, status: jobs.get(id), progress: 100, validation: { ok: true } }; }, fileUrl: () => 'https://portal.test/file' };
  const muxAssets = new Map();
  const mux = {
    createAssetFromUrl: async () => { const asset = { id: `asset${muxAssets.size}`, status: 'preparing', playback_ids: [{ id: `play${muxAssets.size}`, policy: 'public' }] }; muxAssets.set(asset.id, asset); return asset; },
    getAsset: async (id) => muxAssets.get(id), getPlaybackId: (asset) => asset?.playback_ids?.[0]?.id,
  };
  const service = createMarketingService({ store, portal, mux, loadCatalog: async () => catalog, now: () => NOW });
  const commercial = await service.createCommercial({ category: 'custom', templateId: 'christmas', durationSeconds: 15 }, 'a');
  await service.renderCommercial(commercial.id, { formats: ['widescreen', 'vertical'] }, 'a');
  for (const id of jobs.keys()) jobs.set(id, 'ready');
  const handed = await service.refreshCommercial(commercial.id);
  assert.deepEqual(Object.values(handed.renders).map((render) => render.asset.status), ['preparing', 'preparing']);
  assert.equal(handed.status, 'rendering');
  const calls = renderStatusCalls;
  for (const asset of muxAssets.values()) asset.status = 'ready';
  const ready = await service.refreshCommercial(commercial.id);
  assert.deepEqual(Object.values(ready.renders).map((render) => render.asset.status), ['ready', 'ready']);
  assert.equal(ready.status, 'in-review');
  assert.equal(renderStatusCalls, calls, 'a finished render is not polled again');
  assert.equal(muxAssets.size, 2, 'each render is copied to Mux once');
});

test('image library: upload re-encodes, signed links only, images placed and framed in the render plan', async () => {
  const sharp = require('sharp');
  const images = require('../src/marketing/images');
  const store = new MemoryMarketingStore();
  const catalog = [video(CAESAR), video(CURTAIN), video(THIRTY)];
  const portal = { configured: () => true, submitRender: async (plan) => ({ id: plan.id, status: 'queued' }), renderStatus: async () => ({}), fileUrl: () => '' };
  const service = createMarketingService({ store, portal, loadCatalog: async () => catalog, now: () => NOW, imageSecret: () => 'k'.repeat(43), siteBase: () => 'https://watchprotv.com' });
  const png = await sharp({ create: { width: 1080, height: 1920, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.9 } } }).png().toBuffer();
  await assert.rejects(service.uploadImage({ name: 'Shot', kind: 'screenshot', dataBase64: png.toString('base64') }, 'a'), /where the image comes from/);
  await assert.rejects(service.uploadImage({ name: 'Bad', kind: 'other', source: 'x', dataBase64: Buffer.from('not an image').toString('base64') }, 'a'), /not a readable image/);
  const shot = await service.uploadImage({ name: 'Home screen', kind: 'screenshot', source: 'PROtv app screenshot', dataBase64: `data:image/png;base64,${png.toString('base64')}` }, 'a');
  assert.equal(shot.mime, 'image/png');
  assert.ok(shot.width <= 2000 && shot.height <= 2000 && !('data' in shot));
  assert.match(shot.previewUrl, /^https:\/\/watchprotv\.com\/api\/marketing\/images\/mi_[a-f0-9]{20}\.png\?expires=\d{13}&signature=[0-9a-f]{64}$/);
  const url = new URL(shot.previewUrl);
  const ok = { id: shot.id, expires: url.searchParams.get('expires'), signature: url.searchParams.get('signature') };
  assert.equal(images.verifyImageRequest(ok, { secret: 'k'.repeat(43), now: NOW }), true);
  assert.equal(images.verifyImageRequest({ ...ok, signature: '0'.repeat(64) }, { secret: 'k'.repeat(43), now: NOW }), false);
  assert.equal(images.verifyImageRequest(ok, { secret: 'k'.repeat(43), now: NOW + 2 * 3600_000 }), false, 'expired');

  const base = await service.createCommercial({ category: 'custom', templateId: 'custom', durationSeconds: 15 }, 'a');
  const storyboard = structuredClone(base.storyboard);
  storyboard[0].images = [{ imageId: shot.id, x: 0.7, y: 0.5, width: 0.2, frame: 'phone', shadow: true }, { imageId: 'nope', x: 0.5, y: 0.5, width: 0.1 }];
  const saved = await service.updateStoryboard(base.id, storyboard, 'a');
  assert.equal(saved.storyboard[0].images.length, 1, 'invalid image ids are dropped');
  const { plan } = await service.previewPlan({ storyboard: saved.storyboard, theme: saved.theme, branding: saved.branding, music: saved.music, durationSeconds: 15, format: 'widescreen' });
  const element = plan.layers.flatMap((layer) => layer.elements).find((item) => item.type === 'image');
  assert.equal(element.frame, 'phone');
  assert.equal(element.width, 384);
  assert.ok(element.height > element.width * 1.7, 'portrait screenshot keeps its shape');
  assert.equal(Math.round(element.x + element.width / 2), 1344);
  assert.match(element.url, /^https:\/\/watchprotv\.com\/api\/marketing\/images\//);
  await assert.rejects(service.deleteImage(shot.id, 'a'), /used by/);
});

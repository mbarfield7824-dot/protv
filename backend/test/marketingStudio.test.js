// PROtv Marketing Studio: rights, planning, the commercial → review → LIVE draft flow, publishing gates, budget
// protections, measurement, the agent and the signed dispatcher.
const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const rights = require('../src/marketing/rights');
const planner = require('../src/marketing/planner');
const analytics = require('../src/marketing/analytics');
const ads = require('../src/marketing/ads');
const social = require('../src/marketing/social');
const { classify } = require('../src/marketing/agent');
const { MemoryMarketingStore } = require('../src/marketing/store');
const { createMarketingService } = require('../src/marketing/service');
const { marketingSignature, createPortalClient } = require('../src/marketing/portal');
const { createDispatchHandler } = require('../src/marketing/router');

const THIRTY = 'creator_693966b2-abd3-4aa4-94a9-e3f5081a0d47';
const CAESAR = 'creator_78bcb14d-1a7b-4a3c-85e7-77b1fe95593f';
const CURTAIN = 'creator_fddcf883-d5bb-4ea7-8a5d-fa30b96b5f4d';
const DEAD_AIR = 'creator_89303465-51e3-46bb-bd21-ff5ed2db2c49';
const HGF = 'LiMNMZWXBxJj3LoP73kU';
const PLAN9 = 'B2MDEH2b25NknMQMEhoM';
const video = (id, extra = {}) => ({ id, title: `T ${id.slice(-4)}`, approvalStatus: 'approved', status: 'ready', duration: 5000, muxPlaybackId: `pb${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 16)}`, contentType: 'MOVIE', ...extra });
const NOW = Date.parse('2026-11-26T15:00:00Z');

test('marketing rights: agreement clauses, holds, endings, on-screen titles and U.S.-only footage', () => {
  const at = new Date(NOW);
  assert.equal(rights.footageClearance(video(THIRTY), { now: at }).allowed, true);
  assert.ok(rights.footageClearance(video(THIRTY), { now: at }).conditions.includes('title-on-screen'));
  assert.ok(!rights.footageClearance(video(CAESAR), { now: at }).conditions.includes('title-on-screen'), 'CAESAR may market PROtv itself');
  assert.deepEqual(rights.footageClearance(video(DEAD_AIR), { now: at }).deny.includes('rights-hold'), true);
  assert.equal(rights.footageClearance(video(PLAN9), { now: at }).allowed, false, 'library music unresolved');
  const pd = rights.footageClearance(video(HGF), { destination: 'social', now: at });
  assert.equal(pd.allowed, true);
  assert.ok(pd.conditions.includes('target-us-only'));
  assert.equal(rights.footageClearance(video('unknown-title'), { now: at }).allowed, false);
  const videos = new Map([[THIRTY, video(THIRTY)], [CAESAR, video(CAESAR)]]);
  assert.deepEqual(rights.checkShots([{ kind: 'footage', videoId: CAESAR, startSeconds: 100, durationSeconds: 4 }], videos, { now: at }), []);
  assert.match(rights.checkShots([{ kind: 'footage', videoId: THIRTY, startSeconds: 100, durationSeconds: 4 }], videos, { now: at })[0], /title on screen/);
  assert.match(rights.checkShots([{ kind: 'footage', videoId: THIRTY, startSeconds: 4000, durationSeconds: 4, titleOnScreen: true }], videos, { now: at })[0], /ending/);
  assert.match(rights.checkShots(Array.from({ length: 20 }, () => ({ kind: 'footage', videoId: CAESAR, startSeconds: 10, durationSeconds: 5 })), videos, { now: at }).at(-1), /limit 90/);
});

test('planner: the 30-second network structure lands on exact frames, with separate 16:9 and 9:16 compositions', () => {
  const picks = Array.from({ length: 11 }, (_, index) => ({ videoId: index % 2 ? CAESAR : CURTAIN, sourceTitle: 'Title', startSeconds: 20 + index, focusX: 0.4 }));
  const storyboard = planner.networkFreeStoryboard(picks);
  const beats = planner.timeline(storyboard);
  assert.ok(!JSON.stringify(storyboard, (key, value) => (value === undefined ? '__undefined__' : value)).includes('__undefined__'), 'no undefined fields (Firestore rejects them)');
  assert.equal(beats.at(-1).end, 30);
  assert.deepEqual(beats.filter((beat) => beat.purpose === 'Logo reveal').map((beat) => [beat.start, beat.end]), [[23, 27]]);
  assert.deepEqual(beats.filter((beat) => beat.purpose === 'Call to action').map((beat) => [beat.start, beat.end]), [[27, 30]]);
  const videos = new Map(picks.map((pick) => [pick.videoId, video(pick.videoId)]));
  const commercial = { id: 'cm_test', title: 'Test', tone: 'cinematic', storyboard };
  const wide = planner.renderPlan(commercial, 'widescreen', { destination: 'live', videos });
  const tall = planner.renderPlan(commercial, 'vertical', { destination: 'social', videos });
  assert.equal(wide.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0), 30);
  assert.deepEqual(wide.loudness, { integrated: -24, truePeak: -2 });
  assert.deepEqual(tall.loudness, { integrated: -14, truePeak: -1.5 });
  assert.equal(wide.shots[1].focusX, 0.5);
  assert.equal(tall.shots[1].focusX, 0.4, 'the vertical version frames each shot on its own focus point');
  assert.notDeepEqual(wide.layers[0].elements, tall.layers[0].elements);
  assert.ok(tall.layers.flatMap((layer) => layer.elements).filter((item) => item.type === 'text').every((item) => item.x + item.width <= 1080));
  assert.deepEqual(wide.music.impacts.includes(23), true);
  assert.equal(planner.fitText('INDEPENDENT VOICES', 150, 936, { spacing: 6 }).lines, 2);
  assert.match(planner.srt(planner.captionsFor(commercial)), /^1\n00:00:00,000 --> 00:00:04,000\nYOUR NEXT FAVORITE MOVIE IS FREE/);
});

function harness(overrides = {}) {
  const store = new MemoryMarketingStore();
  const catalog = [video(CAESAR), video(CURTAIN), video(THIRTY), video(DEAD_AIR)];
  const renders = new Map();
  const portal = {
    configured: () => true,
    submitRender: async (plan) => { renders.set(plan.id, { status: 'queued' }); return { id: plan.id, status: 'queued', progress: 0 }; },
    renderStatus: async (id) => ({ id, ...renders.get(id) }),
    cancelRender: async (id) => { renders.set(id, { status: 'cancelled' }); return {}; },
    hypeClips: async () => ({ items: [{ id: 'hype-1', title: 'T 0a33', format: 'vertical', durationSeconds: 25, projectId: 'p1', rights: { basis: 'schedule' } }] }),
    fileUrl: (kind, id) => `https://portal.test/${kind}/${id}?signature=x`,
  };
  const assets = new Map();
  const mux = {
    createAssetFromUrl: async (url) => { const asset = { id: `asset${assets.size + 1}xxxxxx`, status: 'ready', playback_ids: [{ id: `play${assets.size + 1}xxxxxx`, policy: 'public' }], url }; assets.set(asset.id, asset); return asset; },
    getAsset: async (id) => assets.get(id), getPlaybackId: (asset) => asset?.playback_ids?.[0]?.id,
  };
  const creatives = [];
  const linearService = { createCreative: async (input) => { creatives.push(input); return { creative: { id: `cr${creatives.length}`, status: 'draft' } }; } };
  const linearStore = {
    listEntries: async () => [{ id: 'e1', kind: 'program', status: 'approved', videoId: CAESAR, programType: 'movie', startAt: new Date(NOW + 5 * 3600_000).toISOString(), endAt: new Date(NOW + 6 * 3600_000).toISOString() },
      { id: 'e2', kind: 'program', status: 'approved', videoId: 'creator_episode_unreleased', programType: 'premiere', startAt: new Date(NOW + 30 * 3600_000).toISOString(), endAt: new Date(NOW + 31 * 3600_000).toISOString() }],
    getVideos: async (ids) => new Map(ids.filter((id) => catalog.find((item) => item.id === id)).map((id) => [id, catalog.find((item) => item.id === id)])),
    getRights: async (keys) => new Map(keys.filter((key) => key === `title_${CAESAR}`).map((key) => [key, { status: 'confirmed', basis: 'test' }])),
  };
  const service = createMarketingService({ store, portal, loadCatalog: async () => catalog, linearStore, linearService, mux, now: () => NOW, ...overrides });
  return { service, store, renders, creatives, catalog };
}

test('commercial flow: rights-checked render, validated assets, review, and a DRAFT LIVE spot (no timeline change)', async () => {
  const { service, renders, creatives, store } = harness();
  const picks = Array.from({ length: 11 }, (_, index) => ({ videoId: index % 2 ? CAESAR : CURTAIN, sourceTitle: 'Title', startSeconds: 30 + index }));
  const commercial = await service.createCommercial({ category: 'network', durationSeconds: 30, picks }, 'admin1');
  assert.deepEqual(commercial.rightsCheck, []);
  assert.equal(commercial.brief.footage.length, 2);
  await assert.rejects(service.registerForLive(commercial.id, {}, 'admin1'), /Approve the commercial first/);
  const rendering = await service.renderCommercial(commercial.id, { formats: ['widescreen', 'vertical'] }, 'admin1');
  assert.equal(rendering.renders.widescreen.destination, 'live');
  assert.equal(rendering.renders.vertical.destination, 'social');
  await assert.rejects(service.reviewCommercial(commercial.id, { decision: 'approve' }, 'admin1'), /Nothing is rendered/);
  for (const render of Object.values(rendering.renders)) renders.set(render.jobId, { status: 'ready', progress: 100, validation: { ok: true } });
  const refreshed = await service.refreshCommercial(commercial.id);
  assert.equal(refreshed.status, 'in-review');
  assert.equal((await store.list('assets')).length, 2);
  await service.refreshCommercial(commercial.id);
  assert.equal((await store.list('assets')).length, 2, 'refreshing again never duplicates assets');
  await service.reviewCommercial(commercial.id, { decision: 'approve', note: 'Looks right' }, 'owner');
  const live = await service.registerForLive(commercial.id, { flightStart: '2026-12-01' }, 'owner');
  assert.equal(live.status, 'draft');
  assert.equal(creatives[0].source, 'marketing-asset');
  assert.equal(creatives[0].type, 'promo');
  assert.deepEqual(await service.registerForLive(commercial.id, {}, 'owner'), { creativeId: 'cr1', already: true });
  assert.equal(creatives.length, 1);
});

test('a held or uncleared title can never be rendered', async () => {
  const { service } = harness();
  await assert.rejects(service.createCommercial({ category: 'title', videoId: DEAD_AIR, durationSeconds: 30 }, 'a'), /rights-hold/);
  const spot = await service.createCommercial({ category: 'title', videoId: THIRTY, durationSeconds: 15 }, 'a');
  assert.deepEqual(spot.rightsCheck, []);
  assert.equal(planner.timeline(spot.storyboard).at(-1).end, 15);
  const sponsor = await service.createCommercial({ category: 'sponsor', durationSeconds: 30, sponsor: { name: 'Local Bakery', offer: '' } }, 'a');
  await assert.rejects(service.renderCommercial(sponsor.id, {}, 'a'), /sponsor supplied and approved/);
});

test('publishing: approval gates, manual handoff when not connected, idempotent receipts, campaign pause holds posts', async () => {
  const { service } = harness();
  const campaign = await service.createCampaign({ name: 'Launch week', type: 'network-awareness', platforms: ['facebook', 'manual'] }, 'a');
  assert.match(campaign.trackingLinks[0].url, /utm_campaign=mc_/);
  const post = await service.createPost({ platform: 'facebook', campaignId: campaign.id, scheduledAt: NOW - 60_000 }, 'a');
  assert.match(post.caption, /utm_source=facebook/);
  await assert.rejects(service.publishPost(post.id, 'a'), /approved post/);
  await service.approvePost(post.id, 'a');
  await assert.rejects(service.publishPost(post.id, 'a'), /campaign is not approved/);
  await service.transitionCampaign(campaign.id, 'approve', 'owner');
  const handed = await service.publishPost(post.id, 'a');
  assert.equal(handed.status, 'ready-for-manual', 'no connected account: manual handoff, nothing sent');
  const recorded = await service.recordManualPost(post.id, { url: 'https://facebook.com/protv/posts/1' }, 'a');
  assert.equal(recorded.status, 'published');
  assert.equal((await service.publishPost(post.id, 'a')).receipt.url, 'https://facebook.com/protv/posts/1');
  const second = await service.createPost({ platform: 'facebook', campaignId: campaign.id, scheduledAt: NOW + 3600_000 }, 'a');
  await service.approvePost(second.id, 'a');
  await service.transitionCampaign(campaign.id, 'activate', 'owner');
  await service.transitionCampaign(campaign.id, 'pause', 'owner');
  assert.equal((await service.listPosts()).find((item) => item.id === second.id).status, 'held');
});

test('the seven-day plan drafts from the real lineup and never advertises an unreleased premiere', async () => {
  const { service } = harness();
  const all = await service.liveUpcoming(48, { includeUnplayable: true });
  assert.deepEqual(all.map((item) => [item.videoId, item.playable]), [[CAESAR, true], ['creator_episode_unreleased', false]]);
  assert.equal((await service.liveUpcoming(48)).length, 1, 'only slots the channel will actually play are promotable');
  const plan = await service.sevenDayPlan('a', { platforms: ['facebook'] });
  assert.equal(plan.posts.length, 1);
  assert.equal(plan.posts[0].status, 'draft');
  assert.match(plan.posts[0].caption, /PROtv LIVE/);
  assert.ok(!JSON.stringify(plan.posts).includes('unreleased'));
});

test('paid advertising: $0 by default, caps enforced, nothing reaches Meta without a connected account', async () => {
  const { service } = harness();
  const campaign = await service.createCampaign({ name: 'Paid test', type: 'paid-acquisition' }, 'a');
  const draft = await service.createAd({ campaignId: campaign.id, dailyBudgetUsd: 10, totalBudgetUsd: 50 }, 'a');
  assert.equal(draft.status, 'draft');
  assert.equal(draft.estimate.kind, 'estimate');
  await assert.rejects(service.adAction(draft.id, 'approve', 'owner'), /monthly advertising cap is \$0/);
  await service.saveSettings({ ads: { monthlyCapUsd: 40 } }, 'owner');
  await assert.rejects(service.adAction(draft.id, 'approve', 'owner'), /only \$40.00 of the \$40.00/);
  await service.saveSettings({ ads: { monthlyCapUsd: 100 } }, 'owner');
  assert.equal((await service.adAction(draft.id, 'approve', 'owner')).status, 'approved');
  await assert.rejects(service.adAction(draft.id, 'prepare', 'owner'), /Connect the Meta account/);
  await service.adAction(draft.id, 'emergency-pause', 'owner');
  assert.equal((await service.settings()).ads.emergencyPause, true);
  assert.equal(ads.budgetCheck({ dailyBudgetUsd: 5, totalBudgetUsd: 10 }, await service.settings(), []).ok, false);
});

test('measurement: anonymous aggregate counters, observed vs reported, invalid events refused', async () => {
  const { service, store } = harness();
  const campaign = await service.createCampaign({ name: 'Measured', type: 'free-streaming' }, 'a');
  for (const event of ['visit', 'visit', 'play', 'session']) assert.equal(await service.record({ event, campaign: campaign.id, content: 'abc123' }), true);
  assert.equal(await service.record({ event: 'visit', campaign: 'not-a-campaign' }), false);
  assert.equal(await service.record({ event: 'purchase', campaign: campaign.id }), false);
  const stored = await store.list('stats');
  assert.ok(stored.every((row) => !('ip' in row) && !('userId' in row)));
  const report = await service.report({ days: 30 });
  assert.equal(report.totals.kind, 'observed');
  assert.deepEqual(report.campaigns[0].observed, { clicks: 0, visits: 2, playStarts: 1, meaningfulSessions: 1, returningVisits: 0, days: 1 });
  assert.equal(report.campaigns[0].reported, null, 'no spend is reported, so no cost per session is invented');
  assert.equal(analytics.trackingUrl({ campaignId: 'mc_abcdefgh12', platform: 'tiktok' }), 'https://watchprotv.com/?utm_source=tiktok&utm_medium=social&utm_campaign=mc_abcdefgh12');
});

test('Hype Clip Studio exports become library assets once (deduplicated)', async () => {
  const { service, store } = harness();
  const first = await service.importHypeClip('hype-1', 'a');
  const second = await service.importHypeClip('hype-1', 'a');
  assert.equal(first.id, second.id);
  assert.equal((await store.list('assets')).length, 1);
  assert.equal((await service.listAssets()).hypeClips[0].imported, true);
});

test('social connectors: not configured without app credentials; tokens sealed; OAuth state single-use', async () => {
  const saved = { ...process.env };
  try {
    delete process.env.META_APP_ID;
    assert.equal(social.platformStatus('facebook', null).state, 'not-configured');
    assert.equal(social.platformStatus('manual', null).state, 'ready');
    process.env.MARKETING_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
    const sealed = social.seal({ access: 'secret-token' });
    assert.ok(!sealed.includes('secret-token'));
    assert.deepEqual(social.unseal(sealed), { access: 'secret-token' });
    process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
    const { service } = harness();
    const { url } = await service.startConnect('youtube', 'https://watchprotv.com/api/marketing/oauth/youtube/callback', 'a');
    assert.match(url, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    await assert.rejects(service.finishConnect({ state: 'forged', code: 'x' }), /expired/);
  } finally { process.env = saved; }
});

test('the agent routes instructions to workflows', () => {
  assert.equal(classify('Create a commercial for PROtv.'), 'network-commercial');
  assert.equal(classify('Promote Ironborn this week.'), 'promote-title');
  assert.equal(classify("Promote tonight's LIVE lineup."), 'tonight-live');
  assert.equal(classify('Prepare seven days of Facebook posts.'), 'seven-days');
  assert.equal(classify('Make vertical versions of our commercials.'), 'vertical-versions');
  assert.equal(classify('Which movie should we advertise next?'), 'what-next');
  assert.equal(classify('Show me what marketing generated the most viewers.'), 'results');
  assert.equal(classify("Prepare this week's creator promotions."), 'creator-week');
  assert.equal(classify('Create a 30-second sponsor commercial.'), 'sponsor-commercial');
});

test('portal requests are signed; the dispatcher accepts only a valid signature or the cron secret', async (context) => {
  let seen = null;
  const client = createPortalClient({ baseUrl: () => 'https://portal.test', secret: () => 'shared', now: () => 1795600000000, fetcher: async (url, options) => { seen = { url, options }; return new Response(JSON.stringify({ id: 'x', status: 'queued' }), { status: 202 }); } });
  await client.submitRender({ id: 'plan-123456' });
  const body = JSON.stringify({ plan: { id: 'plan-123456' } });
  assert.equal(seen.options.headers['X-PROtv-Marketing-Signature'], marketingSignature('shared', 'POST', '/api/integrations/marketing/renders', '1795600000000', body));
  const app = express();
  app.get('/integrations/marketing/dispatch', createDispatchHandler({ service: { dispatchDue: async () => ({ due: 0, results: [] }) }, secret: () => 'shared', cronSecret: () => 'cron' }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/integrations/marketing/dispatch`;
  assert.equal((await fetch(url)).status, 401);
  const timestamp = String(Date.now());
  const signed = await fetch(url, { headers: { 'X-PROtv-Marketing-Timestamp': timestamp, 'X-PROtv-Marketing-Signature': marketingSignature('shared', 'GET', '/integrations/marketing/dispatch', timestamp, '') } });
  assert.equal(signed.status, 200);
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer cron' } })).status, 200);
  assert.equal((await fetch(url, { headers: { 'X-PROtv-Marketing-Timestamp': timestamp, 'X-PROtv-Marketing-Signature': 'f'.repeat(64) } })).status, 401);
});

test('downloads: the original render when the worker holds it, otherwise the Mux master (prepared once, then ready)', async () => {
  const { service, store, renders } = harness();
  await store.put('assets', 'as_render', { title: 'Spot · 16:9 (PROtv LIVE / YouTube)', format: 'widescreen', renderJobId: 'job-1', muxAssetId: 'asset-r', status: 'approved' });
  renders.set('job-1', { status: 'ready' });
  const original = await service.downloadAsset('as_render', 'owner');
  assert.equal(original.status, 'ready');
  assert.match(original.url, /^https:\/\/portal\.test\/render\/job-1/);
  assert.match(original.source, /Original render/);
  assert.equal(original.name, 'PROtv-Spot-16x9.mp4');
  await store.put('assets', 'as_hype', { title: 'Clip', format: 'vertical', hypeClipJobId: 'hype-9', status: 'approved' });
  assert.match((await service.downloadAsset('as_hype', 'owner')).url, /\/hype\/hype-9/);
  const muxState = { master_access: 'none', master: null };
  let enabled = 0;
  const local = harness({ mux: { getAsset: async () => muxState, enableMasterAccess: async () => { enabled += 1; muxState.master_access = 'temporary'; muxState.master = { status: 'preparing' }; } } });
  await local.store.put('assets', 'as_local', { title: 'First', format: 'vertical', muxAssetId: 'asset-local', status: 'approved' });
  assert.equal((await local.service.downloadAsset('as_local', 'owner')).status, 'preparing');
  assert.equal((await local.service.downloadAsset('as_local', 'owner')).status, 'preparing');
  assert.equal(enabled, 1, 'Mux is asked once, not on every poll');
  muxState.master = { status: 'ready', url: 'https://master.mux.com/first.mp4' };
  const ready = await local.service.downloadAsset('as_local', 'owner');
  assert.deepEqual([ready.status, ready.url], ['ready', 'https://master.mux.com/first.mp4']);
  await assert.rejects(local.service.downloadAsset('missing', 'owner'), /Asset not found/);
});

test('Facebook and Instagram publish only through PROtv Social Studio: queue, claim once, results, test mode', async () => {
  const { service, store } = harness();
  const campaign = await service.createCampaign({ name: 'PSS flow', type: 'network-awareness', platforms: ['facebook', 'instagram'] }, 'a');
  await service.transitionCampaign(campaign.id, 'approve', 'owner');
  await store.put('assets', 'as_w', { title: 'Spot', format: 'widescreen', renderJobId: 'job-w', status: 'approved' });
  const fb = await service.createPost({ platform: 'facebook', campaignId: campaign.id, assetId: 'as_w' }, 'a');
  await service.approvePost(fb.id, 'a');
  assert.equal((await service.publishPost(fb.id, 'a')).status, 'ready-for-manual', 'PSS not linked yet: manual handoff, nothing sent');
  await store.put('posts', fb.id, { ...(await store.get('posts', fb.id)), status: 'approved', error: '' });
  await service.pssHeartbeat({ connected: true, facebookReady: true, instagramReady: true, page: { id: 'p', name: 'PROtv' }, instagram: { id: 'i', username: 'watchprotv' } });
  const accounts = await service.accounts();
  assert.deepEqual(accounts.filter((item) => ['facebook', 'instagram'].includes(item.id)).map((item) => [item.state, item.via, item.account.label]), [['connected', 'PROtv Social Studio', 'PROtv'], ['connected', 'PROtv Social Studio', '@watchprotv']]);
  await assert.rejects(service.startConnect('facebook', 'https://x', 'a'), /connected in PROtv Social Studio/);
  assert.equal((await service.testPost(fb.id, 'a')).status, 'queued-pss');
  const queue = await service.pssQueue();
  assert.deepEqual(queue.items.map((item) => [item.id, item.platform, item.mode]), [[fb.id, 'facebook', 'test']]);
  assert.match(queue.items[0].mediaUrl, /^https:\/\/portal\.test\/render\/job-w/);
  assert.deepEqual(await service.pssClaim(fb.id), { claimed: true });
  await assert.rejects(service.pssClaim(fb.id), /not waiting/, 'a post is claimed only once');
  const tested = await service.pssResult(fb.id, { status: 'test-uploaded', postId: 'v123', note: 'unpublished' });
  assert.equal(tested.status, 'test-passed');
  assert.equal(tested.receipt.test, true);
  assert.equal((await service.publishPost(fb.id, 'a')).status, 'queued-pss', 'after a test, the real publish still goes through PSS');
  await service.pssClaim(fb.id);
  const live = await service.pssResult(fb.id, { status: 'published', postId: 'v124', permalink: 'https://www.facebook.com/p/videos/v124' });
  assert.equal(live.status, 'published');
  assert.equal(live.receipt.url, 'https://www.facebook.com/p/videos/v124');
  assert.equal((await service.publishPost(fb.id, 'a')).receipt.platformPostId, 'v124', 'a published post is never sent again');
  const ig = await service.createPost({ platform: 'instagram', campaignId: campaign.id, assetId: 'as_w' }, 'a');
  await service.approvePost(ig.id, 'a');
  await service.publishPost(ig.id, 'a');
  await service.pssClaim(ig.id);
  assert.equal((await service.pssResult(ig.id, { status: 'unknown', message: 'timeout' })).status, 'needs-check', 'uncertain: never retried automatically');
});

test('PSS endpoints require a valid signature', async (context) => {
  const { createPssRouter, pssSignature } = require('../src/marketing/pss');
  const app = express();
  app.use(express.json());
  app.use('/integrations/pss', createPssRouter({ service: { pssHeartbeat: async () => ({ ok: true }), pssQueue: async () => ({ items: [] }) }, secret: () => 'k'.repeat(43) }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/integrations/pss/queue`;
  assert.equal((await fetch(url)).status, 401);
  const ts = String(Date.now());
  assert.equal((await fetch(url, { headers: { 'X-PROtv-PSS-Timestamp': ts, 'X-PROtv-PSS-Signature': pssSignature('k'.repeat(43), 'GET', '/integrations/pss/queue', ts, '') } })).status, 200);
  assert.equal((await fetch(url, { headers: { 'X-PROtv-PSS-Timestamp': ts, 'X-PROtv-PSS-Signature': pssSignature('wrong'.repeat(9), 'GET', '/integrations/pss/queue', ts, '') } })).status, 401);
});

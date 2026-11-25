// PROtv Marketing Studio service: campaigns, AI Commercial Studio, assets, social calendar and publishing, paid
// advertising governance, LIVE commercial hand-off, creator promotion and measurement, behind one set of rules:
//   - real data only (catalog, LIVE master schedule, observed counters); nothing invented is shown as a result;
//   - footage only where marketing rights allow it (marketing/rights.js), checked again before every render;
//   - nothing public, paid or on air happens without an Administrator's approval; every action is audited.
const { newId } = require('./store');
const planner = require('./planner');
const rights = require('./rights');
const social = require('./social');
const ads = require('./ads');
const analytics = require('./analytics');

class MarketingError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

const CAMPAIGN_TYPES = ['network-awareness', 'film-premiere', 'new-episode', 'live-promotion', 'creator-spotlight', 'genre-discovery', 'weekend-lineup', 'free-streaming', 'sponsor', 'paid-acquisition', 'retargeting'];
const CAMPAIGN_STATES = ['draft', 'in-review', 'approved', 'active', 'paused', 'completed', 'archived'];
const COMMERCIAL_CATEGORIES = ['network', 'title', 'sponsor'];
const DURATIONS = [15, 30, 60];
const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'manual'];
const PLATFORM_FORMAT = { facebook: 'widescreen', instagram: 'vertical', tiktok: 'vertical', youtube: 'widescreen', manual: 'vertical' };
const DEFAULT_SETTINGS = Object.freeze({
  ads: { monthlyCapUsd: 0, emergencyPause: false, assumedCpmUsd: { low: 4, high: 12 }, metaAdAccountId: '', metaPageId: '' },
  ai: { textViaPortal: true, renderAllowanceUsd: 0 },
  aiVideo: { provider: 'none', enabled: false, monthlyCapUsd: 0 },
  publishing: { timeZone: 'America/New_York' },
});
// Optional generative-video providers (pluggable; none is active by default). Prices change: the Studio shows the
// configured per-second rate and never runs a paid generation without an approved allowance.
const VIDEO_PROVIDERS = Object.freeze({
  none: { name: 'No generation (assemble from authorized footage and graphics)', env: [], perSecondUsd: 0 },
  runway: { name: 'Runway API (image/video to video)', env: ['RUNWAY_API_KEY'], perSecondUsd: null, docs: 'https://docs.dev.runwayml.com' },
  luma: { name: 'Luma Dream Machine API', env: ['LUMA_API_KEY'], perSecondUsd: null, docs: 'https://docs.lumalabs.ai' },
  veo: { name: 'Google Veo (Vertex AI)', env: ['GOOGLE_VERTEX_PROJECT'], perSecondUsd: null, docs: 'https://cloud.google.com/vertex-ai/generative-ai/docs/video/overview' },
});

const iso = (value) => new Date(value).toISOString();
const text = (value, max = 2000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const etLabel = (at) => new Date(at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(/:00(?= [AP]M)/, '') + ' ET';
const slug = (value) => String(value || '').normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '').slice(0, 30);

function createMarketingService({ store, portal, loadCatalog, linearStore = null, linearService = null, mux = null, now = () => Date.now(), fetcher = fetch, audit = async () => {} } = {}) {
  const at = () => new Date(now());
  const stamp = () => at().toISOString();
  async function log(actor, action, message, details = {}) {
    const entry = { at: stamp(), actor: actor || 'system', action, message, details };
    await store.put('audit', newId('ma'), entry);
    await audit({ type: `marketing.${action}`, actorId: actor || 'system', message, details }).catch(() => {});
  }
  async function settings() {
    const saved = await store.get('settings', 'studio');
    return { ...structuredClone(DEFAULT_SETTINGS), ...(saved || {}), ads: { ...DEFAULT_SETTINGS.ads, ...(saved?.ads || {}) }, ai: { ...DEFAULT_SETTINGS.ai, ...(saved?.ai || {}) }, aiVideo: { ...DEFAULT_SETTINGS.aiVideo, ...(saved?.aiVideo || {}) } };
  }
  async function catalogMap() { return new Map((await loadCatalog()).map((video) => [video.id, video])); }

  // ---------------------------------------------------------------- real programming data
  // The LIVE master schedule as viewers will see it. A slot is promotable only if the channel itself would play it
  // (linear rights confirmed, title released, no hold), using the channel's own rules; U.S.-limited grants are flagged.
  // Premieres and other unplayable slots are returned only on request, never as something to advertise.
  async function liveUpcoming(hours = 7 * 24, { includeUnplayable = false } = {}) {
    if (!linearStore) return [];
    const { airState, rightsKeysFor } = require('../linear/model');
    const from = iso(now());
    const entries = (await linearStore.listEntries(from, iso(now() + hours * 3600_000))).filter((entry) => entry.status === 'approved' && entry.kind === 'program');
    const videos = await linearStore.getVideos([...new Set(entries.map((entry) => entry.videoId))]);
    const grants = linearStore.getRights ? await linearStore.getRights([...videos.values()].flatMap(rightsKeysFor)) : new Map();
    return entries.sort((a, b) => a.startAt.localeCompare(b.startAt)).map((entry) => {
      const video = videos.get(entry.videoId);
      const playable = Boolean(video) && airState(entry, video, grants, Date.parse(entry.startAt) + 1000) === 'playing';
      const grant = video ? grants.get(`title_${video.id}`) : null;
      return { entryId: entry.id, videoId: entry.videoId, title: video ? (video.contentType === 'EPISODE' && video.seriesTitle ? `${video.seriesTitle}: ${video.title}` : video.title) : '(premiere not yet delivered)', startAt: entry.startAt, endAt: entry.endAt, startLabel: etLabel(entry.startAt), programType: entry.programType, creator: String(entry.videoId || '').startsWith('creator_'), released: Boolean(video && video.approvalStatus === 'approved'), playable, usOnly: grant?.signedPlaybackRequired === true };
    }).filter((item) => includeUnplayable || item.playable);
  }
  async function eligibleFootage({ destination = 'social', network = false } = {}) {
    const videos = await loadCatalog();
    return videos.map((video) => ({ video, decision: rights.footageClearance(video, { destination, network, now: at() }) }))
      .filter((item) => item.decision.allowed && item.video.muxPlaybackId && Number(item.video.duration) > 60)
      .map(({ video, decision }) => ({ id: video.id, title: video.title, contentType: video.contentType, duration: Number(video.duration), poster: video.posterUrl || video.thumbnailUrl || '', muxPlaybackId: video.muxPlaybackId, genre: video.genre || video.category || '', creator: video.id.startsWith('creator_'), scope: decision.scope, conditions: decision.conditions, basis: decision.basis, excerptUntil: rights.excerptWindow(video).to }));
  }

  // ---------------------------------------------------------------- campaigns
  async function createCampaign(input, actor) {
    const type = CAMPAIGN_TYPES.includes(input?.type) ? input.type : null;
    if (!type) throw new MarketingError('Choose a campaign type.');
    const name = text(input.name, 120);
    if (name.length < 3) throw new MarketingError('Name the campaign.');
    const platforms = (Array.isArray(input.platforms) ? input.platforms : []).filter((item) => PLATFORMS.includes(item));
    const campaign = {
      name, type, objective: text(input.objective, 300) || 'Genuine viewers and repeat viewing', titleIds: (input.titleIds || []).slice(0, 20).map(String),
      sponsorId: text(input.sponsorId, 80), audience: text(input.audience, 400), platforms, cta: text(input.cta, 120) || 'Watch free at watchprotv.com',
      landingPage: text(input.landingPage, 300) || 'https://watchprotv.com/', startDate: text(input.startDate, 10) || stamp().slice(0, 10), endDate: text(input.endDate, 10) || '',
      budgetUsd: Number(input.budgetUsd) > 0 ? Number(input.budgetUsd) : 0, status: 'draft', assetIds: [], commercialIds: [], notes: text(input.notes, 2000),
      template: Boolean(input.template), createdBy: actor, createdAt: stamp(), updatedAt: stamp(), history: [{ at: stamp(), actor, status: 'draft' }],
    };
    if (campaign.endDate && campaign.endDate < campaign.startDate) throw new MarketingError('The campaign ends before it starts.');
    const id = newId('mc');
    const saved = await store.put('campaigns', id, { ...campaign, trackingLinks: platforms.map((platform) => ({ platform, url: analytics.trackingUrl({ campaignId: id, platform, destination: campaign.landingPage }) })) });
    await log(actor, 'campaign_create', `Created campaign "${name}".`, { campaignId: id });
    return saved;
  }
  async function updateCampaign(id, input, actor) {
    const campaign = await requireRecord('campaigns', id, 'Campaign');
    const patch = {};
    for (const key of ['name', 'objective', 'audience', 'cta', 'landingPage', 'startDate', 'endDate', 'notes']) if (input[key] !== undefined) patch[key] = text(input[key], key === 'notes' ? 2000 : 300);
    if (input.platforms) patch.platforms = input.platforms.filter((item) => PLATFORMS.includes(item));
    if (input.titleIds) patch.titleIds = input.titleIds.slice(0, 20).map(String);
    if (input.budgetUsd !== undefined) patch.budgetUsd = Math.max(0, Number(input.budgetUsd) || 0);
    const revised = campaign.status === 'approved' || campaign.status === 'active';
    const saved = await store.put('campaigns', id, { ...campaign, ...patch, ...(revised ? { status: 'in-review' } : {}), updatedAt: stamp(), history: [...campaign.history, { at: stamp(), actor, status: revised ? 'in-review' : campaign.status, note: 'revised' }] });
    await log(actor, 'campaign_update', `Revised campaign "${saved.name}"${revised ? '; it needs approval again' : ''}.`, { campaignId: id });
    return saved;
  }
  const TRANSITIONS = { submit: ['draft', 'in-review'], approve: ['in-review', 'approved'], activate: ['approved', 'active'], pause: ['active', 'paused'], resume: ['paused', 'active'], complete: ['active', 'completed'], archive: [null, 'archived'], reopen: ['archived', 'draft'] };
  async function transitionCampaign(id, action, actor, note = '') {
    const campaign = await requireRecord('campaigns', id, 'Campaign');
    const rule = TRANSITIONS[action];
    if (!rule) throw new MarketingError('Unknown campaign action.');
    if (rule[0] && campaign.status !== rule[0] && !(action === 'approve' && campaign.status === 'draft')) throw new MarketingError(`A ${campaign.status} campaign cannot be ${action}d.`);
    const saved = await store.put('campaigns', id, { ...campaign, status: rule[1], updatedAt: stamp(), ...(action === 'approve' ? { approvedBy: actor, approvedAt: stamp() } : {}), history: [...campaign.history, { at: stamp(), actor, status: rule[1], note: text(note, 500) }] });
    if (action === 'pause') for (const post of await store.list('posts', { where: { campaignId: id } })) if (post.status === 'scheduled') await store.put('posts', post.id, { ...post, status: 'held', updatedAt: stamp() });
    await log(actor, `campaign_${action}`, `Campaign "${campaign.name}" ${rule[1]}.`, { campaignId: id, note });
    return saved;
  }
  async function duplicateCampaign(id, actor) {
    const campaign = await requireRecord('campaigns', id, 'Campaign');
    return createCampaign({ ...campaign, name: `${campaign.name} (copy)`, template: false }, actor);
  }

  // ---------------------------------------------------------------- AI Commercial Studio
  async function autoPicks(video, count) {
    const window = rights.excerptWindow(video);
    const span = Math.max(30, window.to - 20);
    return Array.from({ length: count }, (_, index) => ({ videoId: video.id, sourceTitle: video.title, startSeconds: Math.round(Math.max(10, span * (0.15 + index * (0.7 / Math.max(1, count))))), focusX: 0.5 }));
  }
  async function createCommercial(input, actor) {
    const category = COMMERCIAL_CATEGORIES.includes(input?.category) ? input.category : null;
    if (!category) throw new MarketingError('Choose a commercial category: network, title or sponsor.');
    const durationSeconds = DURATIONS.includes(Number(input.durationSeconds)) ? Number(input.durationSeconds) : 30;
    const tone = planner.TONES.includes(input.tone) ? input.tone : 'cinematic';
    const videos = await catalogMap();
    let storyboard = [];
    let title = text(input.title, 120);
    if (category === 'network') {
      const picks = Array.isArray(input.picks) && input.picks.length >= 11 ? input.picks : null;
      if (!picks) {
        const pool = (await eligibleFootage({ destination: 'social', network: true })).filter((item) => item.creator && item.contentType !== 'EPISODE');
        if (pool.length < 4) throw new MarketingError('Not enough cleared creator footage for a network spot.');
        const ordered = [...pool].sort((a, b) => (a.scope === 'title-and-protv' ? -1 : 0) - (b.scope === 'title-and-protv' ? -1 : 0));
        const chosen = [];
        for (let index = 0; chosen.length < 11; index += 1) {
          const item = ordered[index % ordered.length];
          chosen.push(...await autoPicks(videos.get(item.id), 1).then((list) => list.map((pick) => ({ ...pick, startSeconds: Math.round(item.excerptUntil * (0.12 + ((index * 0.37) % 0.8) * 0.85)) }))));
        }
        storyboard = planner.networkFreeStoryboard(chosen);
      } else storyboard = planner.networkFreeStoryboard(picks);
      title = title || 'Your Next Favorite Movie Is FREE';
      if (durationSeconds !== 30) throw new MarketingError('The network template is 30 seconds; choose a title spot for 15 or 60 seconds.');
    } else if (category === 'title') {
      const video = videos.get(String(input.videoId || ''));
      if (!video) throw new MarketingError('Choose a published title.');
      const decision = rights.footageClearance(video, { destination: 'social', now: at() });
      if (!decision.allowed) throw new MarketingError(`This title cannot be used in marketing: ${decision.deny.join(', ')}.`);
      const airing = (await liveUpcoming(72)).find((item) => item.videoId === video.id);
      const sceneCount = durationSeconds === 15 ? 2 : durationSeconds === 30 ? 4 : 8;
      storyboard = planner.titleSpotStoryboard(video, Array.isArray(input.picks) && input.picks.length ? input.picks : await autoPicks(video, sceneCount), { durationSeconds, airing: input.mentionLive && airing ? airing.startLabel.toUpperCase() : null });
      title = title || `${video.title}: ${durationSeconds}s spot`;
    } else {
      // Sponsor commercials use only materials the sponsor supplied and approved (records in the sponsorship system).
      const sponsor = input.sponsor || {};
      if (text(sponsor.name, 120).length < 2) throw new MarketingError('Name the sponsor.');
      const claims = text(sponsor.offer, 200);
      storyboard = [
        { kind: 'card', durationSeconds: durationSeconds - 7, purpose: 'Sponsor message', text: { headline: 'SPONSORED BY', hero: text(sponsor.name, 60).toUpperCase(), sub: claims || text(sponsor.tagline, 120) } },
        { kind: 'logo', durationSeconds: 4, purpose: 'PROtv', text: { sub: 'FREE MOVIES · SERIES · LIVE TV' } },
        { kind: 'cta', durationSeconds: 3, purpose: 'Call to action', text: { headline: text(sponsor.cta, 40).toUpperCase() || 'VISIT', hero: text(sponsor.website, 40).toUpperCase().replace(/^HTTPS?:\/\//, '') || 'WATCHPROTV.COM' } },
      ];
      title = title || `${text(sponsor.name, 80)}: sponsor commercial`;
    }
    const id = newId('cm');
    const commercial = {
      title, category, durationSeconds, tone, audience: text(input.audience, 300), objective: text(input.objective, 300), cta: text(input.cta, 120) || 'Watch free at watchprotv.com',
      destinations: (input.destinations || ['live', 'social']).filter((item) => ['live', 'social', 'paid', 'website'].includes(item)),
      voiceover: { mode: 'none', note: 'No narration provider is connected; on-screen text carries the message.' },
      music: { kind: 'generated', mood: planner.MOOD_FOR_TONE[tone], bpm: tone === 'energetic' || tone === 'comedy' ? 128 : 120, source: 'Original music bed generated by the PROtv render worker (no third-party recording).' },
      sponsor: category === 'sponsor' ? { ...input.sponsor, approvalStatus: 'awaiting-sponsor' } : null,
      campaignId: text(input.campaignId, 40), storyboard, revision: 0, status: 'draft', renders: {}, reviews: [], provenance: [], costs: [],
      createdBy: actor, createdAt: stamp(), updatedAt: stamp(),
    };
    commercial.script = planner.scriptFor(commercial);
    commercial.captions = planner.captionsFor(commercial);
    commercial.brief = brief(commercial, videos);
    commercial.rightsCheck = rights.checkShots(planner.timeline(storyboard).map((beat) => ({ ...beat, titleOnScreen: Boolean(beat.titleOnScreen) })), videos, { destination: 'social', network: category === 'network', now: at() });
    const saved = await store.put('commercials', id, { ...commercial, id });
    await log(actor, 'commercial_create', `Created commercial "${title}" (${category}, ${durationSeconds}s).`, { commercialId: id });
    return saved;
  }
  function brief(commercial, videos) {
    const titles = [...new Set(commercial.storyboard.filter((beat) => beat.kind === 'footage').map((beat) => videos.get(beat.videoId)?.title || beat.sourceTitle))];
    return {
      objective: commercial.objective || (commercial.category === 'network' ? 'Introduce PROtv as the free home of independent movies, series and LIVE TV.' : 'Drive viewers to watch the title free on PROtv.'),
      audience: commercial.audience || 'U.S. adults who stream movies and series; fans of Black cinema and independent film',
      message: commercial.category === 'network' ? 'Your next favorite movie is free on PROtv.' : 'Now streaming free on PROtv.',
      tone: commercial.tone, durationSeconds: commercial.durationSeconds, footage: titles, cta: commercial.cta,
      rules: ['Only authorized footage, each creator excerpt identified on screen and taken before the ending', 'No claims about unreleased or unavailable content', 'Original music; no voice or likeness imitation'],
    };
  }
  async function updateStoryboard(id, storyboard, actor) {
    const commercial = await requireRecord('commercials', id, 'Commercial');
    if (!Array.isArray(storyboard) || !storyboard.length) throw new MarketingError('The storyboard is empty.');
    const total = storyboard.reduce((sum, beat) => sum + Number(beat.durationSeconds || 0), 0);
    if (Math.abs(total - commercial.durationSeconds) > 0.001) throw new MarketingError(`The beats add up to ${total} s; the commercial is ${commercial.durationSeconds} s.`);
    const videos = await catalogMap();
    const next = { ...commercial, storyboard, revision: commercial.revision + 1, status: 'draft', renders: {}, updatedAt: stamp() };
    next.script = planner.scriptFor(next);
    next.captions = planner.captionsFor(next);
    next.rightsCheck = rights.checkShots(planner.timeline(storyboard), videos, { destination: 'social', network: commercial.category === 'network', now: at() });
    await log(actor, 'commercial_revise', `Revised the storyboard of "${commercial.title}" (revision ${next.revision}).`, { commercialId: id });
    return store.put('commercials', id, next);
  }
  async function renderCommercial(id, { formats = ['widescreen', 'vertical'] } = {}, actor) {
    const commercial = await requireRecord('commercials', id, 'Commercial');
    if (commercial.category === 'sponsor' && commercial.sponsor?.materialsConfirmed !== true) throw new MarketingError('Confirm that the sponsor supplied and approved every material and claim before rendering.');
    const videos = await catalogMap();
    const problems = rights.checkShots(planner.timeline(commercial.storyboard), videos, { destination: 'social', network: commercial.category === 'network', now: at() });
    if (problems.length) throw new MarketingError(`Rights check failed: ${problems.join(' ')}`);
    const renders = { ...commercial.renders };
    for (const format of formats.filter((item) => planner.FORMATS[item])) {
      const destination = format === 'widescreen' && commercial.destinations.includes('live') ? 'live' : 'social';
      const plan = planner.renderPlan(commercial, format, { destination, videos });
      const job = await portal.submitRender(plan);
      renders[format] = { jobId: plan.id, status: job.status, progress: job.progress, destination, submittedAt: stamp(), validation: null, asset: null, error: '' };
    }
    await log(actor, 'commercial_render', `Sent "${commercial.title}" to the render worker (${Object.keys(renders).join(', ')}).`, { commercialId: id });
    return store.put('commercials', id, { ...commercial, renders, status: 'rendering', updatedAt: stamp() });
  }
  // Follows renders; a finished export is copied into Mux (for preview, LIVE and publishing) straight from the worker.
  async function refreshCommercial(id) {
    const commercial = await requireRecord('commercials', id, 'Commercial');
    const renders = { ...commercial.renders };
    let changed = false;
    for (const [format, render] of Object.entries(renders)) {
      if (render.status !== 'ready' || !render.asset) {
        const job = await portal.renderStatus(render.jobId).catch((error) => ({ status: render.status, error: error.message }));
        const next = { ...render, status: job.status, progress: job.progress ?? render.progress, stage: job.stage || render.stage, error: job.error || '', validation: job.validation || render.validation };
        if (job.status === 'ready' && !render.asset && mux) {
          const asset = await mux.createAssetFromUrl(portal.fileUrl('render', render.jobId), { playbackPolicy: 'public' });
          next.asset = { muxAssetId: asset.id, status: asset.status, playbackId: mux.getPlaybackId(asset, 'public') || null };
          const assetId = newId('as');
          await store.put('assets', assetId, { kind: 'commercial', format, commercialId: id, title: `${commercial.title} · ${planner.FORMATS[format].label}`, muxAssetId: asset.id, playbackId: next.asset.playbackId, durationSeconds: commercial.durationSeconds, source: 'Marketing Studio render', provenance: commercial.storyboard.filter((beat) => beat.kind === 'footage').map((beat) => ({ videoId: beat.videoId, title: beat.sourceTitle, startSeconds: beat.startSeconds, seconds: beat.durationSeconds })), music: commercial.music.source, validation: job.validation, renderJobId: render.jobId, status: 'pending-review', createdAt: stamp(), updatedAt: stamp() });
          next.assetRecordId = assetId;
        } else if (render.asset && render.asset.status !== 'ready' && mux) {
          const asset = await mux.getAsset(render.asset.muxAssetId);
          next.asset = { ...render.asset, status: asset?.status || render.asset.status, playbackId: mux.getPlaybackId(asset, 'public') || render.asset.playbackId };
        }
        if (JSON.stringify(next) !== JSON.stringify(render)) { renders[format] = next; changed = true; }
      }
    }
    const all = Object.values(renders);
    const status = all.length && all.every((render) => render.status === 'ready' && render.asset?.status === 'ready') ? (commercial.status === 'rendering' ? 'in-review' : commercial.status)
      : all.some((render) => render.status === 'failed') ? 'render-failed' : commercial.status;
    return changed || status !== commercial.status ? store.put('commercials', id, { ...commercial, renders, status, updatedAt: stamp() }) : commercial;
  }
  async function reviewCommercial(id, { decision, note }, actor) {
    const commercial = await requireRecord('commercials', id, 'Commercial');
    if (!['approve', 'reject'].includes(decision)) throw new MarketingError('Approve or reject.');
    if (decision === 'approve') {
      const ready = Object.values(commercial.renders).filter((render) => render.status === 'ready' && render.asset?.status === 'ready' && render.validation?.ok);
      if (!ready.length) throw new MarketingError('Nothing is rendered, validated and processed yet.');
      if (commercial.category === 'sponsor' && commercial.sponsor?.approvalStatus !== 'approved') throw new MarketingError('The sponsor must approve the final creative first (record their approval).');
    }
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const saved = await store.put('commercials', id, { ...commercial, status, reviews: [...commercial.reviews, { at: stamp(), actor, decision, note: text(note, 1000) }], updatedAt: stamp() });
    for (const asset of await store.list('assets', { where: { commercialId: id } })) await store.put('assets', asset.id, { ...asset, status: decision === 'approve' ? 'approved' : 'rejected', updatedAt: stamp() });
    await log(actor, `commercial_${decision}`, `${decision === 'approve' ? 'Approved' : 'Rejected'} "${commercial.title}".`, { commercialId: id, note });
    return saved;
  }
  async function recordSponsorApproval(id, { approved, by, note }, actor) {
    const commercial = await requireRecord('commercials', id, 'Commercial');
    if (commercial.category !== 'sponsor') throw new MarketingError('Only sponsor commercials need sponsor approval.');
    const sponsor = { ...commercial.sponsor, approvalStatus: approved ? 'approved' : 'changes-requested', approvalBy: text(by, 120), approvalNote: text(note, 1000), approvalRecordedAt: stamp(), approvalRecordedBy: actor };
    await log(actor, 'sponsor_approval', `Recorded sponsor ${approved ? 'approval' : 'change request'} for "${commercial.title}".`, { commercialId: id, by });
    return store.put('commercials', id, { ...commercial, sponsor, updatedAt: stamp() });
  }
  // A download link for a library video: the original render (or Hype Clip export) from the worker when it is held
  // there, otherwise Mux's stored master copy, which Mux prepares on request and keeps downloadable for 24 hours.
  async function downloadAsset(id, actor) {
    const asset = await requireRecord('assets', id, 'Asset');
    const name = `PROtv-${slug(asset.title).slice(0, 40) || 'video'}-${asset.format || 'video'}.mp4`;
    if (asset.renderJobId && portal.configured()) {
      const status = await portal.renderStatus(asset.renderJobId).catch(() => null);
      if (status?.status === 'ready') {
        await log(actor, 'asset_download', `Downloaded "${asset.title}" (original render).`, { assetId: id });
        return { status: 'ready', url: portal.fileUrl('render', asset.renderJobId, { ttlMs: 3600_000, download: true }), name, source: 'Original render from the PROtv render worker (link valid 1 hour)' };
      }
    }
    if (asset.hypeClipJobId && portal.configured()) {
      await log(actor, 'asset_download', `Downloaded "${asset.title}" (Hype Clip export).`, { assetId: id });
      return { status: 'ready', url: portal.fileUrl('hype', asset.hypeClipJobId, { ttlMs: 3600_000, download: true }), name, source: 'Hype Clip Studio export (link valid 1 hour)' };
    }
    if (!mux || !asset.muxAssetId) throw new MarketingError('This video has no downloadable copy.', 404);
    const current = await mux.getAsset(asset.muxAssetId);
    if (current?.master?.status === 'ready' && current.master.url) {
      await log(actor, 'asset_download', `Downloaded "${asset.title}" (Mux master copy).`, { assetId: id });
      return { status: 'ready', url: current.master.url, name, source: 'Mux master copy (link valid up to 24 hours)' };
    }
    if (current?.master?.status === 'errored') throw new MarketingError('Mux could not prepare a download of this video.', 502);
    if (current?.master_access !== 'temporary') {
      await mux.enableMasterAccess(asset.muxAssetId);
      await log(actor, 'asset_download_prepare', `Asked Mux to prepare a download of "${asset.title}".`, { assetId: id });
    }
    return { status: 'preparing', name, source: 'Mux is preparing the MP4 (usually under a minute)' };
  }

  // Hands an approved 16:9 commercial to the existing PROtv LIVE inventory as a DRAFT spot (no timeline change).
  async function registerForLive(id, { flightStart = null, flightEnd = null } = {}, actor) {
    const commercial = await requireRecord('commercials', id, 'Commercial');
    if (commercial.status !== 'approved') throw new MarketingError('Approve the commercial first.');
    const render = commercial.renders.widescreen;
    if (!render?.asset || render.asset.status !== 'ready' || render.destination !== 'live') throw new MarketingError('The 16:9 LIVE master (−24 LUFS) is not ready.');
    if (!linearService) throw new MarketingError('PROtv LIVE is not available.', 503);
    if (commercial.liveCreativeId) return { creativeId: commercial.liveCreativeId, already: true };
    const { creative } = await linearService.createCreative({
      source: 'marketing-asset', type: commercial.category === 'sponsor' ? 'sponsor' : 'promo', title: commercial.title.slice(0, 120),
      advertiser: commercial.category === 'sponsor' ? commercial.sponsor?.name : '', flightStart, flightEnd,
      notes: `Marketing Studio commercial ${id}. Footage: ${[...new Set(commercial.storyboard.filter((beat) => beat.kind === 'footage').map((beat) => beat.sourceTitle))].join(', ') || 'none'}. Music: original generated bed.`,
      muxAssetId: render.asset.muxAssetId, marketingCommercialId: id,
    }, actor);
    await store.put('commercials', id, { ...commercial, liveCreativeId: creative.id, updatedAt: stamp() });
    await log(actor, 'commercial_live_register', `Added "${commercial.title}" to PROtv LIVE spots as a draft (approve it under PROtv LIVE → Commercials to air it).`, { commercialId: id, creativeId: creative.id });
    return { creativeId: creative.id, status: creative.status };
  }

  // ---------------------------------------------------------------- assets (shared library, Hype Clip Studio)
  async function listAssets() {
    const own = await store.list('assets', { limit: 300 });
    let hype = [];
    let hypeError = '';
    try { hype = (await portal.hypeClips()).items || []; } catch (error) { hypeError = error.message; }
    const imported = new Set(own.filter((asset) => asset.hypeClipJobId).map((asset) => asset.hypeClipJobId));
    return { items: own, hypeClips: hype.map((clip) => ({ ...clip, imported: imported.has(clip.id) })), hypeError };
  }
  async function importHypeClip(jobId, actor) {
    const existing = (await store.list('assets', { where: { hypeClipJobId: jobId } }))[0];
    if (existing) return existing; // deduplicated: one library asset per Hype Clip export
    const clip = ((await portal.hypeClips()).items || []).find((item) => item.id === jobId);
    if (!clip) throw new MarketingError('That Hype Clip export is not available (it may have expired in Hype Clip Studio).', 404);
    if (!mux) throw new MarketingError('Video processing is not available.', 503);
    const asset = await mux.createAssetFromUrl(portal.fileUrl('hype', jobId), { playbackPolicy: 'public' });
    const record = await store.put('assets', newId('as'), { kind: 'hype-clip', format: clip.format, hypeClipJobId: jobId, title: `${clip.title} · Hype clip`, videoId: clip.videoId || '', projectId: clip.projectId, muxAssetId: asset.id, playbackId: mux.getPlaybackId(asset, 'public'), durationSeconds: clip.durationSeconds, source: 'Hype Clip Studio', rights: clip.rights, status: 'approved', createdAt: stamp(), updatedAt: stamp() });
    await log(actor, 'asset_import', `Imported Hype Clip "${clip.title}" into the asset library.`, { assetId: record.id, hypeClipJobId: jobId });
    return record;
  }

  // ---------------------------------------------------------------- social calendar and publishing
  function captionFor(platform, { title, line, link, hashtags }) {
    const tags = (hashtags || ['PROtv', 'FreeMovies', 'IndieFilm', 'BlackCinema', 'StreamingFree']).map((tag) => `#${slug(tag)}`).filter((tag) => tag.length > 1);
    if (platform === 'tiktok' || platform === 'instagram') return `${line}\n\n${title ? `${title} · ` : ''}Free on PROtv. Link in bio.\n\n${tags.slice(0, 5).join(' ')}`;
    if (platform === 'youtube') return `${line}\n\nWatch free: ${link}\n\n${tags.slice(0, 3).join(' ')}`;
    return `${line}\n\nWatch free on PROtv: ${link}\n\n${tags.slice(0, 4).join(' ')}`;
  }
  async function createPost(input, actor) {
    const platform = PLATFORMS.includes(input?.platform) ? input.platform : null;
    if (!platform) throw new MarketingError('Choose a platform.');
    const campaign = input.campaignId ? await requireRecord('campaigns', input.campaignId, 'Campaign') : null;
    const asset = input.assetId ? await requireRecord('assets', input.assetId, 'Asset') : null;
    const scheduledAt = input.scheduledAt ? iso(input.scheduledAt) : null;
    const postId = newId('mp');
    const link = campaign ? analytics.trackingUrl({ campaignId: campaign.id, postId: postId.slice(3, 15), platform, destination: input.destination || campaign.landingPage }) : (input.destination || 'https://watchprotv.com/');
    const caption = text(input.caption, 2200) || captionFor(platform, { title: input.title, line: text(input.line, 200) || 'Your next favorite movie is FREE.', link, hashtags: input.hashtags });
    const post = {
      platform, campaignId: campaign?.id || '', assetId: asset?.id || '', title: text(input.title, 100), caption, link, hashtags: input.hashtags || [],
      targetId: text(input.targetId, 80), mode: input.mode === 'draft' ? 'draft' : 'publish', scheduledAt, status: 'draft', attempts: 0, receipt: null, error: '',
      idempotencyKey: `${postId}`, createdBy: actor, createdAt: stamp(), updatedAt: stamp(), history: [{ at: stamp(), actor, status: 'draft' }],
    };
    const saved = await store.put('posts', postId, post);
    await log(actor, 'post_create', `Drafted a ${platform} post${scheduledAt ? ` for ${etLabel(scheduledAt)}` : ''}.`, { postId });
    return saved;
  }
  async function approvePost(id, actor) {
    const post = await requireRecord('posts', id, 'Post');
    if (!['draft', 'held', 'failed'].includes(post.status)) throw new MarketingError(`A ${post.status} post cannot be approved.`);
    if (post.assetId) { const asset = await store.get('assets', post.assetId); if (!asset || asset.status !== 'approved') throw new MarketingError('Approve the attached video first.'); }
    const status = post.scheduledAt ? 'scheduled' : 'approved';
    await log(actor, 'post_approve', `Approved the ${post.platform} post${post.scheduledAt ? ` scheduled for ${etLabel(post.scheduledAt)}` : ''}.`, { postId: id });
    return store.put('posts', id, { ...post, status, approvedBy: actor, approvedAt: stamp(), updatedAt: stamp(), history: [...post.history, { at: stamp(), actor, status }] });
  }
  async function accountTokens(platform) {
    const accountId = platform === 'instagram' ? 'facebook' : platform;
    const account = await store.get('accounts', accountId);
    if (!account || account.status !== 'connected') return null;
    let tokens = social.unseal(account.sealed);
    if (account.expiresAt && Date.parse(account.expiresAt) < now() + 120_000 && account.canRefresh) {
      const refreshed = await social.refreshTokens(accountId, tokens, fetcher);
      tokens = refreshed.tokens;
      await store.put('accounts', accountId, { ...account, sealed: social.seal(tokens), expiresAt: refreshed.expiresAt, updatedAt: stamp() });
    }
    return tokens;
  }
  // Publishes one approved post through its official connector (idempotent: a post with a receipt is never re-sent).
  async function publishPost(id, actor) {
    const post = await requireRecord('posts', id, 'Post');
    if (post.receipt) return post;
    if (!['approved', 'scheduled'].includes(post.status)) throw new MarketingError('Only an approved post can be published.');
    if (post.campaignId) { const campaign = await store.get('campaigns', post.campaignId); if (!campaign || !['approved', 'active'].includes(campaign.status)) throw new MarketingError('Its campaign is not approved or is paused.'); }
    if (post.platform === 'manual') return store.put('posts', id, { ...post, status: 'ready-for-manual', updatedAt: stamp() });
    const tokens = await accountTokens(post.platform);
    if (!tokens) {
      await log(actor, 'post_handoff', `The ${post.platform} account is not connected; the post moved to manual handoff.`, { postId: id });
      return store.put('posts', id, { ...post, status: 'ready-for-manual', error: `${post.platform} is not connected; post it manually from the handoff package.`, updatedAt: stamp() });
    }
    const asset = post.assetId ? await store.get('assets', post.assetId) : null;
    // Platforms pull the original MP4 through a short-lived signed link to the render worker (never a public bucket).
    const media = asset?.renderJobId ? { url: portal.fileUrl('render', asset.renderJobId, { ttlMs: 24 * 3600_000 }) }
      : asset?.hypeClipJobId ? { url: portal.fileUrl('hype', asset.hypeClipJobId, { ttlMs: 24 * 3600_000 }) } : null;
    if (!media) throw new MarketingError('Attach an approved video.');
    try {
      const receipt = await social.publish(post.platform, { tokens, post, media }, fetcher);
      await log(actor, 'post_publish', `Published the ${post.platform} post (${receipt.state}).`, { postId: id, remoteId: receipt.remoteId });
      return store.put('posts', id, { ...post, status: receipt.state === 'published' ? 'published' : 'draft-uploaded', receipt: { ...receipt, at: stamp() }, attempts: post.attempts + 1, error: '', updatedAt: stamp() });
    } catch (error) {
      const attempts = post.attempts + 1;
      const retry = error.transient && attempts < 4;
      await log(actor, 'post_failure', `The ${post.platform} post failed: ${error.message}${retry ? ' (will retry)' : ''}.`, { postId: id });
      return store.put('posts', id, { ...post, status: retry ? post.status : 'failed', attempts, error: error.message, nextAttemptAt: retry ? iso(now() + 2 ** attempts * 60_000) : null, updatedAt: stamp() });
    }
  }
  async function dispatchDue(actor = 'scheduler') {
    const due = (await store.list('posts', { where: { status: 'scheduled' } })).filter((post) => post.scheduledAt && Date.parse(post.scheduledAt) <= now() && (!post.nextAttemptAt || Date.parse(post.nextAttemptAt) <= now()));
    const results = [];
    for (const post of due.slice(0, 10)) results.push(await publishPost(post.id, actor).then((saved) => ({ id: post.id, status: saved.status })).catch((error) => ({ id: post.id, error: error.message })));
    return { due: due.length, results };
  }
  async function recordManualPost(id, { url }, actor) {
    const post = await requireRecord('posts', id, 'Post');
    if (!/^https:\/\/\S+$/.test(String(url || ''))) throw new MarketingError('Paste the address of the published post.');
    await log(actor, 'post_manual', `Recorded the manually published ${post.platform} post.`, { postId: id, url });
    return store.put('posts', id, { ...post, status: 'published', receipt: { state: 'published', url, manual: true, at: stamp() }, updatedAt: stamp() });
  }
  // A rolling seven-day plan drafted from the real LIVE lineup and catalog. Nothing is approved or published.
  async function sevenDayPlan(actor, { platforms = ['facebook', 'instagram', 'tiktok', 'youtube'] } = {}) {
    const lineup = (await liveUpcoming(7 * 24)).filter((item) => item.creator && item.released && item.programType !== 'premiere');
    const premieres = (await liveUpcoming(14 * 24, { includeUnplayable: true })).filter((item) => item.programType === 'premiere');
    const byDay = new Map();
    for (const item of lineup) {
      const day = item.startAt.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, item);
    }
    const campaign = await createCampaign({ name: `Seven-day plan from ${etLabel(now())}`, type: 'live-promotion', platforms, objective: 'Genuine viewers for this week\'s creator programming on PROtv LIVE', notes: 'Drafted automatically from the PROtv LIVE master schedule. Review and approve before anything is scheduled.' }, actor);
    const posts = [];
    for (const [, item] of [...byDay.entries()].slice(0, 7)) {
      const postAt = new Date(Date.parse(item.startAt) - 3 * 3600_000);
      for (const platform of platforms) {
        posts.push(await createPost({ platform, campaignId: campaign.id, title: item.title, line: `${item.title} airs ${item.startLabel} on PROtv LIVE. Free.`, scheduledAt: postAt.getTime() > now() ? postAt.toISOString() : null }, actor));
      }
    }
    return { campaign, posts, premieresNoted: premieres.map((item) => ({ title: item.title, startLabel: item.startLabel, note: 'Premiere: promote only after the episode is released and confirmed.' })) };
  }

  // ---------------------------------------------------------------- social accounts
  async function accounts() {
    const saved = new Map((await store.list('accounts')).map((account) => [account.id, account]));
    return Object.keys(social.PLATFORMS).map((id) => social.platformStatus(id, saved.get(id === 'instagram' ? 'facebook' : id)));
  }
  async function startConnect(platform, redirectUri, actor) {
    const status = social.platformStatus(platform, null);
    if (status.state === 'not-configured') throw new MarketingError(`${status.name} needs PROtv's developer app settings first: ${status.missingSettings.join(', ')}.`, 503);
    const crypto = require('node:crypto');
    const state = crypto.randomBytes(24).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    await store.put('oauth', state, { platform: platform === 'instagram' ? 'facebook' : platform, verifier, redirectUri, actor, expiresAt: iso(now() + 10 * 60_000), createdAt: stamp() });
    return { url: social.authorizeUrl(platform, { state, redirectUri, codeChallenge: challenge }) };
  }
  async function finishConnect({ state, code, error }) {
    const pending = await store.get('oauth', String(state || ''));
    if (!pending || Date.parse(pending.expiresAt) < now()) throw new MarketingError('This connection request expired. Start again from Social Accounts.');
    await store.remove('oauth', pending.id);
    if (error) throw new MarketingError(`The platform declined the connection: ${text(error, 200)}`);
    const result = await social.exchangeCode(pending.platform, { code, redirectUri: pending.redirectUri, codeVerifier: pending.verifier }, fetcher);
    await store.put('accounts', pending.platform, { status: 'connected', label: result.label, targets: result.targets, sealed: social.seal(result.tokens), expiresAt: result.expiresAt, canRefresh: result.canRefresh, connectedAt: stamp(), connectedBy: pending.actor, updatedAt: stamp() });
    await log(pending.actor, 'account_connect', `Connected ${pending.platform} (${result.label}).`, { platform: pending.platform });
    return { platform: pending.platform, label: result.label };
  }
  async function disconnect(platform, actor) {
    const id = platform === 'instagram' ? 'facebook' : platform;
    const account = await store.get('accounts', id);
    if (account) await store.put('accounts', id, { status: 'disconnected', label: account.label, disconnectedAt: stamp(), updatedAt: stamp() });
    await log(actor, 'account_disconnect', `Disconnected ${platform}; stored tokens were deleted.`, { platform });
    return accounts();
  }

  // ---------------------------------------------------------------- paid advertising
  async function createAd(input, actor) {
    const campaign = await requireRecord('campaigns', input.campaignId, 'Campaign');
    const draft = {
      campaignId: campaign.id, name: text(input.name, 120) || `${campaign.name} · Meta`, platform: 'meta', objective: ads.OBJECTIVES[input.objective] ? input.objective : 'video-views',
      dailyBudgetUsd: Math.max(0, Number(input.dailyBudgetUsd) || 0), totalBudgetUsd: Math.max(0, Number(input.totalBudgetUsd) || 0),
      startDate: text(input.startDate, 25), endDate: text(input.endDate, 25), assetId: text(input.assetId, 40), primaryText: text(input.primaryText, 500), headline: text(input.headline, 80),
      audience: { label: text(input.audience?.label, 120) || 'U.S. adults 18–54 interested in movies and streaming', ageMin: 18, ageMax: Number(input.audience?.ageMax) || 54, interests: [] },
      landingUrl: analytics.trackingUrl({ campaignId: campaign.id, platform: 'meta', medium: 'paid', destination: campaign.landingPage }),
      status: 'draft', approvals: [], meta: null, reported: null, createdBy: actor, createdAt: stamp(), updatedAt: stamp(),
    };
    const id = newId('ad');
    const record = await store.put('ads', id, { ...draft, estimate: ads.estimate(draft, await settings()) });
    await log(actor, 'ad_create', `Drafted paid campaign "${draft.name}" ($${draft.dailyBudgetUsd}/day, cap $${draft.totalBudgetUsd}). Nothing was sent to Meta.`, { adId: id });
    return record;
  }
  async function adAction(id, action, actor) {
    const draft = await requireRecord('ads', id, 'Paid campaign');
    const config = await settings();
    const all = await store.list('ads');
    if (action === 'approve') {
      const check = ads.budgetCheck(draft, config, all, { now: at() });
      if (!check.ok) throw new MarketingError(check.problems.join(' '));
      await log(actor, 'ad_approve', `Approved paid campaign "${draft.name}" for preparation (total cap $${draft.totalBudgetUsd}).`, { adId: id, check });
      return store.put('ads', id, { ...draft, status: 'approved', approvals: [...draft.approvals, { at: stamp(), actor, step: 'budget', capUsd: draft.totalBudgetUsd }], updatedAt: stamp() });
    }
    if (action === 'pause' || action === 'emergency-pause') {
      if (action === 'emergency-pause') await store.put('settings', 'studio', { ...config, ads: { ...config.ads, emergencyPause: true } });
      const targets = action === 'emergency-pause' ? all.filter((item) => item.status === 'active') : [draft];
      for (const item of targets) {
        if (item.meta) { const tokens = await accountTokens('facebook'); if (tokens) await ads.setMetaStatus(item.meta, tokens.user, 'PAUSED', fetcher); }
        await store.put('ads', item.id, { ...item, status: item.status === 'active' ? 'paused' : item.status, updatedAt: stamp() });
      }
      await log(actor, `ad_${action}`, action === 'emergency-pause' ? 'Emergency pause: every paid campaign was paused and new spending is blocked.' : `Paused "${draft.name}".`, { adId: id });
      return store.get('ads', id);
    }
    const tokens = await accountTokens('facebook');
    if (!tokens) throw new MarketingError('Connect the Meta account (with ads_management approved by Meta) before preparing paid campaigns.', 503);
    if (action === 'prepare') {
      if (draft.status !== 'approved') throw new MarketingError('Approve the budget first.');
      const check = ads.budgetCheck(draft, config, all, { now: at() });
      if (!check.ok) throw new MarketingError(check.problems.join(' '));
      const asset = await store.get('assets', draft.assetId);
      if (!asset?.metaVideoId) throw new MarketingError('Upload the creative to the Meta Page first (publish it as an unpublished Page video).');
      const meta = await ads.prepareMetaCampaign({ draft, token: tokens.user, adAccountId: config.ads.metaAdAccountId, pageId: config.ads.metaPageId, videoId: asset.metaVideoId, landingUrl: draft.landingUrl }, fetcher);
      await log(actor, 'ad_prepare', `Created "${draft.name}" in Meta, PAUSED (no spending).`, { adId: id, meta });
      return store.put('ads', id, { ...draft, status: 'prepared', meta, updatedAt: stamp() });
    }
    if (action === 'activate' || action === 'resume') {
      if (!['prepared', 'paused'].includes(draft.status) || !draft.meta) throw new MarketingError('Prepare the campaign in Meta first.');
      const check = ads.budgetCheck(draft, config, all, { now: at() });
      if (!check.ok) throw new MarketingError(check.problems.join(' '));
      await ads.setMetaStatus(draft.meta, tokens.user, 'ACTIVE', fetcher);
      await log(actor, 'ad_activate', `Activated "${draft.name}" (spending begins, capped at $${draft.totalBudgetUsd}).`, { adId: id });
      return store.put('ads', id, { ...draft, status: 'active', approvals: [...draft.approvals, { at: stamp(), actor, step: 'activate' }], updatedAt: stamp() });
    }
    throw new MarketingError('Unknown action.');
  }

  // ---------------------------------------------------------------- creator promotion center
  async function creatorKits() {
    const lineup = await liveUpcoming(7 * 24);
    const footage = await eligibleFootage({ destination: 'social' });
    const campaigns = await store.list('campaigns');
    return footage.filter((item) => item.creator).map((item) => {
      const airings = lineup.filter((slot) => slot.videoId === item.id).slice(0, 5);
      const watchUrl = `https://watchprotv.com/title/${encodeURIComponent(item.id)}`;
      return {
        videoId: item.id, title: item.title, poster: item.poster, genre: item.genre, rightsBasis: item.basis, conditions: item.conditions,
        nextAirings: airings.map((slot) => `${slot.startLabel}${slot.usOnly ? ' (U.S. viewers)' : ''}`),
        captions: [
          `${item.title} is streaming FREE on PROtv. ${watchUrl}`,
          airings[0] ? `Catch ${item.title} on PROtv LIVE ${airings[0].startLabel}. Free, no subscription.` : `Watch ${item.title} free, anytime, on PROtv.`,
          `Independent film deserves an audience. Watch ${item.title} free on PROtv.`,
        ],
        clipSuggestions: [0.15, 0.3, 0.45].map((fraction) => ({ startSeconds: Math.round(item.excerptUntil * fraction), seconds: 20, note: 'Excerpt before the ending; open it in Hype Clip Studio to cut and caption' })),
        campaigns: campaigns.filter((campaign) => campaign.titleIds?.includes(item.id)).map((campaign) => ({ id: campaign.id, name: campaign.name, status: campaign.status })),
      };
    });
  }

  // ---------------------------------------------------------------- analytics and overview
  async function report({ days = 30 } = {}) {
    const since = iso(now() - days * 86_400_000).slice(0, 10);
    const stats = (await store.list('stats', { limit: 5000 })).filter((row) => String(row.date || '') >= since);
    const campaigns = await store.list('campaigns');
    const adList = await store.list('ads');
    const summary = analytics.summarize(stats, campaigns, adList);
    const totals = summary.reduce((sum, row) => ({ clicks: sum.clicks + row.observed.clicks, visits: sum.visits + row.observed.visits, playStarts: sum.playStarts + row.observed.playStarts, meaningfulSessions: sum.meaningfulSessions + row.observed.meaningfulSessions }), { clicks: 0, visits: 0, playStarts: 0, meaningfulSessions: 0 });
    const recommendations = [];
    if (!summary.length) recommendations.push('No tracked marketing traffic yet. Approve the first social drafts so their tracked links start counting.');
    const best = summary.find((row) => row.observed.meaningfulSessions > 0);
    if (best) recommendations.push(`"${best.name}" produced the most meaningful viewing sessions (${best.observed.meaningfulSessions}); reuse its creative and posting times.`);
    for (const row of summary) if (row.observed.visits >= 20 && row.rates.visitToPlay !== null && row.rates.visitToPlay < 15) recommendations.push(`"${row.name}": only ${row.rates.visitToPlay}% of visits start a video; point its link at the title page instead of the home page.`);
    return { days, totals: { kind: 'observed', ...totals }, campaigns: summary, recommendations, note: 'Observed = counted by PROtv from tracked links and anonymous on-site events. Platform figures appear only when a connected account reports them. Estimates are labelled.' };
  }
  async function overview() {
    const [campaigns, commercials, posts, adList, config, lineup, assetList] = await Promise.all([
      store.list('campaigns'), store.list('commercials'), store.list('posts'), store.list('ads'), settings(), liveUpcoming(48), store.list('assets', { limit: 20 }),
    ]);
    const committed = adList.filter((item) => ['approved', 'prepared', 'active', 'paused'].includes(item.status)).reduce((sum, item) => sum + Number(item.totalBudgetUsd || 0), 0);
    const measured = await report({ days: 30 });
    const suggestions = [];
    if (!commercials.some((item) => item.status === 'approved')) suggestions.push('Review and approve the first network commercial.');
    if (!posts.length) suggestions.push('Generate the seven-day plan from the LIVE schedule.');
    const accountsState = await accounts();
    if (!accountsState.some((item) => item.state === 'connected')) suggestions.push('Social accounts are not connected; posts use the manual handoff until PROtv\'s developer apps are approved.');
    return {
      counts: {
        draftCampaigns: campaigns.filter((item) => item.status === 'draft').length,
        awaitingApproval: campaigns.filter((item) => item.status === 'in-review').length + commercials.filter((item) => item.status === 'in-review').length + posts.filter((item) => item.status === 'draft').length,
        scheduledPosts: posts.filter((item) => item.status === 'scheduled').length,
        publishingFailures: posts.filter((item) => item.status === 'failed').length,
        manualHandoffs: posts.filter((item) => item.status === 'ready-for-manual').length,
        activePaidCampaigns: adList.filter((item) => item.status === 'active').length,
      },
      budget: { monthlyCapUsd: config.ads.monthlyCapUsd, committedUsd: committed, remainingUsd: Math.max(0, config.ads.monthlyCapUsd - committed), emergencyPause: config.ads.emergencyPause },
      upcomingLive: lineup.filter((item) => item.creator).slice(0, 8),
      upcomingPremieres: (await liveUpcoming(14 * 24, { includeUnplayable: true })).filter((item) => item.programType === 'premiere').slice(0, 6),
      recentCommercials: commercials.slice(0, 6).map((item) => ({ id: item.id, title: item.title, status: item.status, renders: Object.fromEntries(Object.entries(item.renders || {}).map(([format, render]) => [format, { status: render.status, playbackId: render.asset?.playbackId || null }])) })),
      measured: measured.totals, topCampaigns: measured.campaigns.slice(0, 5), suggestions, recentAssets: assetList.slice(0, 6),
    };
  }

  async function requireRecord(kind, id, label) {
    const record = await store.get(kind, String(id || ''));
    if (!record) throw new MarketingError(`${label} not found.`, 404);
    return record;
  }

  return {
    settings, async saveSettings(input, actor) {
      const current = await settings();
      const next = { ...current };
      if (input.ads) next.ads = { ...current.ads, monthlyCapUsd: Math.max(0, Number(input.ads.monthlyCapUsd ?? current.ads.monthlyCapUsd) || 0), emergencyPause: Boolean(input.ads.emergencyPause ?? current.ads.emergencyPause), metaAdAccountId: text(input.ads.metaAdAccountId ?? current.ads.metaAdAccountId, 40), metaPageId: text(input.ads.metaPageId ?? current.ads.metaPageId, 40) };
      if (input.aiVideo) next.aiVideo = { ...current.aiVideo, provider: VIDEO_PROVIDERS[input.aiVideo.provider] ? input.aiVideo.provider : 'none', enabled: Boolean(input.aiVideo.enabled), monthlyCapUsd: Math.max(0, Number(input.aiVideo.monthlyCapUsd) || 0) };
      await store.put('settings', 'studio', next);
      await log(actor, 'settings', `Updated Marketing Studio settings (monthly ad cap $${next.ads.monthlyCapUsd}, emergency pause ${next.ads.emergencyPause ? 'on' : 'off'}).`, {});
      return next;
    },
    providers: () => Object.entries(VIDEO_PROVIDERS).map(([id, provider]) => ({ id, ...provider, configured: provider.env.every((name) => process.env[name]), missing: provider.env.filter((name) => !process.env[name]) })),
    overview, report, liveUpcoming, eligibleFootage,
    createCampaign, updateCampaign, transitionCampaign, duplicateCampaign, listCampaigns: () => store.list('campaigns'), getCampaign: (id) => requireRecord('campaigns', id, 'Campaign'),
    createCommercial, updateStoryboard, renderCommercial, refreshCommercial, reviewCommercial, recordSponsorApproval, registerForLive,
    listCommercials: () => store.list('commercials'), getCommercial: (id) => requireRecord('commercials', id, 'Commercial'),
    async cancelRender(id, format, actor) { const commercial = await requireRecord('commercials', id, 'Commercial'); const render = commercial.renders[format]; if (!render) throw new MarketingError('No such render.'); await portal.cancelRender(render.jobId); await log(actor, 'commercial_cancel', `Cancelled the ${format} render of "${commercial.title}".`, { commercialId: id }); return refreshCommercial(id); },
    srt: async (id) => planner.srt((await requireRecord('commercials', id, 'Commercial')).captions),
    listAssets, importHypeClip, downloadAsset,
    createPost, approvePost, publishPost, dispatchDue, recordManualPost, sevenDayPlan, listPosts: () => store.list('posts'),
    async cancelPost(id, actor) { const post = await requireRecord('posts', id, 'Post'); if (post.receipt) throw new MarketingError('This post was already published.'); await log(actor, 'post_cancel', `Withdrew the ${post.platform} post.`, { postId: id }); return store.put('posts', id, { ...post, status: 'cancelled', updatedAt: stamp() }); },
    accounts, startConnect, finishConnect, disconnect,
    createAd, adAction, listAds: () => store.list('ads'),
    creatorKits,
    auditLog: (limit = 100) => store.list('audit', { limit }),
    record: (event) => analytics.record(store, event),
  };
}

module.exports = { CAMPAIGN_TYPES, CAMPAIGN_STATES, COMMERCIAL_CATEGORIES, DURATIONS, PLATFORMS, PLATFORM_FORMAT, VIDEO_PROVIDERS, MarketingError, createMarketingService };

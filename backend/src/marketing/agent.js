// Marketing Studio agent: turns an Administrator's instruction into real Studio workflows (tool calls on the service),
// then reports exactly what it did. It may draft, plan, analyse and queue renders; it never publishes, spends, sends
// sponsor communications or puts anything on air: those stay behind the approval steps in the service.
const INTENTS = [
  { id: 'network-commercial', test: /\b(commercial|spot|ad)\b.*\b(protv|network|free streaming)\b|\b(protv|network)\b.*\bcommercial\b/i },
  { id: 'sponsor-commercial', test: /\bsponsor\b.*\bcommercial\b|\bcommercial\b.*\bsponsor\b/i },
  { id: 'vertical-versions', test: /\bvertical\b/i },
  { id: 'tonight-live', test: /\btonight\b|\blive lineup\b/i },
  { id: 'seven-days', test: /\b(seven|7)\b.*\bdays?\b|\bweek(ly)?\b.*\bposts?\b/i },
  { id: 'creator-week', test: /\bcreator promotions?\b|\bthis week'?s creator\b/i },
  { id: 'what-next', test: /\bwhich\b.*\b(advertise|promote)\b.*\bnext\b|\bwhat should we (advertise|promote)\b/i },
  { id: 'results', test: /\b(most viewers|what marketing|performance|results|report)\b/i },
  { id: 'promote-title', test: /\bpromote\b/i },
];

function classify(instruction) {
  const textValue = String(instruction || '');
  for (const intent of INTENTS) if (intent.test.test(textValue)) return intent.id;
  return 'unknown';
}

function findTitle(instruction, catalog) {
  const lower = String(instruction).toLowerCase();
  const scored = catalog.map((video) => {
    const names = [video.title, video.seriesTitle].filter(Boolean).map((name) => name.toLowerCase().replace(/[’']/g, "'"));
    const hit = names.find((name) => name.length > 2 && lower.includes(name));
    return { video, score: hit ? hit.length : 0 };
  }).filter((item) => item.score).sort((a, b) => b.score - a.score);
  return scored[0]?.video || null;
}

async function runAgent(service, instruction, actor, { loadCatalog }) {
  const intent = classify(instruction);
  const steps = [];
  const step = (label, detail = '') => steps.push({ label, detail });
  const footage = () => service.eligibleFootage({ destination: 'social' });

  if (intent === 'network-commercial') {
    const commercial = await service.createCommercial({ category: 'network', durationSeconds: 30, tone: 'cinematic', destinations: ['live', 'social'] }, actor);
    step('Planned the network commercial', `${commercial.storyboard.length} beats from ${commercial.brief.footage.length} cleared titles; rights check: ${commercial.rightsCheck.length ? commercial.rightsCheck.join(' ') : 'clear'}`);
    let rendered = null;
    if (!commercial.rightsCheck.length) {
      rendered = await service.renderCommercial(commercial.id, { formats: ['widescreen', 'vertical'] }, actor).catch((error) => { step('Render not started', error.message); return null; });
      if (rendered) step('Queued renders', '16:9 LIVE master and 9:16 social version on the render worker');
    }
    return { intent, steps, result: { commercialId: commercial.id }, next: ['Review the storyboard and previews in AI Commercial Studio', 'Approve, then add it to PROtv LIVE spots and create social drafts'] };
  }
  if (intent === 'sponsor-commercial') {
    step('Needs sponsor materials', 'Open Sponsor Commercials, choose the sponsor and enter only the details and claims they supplied and approved.');
    return { intent, steps, result: { form: 'sponsor' }, next: ['Fill in the sponsor brief', 'Confirm the materials are sponsor-approved, render, then record the sponsor\'s approval'] };
  }
  if (intent === 'vertical-versions') {
    const commercials = (await service.listCommercials()).filter((item) => item.renders?.widescreen && !item.renders?.vertical && item.status !== 'rejected');
    for (const commercial of commercials.slice(0, 5)) {
      await service.renderCommercial(commercial.id, { formats: ['vertical'] }, actor).then(() => step(`Queued a 9:16 version of "${commercial.title}"`)).catch((error) => step(`Could not render "${commercial.title}"`, error.message));
    }
    if (!commercials.length) step('Every commercial already has a vertical version');
    return { intent, steps, result: { count: commercials.length }, next: ['Review the vertical previews'] };
  }
  if (intent === 'tonight-live') {
    const lineup = (await service.liveUpcoming(30)).filter((item) => {
      const hour = Number(new Date(item.startAt).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
      return item.released && hour >= 17 && Date.parse(item.startAt) - Date.now() < 20 * 3600_000;
    }).slice(0, 6);
    if (!lineup.length) { step('No released programs tonight in the master schedule'); return { intent, steps, result: {} }; }
    const campaign = await service.createCampaign({ name: `Tonight on PROtv LIVE · ${lineup[0].startLabel.split(',')[0]}`, type: 'live-promotion', platforms: ['facebook', 'instagram', 'tiktok'] }, actor);
    const line = `Tonight on PROtv LIVE: ${lineup.map((item) => `${item.title} (${item.startLabel.split(', ').pop()})`).join(' · ')}. Free.`;
    for (const platform of campaign.platforms) await service.createPost({ platform, campaignId: campaign.id, line, destination: 'https://watchprotv.com/live' }, actor);
    step('Read tonight\'s lineup from the master schedule', lineup.map((item) => `${item.title} ${item.startLabel}`).join('; '));
    step('Drafted the campaign and one post per platform', 'Eastern Time; nothing is scheduled or published until approved');
    return { intent, steps, result: { campaignId: campaign.id }, next: ['Attach a video or graphic, approve and schedule'] };
  }
  if (intent === 'seven-days') {
    const platforms = /facebook/i.test(instruction) ? ['facebook'] : /instagram/i.test(instruction) ? ['instagram'] : /tiktok/i.test(instruction) ? ['tiktok'] : /youtube/i.test(instruction) ? ['youtube'] : ['facebook', 'instagram', 'tiktok', 'youtube'];
    const plan = await service.sevenDayPlan(actor, { platforms });
    step('Built the seven-day plan from the LIVE master schedule', `${plan.posts.length} draft posts for ${platforms.join(', ')}`);
    if (plan.premieresNoted.length) step('Premieres held back until released', plan.premieresNoted.map((item) => `${item.title} ${item.startLabel}`).join('; '));
    return { intent, steps, result: { campaignId: plan.campaign.id, posts: plan.posts.length }, next: ['Review the drafts in Social Calendar and approve the ones to schedule'] };
  }
  if (intent === 'creator-week') {
    const kits = (await service.creatorKits()).filter((kit) => kit.nextAirings.length);
    for (const kit of kits.slice(0, 8)) {
      const campaign = await service.createCampaign({ name: `Creator spotlight · ${kit.title}`, type: 'creator-spotlight', titleIds: [kit.videoId], platforms: ['facebook', 'instagram'] }, actor);
      for (const platform of campaign.platforms) await service.createPost({ platform, campaignId: campaign.id, title: kit.title, line: kit.captions[1], destination: `https://watchprotv.com/title/${encodeURIComponent(kit.videoId)}` }, actor);
      step(`Drafted a spotlight for ${kit.title}`, `next on LIVE ${kit.nextAirings[0]}`);
    }
    if (!kits.length) step('No creator titles air in the next seven days');
    return { intent, steps, result: { count: kits.length }, next: ['Open Creator Promotion Center to share kits with creators'] };
  }
  if (intent === 'what-next') {
    const [eligible, lineup, campaigns, measured] = await Promise.all([footage(), service.liveUpcoming(7 * 24), service.listCampaigns(), service.report({ days: 30 })]);
    const promoted = new Map();
    for (const campaign of campaigns) for (const id of campaign.titleIds || []) promoted.set(id, (promoted.get(id) || 0) + 1);
    const ranked = eligible.filter((item) => item.creator).map((item) => {
      const airings = lineup.filter((slot) => slot.videoId === item.id).length;
      const score = airings * 2 - (promoted.get(item.id) || 0) * 3 + (item.scope === 'title-and-protv' ? 1 : 0);
      return { title: item.title, videoId: item.id, airingsThisWeek: airings, campaigns: promoted.get(item.id) || 0, score };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
    step('Ranked cleared creator titles', 'More LIVE airings this week and fewer existing campaigns rank higher (observed data only)');
    return { intent, steps, result: { ranked, measuredNote: measured.totals.meaningfulSessions ? '' : 'No observed marketing sessions yet, so the ranking uses programming and coverage, not performance.' } };
  }
  if (intent === 'results') {
    const report = await service.report({ days: 30 });
    step('Read observed marketing results (30 days)', `${report.totals.meaningfulSessions} meaningful sessions from ${report.totals.clicks} tracked clicks`);
    return { intent, steps, result: report };
  }
  if (intent === 'promote-title') {
    const catalog = await loadCatalog();
    const video = findTitle(instruction, catalog);
    if (!video) { step('Which title?', 'Name a published title, for example "Promote The Thirst this week".'); return { intent, steps, result: {} }; }
    const series = video.contentType === 'SERIES' || video.contentType === 'EPISODE';
    const lineup = (await service.liveUpcoming(7 * 24)).filter((slot) => slot.title.toLowerCase().includes((video.seriesTitle || video.title).toLowerCase()));
    const released = lineup.filter((slot) => slot.released);
    step('Read the catalog and master schedule', `${video.title}: ${released.length} released airing(s) this week${lineup.length > released.length ? `, ${lineup.length - released.length} premiere(s) not yet released (not advertised as available)` : ''}`);
    const eligible = (await footage()).find((item) => item.id === video.id);
    const assets = await service.listAssets();
    const clips = (assets.hypeClips || []).filter((clip) => String(clip.title || '').toLowerCase().includes(video.title.toLowerCase()));
    step('Checked Hype Clip Studio', clips.length ? `${clips.length} existing clip(s) to reuse` : 'No existing clips; suggested scenes are in the Creator Promotion Center');
    const campaign = await service.createCampaign({ name: `${series ? 'New episode' : 'Spotlight'} · ${video.seriesTitle || video.title}`, type: series ? 'new-episode' : 'creator-spotlight', titleIds: [video.id], platforms: ['facebook', 'instagram', 'tiktok', 'youtube'] }, actor);
    let commercial = null;
    if (eligible && video.contentType !== 'SERIES') {
      commercial = await service.createCommercial({ category: 'title', videoId: video.id, durationSeconds: 30, tone: /horror|thriller/i.test(video.genre || '') ? 'suspense' : 'cinematic', campaignId: campaign.id, mentionLive: Boolean(released.length) }, actor).catch((error) => { step('Commercial not created', error.message); return null; });
      if (commercial) step('Drafted a 30-second title spot', `rights: ${commercial.rightsCheck.length ? commercial.rightsCheck.join(' ') : 'clear'}`);
    } else if (!eligible) step('No commercial', 'This title has no marketing clearance on record');
    for (const [index, slot] of released.slice(0, 3).entries()) {
      for (const platform of campaign.platforms) await service.createPost({ platform, campaignId: campaign.id, title: video.title, line: `${slot.title} airs ${slot.startLabel} on PROtv LIVE. Free.`, scheduledAt: Date.parse(slot.startAt) - 3 * 3600_000 > Date.now() ? new Date(Date.parse(slot.startAt) - 3 * 3600_000).toISOString() : null, destination: 'https://watchprotv.com/live' }, actor);
      step(`Drafted posts for airing ${index + 1}`, slot.startLabel);
    }
    step('Paid option (not created)', 'A Meta video-views test at $10/day for 5 days ($50 cap) could be drafted in Paid Advertising once a monthly cap is approved');
    return { intent, steps, result: { campaignId: campaign.id, commercialId: commercial?.id || null }, next: ['Review the commercial storyboard and render it', 'Approve posts in Social Calendar'] };
  }
  step('I can do these', 'create a commercial for PROtv · promote <title> this week · promote tonight\'s LIVE lineup · prepare seven days of Facebook posts · make vertical versions · which movie should we advertise next · show what marketing generated the most viewers · prepare this week\'s creator promotions · create a 30-second sponsor commercial');
  return { intent, steps, result: {} };
}

module.exports = { INTENTS, classify, findTitle, runAgent };

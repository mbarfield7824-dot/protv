// Marketing Studio measurement. What is recorded is aggregate and anonymous: daily counters per campaign and post
// (link clicks, landing visits, play starts, meaningful viewing sessions, returning visitors). No user ID, IP address
// or viewing history is stored or shared with any platform or advertiser. Every metric is labelled with how it was
// obtained: observed (counted here), reported (from a platform API) or estimated (a planning figure, never a result).
const crypto = require('node:crypto');

const EVENTS = ['click', 'visit', 'play', 'session', 'return'];
const MEANINGFUL_SECONDS = 120;
const CODE = /^[a-z0-9]{6,16}$/;
const CAMPAIGN = /^mc_[a-z0-9]{8,24}$/i;
const CONTENT = /^[a-z0-9_-]{1,40}$/i;

function trackingUrl({ campaignId, postId = '', platform = 'social', medium = 'social', destination = 'https://watchprotv.com/' }) {
  const url = new URL(destination);
  url.searchParams.set('utm_source', platform);
  url.searchParams.set('utm_medium', medium);
  url.searchParams.set('utm_campaign', campaignId);
  if (postId) url.searchParams.set('utm_content', postId);
  return url.toString();
}
function linkCode(campaignId, postId, platform) {
  return crypto.createHash('sha256').update(`${campaignId}|${postId}|${platform}`).digest('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
}

function statId(date, campaignId, content) { return `${date}_${campaignId}_${content || 'none'}`.slice(0, 120); }

async function record(store, { event, campaign, content = '', at = new Date() }) {
  if (!EVENTS.includes(event) || !CAMPAIGN.test(campaign || '') || (content && !CONTENT.test(content))) return false;
  const date = at.toISOString().slice(0, 10);
  const id = statId(date, campaign, content);
  await store.increment('stats', id, { [event]: 1 });
  const existing = await store.get('stats', id);
  if (existing && !existing.campaignId) await store.put('stats', id, { ...existing, date, campaignId: campaign, content: content || '' });
  return true;
}

// Rolls up observed counters (and any reported paid figures) per campaign, with cost per qualified session only when
// spend is reported by the platform.
function summarize(stats, campaigns, adCampaigns = []) {
  const byCampaign = new Map();
  for (const row of stats) {
    if (!row.campaignId) continue;
    const item = byCampaign.get(row.campaignId) || { campaignId: row.campaignId, click: 0, visit: 0, play: 0, session: 0, return: 0, days: new Set() };
    for (const event of EVENTS) item[event] += Number(row[event] || 0);
    item.days.add(row.date);
    byCampaign.set(row.campaignId, item);
  }
  const names = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  return [...byCampaign.values()].map((item) => {
    const campaign = names.get(item.campaignId);
    const spend = adCampaigns.filter((ad) => ad.campaignId === item.campaignId && ad.reported?.spendUsd != null).reduce((sum, ad) => sum + Number(ad.reported.spendUsd), 0);
    const paid = adCampaigns.some((ad) => ad.campaignId === item.campaignId && ['active', 'paused', 'completed'].includes(ad.status));
    return {
      campaignId: item.campaignId, name: campaign?.name || item.campaignId, type: campaign?.type || '', channel: paid ? 'paid + organic' : 'organic',
      observed: { clicks: item.click, visits: item.visit, playStarts: item.play, meaningfulSessions: item.session, returningVisits: item.return, days: item.days.size },
      reported: spend ? { spendUsd: Math.round(spend * 100) / 100, costPerMeaningfulSession: item.session ? Math.round((spend / item.session) * 100) / 100 : null } : null,
      rates: { visitToPlay: item.visit ? Math.round((item.play / item.visit) * 1000) / 10 : null, playToSession: item.play ? Math.round((item.session / item.play) * 1000) / 10 : null },
    };
  }).sort((a, b) => b.observed.meaningfulSessions - a.observed.meaningfulSessions || b.observed.visits - a.observed.visits);
}

module.exports = { EVENTS, MEANINGFUL_SECONDS, CODE, CAMPAIGN, CONTENT, trackingUrl, linkCode, record, summarize };

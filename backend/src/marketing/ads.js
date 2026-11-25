// Marketing Studio paid advertising: budget-governed drafts, approvals and a Meta Marketing API adapter.
//
// Spending protections (enforced here, not in the browser):
//   - the account-wide monthly cap defaults to $0; nothing can be prepared above the remaining approved budget;
//   - a campaign is created in Meta only after an Administrator approves it, and always PAUSED;
//   - activation is a second, separate approval; increases need a new approval; the emergency pause stops everything;
//   - every action is audited. No provider account or billing is ever created here.
const { SocialError } = require('./social');

const OBJECTIVES = {
  'video-views': { label: 'Video views (ThruPlay)', meta: 'OUTCOME_ENGAGEMENT', optimization: 'THRUPLAY', billing: 'IMPRESSIONS' },
  traffic: { label: 'Visits to watchprotv.com', meta: 'OUTCOME_TRAFFIC', optimization: 'LANDING_PAGE_VIEWS', billing: 'IMPRESSIONS' },
  awareness: { label: 'Reach', meta: 'OUTCOME_AWARENESS', optimization: 'REACH', billing: 'IMPRESSIONS' },
};
const META_API = 'https://graph.facebook.com/v21.0';
const cents = (dollars) => Math.round(Number(dollars) * 100);

function budgetCheck(draft, settings, campaigns, { now = new Date() } = {}) {
  const problems = [];
  const monthlyCap = Number(settings?.ads?.monthlyCapUsd || 0);
  const daily = Number(draft.dailyBudgetUsd || 0);
  const total = Number(draft.totalBudgetUsd || 0);
  if (!(daily > 0)) problems.push('Set a daily budget above $0.');
  if (!(total > 0)) problems.push('Set a total (lifetime) cap above $0.');
  if (daily > total) problems.push('The daily budget is larger than the total cap.');
  const month = now.toISOString().slice(0, 7);
  const committed = campaigns.filter((item) => item.id !== draft.id && ['approved', 'prepared', 'active', 'paused'].includes(item.status) && String(item.startDate || '').slice(0, 7) <= month)
    .reduce((sum, item) => sum + Number(item.totalBudgetUsd || 0), 0);
  if (monthlyCap <= 0) problems.push('The monthly advertising cap is $0. Set an approved monthly cap in Settings before any paid campaign.');
  else if (committed + total > monthlyCap) problems.push(`This needs $${total.toFixed(2)} but only $${Math.max(0, monthlyCap - committed).toFixed(2)} of the $${monthlyCap.toFixed(2)} monthly cap remains.`);
  if (settings?.ads?.emergencyPause) problems.push('Paid advertising is under an emergency pause.');
  return { ok: problems.length === 0, problems, monthlyCapUsd: monthlyCap, committedUsd: committed, remainingUsd: Math.max(0, monthlyCap - committed) };
}

// Planning estimates only (never presented as results): ranges for U.S. entertainment video campaigns, adjustable in Settings.
function estimate(draft, settings) {
  const cpm = settings?.ads?.assumedCpmUsd || { low: 4, high: 12 };
  const total = Number(draft.totalBudgetUsd || 0);
  return { kind: 'estimate', note: 'Planning estimate from assumed CPM; not a result.', impressions: { low: Math.round((total / cpm.high) * 1000), high: Math.round((total / cpm.low) * 1000) } };
}

async function metaCall(fetcher, path, token, params, method = 'POST') {
  const url = `${META_API}/${path}`;
  const response = await fetcher(method === 'GET' ? `${url}?${new URLSearchParams({ ...params, access_token: token })}` : url, method === 'GET' ? {} : { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, access_token: token }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new SocialError(body.error?.message || `Meta answered ${response.status}`, { transient: response.status >= 500 || response.status === 429, status: response.status });
  return body;
}

// Creates campaign → ad set → creative → ad in Meta, every object PAUSED. Returns the Meta object IDs.
async function prepareMetaCampaign({ draft, token, adAccountId, pageId, videoId, landingUrl }, fetcher = fetch) {
  if (!/^act_\d+$/.test(adAccountId || '')) throw new SocialError('Set the Meta ad account (act_…) in Settings.', { status: 503 });
  const objective = OBJECTIVES[draft.objective] || OBJECTIVES['video-views'];
  const campaign = await metaCall(fetcher, `${adAccountId}/campaigns`, token, { name: `PROtv · ${draft.name}`, objective: objective.meta, status: 'PAUSED', special_ad_categories: '[]' });
  const adset = await metaCall(fetcher, `${adAccountId}/adsets`, token, {
    name: `${draft.name} · ${draft.audience?.label || 'audience'}`, campaign_id: campaign.id, status: 'PAUSED',
    daily_budget: String(cents(draft.dailyBudgetUsd)), billing_event: objective.billing, optimization_goal: objective.optimization,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP', start_time: draft.startDate, end_time: draft.endDate,
    targeting: JSON.stringify({ geo_locations: { countries: ['US'] }, age_min: Math.max(18, Number(draft.audience?.ageMin || 18)), age_max: Number(draft.audience?.ageMax || 65), ...(draft.audience?.interests?.length ? { flexible_spec: [{ interests: draft.audience.interests }] } : {}) }),
  });
  const creative = await metaCall(fetcher, `${adAccountId}/adcreatives`, token, {
    name: `${draft.name} creative`,
    object_story_spec: JSON.stringify({ page_id: pageId, video_data: { video_id: videoId, message: draft.primaryText, title: draft.headline, call_to_action: { type: 'WATCH_MORE', value: { link: landingUrl } } } }),
  });
  const ad = await metaCall(fetcher, `${adAccountId}/ads`, token, { name: `${draft.name} ad`, adset_id: adset.id, creative: JSON.stringify({ creative_id: creative.id }), status: 'PAUSED' });
  // A spend cap at the campaign level as well, so Meta itself stops at the approved total.
  await metaCall(fetcher, campaign.id, token, { spend_cap: String(cents(draft.totalBudgetUsd)) });
  return { campaignId: campaign.id, adsetId: adset.id, creativeId: creative.id, adId: ad.id };
}
const setMetaStatus = (ids, token, status, fetcher = fetch) => metaCall(fetcher, ids.campaignId, token, { status });
async function metaInsights(ids, token, fetcher = fetch) {
  const body = await metaCall(fetcher, `${ids.campaignId}/insights`, token, { fields: 'spend,impressions,clicks,video_thruplay_watched_actions,actions', date_preset: 'maximum' }, 'GET');
  return body.data?.[0] || null;
}

module.exports = { OBJECTIVES, budgetCheck, estimate, prepareMetaCampaign, setMetaStatus, metaInsights };

// Marketing Studio attribution: only when a visitor arrives through a PROtv campaign link (utm_campaign=mc_…).
// Sends anonymous counters (visit, return, play, session = 2+ minutes watched). No identifiers, no cookies, nothing
// shared with any platform; the campaign tag lives in this tab's sessionStorage only.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const KEY = 'protv.marketing.attribution';
const CAMPAIGN = /^mc_[a-z0-9]{8,24}$/i;
const CONTENT = /^[a-z0-9_-]{1,40}$/i;
const sent = new Set();

function read() {
  try { return JSON.parse(window.sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function send(event, attribution, onceKey = event) {
  if (!attribution || sent.has(onceKey)) return;
  sent.add(onceKey);
  try {
    const body = JSON.stringify({ event, campaign: attribution.campaign, content: attribution.content || '' });
    fetch(`${API_URL}/marketing/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* measurement never affects the site */ }
}

export function captureCampaignVisit(search = window.location.search) {
  const params = new URLSearchParams(search);
  const campaign = params.get('utm_campaign') || '';
  if (!CAMPAIGN.test(campaign)) return;
  const content = params.get('utm_content') || '';
  const attribution = { campaign, content: CONTENT.test(content) ? content : '' };
  try { window.sessionStorage.setItem(KEY, JSON.stringify(attribution)); } catch { /* private mode */ }
  send('visit', attribution);
  let returning = false;
  try { returning = window.localStorage.getItem('protv.marketing.seen') === '1'; window.localStorage.setItem('protv.marketing.seen', '1'); } catch { /* ignore */ }
  if (returning) send('return', attribution);
}

export function reportCampaignPlay(videoId) { send('play', read(), `play:${videoId}`); }
export function reportCampaignSession(videoId) { send('session', read(), `session:${videoId}`); }
export const MEANINGFUL_SECONDS = 120;

// Marketing Studio social connectors: official OAuth and publishing APIs only. No passwords are ever asked for or
// stored, no browser automation, no engagement buying. A connector is "not configured" until PROtv's own developer app
// credentials are set (server environment), "not connected" until an Administrator authorizes an account, and
// publishing additionally needs an approved post. Where a platform requires its own app review before public posting,
// the connector says so and offers its official draft route or the manual handoff.
//
// Access tokens are encrypted at rest (AES-256-GCM, MARKETING_TOKEN_KEY) and never sent to the browser.
const crypto = require('node:crypto');

const GRAPH = 'https://graph.facebook.com/v21.0';
class SocialError extends Error {
  constructor(message, { transient = false, status = 400 } = {}) { super(message); this.transient = transient; this.status = status; }
}

// ---- token encryption ----
function tokenKey() {
  const raw = String(process.env.MARKETING_TOKEN_KEY || '');
  const key = /^[A-Za-z0-9+/=]{43,44}$/.test(raw) ? Buffer.from(raw, 'base64') : null;
  return key && key.length === 32 ? key : null;
}
function seal(value, key = tokenKey()) {
  if (!key) throw new SocialError('Token storage is not configured (MARKETING_TOKEN_KEY).', { status: 503 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}
function unseal(sealed, key = tokenKey()) {
  if (!key) throw new SocialError('Token storage is not configured (MARKETING_TOKEN_KEY).', { status: 503 });
  const [version, iv, tag, data] = String(sealed || '').split('.');
  if (version !== 'v1') throw new SocialError('Stored credentials are unreadable; reconnect the account.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
}

async function requestJson(fetcher, url, options = {}) {
  let response;
  try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 30_000) }); } catch (error) {
    throw new SocialError(`Network error: ${error.message}`, { transient: true, status: 502 });
  }
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
  if (!response.ok) {
    const message = body.error?.message || body.error_description || body.error?.code || body.message || `HTTP ${response.status}`;
    throw new SocialError(`${message}`, { transient: response.status === 429 || response.status >= 500, status: response.status });
  }
  return body;
}

// ---- platform descriptors ----
const PLATFORMS = {
  facebook: {
    name: 'Facebook Page', env: ['META_APP_ID', 'META_APP_SECRET'],
    scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'publish_video', 'business_management'],
    review: 'Meta App Review must approve pages_manage_posts and publish_video before the app can post for a Page it does not develop.',
    publishes: ['video', 'link'], draftRoute: 'Unpublished Page video (published: false), then publish from Meta Business Suite',
  },
  instagram: {
    name: 'Instagram professional account (Reels)', env: ['META_APP_ID', 'META_APP_SECRET'],
    scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'business_management'],
    review: 'Meta App Review must approve instagram_content_publish. The Instagram account must be a Business or Creator account linked to the Facebook Page.',
    publishes: ['reel'], draftRoute: 'Manual handoff (the Instagram API has no draft upload)',
  },
  youtube: {
    name: 'YouTube channel (videos and Shorts)', env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    review: 'Until Google audits the API project, every video uploaded through it is locked to Private. The OAuth consent screen also needs verification for the youtube.upload scope.',
    publishes: ['video', 'short'], draftRoute: 'Upload as Private (an unlisted/private draft), then publish in YouTube Studio',
  },
  tiktok: {
    name: 'TikTok account', env: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    scopes: ['user.info.basic', 'video.upload', 'video.publish'],
    review: 'Until TikTok audits the app, Direct Post may only post as private (SELF_ONLY). Pulling a video from a URL also requires verifying the URL\'s domain with TikTok.',
    publishes: ['video'], draftRoute: 'Upload to the TikTok inbox as a draft (video.upload), then finish and post in the TikTok app',
  },
  manual: {
    name: 'Manual handoff (any platform)', env: [], scopes: [], review: '', publishes: ['video', 'image', 'text'],
    draftRoute: 'Download the export with its caption, hashtags and tracked link, post it yourself, then record the post address here',
  },
};

function platformStatus(id, account) {
  const platform = PLATFORMS[id];
  if (!platform) return { id, state: 'unknown' };
  const missing = platform.env.filter((name) => !process.env[name]);
  const keyReady = Boolean(tokenKey()) || id === 'manual';
  let state = 'ready';
  if (id !== 'manual') {
    if (missing.length || !keyReady) state = 'not-configured';
    else if (!account || account.status === 'disconnected') state = 'not-connected';
    else if (account.expiresAt && Date.parse(account.expiresAt) < Date.now() && !account.canRefresh) state = 'expired';
    else state = 'connected';
  }
  return {
    id, name: platform.name, state, missingSettings: [...missing, ...(keyReady ? [] : ['MARKETING_TOKEN_KEY'])],
    scopes: platform.scopes, review: platform.review, draftRoute: platform.draftRoute, publishes: platform.publishes,
    account: account && account.status !== 'disconnected' ? { label: account.label, connectedAt: account.connectedAt, targets: (account.targets || []).map(({ id: targetId, name, kind }) => ({ id: targetId, name, kind })), expiresAt: account.expiresAt || null } : null,
  };
}

// ---- OAuth ----
function authorizeUrl(id, { state, redirectUri, codeChallenge }) {
  if (id === 'facebook' || id === 'instagram') {
    const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    url.search = new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: redirectUri, state, response_type: 'code', scope: [...new Set([...PLATFORMS.facebook.scopes, ...PLATFORMS.instagram.scopes])].join(',') }).toString();
    return url.toString();
  }
  if (id === 'youtube') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, state, response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope: PLATFORMS.youtube.scopes.join(' '), code_challenge: codeChallenge, code_challenge_method: 'S256' }).toString();
    return url.toString();
  }
  if (id === 'tiktok') {
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.search = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, redirect_uri: redirectUri, state, response_type: 'code', scope: PLATFORMS.tiktok.scopes.join(','), code_challenge: codeChallenge, code_challenge_method: 'S256' }).toString();
    return url.toString();
  }
  throw new SocialError('This platform does not use an authorization step.');
}

async function exchangeCode(id, { code, redirectUri, codeVerifier }, fetcher = fetch) {
  const now = Date.now();
  if (id === 'facebook' || id === 'instagram') {
    const short = await requestJson(fetcher, `${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: redirectUri, code })}`);
    const long = await requestJson(fetcher, `${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token })}`);
    const pages = await requestJson(fetcher, `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(long.access_token)}`);
    const targets = (pages.data || []).flatMap((page) => [
      { id: page.id, name: page.name, kind: 'facebook-page', token: page.access_token },
      ...(page.instagram_business_account ? [{ id: page.instagram_business_account.id, name: `@${page.instagram_business_account.username || page.instagram_business_account.id}`, kind: 'instagram-account', token: page.access_token }] : []),
    ]);
    return { label: targets.map((target) => target.name).join(', ') || 'Meta account', tokens: { user: long.access_token, targets: targets.map(({ id: targetId, token }) => ({ id: targetId, token })) }, targets: targets.map(({ token, ...rest }) => rest), expiresAt: long.expires_in ? new Date(now + long.expires_in * 1000).toISOString() : null, canRefresh: false };
  }
  if (id === 'youtube') {
    const body = await requestJson(fetcher, 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }) });
    const channel = await requestJson(fetcher, 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${body.access_token}` } });
    const item = channel.items?.[0];
    return { label: item?.snippet?.title || 'YouTube channel', tokens: { access: body.access_token, refresh: body.refresh_token }, targets: item ? [{ id: item.id, name: item.snippet.title, kind: 'youtube-channel' }] : [], expiresAt: new Date(now + (body.expires_in || 3600) * 1000).toISOString(), canRefresh: Boolean(body.refresh_token) };
  }
  if (id === 'tiktok') {
    const body = await requestJson(fetcher, 'https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: codeVerifier }) });
    return { label: 'TikTok account', tokens: { access: body.access_token, refresh: body.refresh_token, openId: body.open_id }, targets: [{ id: body.open_id, name: 'TikTok account', kind: 'tiktok-account' }], expiresAt: new Date(now + (body.expires_in || 86400) * 1000).toISOString(), canRefresh: Boolean(body.refresh_token) };
  }
  throw new SocialError('Unknown platform.');
}

async function refreshTokens(id, tokens, fetcher = fetch) {
  if (id === 'youtube' && tokens.refresh) {
    const body = await requestJson(fetcher, 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: tokens.refresh, grant_type: 'refresh_token' }) });
    return { tokens: { ...tokens, access: body.access_token }, expiresAt: new Date(Date.now() + (body.expires_in || 3600) * 1000).toISOString() };
  }
  if (id === 'tiktok' && tokens.refresh) {
    const body = await requestJson(fetcher, 'https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: tokens.refresh }) });
    return { tokens: { ...tokens, access: body.access_token, refresh: body.refresh_token || tokens.refresh }, expiresAt: new Date(Date.now() + (body.expires_in || 86400) * 1000).toISOString() };
  }
  throw new SocialError('This connection cannot be refreshed; reconnect the account.', { status: 401 });
}

// ---- publishing ----
// post: { caption, title, mode: 'publish'|'draft', targetId }, media: { url (public HTTPS MP4), bytes? }
async function publish(id, { tokens, post, media }, fetcher = fetch) {
  if (id === 'facebook') {
    const target = tokens.targets?.find((item) => item.id === post.targetId);
    if (!target) throw new SocialError('Choose a connected Facebook Page.');
    const body = await requestJson(fetcher, `${GRAPH}/${target.id}/videos`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ file_url: media.url, description: post.caption, title: post.title || '', published: post.mode === 'draft' ? 'false' : 'true', access_token: target.token }), timeoutMs: 120_000 });
    return { remoteId: body.id, url: `https://www.facebook.com/${body.id}`, state: post.mode === 'draft' ? 'draft-uploaded' : 'published' };
  }
  if (id === 'instagram') {
    if (post.mode === 'draft') throw new SocialError('Instagram has no API draft; use the manual handoff.');
    const target = tokens.targets?.find((item) => item.id === post.targetId);
    if (!target) throw new SocialError('Choose a connected Instagram account.');
    const container = await requestJson(fetcher, `${GRAPH}/${target.id}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ media_type: 'REELS', video_url: media.url, caption: post.caption, share_to_feed: 'true', access_token: target.token }) });
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const status = await requestJson(fetcher, `${GRAPH}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(target.token)}`);
      if (status.status_code === 'FINISHED') break;
      if (status.status_code === 'ERROR') throw new SocialError(`Instagram could not process the video: ${status.status || 'unknown error'}`);
      if (attempt === 23) throw new SocialError('Instagram is still processing the video; it will be retried.', { transient: true });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    const published = await requestJson(fetcher, `${GRAPH}/${target.id}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: container.id, access_token: target.token }) });
    return { remoteId: published.id, url: null, state: 'published' };
  }
  if (id === 'youtube') {
    const source = await fetcher(media.url, { signal: AbortSignal.timeout(120_000) });
    if (!source.ok) throw new SocialError('The video file could not be read for upload.', { transient: true });
    const bytes = Buffer.from(await source.arrayBuffer());
    const init = await fetcher('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST', headers: { Authorization: `Bearer ${tokens.access}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(bytes.length) },
      body: JSON.stringify({ snippet: { title: (post.title || 'PROtv').slice(0, 100), description: post.caption.slice(0, 4900), categoryId: '1' }, status: { privacyStatus: post.mode === 'draft' ? 'private' : 'public', selfDeclaredMadeForKids: false } }),
    });
    if (!init.ok) throw new SocialError(`YouTube refused the upload (${init.status}).`, { transient: init.status >= 500, status: init.status });
    const location = init.headers.get('location');
    const done = await requestJson(fetcher, location, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes, timeoutMs: 300_000 });
    return { remoteId: done.id, url: `https://www.youtube.com/watch?v=${done.id}`, state: done.status?.privacyStatus === 'public' ? 'published' : 'draft-uploaded' };
  }
  if (id === 'tiktok') {
    const endpoint = post.mode === 'draft' ? 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/' : 'https://open.tiktokapis.com/v2/post/publish/video/init/';
    const payload = post.mode === 'draft'
      ? { source_info: { source: 'PULL_FROM_URL', video_url: media.url } }
      : { post_info: { title: post.caption.slice(0, 2000), privacy_level: post.privacy || 'SELF_ONLY', disable_comment: false }, source_info: { source: 'PULL_FROM_URL', video_url: media.url } };
    const body = await requestJson(fetcher, endpoint, { method: 'POST', headers: { Authorization: `Bearer ${tokens.access}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(payload) });
    return { remoteId: body.data?.publish_id || '', url: null, state: post.mode === 'draft' ? 'draft-uploaded' : 'submitted' };
  }
  throw new SocialError('Manual posts are recorded by the Administrator, not sent.');
}

module.exports = { PLATFORMS, SocialError, platformStatus, authorizeUrl, exchangeCode, refreshTokens, publish, seal, unseal, tokenKey };

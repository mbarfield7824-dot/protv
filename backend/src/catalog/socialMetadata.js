const crypto = require('node:crypto');
const { isViewerEligible, publicTitle, podcastCatalog } = require('./readModel');
const { isFeaturedPodcast } = require('./podcasts');
const { releaseAllowed } = require('./releases');
const { structuredDataScript } = require('./structuredData');
const { metadataAllowed, detailEligible, titleDetails, seriesDetails } = require('./details');

const ORIGIN = 'https://watchprotv.com';
const FEATURED_ARTWORK = '/api/short-links/artwork/mmwf';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function previewEligible(record) {
  const now = Date.now();
  return releaseAllowed(record) && record.muxPlaybackPolicy !== 'signed' && metadataAllowed(record, now);
}

function publicArtworkUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try { url = new URL(value, ORIGIN); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash
    || (url.port && url.port !== '443')
    || [...url.searchParams.keys()].some(key => /token|signature|credential|authorization|secret|key|expires/i.test(key))
    || /\.(?:mp4|m3u8|mpd|mov)(?:$|\/)/i.test(url.pathname)) return null;
  if (url.origin === ORIGIN
    && !/^\/(?:api\/posters\/[^/]+|api\/short-links\/artwork\/mmwf|assets\/[^/]+|posters\/[^/]+)$/.test(url.pathname)) {
    return null;
  }
  return url.href;
}

function artworkCandidates(content) {
  return [...new Set([
    content.heroImageUrl, content.artworkUrl, content.artwork,
    content.thumbnailUrl, content.posterUrl,
    ...(content.parentArtwork || []),
  ].map(publicArtworkUrl).filter(Boolean))];
}

function previewContent(videos, kind, id) {
  const eligible = videos.filter(previewEligible);
  if (kind === 'title') {
    const record = videos.find(item => item.id === id && detailEligible(item, videos));
    if (!record) return null;
    const title = record.muxPlaybackPolicy !== 'signed' && releaseAllowed(record)
      ? { ...publicTitle(record), watchAvailable: isViewerEligible(record, videos) }
      : titleDetails(record, videos);
    for (const field of ['thumbnailUrl', 'posterUrl', 'heroImageUrl']) {
      title[field] = publicArtworkUrl(title[field]) || '';
    }
    const parent = record.contentType === 'PODCAST_EPISODE'
      ? podcastCatalog(eligible).find(show => show.id === record.podcastShowId) : null;
    return { ...title, parentArtwork: parent
      ? [isFeaturedPodcast(parent) ? FEATURED_ARTWORK : parent.artworkUrl] : [] };
  }
  if (kind === 'series') return seriesDetails(videos).find(item => item.key === id) || null;
  if (kind === 'podcast') {
    const show = podcastCatalog(eligible).find(item => item.id === id);
    return show ? { ...show, ...(isFeaturedPodcast(show) ? { artworkUrl: FEATURED_ARTWORK } : {}) } : null;
  }
  return null;
}

function contentMetadata(content, kind = 'title', id = content.id) {
  const title = typeof content.title === 'string' && content.title.trim() ? content.title.trim() : 'PROtv';
  const description = typeof content.description === 'string' && content.description.trim()
    ? content.description.trim() : title === 'PROtv'
      ? 'Discover approved films, series, podcasts and music on PROtv.' : `Watch ${title} on PROtv.`;
  const version = crypto.createHash('sha256').update(JSON.stringify(artworkCandidates(content))).digest('hex').slice(0, 16);
  const type = kind === 'title'
    ? content.contentType === 'MOVIE' ? 'video.movie'
      : ['EPISODE', 'PODCAST_EPISODE'].includes(content.contentType) ? 'video.episode' : 'video.other'
    : kind === 'series' ? 'video.tv_show' : 'website';
  return { title, description, type, image: `${ORIGIN}/api/social/artwork/${kind}/${encodeURIComponent(id)}?v=${version}` };
}

function socialMetadata(template, metadata, canonical, structuredData = null) {
  if (!/<title>[^]*?<\/title>/.test(template) || !template.includes('</head>')) {
    throw new Error('The built social HTML template is invalid.');
  }
  const title = `${metadata.title} | PROtv`;
  const image = new URL(metadata.image, ORIGIN).href;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    '<meta property="og:site_name" content="PROtv">',
    ...[['og:type', metadata.type || 'website'], ['og:title', title], ['og:description', metadata.description],
      ['og:image', image], ['og:image:secure_url', image], ['og:image:type', 'image/jpeg'],
      ['og:image:width', '1200'], ['og:image:height', '630'], ['og:image:alt', `${metadata.title} promotional artwork`],
      ['og:url', canonical]].map(([key, value]) => `<meta property="${key}" content="${escapeHtml(value)}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    ...[['twitter:title', title], ['twitter:description', metadata.description], ['twitter:image', image],
      ['twitter:image:alt', `${metadata.title} promotional artwork`]]
      .map(([key, value]) => `<meta name="${key}" content="${escapeHtml(value)}">`),
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
  ].join('\n');
  const html = template
    .replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="description")[^>]*>\s*/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, '')
    .replace(/<title>[^]*?<\/title>/, () => tags);
  if (!structuredData) return html;
  return html.replace('</head>', `${structuredDataScript(structuredData)}</head>`);
}

module.exports = {
  ORIGIN, escapeHtml, previewEligible, publicArtworkUrl, artworkCandidates, previewContent, contentMetadata, socialMetadata,
};

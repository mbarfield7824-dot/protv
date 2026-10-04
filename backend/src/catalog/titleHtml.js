const fs = require('node:fs/promises');
const path = require('node:path');

function loadTitleTemplate() {
  return fs.readFile(path.resolve(__dirname, '../../../frontend/dist/index.html'), 'utf8');
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function publicArtwork(title) {
  for (const value of [title.heroImageUrl, title.thumbnailUrl, title.posterUrl]) {
    if (typeof value !== 'string' || !value.trim()) continue;
    let url;
    try {
      url = new URL(value);
    } catch {
      continue;
    }
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
      return url.href;
    }
  }
  return '';
}

function titleHtml(template, title) {
  const name = typeof title.title === 'string' ? title.title.trim() : '';
  const description = typeof title.description === 'string' && title.description.trim()
    ? title.description : name;
  const canonical = `https://watchprotv.com/title/${encodeURIComponent(title.id)}`;
  const image = publicArtwork(title);
  const metadata = [
    `<title>${escapeHtml(name ? `${name} | PROtv` : 'PROtv')}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:title" content="${escapeHtml(name || 'PROtv')}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    '<meta property="og:type" content="video.other">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(name || 'PROtv')}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    ...(image ? [
      `<meta property="og:image" content="${escapeHtml(image)}">`,
      `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    ] : []),
  ].join('\n    ');
  if (!/<title>[^]*?<\/title>/.test(template) || !template.includes('<div id="root"></div>')) {
    throw new Error('The built React HTML template is invalid.');
  }
  return template
    .replace(/<meta\s+name="description"[^>]*>\s*/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, '')
    .replace(/<title>[^]*?<\/title>/, () => metadata);
}

module.exports = { loadTitleTemplate, titleHtml };

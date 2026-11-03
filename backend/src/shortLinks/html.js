const crypto = require('node:crypto');
const { escapeHtml } = require('../catalog/titleHtml');
const brand = require('../../../shared/brand.json');

function socialMetadata(template, metadata, canonical) {
  if (!/<title>[^]*?<\/title>/.test(template) || !template.includes('</head>')) {
    throw new Error('The built social HTML template is invalid.');
  }
  const image = new URL(metadata.image, 'https://watchprotv.com').href;
  const tags = [
    `<title>${escapeHtml(metadata.title)} | ${escapeHtml(brand.plainTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    '<meta property="og:site_name" content="PROtv">',
    '<meta property="og:type" content="website">',
    ...[['og:title', metadata.title], ['og:description', metadata.description], ['og:image', image], ['og:url', canonical]]
      .map(([key, value]) => `<meta property="${key}" content="${escapeHtml(value)}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    ...[['twitter:title', metadata.title], ['twitter:description', metadata.description], ['twitter:image', image]]
      .map(([key, value]) => `<meta name="${key}" content="${escapeHtml(value)}">`),
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
  ].join('\n');
  return template
    .replace(/<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="description")[^>]*>\s*/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, '')
    .replace(/<title>[^]*?<\/title>/, () => tags);
}

function shareHtml(record, metadata) {
  const nonce = crypto.randomBytes(18).toString('base64');
  const canonical = `https://watchprotv.com/${record.slug}`;
  const destination = metadata.destination;
  const template = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PROtv</title></head><body>'
    + `<style nonce="${nonce}">body{margin:0;background:#05070b;color:white;font:18px/1.6 Arial,sans-serif}main{max-width:900px;margin:6vh auto;padding:24px}img{width:100%;border-radius:16px}a{display:inline-block;background:#285be8;color:white;border-radius:8px;padding:12px 20px}p{color:#c4d2ec}</style>`
    + `<main><p>PROtv - ${escapeHtml(brand.plainSlogan)}</p><h1>${escapeHtml(metadata.title)}</h1>`
    + `<img src="${escapeHtml(new URL(metadata.image, 'https://watchprotv.com').href)}" alt="${escapeHtml(metadata.title)}">`
    + `<p>${escapeHtml(metadata.description)}</p><p><a href="${escapeHtml(destination)}">Continue to ${escapeHtml(metadata.title)}</a></p>`
    + '<noscript><p>JavaScript is off. Select Continue to open this content.</p></noscript></main>'
    + `<script nonce="${nonce}">location.replace(${JSON.stringify(destination).replace(/</g, '\\u003c')});</script></body></html>`;
  return { html: socialMetadata(template, metadata, canonical), nonce };
}

function unavailableHtml() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Link unavailable | PROtv</title></head>'
    + '<body style="margin:0;background:#05070b;color:white;font:18px/1.6 Arial,sans-serif"><main style="max-width:760px;margin:10vh auto;padding:24px">'
    + `<p>PROtv - ${escapeHtml(brand.plainSlogan)}</p><h1>This PROtv link is unavailable.</h1><p>It may be inactive, unassigned, or awaiting approved content.</p><a style="color:#67b1ff" href="/">Explore PROtv</a></main></body></html>`;
}
module.exports = { socialMetadata, shareHtml, unavailableHtml };

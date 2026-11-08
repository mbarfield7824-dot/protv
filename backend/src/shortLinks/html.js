const crypto = require('node:crypto');
const { escapeHtml, socialMetadata } = require('../catalog/socialMetadata');
const brand = require('../../../shared/brand.json');

function shareHtml(record, metadata) {
  const nonce = crypto.randomBytes(18).toString('base64');
  const shareUrl = `https://watchprotv.com/${record.slug}`;
  const destination = metadata.destination;
  // A short link is an alias: search engines are pointed at the destination's own page so the two never compete.
  // Player links point at the title page, because /player is not indexed.
  const canonical = `https://watchprotv.com${metadata.canonicalPath || destination.replace(/^\/player\//, '/title/')}`;
  const template = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PROtv</title></head><body>'
    + `<style nonce="${nonce}">body{margin:0;background:#05070b;color:white;font:18px/1.6 Arial,sans-serif}main{max-width:900px;margin:6vh auto;padding:24px}img{width:100%;border-radius:16px}a{display:inline-block;background:#285be8;color:white;border-radius:8px;padding:12px 20px}p{color:#c4d2ec}</style>`
    + `<main><p>PROtv - ${escapeHtml(brand.plainSlogan)}</p><h1>${escapeHtml(metadata.title)}</h1>`
    + `<img src="${escapeHtml(new URL(metadata.image, 'https://watchprotv.com').href)}" alt="${escapeHtml(metadata.title)}">`
    + `<p>${escapeHtml(metadata.description)}</p><p><a href="${escapeHtml(destination)}">Continue to ${escapeHtml(metadata.title)}</a></p>`
    + '<noscript><p>JavaScript is off. Select Continue to open this content.</p></noscript></main>'
    + `<script nonce="${nonce}">location.replace(${JSON.stringify(destination).replace(/</g, '\\u003c')});</script></body></html>`;
  return { html: socialMetadata(template, metadata, canonical, null, { shareUrl }), nonce };
}

function unavailableHtml() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Link unavailable | PROtv</title></head>'
    + '<body style="margin:0;background:#05070b;color:white;font:18px/1.6 Arial,sans-serif"><main style="max-width:760px;margin:10vh auto;padding:24px">'
    + `<p>PROtv - ${escapeHtml(brand.plainSlogan)}</p><h1>This PROtv link is unavailable.</h1><p>It may be inactive, unassigned, or awaiting approved content.</p><a style="color:#67b1ff" href="/">Explore PROtv</a></main></body></html>`;
}
module.exports = { socialMetadata, shareHtml, unavailableHtml };

const fs = require('node:fs/promises');
const path = require('node:path');
const { escapeHtml, contentMetadata, socialMetadata } = require('./socialMetadata');
const { titleStructuredData } = require('./structuredData');
const { partOfLink } = require('./seoBody');

function loadTitleTemplate() {
  return fs.readFile(path.resolve(__dirname, '../../../frontend/dist/index.html'), 'utf8');
}

// parent: { name, url } of the public series or Podcast page the episode belongs to (optional).
function titleHtml(template, title, parent = null) {
  const name = typeof title.title === 'string' ? title.title.trim() : '';
  const canonical = `https://watchprotv.com/title/${encodeURIComponent(title.slug || title.id)}`;
  if (!/<title>[^]*?<\/title>/.test(template) || !template.includes('<div id="root"></div>')) {
    throw new Error('The built React HTML template is invalid.');
  }
  const initialData = JSON.stringify(title).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const metadata = contentMetadata(title);
  const body = `<div id="root"><main class="title-page"><section class="title-hero"><div class="title-hero__content"><h1>${escapeHtml(name)}</h1><p class="title-description">${escapeHtml(typeof title.description === 'string' ? title.description : '')}</p>${partOfLink(parent)}</div></section></main></div>`
    + `<script id="protv-initial-title" type="application/json">${initialData}</script>`;
  return socialMetadata(template, metadata, canonical, titleStructuredData(title, canonical, metadata.image, parent))
    .replace('<div id="root"></div>', () => body);
}

module.exports = { loadTitleTemplate, titleHtml, escapeHtml };

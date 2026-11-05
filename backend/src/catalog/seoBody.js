// Server-rendered summary of a show for crawlers and for viewers before JavaScript starts.
// Every value comes from the approved catalog record (or shared/featuredPodcast.json); nothing is invented.
// The React app replaces this markup when it mounts, exactly as it does for title pages.
const { isFeaturedPodcast } = require('./podcasts');
const featuredPodcast = require('../../../shared/featuredPodcast.json');

const ORIGIN = 'https://watchprotv.com';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const paragraphs = (value) => (Array.isArray(value) ? value : text(value).split(/\n\s*\n/))
  .map(text).filter(Boolean);

function episodeName(episode) {
  return text(episode.episodeTitle) || text(episode.title);
}

function episodeLabel(episode) {
  const name = episodeName(episode);
  const season = Number.isInteger(episode.seasonNumber) && episode.seasonNumber > 0 ? episode.seasonNumber : null;
  const number = Number.isInteger(episode.episodeNumber) && episode.episodeNumber > 0 ? episode.episodeNumber : null;
  const prefix = season && number ? `Season ${season}, Episode ${number}: ` : number ? `Episode ${number}: ` : '';
  return `${prefix}${name}`;
}

const episodeUrl = (episode) => `${ORIGIN}/title/${encodeURIComponent(episode.id)}`;
const listedEpisodes = (episodes) => (Array.isArray(episodes) ? episodes : [])
  .filter((episode) => typeof episode?.id === 'string' && episode.id && episodeName(episode));

function collectionBody({ title, byline = '', lead = '', description = [], image = '', episodes = [] }) {
  const items = listedEpisodes(episodes);
  return '<div id="root"><main class="seo-summary">'
    + `<h1>${escapeHtml(title)}</h1>`
    + (byline ? `<p class="seo-summary__byline">${escapeHtml(byline)}</p>` : '')
    + (image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}">` : '')
    + (lead ? `<p class="seo-summary__lead">${escapeHtml(lead)}</p>` : '')
    + paragraphs(description).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
    + (items.length ? '<section aria-labelledby="seo-episodes"><h2 id="seo-episodes">Episodes</h2><ol>'
      + items.map((episode) => `<li><a href="${escapeHtml(episodeUrl(episode))}">${escapeHtml(episodeLabel(episode))}</a></li>`).join('')
      + '</ol></section>' : '')
    + '</main></div>';
}

// Inserts the summary into the built React shell; a template without the empty root is returned unchanged.
function withBody(html, body) {
  return html.includes('<div id="root"></div>') ? html.replace('<div id="root"></div>', () => body) : html;
}

function partOfLink(parent) {
  if (!parent?.name || !parent?.url) return '';
  return `<p class="seo-summary__part-of">Part of <a href="${escapeHtml(parent.url)}">${escapeHtml(parent.name)}</a></p>`;
}

// The one public URL for a Podcast Show: the featured show has its own page, which the site links to.
function podcastPath(show) {
  return isFeaturedPodcast(show) ? featuredPodcast.path : `/podcasts/${encodeURIComponent(show.id)}`;
}

module.exports = {
  ORIGIN, collectionBody, withBody, partOfLink, paragraphs, episodeName, episodeUrl, listedEpisodes, podcastPath,
};

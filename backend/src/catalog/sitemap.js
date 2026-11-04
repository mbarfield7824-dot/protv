const { playableCatalog, podcastCatalog, seriesCatalog } = require('./readModel');
const { previewEligible } = require('./socialMetadata');

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function catalogSitemap(videos) {
  const publicVideos = videos.filter(previewEligible);
  const urls = [
    'https://watchprotv.com/',
    ...playableCatalog(publicVideos).map((title) => (
      `https://watchprotv.com/title/${encodeURIComponent(title.id)}`
    )),
    ...seriesCatalog(publicVideos).map((series) => (
      `https://watchprotv.com/series/${encodeURIComponent(series.key)}`
    )),
    ...podcastCatalog(publicVideos).map((show) => (
      `https://watchprotv.com/podcasts/${encodeURIComponent(show.id)}`
    )),
  ];
  const entries = [...new Set(urls)]
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

module.exports = { catalogSitemap };

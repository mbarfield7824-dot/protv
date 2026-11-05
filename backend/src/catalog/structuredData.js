function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function isoDuration(seconds) {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${remainder ? `${remainder}S` : ''}`;
}

function yearDate(value) {
  const year = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : null;
  return Number.isInteger(year) && year >= 1000 && year <= 9999 ? String(year) : null;
}

const { episodeName, episodeUrl, listedEpisodes, paragraphs } = require('./seoBody');

// parent: { name, url } of the show an episode belongs to, when that show has a public page.
function titleStructuredData(content, canonical, artworkUrl, parent = null) {
  const name = content.contentType === 'EPISODE' && typeof content.episodeTitle === 'string'
    && content.episodeTitle.trim() ? content.episodeTitle.trim() : content.title;
  if (typeof name !== 'string' || !name.trim()) return null;

  const videoId = `${canonical}#video`;
  const media = {
    '@type': 'VideoObject',
    '@id': videoId,
    name,
    url: canonical,
    ...(content.muxPlaybackId && content.muxPlaybackPolicy !== 'signed'
      ? { contentUrl: `https://stream.mux.com/${encodeURIComponent(content.muxPlaybackId)}.m3u8` } : {}),
  };
  if (typeof content.description === 'string' && content.description.trim()) media.description = content.description.trim();
  if (artworkUrl) media.thumbnailUrl = artworkUrl;
  const duration = positiveNumber(content.duration);
  if (duration) media.duration = isoDuration(duration);

  let entity = null;
  if (content.contentType === 'MOVIE') {
    entity = { '@type': 'Movie', name: content.title, video: { '@id': videoId } };
    if (typeof content.description === 'string' && content.description.trim()) {
      entity.description = content.description.trim();
    }
    const datePublished = yearDate(content.year);
    if (datePublished) entity.datePublished = datePublished;
  } else if (content.contentType === 'EPISODE') {
    entity = {
      '@type': 'TVEpisode',
      name,
      video: { '@id': videoId },
    };
    if (typeof content.description === 'string' && content.description.trim()) {
      entity.description = content.description.trim();
    }
    if (Number.isInteger(content.episodeNumber) && content.episodeNumber > 0) {
      entity.episodeNumber = content.episodeNumber;
    }
    if (Number.isInteger(content.seasonNumber) && content.seasonNumber > 0) {
      entity.partOfSeason = { '@type': 'TVSeason', seasonNumber: content.seasonNumber };
    }
    if (typeof content.seriesTitle === 'string' && content.seriesTitle.trim()) {
      entity.partOfSeries = { '@type': 'TVSeries', name: content.seriesTitle.trim(), ...(parent?.url ? { url: parent.url } : {}) };
    }
    const datePublished = yearDate(content.year);
    if (datePublished) entity.datePublished = datePublished;
  } else if (content.contentType === 'PODCAST_EPISODE') {
    entity = { '@type': 'PodcastEpisode', name, url: canonical, video: { '@id': videoId } };
    if (typeof content.description === 'string' && content.description.trim()) {
      entity.description = content.description.trim();
    }
    if (Number.isInteger(content.episodeNumber) && content.episodeNumber > 0) {
      entity.episodeNumber = content.episodeNumber;
    }
    if (parent?.name && parent?.url) entity.partOfSeries = { '@type': 'PodcastSeries', name: parent.name, url: parent.url };
    const datePublished = yearDate(content.year);
    if (datePublished) entity.datePublished = datePublished;
  }

  return {
    '@context': 'https://schema.org',
    '@graph': entity ? [entity, media] : [media],
  };
}

function seriesStructuredData(series, canonical, artworkUrl) {
  if (typeof series.title !== 'string' || !series.title.trim()) return null;
  const data = { '@context': 'https://schema.org', '@type': 'TVSeries', name: series.title.trim(), url: canonical };
  if (artworkUrl) data.image = artworkUrl;
  if (typeof series.category === 'string' && series.category.trim()) data.genre = series.category.trim();
  if (Number.isInteger(series.seasonCount) && series.seasonCount > 0) data.numberOfSeasons = series.seasonCount;
  if (Number.isInteger(series.episodeCount) && series.episodeCount > 0) data.numberOfEpisodes = series.episodeCount;
  const description = paragraphs(series.description).join(' ');
  if (description) data.description = description;
  const episodes = listedEpisodes(series.episodes).map((episode) => ({
    '@type': 'TVEpisode', name: episodeName(episode), url: episodeUrl(episode),
    ...(Number.isInteger(episode.episodeNumber) && episode.episodeNumber > 0 ? { episodeNumber: episode.episodeNumber } : {}),
    ...(Number.isInteger(episode.seasonNumber) && episode.seasonNumber > 0
      ? { partOfSeason: { '@type': 'TVSeason', seasonNumber: episode.seasonNumber } } : {}),
  }));
  if (episodes.length) data.episode = episodes;
  return data;
}

function podcastStructuredData(show, canonical, artworkUrl, description = show.description) {
  if (typeof show.title !== 'string' || !show.title.trim()) return null;
  const data = { '@context': 'https://schema.org', '@type': 'PodcastSeries', name: show.title.trim(), url: canonical };
  const summary = paragraphs(description).join(' ');
  if (summary) data.description = summary;
  if (artworkUrl) data.image = artworkUrl;
  const episodes = listedEpisodes(show.episodes).map((episode) => ({
    '@type': 'PodcastEpisode', name: episodeName(episode), url: episodeUrl(episode),
    ...(Number.isInteger(episode.episodeNumber) && episode.episodeNumber > 0 ? { episodeNumber: episode.episodeNumber } : {}),
  }));
  if (episodes.length) data.episode = episodes;
  return data;
}

function structuredDataScript(data) {
  if (!data) return '';
  const json = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<script type="application/ld+json">${json}</script>`;
}

module.exports = { titleStructuredData, seriesStructuredData, podcastStructuredData, structuredDataScript };

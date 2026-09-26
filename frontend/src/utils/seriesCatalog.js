export function normalizeSeriesTitle(title) {
  return typeof title === 'string'
    ? title.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()
    : '';
}

function positiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

export function isEligibleSeriesEpisode(video) {
  return video?.contentType === 'EPISODE'
    && normalizeSeriesTitle(video.seriesTitle) !== ''
    && positiveInteger(video.seasonNumber)
    && positiveInteger(video.episodeNumber);
}

export function seriesKeyFor(title) {
  const normalizedTitle = normalizeSeriesTitle(title);
  const bytes = new TextEncoder().encode(normalizedTitle);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function compareEpisodes(first, second) {
  return first.seasonNumber - second.seasonNumber
    || first.episodeNumber - second.episodeNumber
    || String(first.id || '').localeCompare(String(second.id || ''));
}

function consistentCategory(episodes) {
  const categories = episodes.map((episode) => {
    const category = episode.category || episode.genre;
    return typeof category === 'string' ? category.trim() : '';
  });
  if (!categories.length || categories.some((category) => !category)) return '';
  const normalized = categories.map((category) => category.toLowerCase());
  return normalized.every((category) => category === normalized[0]) ? categories[0] : '';
}

export function getSeriesCatalog(videos) {
  const groups = new Map();

  (Array.isArray(videos) ? videos : [])
    .filter(isEligibleSeriesEpisode)
    .forEach((episode) => {
      const normalizedTitle = normalizeSeriesTitle(episode.seriesTitle);
      const group = groups.get(normalizedTitle) || {
        title: episode.seriesTitle.trim(),
        episodes: [],
      };
      group.episodes.push(episode);
      groups.set(normalizedTitle, group);
    });

  return Array.from(groups.values(), (group) => {
    const episodes = [...group.episodes].sort(compareEpisodes);
    const title = episodes[0].seriesTitle.trim();
    const seasons = [...new Set(episodes.map((episode) => episode.seasonNumber))]
      .sort((first, second) => first - second);
    const artworkEpisode = episodes.find((episode) => episode.thumbnailUrl || episode.posterUrl);

    return {
      ...group,
      title,
      key: seriesKeyFor(title),
      episodes,
      seasons,
      seasonCount: seasons.length,
      episodeCount: episodes.length,
      category: consistentCategory(episodes),
      artwork: artworkEpisode?.thumbnailUrl || artworkEpisode?.posterUrl || '',
    };
  }).sort((first, second) => first.title.localeCompare(second.title));
}

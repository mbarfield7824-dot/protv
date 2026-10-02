export function podcastCatalogUrl(apiBaseUrl, showId) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('The PROtv API base URL is not configured.');
  return `${base}/v1/catalog/podcasts${showId === undefined ? '' : `/${encodeURIComponent(showId)}`}`;
}

export function normalizePodcastShow(show) {
  if (!show || show.contentType !== 'PODCAST_SHOW' || typeof show.id !== 'string' || !show.id) {
    throw new Error('The Podcast Show response is invalid.');
  }
  return {
    ...show,
    description: show.description || '',
    artworkUrl: show.artworkUrl || '',
    thumbnailUrl: show.artworkUrl || '',
    category: show.category || '',
    genres: Array.isArray(show.genres) ? show.genres : [],
    host: show.host || '',
    creator: show.creator || '',
  };
}

export function podcastCatalogItems(payload) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('The Podcast catalog response is invalid.');
  }
  return payload.items.map(normalizePodcastShow);
}

export function podcastShowDetail(payload) {
  const show = normalizePodcastShow(payload);
  if (!Array.isArray(payload.episodes)) {
    throw new Error('The Podcast Show response is invalid.');
  }
  return {
    ...show,
    episodes: payload.episodes.map((episode) => {
      if (episode?.contentType !== 'PODCAST_EPISODE' || episode.podcastShowId !== show.id
        || typeof episode.id !== 'string' || !Number.isSafeInteger(episode.episodeNumber)
        || episode.episodeNumber < 1) {
        throw new Error('The Podcast Episode response is invalid.');
      }
      return {
        ...episode,
        description: episode.description || '',
        thumbnailUrl: episode.thumbnailUrl || episode.posterUrl || '',
      };
    }).sort((a, b) => a.episodeNumber - b.episodeNumber || a.id.localeCompare(b.id)),
  };
}

export function podcastSearchEpisodes(payload) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('The Podcast catalog response is invalid.');
  }
  return payload.items.filter((item) => item.contentType === 'PODCAST_EPISODE').map((episode) => {
    if (typeof episode.id !== 'string' || !episode.id
      || typeof episode.podcastShowId !== 'string' || !episode.podcastShowId) {
      throw new Error('The Podcast Episode response is invalid.');
    }
    return episode;
  });
}

export function isPodcastSearchResult(video) {
  return video.contentType === 'PODCAST_SHOW' || video.contentType === 'PODCAST_EPISODE';
}

export function podcastResultUrl(video) {
  return video.contentType === 'PODCAST_SHOW'
    ? `/podcasts/${encodeURIComponent(video.id)}`
    : `/podcasts/${encodeURIComponent(video.podcastShowId)}#episodes`;
}

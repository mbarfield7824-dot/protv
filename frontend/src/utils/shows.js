export function seriesTitleFor(video) {
  if (video.seriesTitle) return video.seriesTitle;
  if (/^the beverly hillbillies\b/i.test(video.title || '')) return 'The Beverly Hillbillies';
  return '';
}

export function episodeDetailsFor(video) {
  const titleMatch = (video.title || '').match(/\bS(\d+)\s*E(\d+)\b/i);
  return {
    seasonNumber: Number(video.seasonNumber || titleMatch?.[1] || 1),
    episodeNumber: Number(video.episodeNumber || titleMatch?.[2] || 1),
  };
}

export function isTvEpisode(video) {
  return video.contentType === 'EPISODE' || Boolean(seriesTitleFor(video));
}

export function showSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function getShows(videos) {
  const shows = new Map();

  videos.filter(isTvEpisode).forEach((episode) => {
    const title = seriesTitleFor(episode);
    if (!title) return;
    const existing = shows.get(title) || { title, episodes: [], poster: episode.thumbnailUrl, description: episode.description };
    existing.episodes.push(episode);
    if (!existing.poster && episode.thumbnailUrl) existing.poster = episode.thumbnailUrl;
    shows.set(title, existing);
  });

  return Array.from(shows.values()).map((show) => ({
    ...show,
    slug: showSlug(show.title),
    seasons: new Set(show.episodes.map((episode) => episodeDetailsFor(episode).seasonNumber)).size,
  }));
}

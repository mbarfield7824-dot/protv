function isPositiveInteger(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) return false;

  const number = Number(normalized);
  return Number.isSafeInteger(number) && number >= 1;
}

export function validateEpisodeMetadata(video) {
  if (video.contentType !== 'EPISODE') return {};

  const errors = {};
  if (typeof video.seriesTitle !== 'string' || !video.seriesTitle.trim()) {
    errors.seriesTitle = 'Series title is required for an episode.';
  }
  if (!isPositiveInteger(video.seasonNumber)) {
    errors.seasonNumber = 'Season number must be a positive whole number.';
  }
  if (!isPositiveInteger(video.episodeNumber)) {
    errors.episodeNumber = 'Episode number must be a positive whole number.';
  }
  return errors;
}

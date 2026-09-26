function isPositiveInteger(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) return false;

  const number = Number(normalized);
  return Number.isSafeInteger(number) && number >= 1;
}

function validateEpisodeMetadata(video) {
  if (video.contentType !== 'EPISODE') return null;

  if (typeof video.seriesTitle !== 'string' || !video.seriesTitle.trim()) {
    return 'Series title is required for an episode.';
  }
  if (!isPositiveInteger(video.seasonNumber)) {
    return 'Season number must be a positive whole number.';
  }
  if (!isPositiveInteger(video.episodeNumber)) {
    return 'Episode number must be a positive whole number.';
  }
  return null;
}

module.exports = { validateEpisodeMetadata };

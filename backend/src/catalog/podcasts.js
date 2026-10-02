const PODCAST_SHOW = 'PODCAST_SHOW';
const PODCAST_EPISODE = 'PODCAST_EPISODE';

function podcastIngestionMatches(record, expected) {
  return record?.contentType === PODCAST_EPISODE
    && Object.entries(expected).every(([key, value]) => (record[key] ?? null) === (value ?? null));
}

function isPublishedPodcastShow(show) {
  return show?.contentType === PODCAST_SHOW
    && typeof show.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(show.id)
    && typeof show.title === 'string' && Boolean(show.title.trim())
    && show.approvalStatus === 'approved';
}

function podcastEpisodeReferenceError(episode, show) {
  if (episode?.contentType !== PODCAST_EPISODE) return 'A Podcast episode is required.';
  if (typeof episode.podcastShowId !== 'string'
    || !/^[A-Za-z0-9_-]{1,200}$/.test(episode.podcastShowId)) {
    return 'A valid podcastShowId is required.';
  }
  if (!show || show.contentType !== PODCAST_SHOW || show.id !== episode.podcastShowId) {
    return 'podcastShowId must reference an existing Podcast Show.';
  }
  if (!Number.isSafeInteger(episode.episodeNumber) || episode.episodeNumber < 1) {
    return 'Podcast episodeNumber must be a positive whole number.';
  }
  return null;
}

function validatePodcastEpisodeReference(episode, show) {
  const error = podcastEpisodeReferenceError(episode, show);
  if (error) throw new Error(error);
  return episode.podcastShowId;
}

function isPublishedPodcastEpisode(episode, show) {
  return !podcastEpisodeReferenceError(episode, show) && isPublishedPodcastShow(show);
}

function publicPodcastShow(show) {
  return {
    id: show.id,
    contentType: PODCAST_SHOW,
    title: show.title,
    description: typeof show.description === 'string' ? show.description : '',
    host: typeof show.host === 'string' ? show.host : '',
    creator: typeof show.creator === 'string' ? show.creator : '',
    category: typeof show.category === 'string' ? show.category : '',
    genres: Array.isArray(show.genres) ? show.genres.filter((genre) => typeof genre === 'string') : [],
    artworkUrl: typeof show.artworkUrl === 'string' ? show.artworkUrl : '',
  };
}

module.exports = {
  PODCAST_SHOW,
  PODCAST_EPISODE,
  podcastIngestionMatches,
  isPublishedPodcastShow,
  isPublishedPodcastEpisode,
  validatePodcastEpisodeReference,
  publicPodcastShow,
};

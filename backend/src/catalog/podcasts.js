const PODCAST_SHOW = 'PODCAST_SHOW';
const PODCAST_EPISODE = 'PODCAST_EPISODE';

class PodcastAttachmentError extends Error {}

function manualPodcastAttachment(video, show, metadata, actor) {
  const fail = (message) => { throw new PodcastAttachmentError(message); };
  if (!show || show.contentType !== PODCAST_SHOW) fail('Select an existing Podcast Show.');
  if (!video || !['MOVIE', 'EPISODE'].includes(video.contentType)
    || Object.keys(video).some((key) => key.startsWith('creator') && key !== 'creator' && video[key])
    || video.muxPlaybackPolicy === 'signed') {
    fail('Only ordinary manual movie or TV uploads can be attached. Creator Portal content must use its existing publishing workflow.');
  }
  if (video.status !== 'ready' || typeof video.muxPlaybackId !== 'string'
    || !video.muxPlaybackId.trim() || video.muxPlaybackId.startsWith('demo-playback')) {
    fail('Wait for the uploaded video to finish processing before attaching it.');
  }
  validatePodcastEpisodeReference({ contentType: PODCAST_EPISODE, ...metadata }, show);
  return {
    ...metadata,
    contentType: PODCAST_EPISODE,
    approvalStatus: 'draft', approvedAt: null, approvedBy: null, approvalNotes: '',
    podcastAttachedBy: actor,
    podcastAttachedAt: new Date().toISOString(),
    podcastPreviousContentType: video.contentType,
  };
}

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
  if (episode.seasonNumber != null
    && (!Number.isSafeInteger(episode.seasonNumber) || episode.seasonNumber < 1)) {
    return 'Podcast seasonNumber must be a positive whole number when provided.';
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
  PodcastAttachmentError,
  manualPodcastAttachment,
  PODCAST_SHOW,
  PODCAST_EPISODE,
  podcastIngestionMatches,
  isPublishedPodcastShow,
  isPublishedPodcastEpisode,
  validatePodcastEpisodeReference,
  publicPodcastShow,
};

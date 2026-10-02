const { isMusicFormat } = require('./music');
const {
  PODCAST_SHOW,
  PODCAST_EPISODE,
  isPublishedPodcastShow,
  isPublishedPodcastEpisode,
  publicPodcastShow,
} = require('./podcasts');

const VIEWS = new Set(['all', 'movies', 'documentaries', 'music']);

function isViewerEligible(video, videos = []) {
  if (video?.contentType === PODCAST_SHOW) return false;
  if (video?.contentType === PODCAST_EPISODE) {
    const show = videos.find((candidate) => candidate.id === video.podcastShowId);
    if (!isPublishedPodcastEpisode(video, show)) return false;
  }
  return video?.approvalStatus === 'approved'
    && video.status === 'ready'
    && typeof video.id === 'string'
    && Boolean(video.id.trim())
    && typeof video.muxPlaybackId === 'string'
    && Boolean(video.muxPlaybackId.trim())
    && (video.contentType !== 'MUSIC' || isMusicFormat(video.musicFormat));
}

function publicTitle(video) {
  return {
    id: video.id,
    title: typeof video.title === 'string' ? video.title : '',
    description: video.description || '',
    contentType: video.contentType,
    category: typeof video.category === 'string' && video.category
      ? video.category
      : typeof video.genre === 'string' ? video.genre : '',
    subgenre: typeof video.subgenre === 'string' ? video.subgenre : '',
    genres: Array.isArray(video.genres) ? video.genres.filter((genre) => typeof genre === 'string') : [],
    year: video.year ?? null,
    duration: video.duration ?? 0,
    runtime: video.runtime ?? null,
    maturityRating: video.maturityRating || video.ageRating || '',
    thumbnailUrl: video.thumbnailUrl || video.posterUrl || '',
    posterUrl: video.posterUrl || '',
    heroImageUrl: video.heroImageUrl || '',
    muxPlaybackId: video.muxPlaybackId.trim(),
    seriesTitle: typeof video.seriesTitle === 'string' ? video.seriesTitle : '',
    seasonNumber: video.seasonNumber ?? null,
    episodeNumber: video.episodeNumber ?? null,
    episodeTitle: video.episodeTitle || '',
    ...(video.contentType === 'MUSIC' ? { musicFormat: video.musicFormat } : {}),
    ...(video.contentType === PODCAST_EPISODE ? { podcastShowId: video.podcastShowId } : {}),
  };
}

function playableCatalog(videos, parentContext = videos) {
  return videos.filter((video) => isViewerEligible(video, parentContext))
    .map(publicTitle)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function podcastCatalog(videos) {
  const episodes = playableCatalog(videos).filter((item) => item.contentType === PODCAST_EPISODE);
  return videos.filter(isPublishedPodcastShow)
    .map((show) => ({
      ...publicPodcastShow(show),
      episodes: episodes.filter((episode) => episode.podcastShowId === show.id)
        .sort((left, right) => left.episodeNumber - right.episodeNumber || left.id.localeCompare(right.id)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function matchesDocumentary(video) {
  return [video.category, video.subgenre, ...(Array.isArray(video.genres) ? video.genres : [])]
    .some((value) => String(value || '').toLowerCase() === 'documentary');
}

function matchesMusic(video) {
  if (video.contentType === 'MUSIC') return isMusicFormat(video.musicFormat);
  return [video.category, video.genre].some(
    (value) => typeof value === 'string' && value.trim().toLowerCase() === 'music'
  );
}

function browse(videos, { view = 'all', q = '' } = {}) {
  if (!VIEWS.has(view)) throw new RangeError('view must be all, movies, documentaries, or music.');
  if (typeof q !== 'string' || q.length > 200) {
    throw new RangeError('q must be a string of at most 200 characters.');
  }
  const terms = q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const candidates = view === 'documentaries'
    ? videos.filter(matchesDocumentary)
    : view === 'music' ? videos.filter(matchesMusic) : videos;
  return playableCatalog(candidates, videos).filter((video) => {
    if (view === 'movies' && String(video.contentType || '').toUpperCase() !== 'MOVIE') return false;
    const text = [
      video.title, video.category, video.subgenre, ...video.genres,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

function normalizeSeriesTitle(title) {
  return typeof title === 'string'
    ? title.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()
    : '';
}

function eligibleEpisode(video) {
  return video.contentType === 'EPISODE'
    && normalizeSeriesTitle(video.seriesTitle) !== ''
    && Number.isInteger(video.seasonNumber) && video.seasonNumber >= 1
    && Number.isInteger(video.episodeNumber) && video.episodeNumber >= 1;
}

function seriesKey(title) {
  return Buffer.from(normalizeSeriesTitle(title), 'utf8').toString('base64url');
}

function episodeOrder(left, right) {
  return left.seasonNumber - right.seasonNumber
    || left.episodeNumber - right.episodeNumber
    || left.id.localeCompare(right.id);
}

function consistentCategory(episodes) {
  const categories = episodes.map((episode) => (episode.category || '').trim());
  if (categories.some((category) => !category)) return '';
  return categories.every((category) => category.toLowerCase() === categories[0].toLowerCase())
    ? categories[0]
    : '';
}

function seriesCatalog(videos) {
  const groups = new Map();
  for (const episode of playableCatalog(videos).filter(eligibleEpisode)) {
    const normalized = normalizeSeriesTitle(episode.seriesTitle);
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized).push(episode);
  }

  return [...groups.values()].map((group) => {
    const title = group[0].seriesTitle.trim();
    const episodes = group.sort(episodeOrder);
    const numbers = [...new Set(episodes.map((episode) => episode.seasonNumber))]
      .sort((left, right) => left - right);
    const artworkEpisode = episodes.find((episode) => episode.thumbnailUrl || episode.posterUrl);
    return {
      key: seriesKey(title),
      title,
      category: consistentCategory(episodes),
      artwork: artworkEpisode?.thumbnailUrl || artworkEpisode?.posterUrl || '',
      seasonCount: numbers.length,
      episodeCount: episodes.length,
      seasons: numbers.map((number) => ({
        number,
        episodes: episodes.filter((episode) => episode.seasonNumber === number),
      })),
    };
  }).sort((left, right) => left.title.localeCompare(right.title) || left.key.localeCompare(right.key));
}

module.exports = { browse, isViewerEligible, playableCatalog, podcastCatalog, publicTitle, seriesCatalog, seriesKey };

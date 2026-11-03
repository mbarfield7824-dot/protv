import { loadWithinDeadline } from '../utils/requestDeadline.js';
import { podcastEpisodeOrder } from './playerCatalog.js';

export const FEATURED_PODCAST = {
  title: 'Me and My White Friend',
  hosts: 'Reg and Marv',
  path: '/podcast/me-and-my-white-friend',
  tagline: 'Different backgrounds. Real conversations. One unforgettable friendship.',
  description: [
    'Me and My White Friend brings together Reg and Marv for an entertaining podcast built around friendship, personality, and authentic conversation.',
    "With two unique perspectives and natural chemistry, the hosts bring humor, honesty, and their own experiences to the table. It's a refreshing reminder that even when we come from different walks of life, there's plenty we can laugh about, learn from, and connect over.",
    'Unfiltered, relatable, and full of personality, Me and My White Friend celebrates the conversations and connections that bring people together.',
  ],
};

export function isFeaturedPodcast(show) {
  const normalize = (value) => String(value || '').toLowerCase().replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
  return show?.contentType === 'PODCAST_SHOW'
    && normalize(show.title) === normalize(FEATURED_PODCAST.title);
}

export function featuredPodcastEpisodes(show) {
  if (!show) return [];
  return show.episodes.filter((episode) => (
    episode.contentType === 'PODCAST_EPISODE'
    && episode.podcastShowId === show.id
    && typeof episode.id === 'string' && episode.id
    && typeof episode.muxPlaybackId === 'string' && episode.muxPlaybackId.trim()
    && !episode.muxPlaybackId.trim().startsWith('demo-playback')
    && (!episode.status || episode.status === 'ready')
    && (!episode.approvalStatus || episode.approvalStatus === 'approved')
    && episode.releaseStatus !== 'held'
  )).sort(podcastEpisodeOrder);
}

export function episodeRuntime(episode) {
  const seconds = Number(episode.duration || episode.runtime);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.ceil(seconds / 60);
  return total >= 60 ? `${Math.floor(total / 60)}h ${total % 60}m` : `${total}m`;
}

export async function loadFeaturedPodcast(api, { signal } = {}) {
  return loadWithinDeadline(async (requestSignal) => {
    // Discover the approved Show once, then use its real catalog ID and parent relationship.
    const matches = (await api.getPodcastShows({ signal: requestSignal })).filter(isFeaturedPodcast);
    if (matches.length > 1) throw new Error('The featured Podcast has multiple catalog matches. Please contact PROtv support.');
    if (!matches.length) return null;
    const show = await api.getPodcastShow(matches[0].id, { signal: requestSignal });
    if (show && (show.id !== matches[0].id || !isFeaturedPodcast(show))) {
      throw new Error('The featured Podcast catalog identity changed. Please try again.');
    }
    return show;
  }, 'Podcast episodes', 10_000, signal);
}

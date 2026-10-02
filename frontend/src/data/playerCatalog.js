import { loadWithinDeadline } from '../utils/requestDeadline.js';

export function podcastEpisodePlayerUrl(episode) {
  if (episode?.contentType !== 'PODCAST_EPISODE' || typeof episode.id !== 'string' || !episode.id) {
    throw new Error('A Podcast Episode ID is required.');
  }
  return `/player/${encodeURIComponent(episode.id)}`;
}

export function podcastParentUrl(showId) {
  return typeof showId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(showId)
    ? `/podcasts/${encodeURIComponent(showId)}`
    : '/podcasts';
}

export function normalizePlayerTitle(title, expectedId) {
  if (!title || title.id !== expectedId || title.contentType === 'PODCAST_SHOW'
    || typeof title.muxPlaybackId !== 'string' || !title.muxPlaybackId.trim()) {
    throw new Error('The public playback title response is invalid.');
  }
  if (title.contentType === 'PODCAST_EPISODE'
    && (podcastParentUrl(title.podcastShowId) === '/podcasts'
      || !Number.isSafeInteger(title.episodeNumber) || title.episodeNumber < 1
      || title.muxPlaybackId.trim().startsWith('demo-playback'))) {
    throw new Error('The public Podcast Episode response is invalid.');
  }
  return {
    ...title,
    title: typeof title.title === 'string' ? title.title : '',
    description: typeof title.description === 'string' ? title.description : '',
    thumbnailUrl: title.thumbnailUrl || title.posterUrl || '',
    heroImageUrl: title.heroImageUrl || title.thumbnailUrl || title.posterUrl || '',
    genres: Array.isArray(title.genres) ? title.genres : [],
    muxPlaybackId: title.muxPlaybackId.trim(),
  };
}

export async function fetchPlayerTitle(apiBaseUrl, id, {
  fetchImpl = fetch, signal, timeoutMs = 10_000,
} = {}) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('The PROtv API base URL is not configured.');
  if (typeof id !== 'string' || !id) throw new Error('A playback title ID is required.');
  const url = `${base}/v1/catalog/titles/${encodeURIComponent(id)}`;
  return loadWithinDeadline(async (requestSignal) => {
    const read = async (endpoint) => {
      const response = await fetchImpl(endpoint, { cache: 'no-store', signal: requestSignal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Playback is temporarily unavailable. Please try again.');
      const payload = await response.json();
      requestSignal.throwIfAborted();
      return payload;
    };
    const legacy = await read(`${base}/videos/${encodeURIComponent(id)}`);
    if (legacy === null) return null;
    if (legacy.contentType !== 'PODCAST_EPISODE') return normalizePlayerTitle(legacy, id);
    const title = await read(url);
    if (title === null) return null;
    if (title.contentType !== 'PODCAST_EPISODE' || title.podcastShowId !== legacy.podcastShowId) {
      throw new Error('The public Podcast Episode response changed. Please try again.');
    }
    const normalized = normalizePlayerTitle(title, id);
    // Recheck public eligibility immediately before handing the ID to Mux.
    const playback = await read(`${url}/playback`);
    if (playback === null) return null;
    if (playback.id !== id || playback.streamType !== 'on-demand'
      || typeof playback.muxPlaybackId !== 'string' || !playback.muxPlaybackId.trim()
      || (normalized.contentType === 'PODCAST_EPISODE' && playback.muxPlaybackId.trim().startsWith('demo-playback'))) {
      throw new Error('The public playback response is invalid.');
    }
    return { ...normalized, muxPlaybackId: playback.muxPlaybackId.trim() };
  }, 'Playback request', timeoutMs, signal);
}

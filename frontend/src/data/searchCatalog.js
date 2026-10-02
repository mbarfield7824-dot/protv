import { isPodcastSearchResult } from './podcastCatalog.js';

export const SEARCH_SOURCE_TIMEOUT_MS = 10_000;

export async function fetchSearchVideos(apiBaseUrl, fetchImpl = fetch, { signal } = {}) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('The PROtv API base URL is not configured.');
  const response = await fetchImpl(`${base}/videos`, { cache: 'no-store', ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error('The Movie/Music catalog is temporarily unavailable.');
  const items = await response.json();
  if (!Array.isArray(items)) throw new Error('The Movie/Music catalog response is invalid.');
  return items;
}

async function loadWithinDeadline(load, label, timeoutMs, signal) {
  const controller = new AbortController();
  let timer;
  let onAbort;
  const unavailable = new Promise((resolve, reject) => {
    const stop = (reason) => {
      reject(reason);
      controller.abort(reason);
    };
    onAbort = () => stop(signal.reason || new Error('Search request was cancelled.'));
    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => stop(new Error(`${label} timed out. Please try again.`)), timeoutMs);
    }
  });
  try {
    return await Promise.race([
      unavailable,
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function loadSearchCatalog(apiClient, normalizeVideo = (video) => video, {
  timeoutMs = SEARCH_SOURCE_TIMEOUT_MS, signal,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Search source timeout must be a positive finite number.');
  }
  const sources = [
    { source: 'catalog', label: 'Movie/Music catalog', load: (signal) => apiClient.getSearchVideos({ signal }) },
    { source: 'shows', label: 'Podcast Shows', load: (signal) => apiClient.getPodcastShows({ signal }) },
    { source: 'episodes', label: 'Podcast Episodes', load: (signal) => apiClient.getPodcastEpisodes({ signal }) },
  ];
  const settled = await Promise.allSettled(sources.map(({ source, label, load }) =>
    loadWithinDeadline(async (sourceSignal) => {
      const items = await load(sourceSignal);
      sourceSignal.throwIfAborted();
      if (!Array.isArray(items)) throw new Error('The search response is invalid.');
      return (source === 'catalog' ? items.filter((item) => !isPodcastSearchResult(item)) : items)
        .map(normalizeVideo);
    }, label, timeoutMs, signal)));
  const items = [];
  const failures = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      failures.push({
        source: sources[index].source,
        label: sources[index].label,
        message: result.reason instanceof Error ? result.reason.message : 'Unable to load this search source.',
      });
    }
  });
  return {
    items,
    failures,
    status: failures.length === sources.length ? 'unavailable' : failures.length ? 'partial' : 'complete',
  };
}

export function overlaySearchCatalog(catalog, legacy) {
  if (catalog.status === 'loading' || catalog.status === 'unavailable') return [];
  if (catalog.status === 'partial') return catalog.items;
  // Preserve legacy mock search only after every public source has loaded successfully.
  return [
    ...(catalog.items.length ? catalog.items : legacy.primary),
    ...legacy.additional,
  ];
}

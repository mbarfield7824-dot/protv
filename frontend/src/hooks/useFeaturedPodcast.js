import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { featuredPodcastEpisodes, loadFeaturedPodcast } from '../data/featuredPodcast';

export function useFeaturedPodcast() {
  const [state, setState] = useState({ show: null, loading: true, error: '' });
  const request = useRef(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const show = await loadFeaturedPodcast(api, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ show, loading: false, error: '' });
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Failed to load featured Podcast episodes:', error);
        setState({ show: null, loading: false, error: error.message });
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const whenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(whenVisible, 60_000);
    window.addEventListener('focus', whenVisible);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('focus', whenVisible);
      document.removeEventListener('visibilitychange', whenVisible);
      request.current?.abort();
    };
  }, [refresh]);

  return { ...state, episodes: featuredPodcastEpisodes(state.show), refresh };
}

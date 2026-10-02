import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { loadSearchCatalog } from '../data/searchCatalog';

export function useSearchCatalog(normalizeVideo) {
  const [catalog, setCatalog] = useState({ items: [], failures: [], status: 'loading' });
  const request = useRef(0);
  const activeRequest = useRef(null);

  const load = useCallback(async () => {
    const current = ++request.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const result = await loadSearchCatalog(api, normalizeVideo, { signal: controller.signal });
    if (request.current === current) setCatalog(result);
  }, [normalizeVideo]);

  const retry = useCallback(() => {
    setCatalog({ items: [], failures: [], status: 'loading' });
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
      activeRequest.current?.abort();
    };
  }, [load]);

  return { catalog, retry };
}

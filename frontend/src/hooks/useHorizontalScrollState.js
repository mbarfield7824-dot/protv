import { useCallback, useEffect, useRef, useState } from 'react';

export function useHorizontalScrollState() {
  const scrollRef = useRef(null);
  const [state, setState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
    progress: 0,
  });

  const update = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
    setState({
      canScrollLeft: element.scrollLeft > 4,
      canScrollRight: element.scrollLeft < maximum - 4,
      hasOverflow: maximum > 4,
      progress: maximum > 0 ? Math.min(100, Math.max(0, (element.scrollLeft / maximum) * 100)) : 0,
    });
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const frame = window.requestAnimationFrame(update);
    const delayedUpdate = window.setTimeout(update, 250);
    const settledUpdate = window.setTimeout(update, 1000);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(update);
    observer?.observe(element);
    mutationObserver?.observe(element, { childList: true });
    element.addEventListener('scroll', update, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayedUpdate);
      window.clearTimeout(settledUpdate);
      observer?.disconnect();
      mutationObserver?.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [update]);

  return { scrollRef, update, ...state };
}

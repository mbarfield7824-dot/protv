import { api } from '../api';

// Automatic, first-party ad measurement. Nothing here asks the viewer anything or identifies them: events carry only
// the signed measurement session, the ad's position in its break and what happened. The server decides what counts.
export const DISPLAY_VIEWABLE_MS = 1000;
export const VIDEO_VIEWABLE_MS = 2000;
export const VIEWABLE_PIXEL_RATIO = 0.5;
export const MIN_COMPLETE_MS = 1000;

// Google IMA error codes grouped into the failure reasons PROtv reports.
const IMA_FAILURES = { 303: 'empty', 1009: 'empty', 301: 'timeout', 402: 'timeout', 1205: 'playback_blocked', 400: 'playback_blocked', 405: 'playback_blocked' };
export function imaFailureReason(error) {
  let code;
  try { code = error?.getErrorCode?.(); } catch { code = undefined; }
  return IMA_FAILURES[code] || 'ad_error';
}
const RETRY_AFTER_MS = 1500;

export function automatedBrowser() {
  try { return navigator.webdriver === true; } catch { return false; }
}

// The page type a display placement first rendered on. Only these broad types are recorded, never the address.
export function pageType(pathname = window.location.pathname) {
  if (pathname === '/' || pathname === '') return 'home';
  if (/^\/title\//.test(pathname)) return 'title';
  if (/^\/series\/./.test(pathname)) return 'series';
  if (/^\/(podcasts\/.|podcast\/)/.test(pathname)) return 'podcast';
  if (/^\/(movies|documentaries|series|music|podcasts|cartoons)\/?$/.test(pathname)) return 'browse';
  return 'other';
}

// Sends each event at most once per ad position, in the order they happened, after the session token arrives.
// A network failure or server error is retried once; the server ignores repeats, so a retry can never double count.
// Without a token (measurement off, rate limited or unavailable) events are dropped: the ad is simply not counted.
// `timing` ({ after, ms }) holds an event until `ms` after the server accepted the `after` event for that ad, so a
// late token or slow network cannot make a genuine viewable impression or completion look implausibly early.
export function createAdMeasurer(tokenPromise, { send = (event) => api.recordAdMeasurement(event), wait = delay, now = () => Date.now() } = {}) {
  const sent = new Set();
  const accepted = new Map();
  let queue = Promise.resolve(tokenPromise).then((token) => token || null, () => null);
  const automated = automatedBrowser();
  return {
    record(position, eventType, details = {}, timing = null) {
      const key = `${position}:${eventType}`;
      if (sent.has(key)) return false;
      sent.add(key);
      queue = queue.then(async (token) => {
        if (!token) return token;
        if (timing) {
          const since = accepted.get(`${position}:${timing.after}`);
          if (since === undefined) return token; // what it depends on was never recorded, so it cannot count
          const remaining = since + timing.ms - now();
          if (remaining > 0) await wait(remaining + 50);
        }
        const event = { token, position, eventType, ...details, ...(automated ? { automated: true } : {}) };
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try { await send(event); accepted.set(key, now()); break; } catch (error) {
            const retryable = !error?.status || error.status >= 500;
            if (!retryable || attempt === 1) break;
            await wait(RETRY_AFTER_MS);
          }
        }
        return token;
      });
      return true;
    },
    settled: () => queue.then(() => undefined),
  };
}

function delay(ms) { return new Promise((resolve) => { window.setTimeout(resolve, ms); }); }

// Viewability: at least half the element's pixels inside the viewport, in a visible tab, while `active()` holds
// (for video: while the ad is playing), for `durationMs` without interruption. Calls onViewable once.
// Not measurable without IntersectionObserver, or when PROtv itself is framed by another site.
export function watchViewability(element, { durationMs, onViewable, active = () => true }) {
  let framed;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (!element || typeof window.IntersectionObserver !== 'function' || framed) {
    return { measurable: false, update() {}, stop() {} };
  }
  let ratio = 0;
  let timer = 0;
  let done = false;
  const update = () => {
    const eligible = !done && ratio >= VIEWABLE_PIXEL_RATIO && document.visibilityState === 'visible' && active();
    if (eligible && !timer) {
      timer = window.setTimeout(() => { timer = 0; done = true; stop(); onViewable(); }, durationMs);
    } else if (!eligible && timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  };
  const observer = new window.IntersectionObserver((entries) => {
    for (const entry of entries) ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
    update();
  }, { threshold: [0, VIEWABLE_PIXEL_RATIO, 1] });
  observer.observe(element);
  document.addEventListener('visibilitychange', update);
  function stop() {
    window.clearTimeout(timer);
    timer = 0;
    observer.disconnect();
    document.removeEventListener('visibilitychange', update);
  }
  return { measurable: true, update, stop };
}

// Clicks on a rendered display unit: a link inside the unit, or focus moving into the unit's ad frame while the
// pointer is over that frame (clicks inside a third-party frame are not otherwise visible to the page).
export function watchClicks(container, onClick) {
  let pointerFrame = null;
  const click = (event) => { if (event.target?.closest?.('a[href]')) onClick(); };
  const over = (event) => { if (event.target?.tagName === 'IFRAME') pointerFrame = event.target; };
  const out = (event) => { if (event.target === pointerFrame) pointerFrame = null; };
  const blur = () => window.setTimeout(() => {
    const focused = document.activeElement;
    if (pointerFrame && focused === pointerFrame && container.contains(focused)) onClick();
  }, 0);
  container.addEventListener('click', click, true);
  container.addEventListener('pointerover', over);
  container.addEventListener('pointerout', out);
  window.addEventListener('blur', blur);
  return () => {
    container.removeEventListener('click', click, true);
    container.removeEventListener('pointerover', over);
    container.removeEventListener('pointerout', out);
    window.removeEventListener('blur', blur);
  };
}

// Video pre-roll (Google IMA): each ad in the break is counted by its pod position. The served impression is IMA's
// IMPRESSION event (the ad's first frame), never the ad request. Returns `fail(error, reason)` for failures that IMA
// reports outside the ads manager, and `stop()` for teardown.
export function attachImaMeasurement({ ima, adsManager, container, measurer }) {
  let viewability = null;
  let playing = false;
  let loaded = 0;
  const positionOf = (event) => {
    try { return Math.min(5, Math.max(1, Number(event?.getAd?.()?.getAdPodInfo?.()?.getAdPosition?.()) || 1)); } catch { return 1; }
  };
  const stopViewability = () => { playing = false; viewability?.stop(); viewability = null; };
  const on = (type, handler) => adsManager.addEventListener(type, handler);
  const types = ima.AdEvent.Type;
  on(types.LOADED, (event) => { loaded = positionOf(event); });
  on(types.IMPRESSION, (event) => measurer.record(positionOf(event), 'served'));
  on(types.STARTED, (event) => {
    const position = positionOf(event);
    loaded = position;
    stopViewability();
    playing = true;
    // Viewable: half the player on screen, tab visible, ad playing, for two continuous seconds.
    viewability = watchViewability(container, {
      durationMs: VIDEO_VIEWABLE_MS,
      active: () => playing,
      onViewable: () => measurer.record(position, 'viewable', {}, { after: 'start', ms: VIDEO_VIEWABLE_MS }),
    });
    measurer.record(position, 'start', { measurable: viewability.measurable });
  });
  on(types.PAUSED, () => { playing = false; viewability?.update(); });
  on(types.RESUMED, () => { playing = true; viewability?.update(); });
  on(types.FIRST_QUARTILE, (event) => measurer.record(positionOf(event), 'firstQuartile'));
  on(types.MIDPOINT, (event) => measurer.record(positionOf(event), 'midpoint'));
  on(types.THIRD_QUARTILE, (event) => measurer.record(positionOf(event), 'thirdQuartile'));
  on(types.CLICK, (event) => measurer.record(positionOf(event), 'click'));
  on(types.COMPLETE, (event) => {
    stopViewability();
    measurer.record(positionOf(event), 'complete', {}, { after: 'start', ms: MIN_COMPLETE_MS });
    loaded = 0;
  });
  on(types.SKIPPED, (event) => {
    stopViewability();
    measurer.record(positionOf(event), 'skip');
    loaded = 0;
  });
  return {
    // Position 0 is a break that failed before any ad was chosen; otherwise the failure belongs to that ad.
    fail: (error, reason = imaFailureReason(error)) => { stopViewability(); measurer.record(loaded, 'error', { reason }); },
    stop: stopViewability,
  };
}

// The Sponsored native banner: one measurement session per ad request (it is only requested after consent).
export function startDisplayMeasurement() {
  const token = api.startAdMeasurement({ channel: 'display', placement: 'native_banner', page: pageType(), ...(automatedBrowser() ? { automated: true } : {}) })
    .then((response) => (response?.enabled ? response.token : null), () => null);
  return createAdMeasurer(token);
}

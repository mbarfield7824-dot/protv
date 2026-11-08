import { api } from '../api';
import { NATIVE_BANNER } from './sponsored';
import { DISPLAY_VIEWABLE_MS, startDisplayMeasurement, watchClicks, watchViewability } from './adMeasurement';

// The Administrator switch is read once per page load, like the ad itself; a change applies on the next load.
let settingsRequest = null;
export function loadPlacementSettings() {
  settingsRequest ||= api.getAdPlacements().catch((error) => { settingsRequest = null; throw error; });
  return settingsRequest;
}

// One ad request per full page load. The ad network keys the unit by a fixed container ID and its script
// skips a second set-up on the same page ("duplicate" / "max widgets"), so re-running it on every in-app route
// change is unsupported. Instead the unit is requested once, and the rendered unit moves to whichever Sponsored
// section is on screen as the viewer navigates. Moving it requests nothing and records no new impression.
// An empty, blocked or failed request is not retried until the next page load.
//
// Measurement is automatic: the served impression is recorded when the unit actually renders (never on request),
// viewability and clicks are watched on the rendered unit wherever it is shown, and all of it counts once per load.
export const session = { status: 'idle', container: null, script: null, host: null, listeners: new Set(), stopMeasuring: null };

function setSessionStatus(status) {
  session.status = status;
  for (const listener of session.listeners) listener(status);
}

export function startSession(host, report, emptyAfterMs, measure = startDisplayMeasurement) {
  const container = document.createElement('div');
  container.id = NATIVE_BANNER.containerId;
  const script = document.createElement('script');
  script.async = true;
  script.dataset.cfasync = 'false';
  script.src = NATIVE_BANNER.scriptSrc;
  const measurer = measure();
  Object.assign(session, { container, script });
  let timer = 0;
  const observer = new MutationObserver(() => {
    if (container.childElementCount > 0) finish('rendered');
  });
  function finish(outcome) {
    if (session.status !== 'requested' || session.container !== container) return;
    window.clearTimeout(timer);
    observer.disconnect();
    if (outcome === 'rendered') {
      const viewability = watchViewability(container, {
        durationMs: DISPLAY_VIEWABLE_MS,
        onViewable: () => measurer.record(1, 'viewable', {}, { after: 'served', ms: DISPLAY_VIEWABLE_MS }),
      });
      measurer.record(1, 'served', { measurable: viewability.measurable });
      const stopClicks = watchClicks(container, () => measurer.record(1, 'click'));
      session.stopMeasuring = () => { viewability.stop(); stopClicks(); };
    } else {
      container.replaceChildren();
      measurer.record(1, 'error', { reason: outcome === 'empty' ? 'empty' : 'script_error' });
    }
    setSessionStatus(outcome);
    report(outcome);
  }
  script.onerror = () => finish('error');
  observer.observe(container, { childList: true, subtree: true });
  timer = window.setTimeout(() => { if (container.childElementCount === 0) finish('empty'); }, emptyAfterMs);
  setSessionStatus('requested');
  report('requested');
  host.append(container);
  container.after(script);
}

// Withdrawal removes the unit and its script. Within this page load nothing is requested again.
export function endSession() {
  session.stopMeasuring?.();
  session.script?.remove();
  session.container?.remove();
  Object.assign(session, { container: null, script: null, host: null, stopMeasuring: null });
  setSessionStatus('withdrawn');
}

// Tests only: start a fresh page load.
export function resetSponsoredSessionForTests() {
  session.stopMeasuring?.();
  session.script?.remove();
  session.container?.remove();
  Object.assign(session, { status: 'idle', container: null, script: null, host: null, stopMeasuring: null });
  session.listeners.clear();
  settingsRequest = null;
}

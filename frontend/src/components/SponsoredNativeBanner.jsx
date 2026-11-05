import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { track } from '@vercel/analytics';
import { api } from '../api';
import { NATIVE_BANNER, readSponsoredConsent, writeSponsoredConsent } from '../ads/sponsored';
import '../styles/Sponsored.css';

const EMPTY_AFTER_MS = 10_000;
const loadPlacementSettings = () => api.getAdPlacements();
// One live ad per page: the ad network keys the unit by a fixed container ID.
let activeUnit = false;

// Placement outcomes only (no impression, CPM or revenue figures; those come from Adsterra's own reports).
function reportSponsored(state) {
  try { track('sponsored_native_banner', { state }); } catch { /* analytics must never affect the page */ }
}

// The homepage Sponsored section. Nothing from the ad network loads unless the Administrator switch is on and the
// viewer has chosen to allow sponsored content. A failed or empty ad removes the section instead of leaving a gap.
export default function SponsoredNativeBanner({
  loadSettings = loadPlacementSettings, report = reportSponsored, emptyAfterMs = EMPTY_AFTER_MS,
}) {
  const [enabled, setEnabled] = useState(false);
  const [consent, setConsent] = useState(() => readSponsoredConsent());
  const [state, setState] = useState('idle');
  const unitRef = useRef(null);

  useEffect(() => {
    let current = true;
    loadSettings()
      .then((settings) => { if (current) setEnabled(settings?.nativeBanner?.enabled === true); })
      .catch(() => { if (current) setEnabled(false); });
    return () => { current = false; };
  }, [loadSettings]);

  useEffect(() => {
    if (enabled && consent === null) report('consent_requested');
  }, [enabled, consent, report]);

  useEffect(() => {
    const unit = unitRef.current;
    if (!enabled || consent !== 'granted' || !unit) return undefined;
    if (activeUnit) {
      // A second Sponsored section on the same page stays hidden rather than competing for the one ad unit.
      const hide = window.setTimeout(() => setState('error'), 0);
      return () => window.clearTimeout(hide);
    }
    activeUnit = true;
    unit.replaceChildren();
    const script = document.createElement('script');
    script.async = true;
    script.dataset.cfasync = 'false';
    script.src = NATIVE_BANNER.scriptSrc;
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      setState(outcome);
      report(outcome);
    };
    script.onerror = () => finish('error');
    const observer = new MutationObserver(() => { if (unit.childElementCount > 0) finish('rendered'); });
    observer.observe(unit, { childList: true, subtree: true });
    const timer = window.setTimeout(() => { if (unit.childElementCount === 0) finish('empty'); }, emptyAfterMs);
    report('requested');
    unit.after(script);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      script.remove();
      unit.replaceChildren();
      activeUnit = false;
    };
  }, [enabled, consent, report, emptyAfterMs]);

  const choose = (value) => {
    writeSponsoredConsent(value);
    setConsent(value);
    report(value === 'granted' ? 'consent_granted' : 'consent_declined');
  };

  if (!enabled || consent === 'declined' || state === 'empty' || state === 'error') return null;
  return (
    <section className="ptv-sponsored" aria-label="Sponsored">
      <div className="ptv-sponsored__head">
        <span className="ptv-sponsored__label">Sponsored</span>
        {consent === 'granted' && (
          <button type="button" className="ptv-sponsored__off" onClick={() => choose('declined')}>Turn off sponsored content</button>
        )}
      </div>
      {consent === 'granted' ? (
        <div className="ptv-sponsored__unit">
          {state !== 'rendered' && <p className="ptv-sponsored__status" role="status">Loading sponsored content…</p>}
          <div id={NATIVE_BANNER.containerId} ref={unitRef} />
        </div>
      ) : (
        <div className="ptv-sponsored__consent">
          <p>
            Sponsored content on PROtv is provided by Adsterra, a third-party advertising network. If you allow it,
            Adsterra loads on this page and may use cookies and similar technologies to show and measure ads.
            {' '}<Link to="/privacy#advertising">How PROtv handles advertising</Link>
          </p>
          <div className="ptv-sponsored__actions">
            <button type="button" className="ptv-btn ptv-btn--primary" onClick={() => choose('granted')}>Allow sponsored content</button>
            <button type="button" className="ptv-btn ptv-btn--ghost" onClick={() => choose('declined')}>No thanks</button>
          </div>
        </div>
      )}
    </section>
  );
}

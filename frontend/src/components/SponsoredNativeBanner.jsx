import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { track } from '@vercel/analytics';
import { endSession, loadPlacementSettings, session, startSession } from '../ads/sponsoredSession';
import { readSponsoredConsent, writeSponsoredConsent } from '../ads/sponsored';
import '../styles/Sponsored.css';

const EMPTY_AFTER_MS = 10_000;
// Placement outcomes for Vercel Analytics. Impressions, viewability and clicks are measured separately and automatically
// (src/ads/adMeasurement.js); earnings and Adsterra's own impression counts come from Adsterra's reports.
function reportSponsored(state) {
  try { track('sponsored_native_banner', { state }); } catch { /* analytics must never affect the page */ }
}

// A Sponsored section. Nothing from the ad network loads unless the Administrator switch is on and the viewer has
// chosen to allow sponsored content. A failed or empty ad removes the section instead of leaving a gap.
export default function SponsoredNativeBanner({
  loadSettings = loadPlacementSettings, report = reportSponsored, emptyAfterMs = EMPTY_AFTER_MS, measure,
}) {
  const [enabled, setEnabled] = useState(false);
  const [consent, setConsent] = useState(() => readSponsoredConsent());
  const [status, setStatus] = useState(session.status);
  const [hidden, setHidden] = useState(false);
  const hostRef = useRef(null);

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
    const host = hostRef.current;
    if (!enabled || consent !== 'granted' || !host) return undefined;
    if (session.host && session.host !== host) {
      // Another Sponsored section is already showing the unit on this screen; this one stays hidden.
      const hide = window.setTimeout(() => setHidden(true), 0);
      return () => window.clearTimeout(hide);
    }
    session.listeners.add(setStatus);
    session.host = host;
    if (session.status === 'idle') startSession(host, report, emptyAfterMs, measure);
    else if (session.container && ['requested', 'rendered'].includes(session.status)) host.append(session.container);
    const sync = window.setTimeout(() => setStatus(session.status), 0);
    return () => {
      window.clearTimeout(sync);
      session.listeners.delete(setStatus);
      // Keep the unit for the next section; it is shown only while a Sponsored section is on screen.
      if (session.container?.parentNode === host) session.container.remove();
      if (session.host === host) session.host = null;
    };
  }, [enabled, consent, report, emptyAfterMs, measure]);

  const choose = (value) => {
    writeSponsoredConsent(value);
    if (value === 'declined' && session.status !== 'idle') endSession();
    setConsent(value);
    report(value === 'granted' ? 'consent_granted' : 'consent_declined');
  };

  if (!enabled || consent === 'declined' || hidden) return null;
  if (consent === 'granted' && !['idle', 'requested', 'rendered'].includes(status)) return null;
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
          {status !== 'rendered' && <p className="ptv-sponsored__status" role="status">Loading sponsored content…</p>}
          <div ref={hostRef} />
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

import { useEffect, useState } from 'react';
import { api } from '../api';
import AdMeasurementReport from './AdMeasurementReport';

// Owner/Administrator switch for the homepage Sponsored (Adsterra Native Banner) placement. It takes effect on the next
// page load, with no redeploy. Viewers still have to allow sponsored content before anything from Adsterra loads.
export default function AdminAdvertising() {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getAdminAdPlacements()
      .then((value) => { if (active) setSettings(value); })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  const change = async (enabled) => {
    const prompt = enabled
      ? 'Turn on the homepage Sponsored placement? Viewers who allow sponsored content will see Adsterra ads.'
      : 'Turn off the homepage Sponsored placement? No Adsterra code will load for any viewer.';
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError('');
    try { setSettings(await api.setNativeBannerEnabled(enabled)); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  const on = settings?.nativeBannerEnabled === true;
  return (
    <section className="admin-advertising" aria-labelledby="admin-advertising-title">
      <h2 id="admin-advertising-title">Sponsored Placements</h2>
      <article className="admin-advertising__card">
        <header>
          <h3>Homepage Sponsored · Adsterra Native Banner (4:1)</h3>
          <span className={`admin-status-pill ${on ? 'is-on' : ''}`}>{settings ? (on ? 'On' : 'Off') : 'Loading…'}</span>
        </header>
        <p>Appears once on the homepage after New on PROtv, Coming Soon and PROtv Originals. Never shown in players, trailers, sign-in, account pages, Admin or the Creator Portal.</p>
        <p>Each viewer is asked before any Adsterra code loads, and browsers sending Global Privacy Control are never shown ads. PROtv measures served and viewable impressions and clicks automatically (below); earnings and Adsterra&apos;s own counts are in your Adsterra dashboard.</p>
        {settings?.updatedAt && <p className="admin-advertising__meta">Last changed {new Date(settings.updatedAt).toLocaleString()}.</p>}
        {settings && (
          <button type="button" className={on ? 'admin-secondary' : 'admin-secondary admin-button-primary'} disabled={busy} onClick={() => change(!on)}>
            {busy ? 'Saving…' : on ? 'Turn off Sponsored placement' : 'Turn on Sponsored placement'}
          </button>
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </article>
      <AdMeasurementReport />
    </section>
  );
}

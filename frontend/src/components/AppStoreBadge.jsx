// Apple's official "Download on the App Store" badge (unmodified, from Apple Marketing Tools), linking to PROtv
// Streaming for iPhone and iPad. Apple's guidelines: use the artwork as supplied, keep clear space around it.
export const APP_STORE_URL = 'https://apps.apple.com/us/app/protv-streaming/id6838530991';

export default function AppStoreBadge({ height = 44, className = '' }) {
  return (
    <a className={`ptv-appstore-badge ${className}`.trim()} href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"
      aria-label="Download PROtv Streaming on the App Store">
      <img src="/brand/download-on-the-app-store-black.svg" alt="Download on the App Store" height={height} style={{ height, width: 'auto', display: 'block' }} />
    </a>
  );
}

export function GetTheApp() {
  return (
    <section className="ptv-get-app" aria-labelledby="ptv-get-app-title">
      <div>
        <p className="ptv-get-app__eyebrow">Now on iPhone &amp; iPad</p>
        <h2 id="ptv-get-app-title">Take PRO<span>tv</span> with you</h2>
        <p className="ptv-get-app__body">Movies, series and PROtv LIVE, free on the PROtv Streaming app.</p>
      </div>
      <AppStoreBadge height={52} />
    </section>
  );
}

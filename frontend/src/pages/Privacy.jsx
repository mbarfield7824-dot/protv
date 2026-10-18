import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/InfoPages.css';

export default function Privacy() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero">
          <p className="info-eyebrow">Privacy</p>
          <h1>Your information, explained simply.</h1>
          <p className="info-lead">Effective September 16, 2026. PROtv uses account information to provide and improve the streaming experience.</p>
        </section>
        <section className="info-copy">
          <h2>Information we use</h2>
          <p>When you create an account, PROtv uses account details such as your email address and display name. We also store the titles you add to My List so that feature works across your signed-in sessions. When playback starts, PROtv records play starts and counts a platform-reported view after at least 30 seconds of content playback. Pauses, buffering, seeking, advertisements, and playback faster than normal speed do not count toward that threshold.</p>
          <p>For repeat-view deduplication, signed-in activity is associated with a protected pseudonymous account identifier. Guest playback uses a random first-party browser identifier stored in local storage; it is not a fingerprint and does not identify guests across devices. Deduplication lasts 24 hours. Playback event and session records are retained for up to seven days, and temporary rate-limit records use a keyed hash of the request address rather than storing the raw address. Browser Do Not Track disables playback tracking.</p>
          <h2>How it is used</h2>
          <p>We use this information to operate the platform, secure accounts, provide support, and improve the viewing experience. Public view counts are platform-reported playback metrics, not unique-person counts or audited audience figures. They are not used to calculate creator payments or revenue shares. We do not sell personal information.</p>
          <h2>Service providers</h2>
          <p>PROtv relies on trusted services to provide authentication, data storage, hosting, analytics, and video streaming. These providers process only the information needed to deliver their services.</p>
          <h2>Your choices</h2>
          <p>You can remove titles from My List at any time. For account or privacy questions, contact <a href="mailto:support@watchprotv.com">support@watchprotv.com</a>.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

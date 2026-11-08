import { Link } from 'react-router-dom';
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
          <p className="info-lead">Effective September 16, 2026. Updated November 5, 2026. PROtv uses account information to provide and improve the streaming experience.</p>
        </section>
        <section className="info-copy">
          <h2>Information we use</h2>
          <p>When you create an account, PROtv uses account details such as your email address and display name. We also store the titles you add to My List and your watch progress (the title, your position and when you last watched) so My List and Continue Watching work across the website and your TVs.</p>
          <p>When playback starts on the website, PROtv records play starts and counts a platform-reported view after at least 30 seconds of content playback. Pauses, buffering, seeking, advertisements, and playback faster than normal speed do not count toward that threshold.</p>
          <p>For repeat-view deduplication, signed-in activity is associated with a protected pseudonymous account identifier. Guest playback uses a random first-party browser identifier stored in local storage; it is not a fingerprint and does not identify guests across devices. Deduplication lasts 24 hours. Playback event and session records are retained for up to seven days, and temporary rate-limit records use a keyed hash of the request address rather than storing the raw address. Browser Do Not Track disables playback tracking.</p>
          <h2>How it is used</h2>
          <p>We use this information to operate the platform, secure accounts, provide support, and improve the viewing experience. View counts are private platform-reported playback metrics shared with the creator of a title and PROtv administrators; they are not unique-person counts or audited audience figures. They are not used to calculate creator payments or revenue shares. We do not sell personal information.</p>
          <h2>PROtv on your TV</h2>
          <p>PROtv's TV apps use the same PROtv account as the website. When you link a TV with an activation code at watchprotv.com/activate, we keep a record of that link. A signed-in TV app stores your sign-in and recent watch progress on the TV itself. Watch progress saved while browsing as a guest stays on that TV and is not sent to PROtv. Uninstalling the app removes what it stored on that TV.</p>
          <h2>Service providers</h2>
          <p>PROtv relies on trusted services to provide authentication, data storage, hosting, analytics, and video streaming. These providers process only the information needed to deliver their services.</p>
          <h2 id="advertising">Advertising</h2>
          <p>
            The PROtv website may show a clearly labeled Sponsored section on its homepage and on title, series,
            Podcast and browse pages, provided by Adsterra, a
            third-party advertising network. Nothing from Adsterra loads unless you choose &quot;Allow sponsored
            content&quot; in that section. If you allow it, Adsterra may set its own cookies and use similar technologies,
            and may receive information such as your browser and device type, screen size, time zone, IP address and the
            page you are viewing, to select, show and measure ads and to prevent fraud. Adsterra handles that information
            under its own privacy policy. Sponsored content is never placed inside video players, trailers, sign-in or
            account pages, or PROtv&apos;s TV apps.
          </p>
          <p>
            You can withdraw your choice at any time with &quot;Turn off sponsored content&quot; in any Sponsored section. Browsers that
            send a Global Privacy Control signal are treated as having declined and are not asked. When an ad is shown on
            the website, PROtv automatically counts whether it rendered, was at least half on screen, was clicked and, for
            video ads, how far it played, so that we can report accurate figures to sponsors. These counts are anonymous: no
            account, contact details, cookies or device identifiers are used, and temporary rate-limit records use a keyed
            hash of the request address rather than the address itself. Your choice is stored
            in your browser, so clearing site data asks again. The website also loads Google&apos;s AdSense script, which
            Google may use to set its own cookies; you can manage Google ad settings at{' '}
            <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">adssettings.google.com</a>.
          </p>
          <h2>Deleting your account</h2>
          <p>
            You can <Link to="/delete-account">request deletion of your PROtv account</Link> on our website without
            installing an app, or email <a href="mailto:support@watchprotv.com">support@watchprotv.com</a> from your
            account's email address. Deleting your account removes your sign-in account, My List, watch progress
            and history, and the links to your TVs. We keep a record of the request itself (without your email
            address), creator agreements, safety reports still under review, and support emails. Creator
            Portal records are kept in a separate system and reviewed with the request. The{' '}
            <Link to="/delete-account">account deletion page</Link> explains what is deleted and kept in more detail.
          </p>
          <h2>Your choices</h2>
          <p>You can remove titles from My List at any time. For account or privacy questions, contact <a href="mailto:support@watchprotv.com">support@watchprotv.com</a>.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

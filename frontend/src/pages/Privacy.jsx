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
          <p className="info-lead">Effective September 16, 2026. Updated October 25, 2026. PROtv uses account information to provide and improve the streaming experience.</p>
        </section>
        <section className="info-copy">
          <h2>Information we use</h2>
          <p>When you create an account, PROtv uses account details such as your email address and display name. We also store the titles you add to My List and your watch progress (the title, your position and when you last watched) so My List and Continue Watching work across the website and your TVs.</p>
          <h2>How it is used</h2>
          <p>We use this information to operate the platform, secure accounts, provide support, and improve the viewing experience. We do not sell personal information.</p>
          <h2>PROtv on your TV</h2>
          <p>PROtv's TV apps use the same PROtv account as the website. When you link a TV with an activation code at watchprotv.com/activate, we keep a record of that link. A signed-in TV app stores your sign-in and recent watch progress on the TV itself. Watch progress saved while browsing as a guest stays on that TV and is not sent to PROtv. Uninstalling the app removes what it stored on that TV.</p>
          <h2>Service providers</h2>
          <p>PROtv relies on trusted services to provide authentication, data storage, hosting, analytics, and video streaming. These providers process only the information needed to deliver their services.</p>
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

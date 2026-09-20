import Footer from '../components/Footer';
import Header from '../components/Header';
import {
  CreatorBenefits,
  CreatorPortalButton,
  CreatorSteps,
} from '../components/CreatorExperience';
import { useAuth } from '../hooks/useAuth';
import '../styles/Creators.css';

export default function Creators() {
  const { user, openAuthModal } = useAuth();

  return (
    <div className="creators-page">
      <Header />
      <main>
        <section className="creators-hero">
          <div className="creators-hero-copy">
            <p className="creator-eyebrow">PROtv for creators</p>
            <h1>Your story. Your audience. One clear path forward.</h1>
            <p>
              Welcome to the PROtv Creator experience, where independent filmmakers can submit
              projects, manage contracts, and follow real revenue from one secure dashboard.
            </p>
            <div className="creators-hero-actions">
              <CreatorPortalButton className="creator-primary-button">
                {user ? 'Open Creator Dashboard' : 'Start Uploading'}
              </CreatorPortalButton>
              {!user && (
                <button className="creator-secondary-button" type="button" onClick={openAuthModal}>
                  Sign In
                </button>
              )}
            </div>
          </div>
          <div className="creators-hero-art" aria-hidden="true">
            <span className="creator-frame creator-frame-one" />
            <span className="creator-frame creator-frame-two" />
            <span className="creator-play-mark">▶</span>
            <p>CREATE<br />CONNECT<br />EARN</p>
          </div>
        </section>

        <section className="creators-content-section" aria-labelledby="why-protv-title">
          <div className="creator-subsection-heading">
            <p>Why PROtv?</p>
            <h2 id="why-protv-title">A creator relationship designed around transparency.</h2>
          </div>
          <CreatorBenefits />
        </section>

        <section className="creators-content-section creators-how" aria-labelledby="creator-process-title">
          <div className="creator-subsection-heading">
            <p>How It Works</p>
            <h2 id="creator-process-title">A guided route from project file to performance reporting.</h2>
          </div>
          <CreatorSteps />
          <CreatorPortalButton className="creator-primary-button creator-bottom-cta">
            {user ? 'Return to Your Dashboard' : 'Start Uploading'}
          </CreatorPortalButton>
        </section>
      </main>
      <Footer />
    </div>
  );
}

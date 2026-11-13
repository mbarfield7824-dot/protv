import ProTVFooter from '../components/ProTVFooter';
import ProTVHeader from '../components/ProTVHeader';
import ProTVShell from '../components/ProTVShell';
import { CreatorPortalButton } from '../components/CreatorExperience';
import '../styles/Creators.css';

// The Creator Portal's "Sign in with PROtv" lands here. It only ever continues to the configured Creator Portal
// address returned by the server, so it takes no destination from the address bar.
export default function CreatorPortalSignIn() {
  return (
    <ProTVShell>
      <div className="creators-page">
        <ProTVHeader />
        <main>
          <section className="creators-cta" aria-labelledby="creator-portal-sign-in-title">
            <div className="creators-cta__content">
              <p className="creators-eyebrow">Creator Portal</p>
              <h1 id="creator-portal-sign-in-title">Sign in with your PROtv account</h1>
              <p>
                Use the same account you use on watchprotv.com. Once you are signed in with a verified email address,
                you continue to the Creator Portal automatically.
              </p>
              <CreatorPortalButton autoOpen className="creators-button creators-button--primary">
                Continue to the Creator Portal
              </CreatorPortalButton>
            </div>
          </section>
        </main>
        <ProTVFooter />
      </div>
    </ProTVShell>
  );
}

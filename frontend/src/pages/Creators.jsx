import ProTVFooter from '../components/ProTVFooter';
import ProTVHeader from '../components/ProTVHeader';
import ProTVShell from '../components/ProTVShell';
import { CreatorPortalButton } from '../components/CreatorExperience';
import { useAuth } from '../hooks/useAuth';
import '../styles/Creators.css';

const contentFocus = [
  'Independent storytelling',
  'Black Cinema',
  'Documentaries',
  'Animation',
  'Music & Hip-Hop',
  'Horror',
  'Action',
  'Comedy',
  'Series & original storytelling',
];

const creatorJourney = [
  {
    number: '01',
    title: 'Create your account',
    description: 'Sign in with a verified PROtv account to get started.',
  },
  {
    number: '02',
    title: 'Enter the Creator Portal',
    description: 'Continue securely through the existing Creator Portal sign-in.',
  },
  {
    number: '03',
    title: 'Submit your project',
    description: 'Share your project and rights information in the Creator Portal.',
  },
  {
    number: '04',
    title: 'Review',
    description: 'Projects are reviewed against PROtv ownership, rights, contract, and approval requirements.',
  },
  {
    number: '05',
    title: 'Distribution',
    description: 'Approved projects proceed through PROtv’s publishing and processing workflow.',
  },
];

export default function Creators() {
  const { user } = useAuth();
  const portalActionLabel = user ? 'Open Creator Portal' : 'Submit Your Film';

  return (
    <ProTVShell>
      <div className="creators-page">
        <ProTVHeader />
        <main>
          <section className="creators-hero" aria-labelledby="creators-title">
            <div className="creators-hero__copy">
              <p className="creators-eyebrow">An entrance for independent voices</p>
              <h1 id="creators-title">Your story belongs here.</h1>
              <p className="creators-hero__lead">
                Bring your independent film, series, documentary, animation, or original story to PROtv.
              </p>
              <p className="creators-hero__supporting">
                PROtv is looking for independent stories and creators. Share what you make with a platform
                built around distinctive storytelling.
              </p>
              <div className="creators-hero__actions">
                <CreatorPortalButton className="creators-button creators-button--primary">
                  {portalActionLabel}
                </CreatorPortalButton>
                <a className="creators-button creators-button--quiet" href="#how-it-works">
                  How It Works <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
            <div className="creators-hero__art" aria-hidden="true">
              <div className="creators-hero__frame creators-hero__frame--back" />
              <div className="creators-hero__frame creators-hero__frame--front">
                <span className="creators-hero__frame-line" />
                <span className="creators-hero__frame-wordmark">PRO<span>tv</span></span>
                <span className="creators-hero__frame-caption">INDEPENDENT STORIES</span>
              </div>
              <span className="creators-hero__light" />
            </div>
          </section>

          <section className="creators-focus" aria-labelledby="why-protv-title">
            <div className="creators-section__heading">
              <p className="creators-eyebrow">Why PROtv</p>
              <h2 id="why-protv-title">A home for stories with their own point of view.</h2>
              <p>
                We’re looking for work across the genres and perspectives that make independent storytelling
                matter. These are areas of interest, not a guarantee of acceptance.
              </p>
            </div>
            <ul className="creators-focus__list">
              {contentFocus.map((item, index) => (
                <li className="creators-focus__item" key={item}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="creators-journey" id="how-it-works" aria-labelledby="creator-process-title">
            <div className="creators-section__heading">
              <p className="creators-eyebrow">How It Works</p>
              <h2 id="creator-process-title">Your project, through the right steps.</h2>
              <p>
                Start in the Creator Portal. PROtv’s existing review and publishing process takes it from there.
              </p>
            </div>
            <ol className="creators-journey__steps">
              {creatorJourney.map((step) => (
                <li className="creators-journey__step" key={step.number}>
                  <span className="creators-journey__number">{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="creators-cta" aria-labelledby="creator-cta-title">
            <div className="creators-cta__content">
              <p className="creators-eyebrow">The next frame starts with you</p>
              <h2 id="creator-cta-title">Ready to bring your story to PROtv?</h2>
              <p>Join PROtv’s growing independent creator community.</p>
              <CreatorPortalButton className="creators-button creators-button--primary">
                Open Creator Portal
              </CreatorPortalButton>
            </div>
            <div className="creators-cta__mark" aria-hidden="true">PRO<span>tv</span></div>
          </section>
        </main>
        <ProTVFooter />
      </div>
    </ProTVShell>
  );
}

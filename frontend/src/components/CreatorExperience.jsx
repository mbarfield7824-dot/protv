import { useCreatorPortal } from '../hooks/useCreatorPortal';

const benefits = [
  {
    title: 'Keep control',
    description: 'Submit your work with clear rights declarations and review every step before release.',
    icon: 'rights',
  },
  {
    title: 'Contracts made clear',
    description: 'Review and sign the schedule selected for your project from your Creator Dashboard.',
    icon: 'contract',
  },
  {
    title: 'Track your earnings',
    description: 'See revenue statements, advertising performance, payments, and balances by title.',
    icon: 'revenue',
  },
];

const steps = [
  { number: '01', title: 'Upload', description: 'Create your profile and submit your film, series, or show.' },
  { number: '02', title: 'Review and sign', description: 'Complete rights review and sign your project contract.' },
  { number: '03', title: 'Reach viewers', description: 'Track your approved release and revenue from one dashboard.' },
];

function BenefitIcon({ name }) {
  if (name === 'contract') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8 3h12l5 5v21H8zM20 3v6h5M12 14h9M12 19h9M12 24h6" />
      </svg>
    );
  }
  if (name === 'revenue') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4 27h24M7 23l6-7 5 4 8-11M21 9h5v5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3l11 4v8c0 7-4.6 12-11 14C9.6 27 5 22 5 15V7zM11 16l3 3 7-8" />
    </svg>
  );
}

export function CreatorPortalButton({ className = '', children = 'Start Uploading' }) {
  const {
    openCreatorPortal,
    opening,
    error,
    verificationRequired,
    verificationMessage,
    sendVerification,
  } = useCreatorPortal();
  return (
    <div className="creator-portal-action">
      <button className={className} type="button" onClick={openCreatorPortal} disabled={opening}>
        {opening ? 'Opening your dashboard...' : children}
      </button>
      {verificationRequired && (
        <div className="creator-verification-notice" role="status">
          <strong>Verify your email to continue</strong>
          <p>
            For account security, confirm your PROtv email address before entering the Creator Portal.
          </p>
          <div className="creator-verification-actions">
            <button type="button" onClick={sendVerification} disabled={opening}>
              Send verification email
            </button>
            <button type="button" onClick={openCreatorPortal} disabled={opening}>
              I&apos;ve verified — open dashboard
            </button>
          </div>
          {verificationMessage && <p className="creator-action-success">{verificationMessage}</p>}
        </div>
      )}
      {error && <p className="creator-action-error" role="alert">{error}</p>}
    </div>
  );
}

export function CreatorBenefits() {
  return (
    <div className="creator-benefits">
      {benefits.map((benefit) => (
        <article className="creator-benefit-card" key={benefit.title}>
          <span className="creator-benefit-icon"><BenefitIcon name={benefit.icon} /></span>
          <h3>{benefit.title}</h3>
          <p>{benefit.description}</p>
        </article>
      ))}
    </div>
  );
}

export function CreatorSteps() {
  return (
    <ol className="creator-steps">
      {steps.map((step) => (
        <li key={step.number}>
          <span className="creator-step-number">{step.number}</span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CreatorInvitation() {
  return (
    <section className="creator-invitation" aria-labelledby="creator-invitation-title">
      <div className="creator-invitation-glow" />
      <div className="creator-section-inner">
        <p className="creator-eyebrow">Stories belong on screen</p>
        <h2 id="creator-invitation-title">Are you a filmmaker? Join PROtv.</h2>
        <p className="creator-lead">Upload your project, sign your contract, earn revenue.</p>
        <CreatorPortalButton className="creator-primary-button">Creator Portal</CreatorPortalButton>
        <div className="creator-subsection-heading">
          <p>Creator Benefits</p>
          <h3>Built for the business behind your story.</h3>
        </div>
        <CreatorBenefits />
        <div className="creator-subsection-heading">
          <p>How It Works</p>
          <h3>From submission to audience in three clear steps.</h3>
        </div>
        <CreatorSteps />
      </div>
    </section>
  );
}

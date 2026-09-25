import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/InfoPages.css';

const policySections = [
  {
    title: '2.1 Adult Content and Sexual Services',
    items: [
      'Nudity intended to arouse sexual interest',
      'Pornographic material',
      'Explicit sexual acts',
      'Subscriber-only nude images or videos',
      'Adult live chat or sexual services',
    ],
  },
  {
    title: '2.2 Intellectual Property Violations',
    items: [
      'Content that infringes copyrights, trademarks, or proprietary rights',
      'Unauthorized distribution of studio films, TV shows, music, or commercial media',
      'Leaked, pirated, or stolen content',
      'Content uploaded without proper licensing or ownership',
    ],
  },
  {
    title: '2.3 Copyright-Infringing Content',
    items: [
      'Leaked music albums',
      'Unauthorized movie uploads',
      'Bootleg recordings',
      'Content copied from other platforms without permission',
    ],
  },
  {
    title: '2.4 Violent Extremism and Hate Speech',
    items: [
      'Content that promotes, celebrates, or encourages unlawful violence',
      'Hate speech targeting individuals or groups based on race, religion, disability, gender, sexual orientation, national origin, or any immutable characteristic',
      'Extremist propaganda or recruitment',
      'Threats of violence or harassment',
    ],
  },
  {
    title: '2.5 Dangerous or Illegal Activities',
    items: [
      'Instructions for committing illegal acts',
      'Depictions of self-harm or suicide encouragement',
      'Weapons trafficking, drug sales, or criminal activity',
      'Fraudulent schemes or scams',
    ],
  },
];

function PolicyList({ items }) {
  return (
    <ul className="policy-list">
      {items.map((item, index) => <li key={typeof item === 'string' ? item : index}>{item}</li>)}
    </ul>
  );
}

export default function AcceptableUsePolicy() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content aup-content">
        <section className="info-hero">
          <p className="info-eyebrow">Acceptable Use Policy</p>
          <h1>PROtv Acceptable Use Policy (AUP)</h1>
          <p className="info-lead">This policy explains the content, conduct, rights, and payment practices required when using PROtv.</p>
        </section>

        <article className="info-copy aup-copy">
          <h2>1. Introduction</h2>
          <p>This Acceptable Use Policy (“AUP”) governs the use of PROtv (“the Platform”), including all content uploaded, streamed, distributed, or monetized by creators and all interactions by viewers and users. By accessing or using PROtv, users agree to comply with this AUP, the PROtv Terms of Service, and all applicable laws.</p>
          <p>PROtv is a rights-respecting streaming platform. All creators must own or control the rights to the content they upload. PROtv prohibits the monetization or distribution of content that violates intellectual property laws, promotes harm, or breaches community standards.</p>

          <h2>2. Prohibited Content Categories</h2>
          <p>The following types of content are strictly prohibited on PROtv. Users may not upload, stream, distribute, sell, monetize, or otherwise make available any content that falls within these categories.</p>
          {policySections.map(({ title, items }) => (
            <section className="policy-subsection" key={title}>
              <h3>{title}</h3>
              <PolicyList items={items} />
            </section>
          ))}

          <h2>3. Prohibited Monetization Practices</h2>
          <p>Users may not monetize content that:</p>
          <PolicyList items={[
            'Violates any section of this AUP',
            'Contains unlicensed copyrighted material',
            'Contains adult sexual content',
            'Encourages hate, violence, or harassment',
            'Misleads viewers or impersonates others',
            'Violates any applicable law or regulation',
          ]} />
          <p>PROtv reserves the right to demonetize or remove any content that violates these rules.</p>

          <h2>4. Rights Ownership and Licensing Requirements</h2>
          <p>Creators must:</p>
          <PolicyList items={[
            'Own or control all rights to the content they upload',
            'Have proper licensing for any third-party materials',
            'Agree to the PROtv Content Rights Agreement',
            'Provide documentation upon request',
            'Remove content immediately if rights ownership cannot be verified',
          ]} />
          <p>PROtv may suspend or terminate accounts that fail to comply.</p>

          <h2>5. Reporting Violations</h2>
          <p>PROtv provides tools for users, rights holders, and other parties to report violations of this AUP.</p>
          <p>Reports may be submitted through:</p>
          <PolicyList items={[
            'The “Report Content” button on video pages',
            <span key="email">Email to <a href="mailto:support@watchprotv.com">support@watchprotv.com</a></span>,
            <span key="dmca">DMCA takedown requests submitted through the Copyright Policy page</span>,
          ]} />
          <p>PROtv reviews all reports promptly and takes appropriate action.</p>

          <h2>6. Enforcement and Repeat Violator Policy</h2>
          <p>PROtv enforces this AUP through the following measures:</p>
          <h3>6.1 First Violation</h3>
          <PolicyList items={['Warning issued', 'Content review required', 'Possible demonetization']} />
          <h3>6.2 Second Violation</h3>
          <PolicyList items={['Content removal', 'Temporary account restrictions']} />
          <h3>6.3 Third Violation</h3>
          <PolicyList items={['Account suspension', 'Monetization disabled']} />
          <h3>6.4 Severe Violations</h3>
          <p>Immediate termination may occur for:</p>
          <PolicyList items={['Copyright infringement', 'Hate speech', 'Violent extremism', 'Adult sexual content', 'Fraud or illegal activity']} />
          <p>PROtv reserves the right to remove content or restrict accounts at its discretion.</p>

          <h2>7. Marketplace and Payment Compliance</h2>
          <p>As a platform using Stripe Connect, PROtv must comply with Stripe’s restricted-business requirements. Users may not engage in:</p>
          <PolicyList items={['Fraudulent transactions', 'Money laundering', 'Unauthorized payouts', 'Attempts to bypass PROtv’s payment systems']} />
          <p>Creators must complete identity verification and comply with all payout requirements.</p>

          <h2>8. Changes to This Policy</h2>
          <p>PROtv may update this AUP at any time. Continued use of the platform constitutes acceptance of the updated policy.</p>

          <h2>9. Contact Information</h2>
          <p>For questions or reports related to this AUP:</p>
          <p><strong>Email:</strong> <a href="mailto:support@watchprotv.com">support@watchprotv.com</a><br />
            <strong>Website:</strong> <a href="https://watchprotv.com/?utm_source=copilot.com">https://watchprotv.com</a></p>
        </article>
      </main>
      <Footer />
    </div>
  );
}

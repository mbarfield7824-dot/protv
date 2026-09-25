import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/InfoPages.css';

function PolicyList({ items }) {
  return (
    <div className="policy-list">
      {items.map((item) => <p key={item}>{item}</p>)}
    </div>
  );
}

export default function DmcaPolicy() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content aup-content">
        <section className="info-hero">
          <p className="info-eyebrow">Copyright Policy</p>
          <h1>PROtv DMCA &amp; Copyright Policy</h1>
          <p className="info-lead">This policy explains how PROtv handles copyright infringement claims and counter-notifications.</p>
        </section>

        <article className="info-copy aup-copy">
          <h2>1. Introduction</h2>
          <p>PROtv (“the Platform”) respects the intellectual property rights of creators, rights holders, and third parties. This DMCA &amp; Copyright Policy explains how PROtv handles copyright infringement claims in accordance with the Digital Millennium Copyright Act (DMCA), 17 U.S.C. §512.</p>
          <p>All creators uploading content to PROtv must own or control the rights to their material. Unauthorized use of copyrighted works is strictly prohibited.</p>

          <h2>2. Notice of Claimed Infringement (DMCA Takedown Notice)</h2>
          <p>If you believe that content hosted on PROtv infringes your copyright, you may submit a DMCA Takedown Notice. To be valid, your notice must include all of the following information:</p>
          <PolicyList items={[
            '1. Identification of the copyrighted work you claim has been infringed.',
            '2. Identification of the infringing material on PROtv, including the URL or direct link.',
            '3. A statement of good-faith belief that the use is not authorized by the copyright owner, its agent, or the law.',
            '4. A statement under penalty of perjury that the information in the notice is accurate and that you are the copyright owner or authorized to act on behalf of the owner.',
            '5. Your contact information, including full name, mailing address, telephone number, and email address.',
            '6. Your physical or electronic signature.',
          ]} />
          <p>DMCA notices may be submitted to:</p>
          <p><strong>Email:</strong> <a href="mailto:support@watchprotv.com?subject=DMCA%20Takedown%20Notice">support@watchprotv.com</a><br />
            <strong>Subject:</strong> DMCA Takedown Notice</p>

          <h2>3. PROtv’s Response to Valid DMCA Notices</h2>
          <p>Upon receiving a valid DMCA Takedown Notice, PROtv will:</p>
          <PolicyList items={[
            'Review the claim',
            'Remove or disable access to the allegedly infringing content',
            'Notify the uploader/creator of the removal',
            'Provide the uploader with a copy of the notice',
            'Allow the uploader to submit a counter-notification if they believe the removal was in error',
          ]} />
          <p>PROtv may also suspend monetization or restrict account access during review.</p>

          <h2>4. Counter-Notification Procedure</h2>
          <p>If a creator believes their content was removed in error or misidentification, they may submit a DMCA Counter-Notification. The counter-notification must include:</p>
          <PolicyList items={[
            '1. Identification of the removed content and its location before removal.',
            '2. A statement under penalty of perjury that the content was removed due to mistake or misidentification.',
            '3. A statement consenting to the jurisdiction of the federal courts in the creator’s district.',
            '4. The creator’s full contact information.',
            '5. The creator’s physical or electronic signature.',
          ]} />
          <p>Counter-notifications must be sent to:</p>
          <p><strong>Email:</strong> <a href="mailto:support@watchprotv.com?subject=DMCA%20Counter-Notification">support@watchprotv.com</a><br />
            <strong>Subject:</strong> DMCA Counter-Notification</p>
          <p>If the counter-notification is valid, PROtv may restore the content unless the original complainant files a court action within 10 business days.</p>

          <h2>5. Repeat Infringer Policy</h2>
          <p>PROtv enforces a strict repeat-infringer policy. Accounts may face:</p>
          <PolicyList items={[
            'First violation: Warning and content removal',
            'Second violation: Content removal and temporary restrictions',
            'Third violation: Account suspension or termination',
            'Severe violations: Immediate termination',
          ]} />
          <p>Creators who repeatedly upload infringing content may lose monetization privileges or access to PROtv entirely.</p>

          <h2>6. Good-Faith Reporting Requirement</h2>
          <p>All DMCA notices and counter-notifications must be submitted in good faith. Submitting fraudulent or bad-faith claims may result in account termination and legal consequences under 17 U.S.C. §512(f).</p>

          <h2>7. Removal of Non-DMCA Violating Content</h2>
          <p>PROtv may remove content that violates:</p>
          <PolicyList items={[
            'The PROtv Acceptable Use Policy',
            'The PROtv Terms of Service',
            'Rights ownership requirements',
            'Marketplace compliance rules',
            'Community standards',
          ]} />
          <p>These actions may be taken even if the content does not fall under DMCA jurisdiction.</p>

          <h2>8. Contact Information</h2>
          <p>For all copyright-related inquiries:</p>
          <p><strong>Email:</strong> <a href="mailto:support@watchprotv.com">support@watchprotv.com</a><br />
            <strong>Website:</strong> <a href="https://watchprotv.com">https://watchprotv.com</a></p>
        </article>
      </main>
      <Footer />
    </div>
  );
}

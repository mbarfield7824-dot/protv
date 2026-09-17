import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/InfoPages.css';

export default function Terms() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero">
          <p className="info-eyebrow">Terms of Use</p>
          <h1>Using PROtv responsibly.</h1>
          <p className="info-lead">Effective September 16, 2026. These terms explain the basic rules for using PROtv.</p>
        </section>
        <section className="info-copy">
          <h2>Platform access</h2>
          <p>Use PROtv lawfully and only through the features provided on the platform. Keep your account credentials secure and do not attempt to disrupt, copy, or bypass the service.</p>
          <h2>Content availability</h2>
          <p>Catalog availability may change by title, territory, technical requirements, or rights status. PROtv may update or remove content when necessary.</p>
          <h2>Accounts and feedback</h2>
          <p>You are responsible for activity under your account. If you contact us or submit feedback, you confirm that the information you provide is accurate and that you have permission to share it.</p>
          <h2>Questions</h2>
          <p>For questions about these terms, contact <a href="mailto:support@watchprotv.com">support@watchprotv.com</a>.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

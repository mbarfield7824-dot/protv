import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/InfoPages.css';

const questions = [
  ['How do I watch PROtv?', 'Browse the catalog, select a title, and press Watch Now. Available titles play directly in your browser.'],
  ['How do I save a title for later?', 'Sign in, then select + My List on a title page. Your saved titles will appear in My List on the homepage.'],
  ['Can I submit a film or series?', 'Creator submissions are coming soon. You can reach the team now through the Creator Submissions & Partnerships contact channel.'],
  ['Where can I get account help?', 'Use the General Support contact channel and include the email address associated with your PROtv account.'],
];

export default function Faq() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero">
          <p className="info-eyebrow">Help Center</p>
          <h1>Frequently asked questions.</h1>
          <p className="info-lead">Quick answers to help you enjoy PROtv.</p>
        </section>
        <section className="info-features">
          <p className="info-eyebrow">PROtv support</p>
          <div className="faq-list">
            {questions.map(([question, answer]) => (
              <article className="faq-item" key={question}>
                <h2>{question}</h2>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

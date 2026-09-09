import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/InfoPages.css';

const contactChannels = [
  {
    title: 'Business & Licensing',
    email: 'business@watchprotv.com',
    description: 'For licensing, business opportunities, and platform partnerships.',
  },
  {
    title: 'Creator Submissions & Partnerships',
    email: 'creators@watchprotv.com',
    description: 'Are you an indie filmmaker, urban creator, or global storyteller? Send us your film, series, or project - we would love to check it out.',
  },
  {
    title: 'General Support',
    email: 'support@watchprotv.com',
    description: 'For help with your PROtv account or watching on the platform.',
  },
];

export default function Contact() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero">
          <p className="info-eyebrow">Contact PROtv</p>
          <h1>Let&apos;s build something original.</h1>
          <p className="info-lead">
            Reach the right PROtv team for business, creator submissions, or account support.
          </p>
        </section>

        <section className="contact-grid">
          {contactChannels.map((channel) => (
            <article className="contact-card" key={channel.email}>
              <p className="info-eyebrow">{channel.title}</p>
              <a href={`mailto:${channel.email}`}>{channel.email}</a>
              <p>{channel.description}</p>
            </article>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}

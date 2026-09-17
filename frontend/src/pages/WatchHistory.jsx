import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/InfoPages.css';

export default function WatchHistory() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero">
          <p className="info-eyebrow">Your account</p>
          <h1>Watch History is on the way.</h1>
          <p className="info-lead">PROtv is preparing viewing-history and resume-progress features for members.</p>
        </section>
        <section className="info-copy">
          <p>For now, use My List to keep track of the titles you want to return to.</p>
          <Link className="info-link-button" to="/#my-list">Go to My List</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}

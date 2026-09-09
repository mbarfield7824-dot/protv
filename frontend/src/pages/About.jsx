import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/InfoPages.css';

export default function About() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero">
          <p className="info-eyebrow">About PROtv</p>
          <h1>Built for creators, culture, and community.</h1>
          <p className="info-lead">
            PROtv is an independent streaming platform built for creators, culture, and community.
          </p>
        </section>

        <section className="info-copy">
          <p>
            We showcase urban, indie, and international voices - the filmmakers and storytellers
            who deserve a real spotlight, not gatekeeping.
          </p>
          <p>
            Our mission is simple: give creators a home, give audiences something real, and build
            a platform where originality wins.
          </p>
        </section>

        <section className="info-features">
          <p className="info-eyebrow">What you will find</p>
          <h2>Made for the stories that deserve to be seen.</h2>
          <ul>
            <li>Independent films</li>
            <li>Urban creators and series</li>
            <li>Nollywood and diaspora cinema</li>
            <li>Underground talent and rising directors</li>
            <li>Creator-submitted projects</li>
            <li>Exclusive originals <span>Coming soon</span></li>
          </ul>
        </section>

        <section className="info-closing">
          <p>
            We believe the future of streaming belongs to the people who create from passion.
            PROtv is built to amplify those voices.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

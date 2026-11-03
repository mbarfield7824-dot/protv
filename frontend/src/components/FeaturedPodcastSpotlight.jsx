import { Link } from 'react-router-dom';
import { FEATURED_PODCAST } from '../data/featuredPodcast';
import PodcastArtwork from './PodcastArtwork';
import '../styles/FeaturedPodcast.css';

export default function FeaturedPodcastSpotlight() {
  return (
    <section className="mmwf-spotlight" aria-labelledby="podcast-spotlight-title">
      <div>
        <p className="mmwf-eyebrow">THE PODCAST SPOTLIGHT <span> / PROtv</span></p>
        <h2 id="podcast-spotlight-title">{FEATURED_PODCAST.title}</h2>
        <p className="mmwf-hosts">With <strong>{FEATURED_PODCAST.hosts}</strong></p>
        <p className="mmwf-spotlight__summary">{FEATURED_PODCAST.tagline}</p>
        <Link className="ptv-btn ptv-btn--primary" to={FEATURED_PODCAST.path}>
          Explore the Podcast <span aria-hidden="true">→</span>
        </Link>
      </div>
      <PodcastArtwork />
    </section>
  );
}

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import ProTVFooter from '../components/ProTVFooter';
import PodcastArtwork from '../components/PodcastArtwork';
import { FEATURED_PODCAST, episodeRuntime } from '../data/featuredPodcast';
import { podcastEpisodeLabel, podcastEpisodePlayerUrl } from '../data/playerCatalog';
import { useFeaturedPodcast } from '../hooks/useFeaturedPodcast';
import { useAuth } from '../hooks/useAuth';
import banner from '../assets/me-and-my-white-friend-banner.png';
import SponsoredNativeBanner from '../components/SponsoredNativeBanner';
import '../styles/FeaturedPodcast.css';

export default function FeaturedPodcast() {
  const { show, episodes, loading, error, refresh } = useFeaturedPodcast();
  const { isAdmin } = useAuth();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#episodes' || hash === '#about-the-podcast') {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
    }
  }, [hash]);
  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="mmwf-page">
        <section className="mmwf-hero" aria-labelledby="podcast-title">
          <div className="mmwf-hero__copy">
            <Link className="mmwf-back" to="/podcasts">← All Podcasts</Link>
            <p className="mmwf-eyebrow">FEATURED ON <span>PROtv</span></p>
            <h1 id="podcast-title">Me and My <br /><span>White Friend</span></h1>
            <p className="mmwf-hosts">A podcast with <strong>{FEATURED_PODCAST.hosts}</strong></p>
            <p className="mmwf-tagline">{FEATURED_PODCAST.tagline}</p>
            <div className="mmwf-hero__actions">
              {episodes.length > 0 ? (
                <Link className="ptv-btn ptv-btn--primary ptv-btn--lg"
                  to={podcastEpisodePlayerUrl(episodes[0])} state={{ podcastShowId: show.id }}>
                  <span aria-hidden="true">▶</span> Watch Episode
                </Link>
              ) : (
                <a className="ptv-btn ptv-btn--primary ptv-btn--lg" href="#episodes">
                  {loading ? 'Explore Episodes' : error ? 'Episode Availability' : 'Episodes Coming Soon'}
                </a>
              )}
              <a className="ptv-btn ptv-btn--ghost ptv-btn--lg" href="#about-the-podcast">About the Show</a>
            </div>
          </div>
          <PodcastArtwork priority />
          <div className="mmwf-hero__footnote" aria-hidden="true">
            <span>REAL FRIENDSHIP. REAL CONVERSATION.</span><span>THE PROTV PODCAST SPOTLIGHT</span>
          </div>
        </section>

        <section className="mmwf-episodes" id="episodes" aria-labelledby="episodes-title">
          <div className="mmwf-section-head">
            <div><p className="mmwf-eyebrow">PULL UP A CHAIR</p><h2 id="episodes-title">The Episodes</h2></div>
            <span className="mmwf-section-label">ME AND MY WHITE FRIEND</span>
          </div>
          {isAdmin && <p className="mmwf-admin-link">
            <Link className="ptv-btn ptv-btn--ghost" to="/admin#mmwf">Manage / Upload Episodes</Link>
          </p>}
          {loading ? (
            <div className="mmwf-episode-state" role="status">Finding published episodes...</div>
          ) : error ? (
            <div className="mmwf-episode-state" role="alert">
              <h3>We couldn&apos;t load the episodes.</h3>
              <p>{error}</p>
              <button type="button" className="ptv-btn ptv-btn--ghost" onClick={() => void refresh()}>Try Again</button>
            </div>
          ) : episodes.length ? (
            <ol className="mmwf-episode-list">
              {episodes.map((episode) => (
                <li className="mmwf-episode" key={episode.id}>
                  <Link className="mmwf-episode__image" to={podcastEpisodePlayerUrl(episode)}
                    state={{ podcastShowId: show.id }} tabIndex={-1} aria-hidden="true">
                    <img src={episode.thumbnailUrl || banner} alt="" width="418" height="235" loading="lazy"
                      onError={(event) => {
                        if (event.currentTarget.getAttribute('src') !== banner) event.currentTarget.src = banner;
                      }} />
                    <span aria-hidden="true">▶</span>
                  </Link>
                  <div className="mmwf-episode__copy">
                    <p className="mmwf-eyebrow">
                      {podcastEpisodeLabel(episode)}
                      {episodeRuntime(episode) && <span> / {episodeRuntime(episode)}</span>}
                    </p>
                    <h3>{episode.title || `Episode ${episode.episodeNumber}`}</h3>
                    {episode.description && <p>{episode.description}</p>}
                    <Link className="ptv-btn ptv-btn--primary" to={podcastEpisodePlayerUrl(episode)}
                      state={{ podcastShowId: show.id }}>
                      <span aria-hidden="true">▶</span> Watch Episode
                      <span className="mmwf-sr-only">: {episode.title || `Episode ${episode.episodeNumber}`}</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mmwf-episode-state mmwf-coming-soon">
              <span className="mmwf-coming-soon__mark" aria-hidden="true">▶</span>
              <div><p className="mmwf-eyebrow">THE CONVERSATION IS JUST GETTING STARTED</p>
                <h3>Episodes Coming Soon</h3>
                <p>{FEATURED_PODCAST.hosts} are coming to PROtv. Published episodes will appear right here. Stay tuned.</p>
              </div>
              <span className="mmwf-coming-soon__badge">ON THE HORIZON</span>
            </div>
          )}
        </section>

        <section className="mmwf-about" id="about-the-podcast" aria-labelledby="about-podcast-title">
          <div className="mmwf-about__heading">
            <p className="mmwf-eyebrow">FRIENDSHIP. PERSONALITY. CONNECTION.</p>
            <h2 id="about-podcast-title">Different walks of life.<br /><span>Plenty in common.</span></h2>
            <div className="mmwf-host-card">
              <span className="mmwf-host-card__initials" aria-hidden="true">RR / M</span>
              <div><p className="mmwf-eyebrow">YOUR HOSTS</p><h3>{FEATURED_PODCAST.hosts}</h3></div>
            </div>
          </div>
          <div className="mmwf-about__description">
            <p className="mmwf-about__lead">{FEATURED_PODCAST.tagline}</p>
            {FEATURED_PODCAST.description.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </section>
        {/* Below the episodes and the show information. */}
        <SponsoredNativeBanner />
        <div className="mmwf-closing"><span /> REAL CONVERSATIONS. UNFORGETTABLE FRIENDSHIP. <span /></div>
      </main>
      <ProTVFooter />
    </ProTVShell>
  );
}

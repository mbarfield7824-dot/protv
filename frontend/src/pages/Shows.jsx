import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { api } from '../api';
import { FALLBACK_POSTER } from '../data/mockData';
import { getShows } from '../utils/shows';
import '../styles/Shows.css';

export default function Shows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getVideos()
      .then((videos) => setShows(getShows(videos.filter((video) => video.status === 'ready' && video.muxPlaybackId))))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="shows-page">
      <Header />
      <main className="shows-content">
        <section className="shows-hero">
          <p>PROtv Presents</p>
          <h1>TV Shows</h1>
          <span>Series worth settling in for.</span>
        </section>
        {loading ? <p className="shows-loading">Loading shows...</p> : shows.length > 0 ? (
          <section className="show-grid">
            {shows.map((show) => (
              <Link className="show-card" to={`/shows/${show.slug}`} key={show.slug}>
                <img src={show.poster || FALLBACK_POSTER} alt={`${show.title} poster`} onError={(event) => { event.currentTarget.src = FALLBACK_POSTER; }} />
                <div><p>{show.seasons} {show.seasons === 1 ? 'season' : 'seasons'}</p><h2>{show.title}</h2></div>
              </Link>
            ))}
          </section>
        ) : (
          <section className="shows-empty"><h2>Shows are coming soon</h2><p>New series will appear here as episodes are released.</p></section>
        )}
      </main>
      <Footer />
    </div>
  );
}

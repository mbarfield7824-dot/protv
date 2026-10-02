import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import ProTVFooter from '../components/ProTVFooter';
import '../styles/Movies.css';
import '../styles/Podcasts.css';

export default function Podcasts() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError('');
    try {
      const items = await api.getPodcastShows();
      if (request.current === current) setShows(items);
    } catch (loadError) {
      if (request.current === current) setError(loadError.message);
    } finally {
      if (request.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      request.current += 1;
    };
  }, [load]);

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="movies-page podcasts-page">
        <header className="movies-page__intro">
          <p className="movies-page__eyebrow">PROtv Collection</p>
          <h1>PODCASTS</h1>
          <p className="movies-page__description">Discover original voices and video Podcast Shows on PROtv.</p>
        </header>
        {loading ? (
          <p className="movies-state" role="status">Loading Podcasts...</p>
        ) : error ? (
          <section className="movies-state" role="alert">
            <h2>Podcasts are unavailable right now.</h2>
            <p>{error}</p>
            <button type="button" className="movies-state__action" onClick={() => void load()}>Try Again</button>
          </section>
        ) : shows.length ? (
          <div className="podcasts-grid">
            {shows.map((show) => (
              <Link className="podcasts-card" key={show.id} to={`/podcasts/${encodeURIComponent(show.id)}`}>
                {show.artworkUrl && <img src={show.artworkUrl} alt="" loading="lazy" />}
                <div className="podcasts-card__copy">
                  <h2>{show.title}</h2>
                  {(show.host || show.creator) && <p>With {show.host || show.creator}</p>}
                  {show.category && <p>{show.category}</p>}
                  {show.description && <p>{show.description}</p>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <section className="movies-state">
            <h2>No Podcast Shows are available yet.</h2>
            <p>Published Shows will appear here.</p>
          </section>
        )}
      </main>
      <ProTVFooter />
    </ProTVShell>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { podcastEpisodePlayerUrl } from '../data/playerCatalog';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import ProTVFooter from '../components/ProTVFooter';
import '../styles/Movies.css';
import '../styles/Podcasts.css';

export default function PodcastShow() {
  const { showId } = useParams();
  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError('');
    setShow(null);
    try {
      const detail = await api.getPodcastShow(showId);
      if (request.current === current) setShow(detail);
    } catch (loadError) {
      if (request.current === current) setError(loadError.message);
    } finally {
      if (request.current === current) setLoading(false);
    }
  }, [showId]);

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
        <Link className="podcasts-back" to="/podcasts">← All Podcasts</Link>
        {loading ? (
          <p className="movies-state" role="status">Loading Podcast Show...</p>
        ) : error ? (
          <section className="movies-state" role="alert">
            <h1>Podcast Show is unavailable right now.</h1>
            <p>{error}</p>
            <button type="button" className="movies-state__action" onClick={() => void load()}>Try Again</button>
          </section>
        ) : !show ? (
          <section className="movies-state">
            <h1>Podcast Show not found</h1>
            <p>This Show may no longer be available.</p>
            <Link className="podcasts-back" to="/podcasts">Browse Podcasts</Link>
          </section>
        ) : (
          <>
            <header className="podcasts-show-hero">
              {show.artworkUrl && <img src={show.artworkUrl} alt="" />}
              <div>
                <p className="movies-page__eyebrow">PROtv Podcast</p>
                <h1>{show.title}</h1>
                {(show.host || show.creator) && <p>With {show.host || show.creator}</p>}
                {show.description && <p>{show.description}</p>}
                {[show.category, ...show.genres].filter(Boolean).length > 0 && (
                  <p className="podcasts-tags">{[...new Set([show.category, ...show.genres].filter(Boolean))].join(' · ')}</p>
                )}
              </div>
            </header>
            <section id="episodes" className="podcasts-episodes">
              <h2>Episodes</h2>
              {show.episodes.length ? (
                <ol>
                  {show.episodes.map((episode) => (
                    <li key={episode.id} className="podcasts-episode">
                      {episode.thumbnailUrl && <img src={episode.thumbnailUrl} alt="" loading="lazy" />}
                      <div>
                        <p className="movies-page__eyebrow">Episode {episode.episodeNumber}</p>
                        <h3>{episode.title}</h3>
                        {episode.description && <p>{episode.description}</p>}
                        <Link className="movies-state__action" to={podcastEpisodePlayerUrl(episode)}
                          state={{ podcastShowId: show.id }}>
                          Watch Episode
                        </Link>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p>No Episodes are available yet.</p>}
            </section>
          </>
        )}
      </main>
      <ProTVFooter />
    </ProTVShell>
  );
}

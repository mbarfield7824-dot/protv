import { useCallback, useEffect, useState } from 'react';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import StreamingCard from '../components/StreamingCard';
import ProTVFooter from '../components/ProTVFooter';
import MoviePreview from '../components/MoviePreview';
import { api } from '../api';
import '../styles/Movies.css';

function normalizeMovie(raw) {
  const category = raw.category || raw.genre || '';
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description || '',
    category,
    genreLabel: category,
    thumbnailUrl: raw.thumbnailUrl || raw.posterUrl,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl || raw.posterUrl,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || null,
    duration: raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: raw.contentType,
    genres: raw.genres || [category].filter(Boolean),
    ageRating: raw.maturityRating || raw.ageRating || '',
    muxPlaybackId: raw.muxPlaybackId,
  };
}

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  const loadMovies = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const videos = await api.getVideos();
      const readyMovies = Array.isArray(videos)
        ? videos.filter((video) => (
          video.status === 'ready'
          && Boolean(video.muxPlaybackId)
          && String(video.contentType || '').toUpperCase() === 'MOVIE'
        ))
        : [];
      setMovies(readyMovies.map(normalizeMovie));
    } catch (loadError) {
      console.error('Failed to load movies:', loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void loadMovies(); }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadMovies]);

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="movies-page">
        <header className="movies-page__intro">
          <p className="movies-page__eyebrow">PROtv Collection</p>
          <h1>MOVIES</h1>
          <p className="movies-page__description">
            Discover independent films, Black cinema, classics and more on PROtv.
          </p>
        </header>

        {loading ? (
          <div className="movies-grid" aria-label="Loading movies" role="status">
            {Array.from({ length: 12 }, (_, index) => (
              <div className="movies-skeleton" key={index}>
                <span className="movies-skeleton__poster" />
                <span className="movies-skeleton__line" />
                <span className="movies-skeleton__line movies-skeleton__line--short" />
              </div>
            ))}
          </div>
        ) : error ? (
          <section className="movies-state" role="alert">
            <h2>Movies are unavailable right now.</h2>
            <p>Please try again in a moment.</p>
            <button type="button" className="movies-state__action" onClick={() => void loadMovies()}>
              Try Again
            </button>
          </section>
        ) : movies.length ? (
          <div className="movies-grid">
            {movies.map((video) => (
              <StreamingCard key={video.id} video={video} onInfo={setPreviewVideo} />
            ))}
          </div>
        ) : (
          <section className="movies-state">
            <h2>No movies are available yet.</h2>
            <p>New titles will appear here as they become available to watch.</p>
          </section>
        )}
      </main>
      <ProTVFooter />
      {previewVideo && (
        <MoviePreview video={previewVideo} onClose={() => setPreviewVideo(null)} />
      )}
    </ProTVShell>
  );
}

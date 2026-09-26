import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import StreamingCard from '../components/StreamingCard';
import ProTVFooter from '../components/ProTVFooter';
import MoviePreview from '../components/MoviePreview';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import '../styles/Movies.css';
import '../styles/MyList.css';

function normalizeVideo(raw) {
  const category = raw.category || raw.genre || '';
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description || '',
    category,
    subgenre: raw.subgenre || '',
    genreLabel: category,
    thumbnailUrl: raw.thumbnailUrl || raw.posterUrl,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl || raw.posterUrl,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || null,
    duration: raw.runtime ? Math.round(raw.runtime) : raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: raw.contentType,
    genres: raw.genres || [category].filter(Boolean),
    ageRating: raw.maturityRating || raw.ageRating || '',
    muxPlaybackId: raw.muxPlaybackId,
  };
}

export default function MyList() {
  const {
    user,
    loading: authLoading,
    favorites,
    favoritesLoading,
    openAuthModal,
  } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(false);
    try {
      const videos = await api.getVideos();
      setCatalog(Array.isArray(videos) ? videos.map(normalizeVideo) : []);
    } catch (error) {
      console.error('Failed to load catalog for My List:', error);
      setCatalogError(true);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return undefined;
    const loadTimer = window.setTimeout(() => { void loadCatalog(); }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [authLoading, loadCatalog, user]);

  const catalogById = new Map(catalog.map((video) => [video.id, video]));
  const savedVideos = favorites.map((videoId) => catalogById.get(videoId)).filter(Boolean);
  const loading = authLoading || (Boolean(user) && (favoritesLoading || catalogLoading));

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="movies-page my-list-page">
        {user ? (
          <>
            <header className="movies-page__intro">
              <p className="movies-page__eyebrow">PROtv Collection</p>
              <h1>MY LIST</h1>
              <p className="movies-page__description">
                Your saved movies, shows and favorites, all in one place.
              </p>
            </header>

            {loading ? (
              <div className="movies-grid" aria-label="Loading your list" role="status">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="movies-skeleton" key={index}>
                    <span className="movies-skeleton__poster" />
                    <span className="movies-skeleton__line" />
                    <span className="movies-skeleton__line movies-skeleton__line--short" />
                  </div>
                ))}
              </div>
            ) : catalogError ? (
              <section className="movies-state" role="alert">
                <h2>Your list could not be loaded.</h2>
                <p>Please try again in a moment.</p>
                <button type="button" className="movies-state__action" onClick={() => void loadCatalog()}>
                  Try Again
                </button>
              </section>
            ) : savedVideos.length ? (
              <div className="movies-grid">
                {savedVideos.map((video) => (
                  <StreamingCard
                    key={video.id}
                    video={video}
                    onInfo={setPreviewVideo}
                    showRemove
                  />
                ))}
              </div>
            ) : (
              <section className="movies-state my-list-page__empty">
                <h2>Your list is waiting</h2>
                <p>Add titles to My List and they&apos;ll appear here.</p>
                <Link className="movies-state__action" to="/movies">Browse PROtv</Link>
              </section>
            )}
          </>
        ) : authLoading ? (
          <div className="movies-grid" aria-label="Loading account" role="status">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="movies-skeleton" key={index}>
                <span className="movies-skeleton__poster" />
                <span className="movies-skeleton__line" />
                <span className="movies-skeleton__line movies-skeleton__line--short" />
              </div>
            ))}
          </div>
        ) : (
          <section className="movies-state my-list-page__signed-out">
            <p className="movies-page__eyebrow">PROtv Collection</p>
            <h1>YOUR LIST, YOUR WAY</h1>
            <p>Sign in to save titles and access your list across PROtv.</p>
            <button type="button" className="movies-state__action" onClick={openAuthModal}>
              Sign In
            </button>
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

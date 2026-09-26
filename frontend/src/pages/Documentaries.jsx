import { useCallback, useEffect, useState } from 'react';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import StreamingCard from '../components/StreamingCard';
import ProTVFooter from '../components/ProTVFooter';
import MoviePreview from '../components/MoviePreview';
import { api } from '../api';
import { BROWSE_CATEGORIES, matchesCategory } from '../data/browseCategories';
import '../styles/Movies.css';

const DOCUMENTARY_CATEGORY = BROWSE_CATEGORIES.find((category) => category.id === 'documentary');

function normalizeDocumentary(raw) {
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

export default function Documentaries() {
  const [documentaries, setDocumentaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  const loadDocumentaries = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const videos = await api.getVideos();
      const readyDocumentaries = Array.isArray(videos)
        ? videos.filter((video) => (
          video.status === 'ready'
          && Boolean(video.muxPlaybackId)
          && matchesCategory(video, DOCUMENTARY_CATEGORY)
        ))
        : [];
      setDocumentaries(readyDocumentaries.map(normalizeDocumentary));
    } catch (loadError) {
      console.error('Failed to load documentaries:', loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void loadDocumentaries(); }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadDocumentaries]);

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="movies-page">
        <header className="movies-page__intro">
          <p className="movies-page__eyebrow">PROtv Collection</p>
          <h1>DOCUMENTARIES</h1>
          <p className="movies-page__description">
            Discover real stories, remarkable people and compelling perspectives on PROtv.
          </p>
        </header>

        {loading ? (
          <div className="movies-grid" aria-label="Loading documentaries" role="status">
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
            <h2>Documentaries are unavailable right now.</h2>
            <p>Please try again in a moment.</p>
            <button type="button" className="movies-state__action" onClick={() => void loadDocumentaries()}>
              Try Again
            </button>
          </section>
        ) : documentaries.length ? (
          <div className="movies-grid">
            {documentaries.map((video) => (
              <StreamingCard key={video.id} video={video} onInfo={setPreviewVideo} />
            ))}
          </div>
        ) : (
          <section className="movies-state">
            <h2>No documentaries are available yet.</h2>
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

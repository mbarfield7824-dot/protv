import { useCallback, useEffect, useMemo, useState } from 'react';
import ProTVFooter from '../components/ProTVFooter';
import ProTVHeader from '../components/ProTVHeader';
import MoviePreview from '../components/MoviePreview';
import ProTVShell from '../components/ProTVShell';
import StreamingCard from '../components/StreamingCard';
import { MUSIC_FORMAT_OPTIONS } from '../data/categories';
import { FALLBACK_POSTER } from '../data/mockData';
import { api } from '../api';
import { matchesMusicFormat, normalizeMusicTitle } from '../data/musicCatalog';
import '../styles/Movies.css';
import '../styles/Music.css';

export default function Music() {
  const [videos, setVideos] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewVideo, setPreviewVideo] = useState(null);

  const loadMusic = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const items = await api.getMusicCatalog();
      setVideos(items.map((video) => normalizeMusicTitle(video, FALLBACK_POSTER)));
    } catch (loadError) {
      console.error('Failed to load Music catalog:', loadError);
      setError(loadError.message || 'The Music catalog is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void loadMusic(); }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadMusic]);

  const visibleVideos = useMemo(
    () => videos.filter((video) => matchesMusicFormat(video, selectedFormat)),
    [selectedFormat, videos]
  );
  const selectedLabel = MUSIC_FORMAT_OPTIONS.find((format) => format.value === selectedFormat)?.label;

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="movies-page music-page">
        <header className="movies-page__intro">
          <p className="movies-page__eyebrow">PROtv Collection</p>
          <h1>MUSIC</h1>
          <p className="movies-page__description">
            Discover music videos, live performances, artist spotlights, interviews, and music documentaries.
          </p>
        </header>

        <nav className="music-format-filters" aria-label="Filter Music by format">
          <button
            type="button"
            className={selectedFormat === 'all' ? 'active' : ''}
            aria-pressed={selectedFormat === 'all'}
            onClick={() => setSelectedFormat('all')}
          >
            All Music <span>{videos.length}</span>
          </button>
          {MUSIC_FORMAT_OPTIONS.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              className={selectedFormat === value ? 'active' : ''}
              aria-pressed={selectedFormat === value}
              onClick={() => setSelectedFormat(value)}
            >
              {label}
              <span>{videos.filter((video) => video.musicFormat === value).length}</span>
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="movies-grid" aria-label="Loading Music" role="status">
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
            <h2>Music is unavailable right now.</h2>
            <p>{error}</p>
            <button type="button" className="movies-state__action" onClick={() => void loadMusic()}>
              Try Again
            </button>
          </section>
        ) : visibleVideos.length ? (
          <div className="movies-grid">
            {visibleVideos.map((video) => (
              <div className="music-card" key={video.id}>
                <StreamingCard video={video} onInfo={setPreviewVideo} />
              </div>
            ))}
          </div>
        ) : (
          <section className="movies-state">
            <h2>{selectedFormat === 'all' ? 'No Music is available yet.' : `No ${selectedLabel} titles yet.`}</h2>
            <p>
              {selectedFormat === 'all'
                ? 'New Music releases will appear here as they become available to watch.'
                : 'Try another Music format to explore available titles.'}
            </p>
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

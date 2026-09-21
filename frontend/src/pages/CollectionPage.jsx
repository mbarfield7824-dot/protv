import { useEffect, useMemo, useState } from 'react';
import Footer from '../components/Footer';
import Header from '../components/Header';
import MovieCard from '../components/MovieCard';
import MoviePreview from '../components/MoviePreview';
import { api } from '../api';
import { COLLECTION_CONFIG } from '../data/categories';
import { FALLBACK_POSTER } from '../data/mockData';
import '../styles/CollectionPage.css';

function normalizeVideo(raw) {
  const category = raw.category || raw.genre || 'General';
  const subgenre = raw.subgenre || '';
  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    description: raw.description || '',
    category,
    subgenre,
    thumbnailUrl: raw.thumbnailUrl || raw.posterUrl || FALLBACK_POSTER,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl || raw.posterUrl,
    year: raw.year || null,
    duration: raw.runtime ? Math.round(raw.runtime) : raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: raw.contentType || 'MOVIE',
    genres: raw.genres?.length
      ? raw.genres
      : [category, subgenre].filter(Boolean),
    ageRating: raw.maturityRating || raw.ageRating || '',
    muxPlaybackId: raw.muxPlaybackId,
    views: raw.views || 0,
  };
}

function matchesSubcategory(video, subcategory) {
  if (subcategory === 'All') return true;
  return video.subgenre === subcategory || video.genres.some(
    (genre) => genre.toLowerCase() === subcategory.toLowerCase()
  );
}

export default function CollectionPage({ category }) {
  const config = COLLECTION_CONFIG[category];
  const [videos, setVideos] = useState([]);
  const [activeSubcategory, setActiveSubcategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [previewVideo, setPreviewVideo] = useState(null);

  useEffect(() => {
    let active = true;
    api.getVideos()
      .then((items) => {
        if (!active) return;
        setVideos(items
          .filter((video) => (
            video.status === 'ready'
            && Boolean(video.muxPlaybackId)
            && (video.category === category || video.genre === category)
          ))
          .map(normalizeVideo));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category]);

  const visibleVideos = useMemo(
    () => videos.filter((video) => matchesSubcategory(video, activeSubcategory)),
    [activeSubcategory, videos]
  );

  return (
    <div className={`collection-page collection-page-${category.toLowerCase()}`}>
      <Header />
      <main className="collection-content">
        <section className="collection-hero">
          <p>{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <span>{config.description}</span>
        </section>

        <nav className="collection-filters" aria-label={`${category} subcategories`}>
          {['All', ...config.subcategories].map((subcategory) => (
            <button
              type="button"
              key={subcategory}
              className={activeSubcategory === subcategory ? 'active' : ''}
              aria-pressed={activeSubcategory === subcategory}
              onClick={() => setActiveSubcategory(subcategory)}
            >
              {subcategory}
              <span>
                {subcategory === 'All'
                  ? videos.length
                  : videos.filter((video) => matchesSubcategory(video, subcategory)).length}
              </span>
            </button>
          ))}
        </nav>

        {loading ? (
          <p className="collection-status">Loading {category.toLowerCase()}...</p>
        ) : visibleVideos.length > 0 ? (
          <section className="collection-grid">
            {visibleVideos.map((video) => (
              <MovieCard key={video.id} video={video} onInfo={setPreviewVideo} />
            ))}
          </section>
        ) : (
          <section className="collection-empty">
            <strong>{activeSubcategory === 'All' ? `${category} is coming soon` : `No ${activeSubcategory} titles yet`}</strong>
            <p>New releases will appear here as they are added to PROtv.</p>
          </section>
        )}
      </main>
      <Footer />
      {previewVideo && <MoviePreview video={previewVideo} onClose={() => setPreviewVideo(null)} />}
    </div>
  );
}

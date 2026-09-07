import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Hero from '../components/Hero';
import ContentRow from '../components/ContentRow';
import ContinueWatching from '../components/ContinueWatching';
import DiscoverPanel from '../components/DiscoverPanel';
import Footer from '../components/Footer';
import Header from '../components/Header';
import MoviePreview from '../components/MoviePreview';
import { api } from '../api';
import {
  mockVideoData,
  blackCinemaData,
  independentData,
  animeData,
  continueWatchingData,
  myListData,
  recentlyAddedData,
  FALLBACK_POSTER,
} from '../data/mockData';
import '../styles/Home.css';

const DEFAULT_CATEGORIES = [
  { id: 'comedy', name: 'Comedy' },
  { id: 'action', name: 'Action' },
  { id: 'documentary', name: 'Documentary' },
  { id: 'horror', name: 'Horror' },
  { id: 'drama', name: 'Drama' },
];

// Normalizes a raw Firestore video record (from the live backend) into the
// same shape the UI components expect from the curated mock catalog, so
// real content can appear in the rails without special-casing everywhere.
function normalizeApiVideo(raw) {
  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    description: raw.description || '',
    category: raw.category || 'General',
    thumbnailUrl: raw.thumbnailUrl || FALLBACK_POSTER,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl,
    rating: typeof raw.rating === 'number' ? raw.rating : 7.5,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || new Date().getFullYear(),
    duration: raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: raw.contentType || 'MOVIE',
    genres: raw.genres && raw.genres.length > 0 ? raw.genres : [raw.category || 'General'],
    ageRating: raw.ageRating || 'PG-13',
    muxPlaybackId: raw.muxPlaybackId,
    views: raw.views || 0,
  };
}

export default function Home() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [apiVideos, setApiVideos] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [activeMood, setActiveMood] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);

  useEffect(() => {
    fetchCategories();
    fetchApiVideos();
  }, []);

  async function fetchCategories() {
    try {
      const data = await api.getCategories();
      setCategories(data && data.length > 0 ? data : DEFAULT_CATEGORIES);
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories(DEFAULT_CATEGORIES);
    } finally {
      setLoading(false);
    }
  }

  // Fetch real backend videos so newly added titles show up on the
  // homepage alongside the curated mock rails. Fails silently (mock
  // content still renders) if the backend is offline.
  async function fetchApiVideos() {
    try {
      const data = await api.getVideos();
      if (Array.isArray(data) && data.length > 0) {
        // Only show videos Mux has finished transcoding (status "ready" or
        // legacy videos with no status field). Skip "processing"/"errored"
        // ones so half-uploaded movies don't appear broken to visitors.
        const readyVideos = data.filter((v) => !v.status || v.status === 'ready');
        setApiVideos(readyVideos.map(normalizeApiVideo));
      }
    } catch (error) {
      console.error('Failed to load live videos:', error);
    }
  }

  if (loading) {
    return <div className="loading">Loading PROtv...</div>;
  }

  const combinedCatalog = [...mockVideoData, ...apiVideos];
  const featured = combinedCatalog[0];

  // Filter videos based on selected category
  const getTrendingVideos = () => {
    if (selectedCategory === 'All') return combinedCatalog.slice(1);
    return combinedCatalog.slice(1).filter((v) => v.category === selectedCategory);
  };

  // Get videos recommended based on first video
  const getRecommendedVideos = () => {
    if (!featured) return [];
    return combinedCatalog.filter((v) => v.category === featured.category && v.id !== featured.id);
  };

  // Discover mood-based recommendations
  const getMoodVideos = () => {
    if (!activeMood) return [];
    const all = [...combinedCatalog, ...blackCinemaData, ...independentData, ...animeData];
    return all.filter((v) => v.genres?.some((g) => activeMood.genres.includes(g)));
  };

  return (
    <div className="home-premium">
      <Header />

      {/* Hero Section */}
      {featured ? (
        <Hero featured={featured} />
      ) : (
        <div className="hero-loading">No content available. Add videos to get started!</div>
      )}

      {/* Continue Watching — cinematic rail with progress bars */}
      <ContinueWatching items={continueWatchingData} />

      {/* Quick Access Section */}
      <div className="quick-access">
        <div className="quick-item">
          <div className="quick-label">My List</div>
          <div className="quick-content">
            <img
              src={myListData[0]?.thumbnailUrl}
              alt="My List"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = FALLBACK_POSTER;
              }}
            />
            <div className="quick-info">
              <p className="quick-title">{myListData[0]?.title}</p>
              <p className="quick-meta">{myListData[0]?.contentType}</p>
            </div>
          </div>
        </div>

        <div className="quick-item">
          <div className="quick-label">Recently Added</div>
          <div className="quick-content">
            <img
              src={recentlyAddedData[0]?.thumbnailUrl}
              alt="Recently Added"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = FALLBACK_POSTER;
              }}
            />
            <div className="quick-info">
              <p className="quick-title">{recentlyAddedData[0]?.title}</p>
              <p className="quick-meta">{recentlyAddedData[0]?.contentType}</p>
            </div>
          </div>
        </div>
      </div>

      {/* PROtv Discover — signature mood-based discovery feature */}
      <DiscoverPanel onMoodSelect={setActiveMood} />

      {activeMood && (
        <ContentRow
          title={`${activeMood.icon} ${activeMood.label}`}
          subtitle="Picked for your mood"
          content={getMoodVideos().slice(0, 8)}
        onInfo={setPreviewVideo}
        />
      )}

      {/* Category Filter */}
      <div className="category-filter-section">
        <div className="filter-wrapper">
          <button
            className={`filter-btn ${selectedCategory === 'All' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('All')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`filter-btn ${selectedCategory === cat.name ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.name)}
            >
              {cat.name}
            </button>
          ))}
          <button
            className={`filter-btn special ${selectedCategory === 'Black Cinema' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('Black Cinema')}
          >
            Black Cinema
          </button>
          <button
            className={`filter-btn special ${selectedCategory === 'Independent' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('Independent')}
          >
            Independent
          </button>
          <button
            className={`filter-btn special ${selectedCategory === 'Anime' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('Anime')}
          >
            Anime
          </button>
        </div>
      </div>

      {/* Content Rows */}
      <ContentRow
        title="🔥 Trending Now"
        content={getTrendingVideos().slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        title="Because You Watched"
        subtitle={featured ? `${featured.title}` : ''}
        content={getRecommendedVideos().slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        title="BLACK CINEMA"
        subtitle="Stories. Culture. Icons."
        content={blackCinemaData}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        title="INDEPENDENT SPOTLIGHT"
        subtitle="Discover the stories Hollywood missed."
        content={independentData}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        title="ANIME UNIVERSE"
        subtitle="Explore. Adventure. Beyond Imagination."
        content={animeData}
        onInfo={setPreviewVideo}
      />

      {/* More Rows */}
      <ContentRow
        title="😂 Comedy"
        content={combinedCatalog.filter((v) => v.category === 'Comedy').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        title="💥 Action"
        content={combinedCatalog.filter((v) => v.category === 'Action').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        title="🎭 Drama"
        content={combinedCatalog.filter((v) => v.category === 'Drama').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        title="😱 Horror"
        content={combinedCatalog.filter((v) => v.category === 'Horror').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        title="🎬 Documentary"
        content={combinedCatalog.filter((v) => v.category === 'Documentary').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      {apiVideos.length > 0 && (
        <ContentRow
          title="🆕 Fresh From PROtv"
          subtitle="Newly added to the library"
          content={apiVideos.slice(0, 8)}
        onInfo={setPreviewVideo}
        />
      )}

      <Footer />
      {previewVideo && (
        <MoviePreview video={previewVideo} onClose={() => setPreviewVideo(null)} />
      )}
    </div>
  );
}

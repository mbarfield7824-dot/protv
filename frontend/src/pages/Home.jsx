import { useEffect, useState } from 'react';
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
  FALLBACK_POSTER,
} from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import '../styles/Home.css';

const DEFAULT_CATEGORIES = [
  { id: 'comedy', name: 'Comedy' },
  { id: 'action', name: 'Action' },
  { id: 'documentary', name: 'Documentary' },
  { id: 'horror', name: 'Horror' },
  { id: 'drama', name: 'Drama' },
  { id: 'ai-cinema', name: 'AI Cinema' },
  { id: 'food', name: 'Food' },
  { id: 'sports', name: 'Sports' },
];

const CATEGORY_SECTION_IDS = {
  Comedy: 'comedy',
  Action: 'action',
  Documentary: 'documentary',
  Horror: 'horror',
  Drama: 'drama',
  'AI Cinema': 'ai-cinema',
  Food: 'food',
  Sports: 'sports',
  'Black Cinema': 'black-cinema',
  Independent: 'independent',
  Anime: 'anime',
};

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
  const [categories, setCategories] = useState([]);
  const [apiVideos, setApiVideos] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [activeMood, setActiveMood] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const { user, favorites } = useAuth();

  async function fetchCategories() {
    try {
      const data = await api.getCategories();
      const apiCategories = Array.isArray(data) ? data : [];
      const existingNames = new Set(DEFAULT_CATEGORIES.map((category) => category.name));
      setCategories([
        ...DEFAULT_CATEGORIES,
        ...apiCategories.filter((category) => !existingNames.has(category.name)),
      ]);
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
        // A public catalog entry is playable only after Mux has produced its
        // public playback ID. Source-only, processing, and failed records
        // must stay out of viewer-facing rails.
        const readyVideos = data.filter(
          (video) => video.status === 'ready' && Boolean(video.muxPlaybackId)
        );
        setApiVideos(readyVideos.map(normalizeApiVideo));
      }

    } catch (error) {
      console.error('Failed to load live videos:', error);
    }
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void fetchCategories();
      void fetchApiVideos();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, []);

  if (loading) {
    return <div className="loading">Loading PROtv...</div>;
  }

  const combinedCatalog = [...mockVideoData, ...apiVideos];
  const featured = combinedCatalog[0];
  const myListVideos = combinedCatalog.filter((video) => favorites.includes(video.id));

  // Filter videos based on selected category
  const getTrendingVideos = () => {
    if (selectedCategory === 'All') return combinedCatalog.slice(1);
    return combinedCatalog.slice(1).filter((v) => v.category === selectedCategory);
  };

  const selectCategory = (category) => {
    setSelectedCategory(category);
    const sectionId = category === 'All' ? 'trending' : CATEGORY_SECTION_IDS[category];
    const section = document.getElementById(sectionId);
    if (section) {
      window.scrollTo({
        top: Math.max(0, section.getBoundingClientRect().top + window.scrollY - 100),
        behavior: 'auto',
      });
    }
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
      <ContinueWatching id="continue-watching" items={continueWatchingData} />

      <section id="my-list" className="my-list-section">
        {user && myListVideos.length > 0 ? (
          <ContentRow title="My List" subtitle="Your saved favorites" content={myListVideos} onInfo={setPreviewVideo} />
        ) : (
          <div className="my-list-empty">
            <h2>My List</h2>
            <p>{user ? 'Save movies and shows with the + My List button to find them here.' : 'Sign in to save favorites and access them on any device.'}</p>
          </div>
        )}
      </section>

      {/* PROtv Discover — signature mood-based discovery feature */}
      <div id="discover">
        <DiscoverPanel onMoodSelect={setActiveMood} />
      </div>

      {activeMood && (
        <ContentRow
          title={`${activeMood.icon} ${activeMood.label}`}
          subtitle="Picked for your mood"
          content={getMoodVideos().slice(0, 8)}
        onInfo={setPreviewVideo}
        />
      )}

      {/* Category Filter */}
      <div id="categories" className="category-filter-section">
        <div className="filter-wrapper">
          <button
            className={`filter-btn ${selectedCategory === 'All' ? 'active' : ''}`}
            onClick={() => selectCategory('All')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`filter-btn ${['ai-cinema', 'food', 'sports'].includes(cat.id) ? 'featured' : ''} ${selectedCategory === cat.name ? 'active' : ''}`}
              onClick={() => selectCategory(cat.name)}
            >
              {cat.name}
            </button>
          ))}
          <button
            className={`filter-btn special ${selectedCategory === 'Black Cinema' ? 'active' : ''}`}
            onClick={() => selectCategory('Black Cinema')}
          >
            Black Cinema
          </button>
          <button
            className={`filter-btn special ${selectedCategory === 'Independent' ? 'active' : ''}`}
            onClick={() => selectCategory('Independent')}
          >
            Independent
          </button>
          <button
            className={`filter-btn special ${selectedCategory === 'Anime' ? 'active' : ''}`}
            onClick={() => selectCategory('Anime')}
          >
            Anime
          </button>
        </div>
      </div>

      {/* Content Rows */}
      <ContentRow
        id="trending"
        title="🔥 Trending Now"
        content={getTrendingVideos().slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="black-cinema"
        title="Because You Watched"
        subtitle={featured ? `${featured.title}` : ''}
        content={getRecommendedVideos().slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="independent"
        title="BLACK CINEMA"
        subtitle="Stories. Culture. Icons."
        content={blackCinemaData}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="anime"
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
        id="comedy"
        title="😂 Comedy"
        content={combinedCatalog.filter((v) => v.category === 'Comedy').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="action"
        title="💥 Action"
        content={combinedCatalog.filter((v) => v.category === 'Action').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="drama"
        title="🎭 Drama"
        content={combinedCatalog.filter((v) => v.category === 'Drama').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="horror"
        title="😱 Horror"
        content={combinedCatalog.filter((v) => v.category === 'Horror').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="documentary"
        title="🎬 Documentary"
        content={combinedCatalog.filter((v) => v.category === 'Documentary').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      {combinedCatalog.some((video) => video.category === 'AI Cinema') && (
        <ContentRow
          id="ai-cinema"
          title="✦ AI CINEMA"
          subtitle="Stories created at the edge of imagination."
          content={combinedCatalog.filter((video) => video.category === 'AI Cinema').slice(0, 8)}
          onInfo={setPreviewVideo}
        />
      )}

      {combinedCatalog.some((video) => video.category === 'Food') && (
        <ContentRow
          id="food"
          title="🍽 FOOD & FLAVOR"
          subtitle="Recipes, culture, and the stories behind every bite."
          content={combinedCatalog.filter((video) => video.category === 'Food').slice(0, 8)}
          onInfo={setPreviewVideo}
        />
      )}

      {combinedCatalog.some((video) => video.category === 'Sports') && (
        <ContentRow
          id="sports"
          title="🏆 SPORTS CENTRAL"
          subtitle="The athletes, moments, and games that move us."
          content={combinedCatalog.filter((video) => video.category === 'Sports').slice(0, 8)}
          onInfo={setPreviewVideo}
        />
      )}

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

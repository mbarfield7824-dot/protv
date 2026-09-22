import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hero from '../components/Hero';
import ContentRow from '../components/ContentRow';
import ContinueWatching from '../components/ContinueWatching';
import DiscoverPanel from '../components/DiscoverPanel';
import Footer from '../components/Footer';
import Header from '../components/Header';
import MoviePreview from '../components/MoviePreview';
import { CreatorInvitation } from '../components/CreatorExperience';
import { api } from '../api';
import {
  mockVideoData,
  blackCinemaData,
  independentData,
  animeData,
  FALLBACK_POSTER,
} from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import { isTvEpisode } from '../utils/shows';
import { useHorizontalScrollState } from '../hooks/useHorizontalScrollState';
import '../styles/Home.css';
import '../styles/Creators.css';

const DEFAULT_CATEGORIES = [
  { id: 'comedy', name: 'Comedy' },
  { id: 'action', name: 'Action' },
  { id: 'documentary', name: 'Documentary' },
  { id: 'horror', name: 'Horror' },
  { id: 'drama', name: 'Drama' },
  { id: 'ai-cinema', name: 'AI Cinema' },
  { id: 'food', name: 'Food' },
  { id: 'sports', name: 'Sports' },
  { id: 'podcast', name: 'Podcast' },
  { id: 'sci-fi', name: 'Sci-Fi' },
  { id: 'espanol', name: 'Espanol' },
  { id: 'international', name: 'International' },
  { id: 'black-cinema', name: 'Black Cinema' },
  { id: 'anime', name: 'Anime' },
  { id: 'music', name: 'Music' },
  { id: 'cartoons', name: 'Cartoons' },
];

const FEATURED_PROTV_TITLE_IDS = [
  '3NAU6BldsmCNs9wjM08a',
  'WIVB9NPQQzvtvjTBsiKw',
  'B2MDEH2b25NknMQMEhoM',
  'zGpbFWvSaup6ioUaoqsN',
];

// Normalizes a raw Firestore video record (from the live backend) into the
// same shape the UI components expect from the curated mock catalog, so
// real content can appear in the rails without special-casing everywhere.
function normalizeApiVideo(raw) {
  const category = raw.category || raw.genre || 'General';
  const subgenre = raw.subgenre || '';
  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    description: raw.description || '',
    category,
    subgenre,
    thumbnailUrl: raw.thumbnailUrl || FALLBACK_POSTER,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || null,
    duration: raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: raw.contentType || 'MOVIE',
    genres: [...new Set([...(raw.genres || []), category, subgenre].filter(Boolean))],
    ageRating: raw.maturityRating || raw.ageRating || '',
    muxPlaybackId: raw.muxPlaybackId,
    views: raw.views || 0,
  };
}

function catalogTimestamp(video) {
  const value = video.approvedAt || video.createdAt || video.submittedAt;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value === 'number') return value;
  if (value && typeof value._seconds === 'number') {
    return (value._seconds * 1000) + Math.floor((value._nanoseconds || 0) / 1_000_000);
  }
  return 0;
}

export default function Home() {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [apiVideos, setApiVideos] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [activeMood, setActiveMood] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const { user, favorites, progress } = useAuth();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const {
    scrollRef: categoryScrollRef,
    canScrollLeft: categoryCanScrollLeft,
    canScrollRight: categoryCanScrollRight,
    hasOverflow: categoriesOverflow,
    progress: categoryProgress,
  } = useHorizontalScrollState();

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
        setApiVideos(
          readyVideos
            .sort((left, right) => catalogTimestamp(right) - catalogTimestamp(left))
            .map(normalizeApiVideo)
        );
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
    const refreshCatalog = () => {
      if (document.visibilityState === 'visible') void fetchApiVideos();
    };
    window.addEventListener('focus', refreshCatalog);
    document.addEventListener('visibilitychange', refreshCatalog);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener('focus', refreshCatalog);
      document.removeEventListener('visibilitychange', refreshCatalog);
    };
  }, []);

  useEffect(() => {
    if (loading || !hash) return undefined;

    const sectionId = decodeURIComponent(hash.slice(1));
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [hash, loading]);

  if (loading) {
    return <div className="loading">Loading PROtv...</div>;
  }

  const combinedCatalog = apiVideos.length > 0 ? apiVideos : mockVideoData;
  const movieCatalog = combinedCatalog.filter((video) => !isTvEpisode(video));
  const showCatalog = combinedCatalog.filter(isTvEpisode);
  const featured = movieCatalog.find((video) => video.title === 'The Bundy Chronicles') || movieCatalog[0];
  const myListVideos = combinedCatalog.filter((video) => favorites.includes(video.id));
  const featuredProtvVideos = FEATURED_PROTV_TITLE_IDS
    .map((id) => apiVideos.find((video) => video.id === id))
    .filter(Boolean);

  // Show a title after five seconds, rather than a percentage threshold that
  // can hide early progress on long movies. Finished titles remain in history.
  const continueWatchingItems = Object.entries(progress || {})
    .filter(([, entry]) => (
      Number.isFinite(entry?.positionSeconds) &&
      Number.isFinite(entry?.durationSeconds) &&
      entry.positionSeconds >= 5 &&
      entry.positionSeconds < entry.durationSeconds * 0.95
    ))
    .sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(([videoId, entry]) => {
      const source = combinedCatalog.find((video) => video.id === videoId);
      if (!source) return null;
      return {
        id: videoId,
        title: source.title,
        thumbnailUrl: source.thumbnailUrl,
        season: source.seasonNumber,
        episode: source.episodeNumber,
        minutesLeft: Math.max(1, Math.round((entry.durationSeconds - entry.positionSeconds) / 60)),
        progressPercent: Math.round((entry.positionSeconds / entry.durationSeconds) * 100),
      };
    })
    .filter(Boolean);

  // Filter videos based on selected category
  const getTrendingVideos = () => {
    const nonFeaturedMovies = movieCatalog.filter((video) => video.id !== featured?.id);
    if (selectedCategory === 'All') return nonFeaturedMovies;
    return nonFeaturedMovies.filter((video) => video.category === selectedCategory);
  };

  const selectCategory = (category) => {
    setSelectedCategory(category);
    window.requestAnimationFrame(() => {
      const sectionId = category === 'All' ? 'trending' : 'category-results';
      const section = document.getElementById(sectionId);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Get videos recommended based on first video
  const getRecommendedVideos = () => {
    if (!featured) return [];
    return movieCatalog.filter((v) => v.category === featured.category && v.id !== featured.id);
  };

  // Discover mood-based recommendations
  const getMoodVideos = () => {
    if (!activeMood) return [];
    const all = [...combinedCatalog, ...blackCinemaData, ...independentData, ...animeData];
    return all.filter((v) => v.genres?.some((g) => activeMood.genres.includes(g)));
  };
  const selectedCategoryVideos = selectedCategory === 'All'
    ? []
    : movieCatalog.filter((video) => video.category === selectedCategory);

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
      <ContinueWatching id="continue-watching" items={continueWatchingItems} />

      {featuredProtvVideos.length > 0 && (
        <ContentRow
          id="featured-on-protv"
          title="Featured on PROtv"
          subtitle="Four classic favorites, ready to watch"
          content={featuredProtvVideos}
          onInfo={setPreviewVideo}
        />
      )}

      <section id="my-list" className="my-list-section">
        {user && myListVideos.length > 0 ? (
          <ContentRow
            title="My List"
            subtitle="Your saved favorites"
            content={myListVideos}
            onInfo={setPreviewVideo}
            showListRemoval
          />
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
        <div className="category-filter-heading">
          <strong>Browse categories</strong>
          {categoriesOverflow && (
            <span aria-hidden="true">
              {categoryCanScrollLeft ? '← ' : ''}Swipe for more{categoryCanScrollRight ? ' →' : ''}
            </span>
          )}
        </div>
        <div className={`category-filter-shell ${categoryCanScrollLeft ? 'has-more-left' : ''} ${categoryCanScrollRight ? 'has-more-right' : ''}`}>
        <div className="filter-wrapper" ref={categoryScrollRef} aria-label="Browse content categories">
          <button
            className={`filter-btn ${selectedCategory === 'All' ? 'active' : ''}`}
            onClick={() => selectCategory('All')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`filter-btn ${['ai-cinema', 'food', 'sports', 'podcast', 'sci-fi', 'espanol', 'international', 'music', 'cartoons'].includes(cat.id) ? 'featured' : ''} ${selectedCategory === cat.name ? 'active' : ''}`}
              onClick={() => (
                cat.name === 'Music' || cat.name === 'Cartoons'
                  ? navigate(`/${cat.name.toLowerCase()}`)
                  : selectCategory(cat.name)
              )}
            >
              {cat.name}
            </button>
          ))}
          <button
            className={`filter-btn special ${selectedCategory === 'Independent' ? 'active' : ''}`}
            onClick={() => selectCategory('Independent')}
          >
            Independent
          </button>
        </div>
        </div>
        {categoriesOverflow && (
          <div className="category-scroll-progress" aria-hidden="true">
            <span style={{ left: `${categoryProgress * 0.72}%` }} />
          </div>
        )}
      </div>

      {selectedCategory !== 'All' && (
        <section id="category-results" className="category-results">
          <div className="category-results-heading">
            <p>Explore PROtv</p>
            <h2>{selectedCategory}</h2>
          </div>
          {selectedCategoryVideos.length > 0 ? (
            <ContentRow
              title={`Featured in ${selectedCategory}`}
              content={selectedCategoryVideos}
              onInfo={setPreviewVideo}
            />
          ) : (
            <div className="category-empty-state">
              <span>{selectedCategory === 'AI Cinema' ? '✦' : selectedCategory === 'Food' ? '🍽' : selectedCategory === 'Sports' ? '🏆' : selectedCategory === 'Podcast' ? '🎙' : selectedCategory === 'Espanol' ? '🎞' : selectedCategory === 'International' ? '🌍' : '🛸'}</span>
              <div>
                <h3>{selectedCategory} is coming soon</h3>
                <p>Check back soon for the first titles in this collection.</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Content Rows */}
      <ContentRow
        id="trending"
        title="🔥 Trending Now"
        content={getTrendingVideos().slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      {showCatalog.length > 0 && (
        <ContentRow
          id="tv-shows"
          title="TV Shows"
          subtitle="Episodes ready to watch"
          content={showCatalog.slice(0, 8)}
          onInfo={setPreviewVideo}
        />
      )}

      <ContentRow
        id="because-you-watched"
        title="Because You Watched"
        subtitle={featured ? `${featured.title}` : ''}
        content={getRecommendedVideos().slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="black-cinema"
        title="BLACK CINEMA"
        subtitle="Stories. Culture. Icons."
        content={[...blackCinemaData, ...movieCatalog.filter((video) => video.category === 'Black Cinema')].slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="independent"
        title="INDEPENDENT SPOTLIGHT"
        subtitle="Discover the stories Hollywood missed."
        content={independentData}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="anime"
        title="ANIME UNIVERSE"
        subtitle="Explore. Adventure. Beyond Imagination."
        content={[...animeData, ...movieCatalog.filter((video) => video.category === 'Anime')].slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      {/* More Rows */}
      <ContentRow
        id="comedy"
        title="😂 Comedy"
        content={movieCatalog.filter((v) => v.category === 'Comedy').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="action"
        title="💥 Action"
        content={movieCatalog.filter((v) => v.category === 'Action').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="drama"
        title="🎭 Drama"
        content={movieCatalog.filter((v) => v.category === 'Drama').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="horror"
        title="😱 Horror"
        content={movieCatalog.filter((v) => v.category === 'Horror').slice(0, 8)}
        onInfo={setPreviewVideo}
      />

      <ContentRow
        id="documentary"
        title="🎬 Documentary"
        content={movieCatalog.filter((v) => v.category === 'Documentary').slice(0, 8)}
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

      {movieCatalog.some((video) => video.category === 'Podcast') && (
        <ContentRow
          id="podcast"
          title="🎙 PODCASTS"
          subtitle="Conversations, culture, and voices worth hearing."
          content={movieCatalog.filter((video) => video.category === 'Podcast').slice(0, 8)}
          onInfo={setPreviewVideo}
        />
      )}

      {movieCatalog.some((video) => video.category === 'Sci-Fi') && (
        <ContentRow
          id="sci-fi"
          title="🛸 SCI-FI EXPLORATIONS"
          subtitle="Future worlds, distant planets, and the unknown."
          content={movieCatalog.filter((video) => video.category === 'Sci-Fi').slice(0, 8)}
          onInfo={setPreviewVideo}
        />
      )}

      {movieCatalog.some((video) => video.category === 'Espanol') && (
        <ContentRow
          id="espanol"
          title="🎞 ESPANOL CINEMA"
          subtitle="Stories and voices from the Spanish-speaking world."
          content={movieCatalog.filter((video) => video.category === 'Espanol').slice(0, 8)}
          onInfo={setPreviewVideo}
        />
      )}

      {movieCatalog.some((video) => video.category === 'International') && (
        <ContentRow
          id="international"
          title="🌍 INTERNATIONAL CINEMA"
          subtitle="Great stories from around the world."
          content={movieCatalog.filter((video) => video.category === 'International').slice(0, 8)}
          onInfo={setPreviewVideo}
        />
      )}

      {movieCatalog.some((video) => video.category === 'Music') && (
        <ContentRow
          id="music"
          title="MUSIC"
          subtitle="Performances, videos, and sounds for every mood."
          content={movieCatalog.filter((video) => video.category === 'Music').slice(0, 8)}
          viewAllLink="/music"
          onInfo={setPreviewVideo}
        />
      )}

      {movieCatalog.some((video) => video.category === 'Cartoons') && (
        <ContentRow
          id="cartoons"
          title="CARTOONS"
          subtitle="Classic animation, family favorites, and animated adventures."
          content={movieCatalog.filter((video) => video.category === 'Cartoons').slice(0, 8)}
          viewAllLink="/cartoons"
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

      <CreatorInvitation />
      <Footer />
      {previewVideo && (
        <MoviePreview video={previewVideo} onClose={() => setPreviewVideo(null)} />
      )}
    </div>
  );
}

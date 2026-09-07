import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  mockVideoData,
  blackCinemaData,
  independentData,
  animeData,
  FALLBACK_POSTER,
} from '../data/mockData';
import { api } from '../api';
import '../styles/SearchOverlay.css';

// Normalizes backend video to match mock data shape
function normalizeApiVideo(raw) {
  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    description: raw.description || '',
    category: raw.category || raw.genre || 'General',
    thumbnailUrl: raw.thumbnailUrl || raw.posterUrl || FALLBACK_POSTER,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl || raw.posterUrl || FALLBACK_POSTER,
    rating: typeof raw.rating === 'number' ? raw.rating : 7.5,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || new Date().getFullYear(),
    duration: raw.runtime ? Math.round(raw.runtime) : raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: 'MOVIE',
    genres: raw.genres?.length ? raw.genres : [raw.category || raw.genre || raw.subgenre || 'General'],
    ageRating: 'PG-13',
    muxPlaybackId: raw.muxPlaybackId,
    views: raw.views || 0,
  };
}

export default function SearchOverlay({ onClose }) {
  const [query, setQuery] = useState('');
  const [apiVideos, setApiVideos] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch backend videos to include in search
    async function fetchApiVideos() {
      try {
        const data = await api.getVideos();
        if (Array.isArray(data) && data.length > 0) {
          setApiVideos(data.map(normalizeApiVideo));
        }
      } catch (error) {
        console.error('Failed to load videos for search:', error);
      }
    }
    fetchApiVideos();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Include mock data + backend API videos
    const SEARCH_CATALOG = [...mockVideoData, ...apiVideos, ...blackCinemaData, ...independentData, ...animeData];

    return SEARCH_CATALOG.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.category?.toLowerCase().includes(q) ||
        v.genres?.some((g) => g.toLowerCase().includes(q))
    ).slice(0, 12);
  }, [query, apiVideos]);

  const handleSelect = (video) => {
    onClose();
    navigate(`/player/${video.id}`);
  };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-overlay-inner" onClick={(e) => e.stopPropagation()}>
        <div className="search-overlay-bar">
          <span className="search-overlay-icon">🔍</span>
          <input
            type="text"
            autoFocus
            placeholder="Search titles, genres, moods..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="search-overlay-close" onClick={onClose} aria-label="Close search">
            ✕
          </button>
        </div>

        {query.trim() && (
          <div className="search-overlay-results">
            {results.length === 0 ? (
              <p className="search-overlay-empty">No matches for "{query}"</p>
            ) : (
              <div className="search-overlay-grid">
                {results.map((video) => (
                  <div
                    key={video.id}
                    className="search-result-card"
                    onClick={() => handleSelect(video)}
                  >
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = FALLBACK_POSTER;
                      }}
                    />
                    <div className="search-result-info">
                      <p className="search-result-title">{video.title}</p>
                      <p className="search-result-meta">
                        {video.category} • {video.year}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  mockVideoData,
  blackCinemaData,
  independentData,
  animeData,
  FALLBACK_POSTER,
} from '../data/mockData';
import '../styles/SearchOverlay.css';

const SEARCH_CATALOG = [...mockVideoData, ...blackCinemaData, ...independentData, ...animeData];

export default function SearchOverlay({ onClose }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_CATALOG.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.category?.toLowerCase().includes(q) ||
        v.genres?.some((g) => g.toLowerCase().includes(q))
    ).slice(0, 12);
  }, [query]);

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

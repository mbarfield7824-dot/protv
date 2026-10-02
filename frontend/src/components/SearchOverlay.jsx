import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPodcastSearchResult, podcastResultUrl } from '../data/podcastCatalog';
import {
  mockVideoData,
  blackCinemaData,
  independentData,
  animeData,
  FALLBACK_POSTER,
} from '../data/mockData';
import { overlaySearchCatalog } from '../data/searchCatalog';
import { useSearchCatalog } from '../hooks/useSearchCatalog';
import { matchesDocumentaryClassification } from '../utils/documentary';
import {
  isMovieSearchResult,
  isSeriesSearchResult,
  matchesMusicClassification,
} from '../data/musicCatalog';
import '../styles/SearchOverlay.css';

// Normalizes backend video to match mock data shape
function normalizeApiVideo(raw) {
  const category = raw.category || raw.genre || 'General';
  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    description: raw.description || '',
    category,
    subgenre: raw.subgenre || '',
    thumbnailUrl: raw.artworkUrl || raw.thumbnailUrl || raw.posterUrl || FALLBACK_POSTER,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl || raw.posterUrl || FALLBACK_POSTER,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || null,
    duration: raw.runtime ? Math.round(raw.runtime) : raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: raw.contentType,
    podcastShowId: raw.podcastShowId,
    host: raw.host,
    creator: raw.creator,
    musicFormat: raw.musicFormat,
    genre: raw.genre,
    genres: [...new Set([...(raw.genres || []), category, raw.subgenre].filter(Boolean))],
    ageRating: raw.maturityRating || raw.ageRating || '',
    muxPlaybackId: raw.muxPlaybackId,
    views: raw.views || 0,
  };
}

export default function SearchOverlay({ onClose }) {
  const [query, setQuery] = useState('');
  const { catalog, retry } = useSearchCatalog(normalizeApiVideo);
  const { failures, status } = catalog;
  const [contentFilter, setContentFilter] = useState('ALL');
  const navigate = useNavigate();
  const searchCatalog = useMemo(() => overlaySearchCatalog(catalog, {
    primary: mockVideoData,
    additional: [...blackCinemaData, ...independentData, ...animeData],
  }), [catalog]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const matches = searchCatalog.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.host?.toLowerCase().includes(q) ||
        v.creator?.toLowerCase().includes(q) ||
        v.category?.toLowerCase().includes(q) ||
        v.subgenre?.toLowerCase().includes(q) ||
        v.genres?.some((g) => g.toLowerCase().includes(q))
    );
    if (contentFilter === 'ALL') return matches.slice(0, 12);
    return matches.filter((video) => {
      if (contentFilter === 'PODCASTS') return isPodcastSearchResult(video);
      if (contentFilter === 'MUSIC') return !isPodcastSearchResult(video) && matchesMusicClassification(video);
      if (contentFilter === 'MOVIES') return isMovieSearchResult(video);
      if (contentFilter === 'SERIES') return isSeriesSearchResult(video);
      if (contentFilter === 'DOCUMENTARIES') return matchesDocumentaryClassification(video);
      const type = String(video.contentType || '').toUpperCase();
      if (contentFilter === 'SHORTS') return type === 'SHORT' || type === 'SHORT FILM';
      return true;
    }).slice(0, 12);
  }, [query, searchCatalog, contentFilter]);

  const availableFilters = useMemo(() => {
    const filters = ['ALL'];
    if (searchCatalog.some(isMovieSearchResult)) filters.push('MOVIES');
    if (searchCatalog.some((video) => ['SERIES', 'EPISODE'].includes(String(video.contentType || '').toUpperCase()))) filters.push('SERIES');
    if (searchCatalog.some((video) => !isPodcastSearchResult(video) && matchesMusicClassification(video))) filters.push('MUSIC');
    filters.push('PODCASTS');
    if (searchCatalog.some(matchesDocumentaryClassification)) filters.push('DOCUMENTARIES');
    if (searchCatalog.some((video) => ['SHORT', 'SHORT FILM'].includes(String(video.contentType || '').toUpperCase()))) filters.push('SHORTS');
    return filters;
  }, [searchCatalog]);

  const handleSelect = (video) => {
    onClose();
    navigate(isPodcastSearchResult(video) ? podcastResultUrl(video) : `/player/${video.id}`);
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
            {status === 'loading' ? (
              <div className="search-overlay-state" role="status">Loading search results...</div>
            ) : failures.length > 0 && (
              <div className="search-overlay-state" role="alert">
                <strong>{status === 'unavailable'
                  ? 'Search is unavailable right now.'
                  : 'Search results are incomplete.'}</strong>
                {status === 'partial' && <span>Showing results from available sources.</span>}
                {failures.map((failure) => (
                  <span key={failure.source}>{failure.label}: {failure.message}</span>
                ))}
                <button type="button" onClick={() => void retry()}>Try Again</button>
              </div>
            )}
            <div className="search-filter-tabs" aria-label="Filter search results">
              {availableFilters.map((filter) => (
                <button
                  type="button"
                  key={filter}
                  className={contentFilter === filter ? 'active' : ''}
                  onClick={() => setContentFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
            {status !== 'loading' && status !== 'unavailable' && (results.length === 0 ? (
              <div className="search-overlay-empty">
                <strong>{status === 'partial' ? 'No matches in available results.' : 'No results found.'}</strong>
                <span>{status === 'partial'
                  ? 'Some sources could not be searched. Retry to check the full catalog.'
                  : 'Try another title, creator or genre.'}</span>
              </div>
            ) : (
              <div className="search-overlay-grid">
                {results.map((video) => (
                  <div
                    key={video.id}
                    className="search-result-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(video)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelect(video);
                      }
                    }}
                  >
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      loading="lazy"
                      decoding="async"
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

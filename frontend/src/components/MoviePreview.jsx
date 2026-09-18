import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { FALLBACK_HERO } from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import { fallbackArtworkUrl } from '../utils/artwork';
import '../styles/MoviePreview.css';

export default function MoviePreview({ video, onClose }) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useAuth();
  const [artworkFailed, setArtworkFailed] = useState(false);

  if (!video) return null;

  const handlePlay = () => {
    onClose();
    navigate(`/player/${video.id}`);
  };
  const artworkUrl = artworkFailed
    ? fallbackArtworkUrl(video, FALLBACK_HERO)
    : video.heroImageUrl || video.thumbnailUrl || fallbackArtworkUrl(video, FALLBACK_HERO);

  return (
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <button className="preview-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <img
          src={video.heroImageUrl || video.thumbnailUrl || fallbackArtworkUrl(video, FALLBACK_HERO)}
          alt=""
          onError={() => setArtworkFailed(true)}
          style={{ display: 'none' }}
        />
        <div
          className="preview-modal-backdrop"
          style={{
            backgroundImage: `url(${artworkUrl})`,
          }}
        >
          <div className="preview-modal-backdrop-overlay" />
          <div className="preview-modal-backdrop-content">
            <h2>{video.title}</h2>
            {video.subtitle && <p className="preview-modal-subtitle">{video.subtitle}</p>}
            <div className="preview-modal-actions">
              <button className="preview-modal-play" onClick={handlePlay}>
                <span>▶</span> Play
              </button>
              <button className="preview-modal-list" onClick={() => void toggleFavorite(video.id)}>
                {isFavorite(video.id) ? '✓ In My List' : '+ My List'}
              </button>
            </div>
          </div>
        </div>

        <div className="preview-modal-body">
          <div className="preview-modal-meta">
            {typeof video.rating === 'number' && (
              <span className="preview-modal-rating">
                <span className="star">★</span> {video.rating}
              </span>
            )}
            {video.year && <span>{video.year}</span>}
            {video.duration && (
              <span>{video.contentType === 'SERIES' ? `${video.duration}m/ep` : `${video.duration}m`}</span>
            )}
            {video.ageRating && <span className="age-pill">{video.ageRating}</span>}
            {video.contentType && <span className="type-pill">{video.contentType}</span>}
          </div>

          <p className="preview-modal-description">{video.description}</p>

          {video.genres && video.genres.length > 0 && (
            <div className="preview-modal-genres">
              {video.genres.map((g) => (
                <span key={g} className="genre-tag">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

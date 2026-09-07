import { useNavigate } from 'react-router-dom';
import { FALLBACK_HERO } from '../data/mockData';
import '../styles/MoviePreview.css';

export default function MoviePreview({ video, onClose }) {
  const navigate = useNavigate();

  if (!video) return null;

  const handlePlay = () => {
    onClose();
    navigate(`/player/${video.id}`);
  };

  return (
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <button className="preview-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div
          className="preview-modal-backdrop"
          style={{
            backgroundImage: `url(${video.heroImageUrl || video.thumbnailUrl || FALLBACK_HERO})`,
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
              <button className="preview-modal-list">+ My List</button>
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

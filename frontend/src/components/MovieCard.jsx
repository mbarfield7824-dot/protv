import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FALLBACK_POSTER } from '../data/mockData';
import '../styles/MovieCard.css';

export default function MovieCard({ video, onPreview, onInfo }) {
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);
  const [previewTimeout, setPreviewTimeout] = useState(null);

  const handleMouseEnter = () => {
    const timeout = setTimeout(() => {
      setShowPreview(true);
      if (onPreview) onPreview(video);
    }, 600);
    setPreviewTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (previewTimeout) clearTimeout(previewTimeout);
    setShowPreview(false);
  };

  const handleClick = () => {
    navigate(`/player/${video.id}`);
  };

  return (
    <div
      className="movie-card"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Card Image */}
      <div className="card-image">
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="thumbnail"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = FALLBACK_POSTER;
          }}
        />
        <div className="card-overlay" />
        <div className="card-glow" />
      </div>

      {/* Card Info */}
      <div className="card-info">
        <h3 className="card-title">{video.title}</h3>

        {/* Rating & Metadata */}
        <div className="card-meta">
          <div className="rating">
            <span className="star">★</span>
            {video.rating}
          </div>
          <span className="content-type">{video.contentType}</span>
        </div>

        {/* Play Button */}
        <button className="card-play">
          <span>▶</span>
        </button>
        {onInfo && (
          <button
            className="card-info-btn"
            title="More info"
            onClick={(e) => {
              e.stopPropagation();
              onInfo(video);
            }}
          >
            <span>ⓘ</span>
          </button>
        )}
      </div>

      {/* Hover Preview Info */}
      {showPreview && (
        <div className="card-preview">
          <div className="preview-header">
            <div className="preview-title">{video.title}</div>
            <div className="preview-meta">
              <span className="year">{video.year}</span>
              <span className="duration">{video.duration}m</span>
              <span className="rating-badge">
                <span className="star">★</span> {video.rating}
              </span>
            </div>
          </div>

          <p className="preview-description">{video.description}</p>

          <div className="preview-genres">
            {video.genres.map((genre, idx) => (
              <span key={idx} className="genre-tag">
                {genre}
              </span>
            ))}
          </div>

          <div className="preview-actions">
            <button
              className="preview-play"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/player/${video.id}`);
              }}
            >
              <span>▶</span> Play
            </button>
            <button className="preview-list" onClick={(e) => e.stopPropagation()}>
              +
            </button>
            {onInfo && (
              <button
                className="preview-info"
                onClick={(e) => {
                  e.stopPropagation();
                  onInfo(video);
                }}
              >
                ⓘ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

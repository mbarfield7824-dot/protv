import { useNavigate } from 'react-router-dom';
import { FALLBACK_POSTER } from '../data/mockData';
import '../styles/ContinueWatching.css';

export default function ContinueWatching({ id, items }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <div id={id} className="continue-row">
      <div className="row-header">
        <div className="row-titles">
          <h2 className="row-title">Continue Watching</h2>
        </div>
      </div>

      <div className="continue-carousel">
        {items.map((item) => (
          <div
            key={item.id}
            className="continue-card"
            onClick={() => navigate(`/player/${item.id}`)}
          >
            <div className="continue-image">
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = FALLBACK_POSTER;
                }}
              />
              <div className="continue-overlay" />
              <button className="continue-play-btn" aria-label={`Resume ${item.title}`}>
                <span>▶</span>
              </button>
            </div>

            <div className="continue-info">
              <p className="continue-title">{item.title}</p>
              <p className="continue-meta">
                {item.season && item.episode && `S${item.season} E${item.episode} • `}
                {item.minutesLeft}m left
              </p>
              <div className="continue-progress-track">
                <div
                  className="continue-progress-fill"
                  style={{ width: `${item.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

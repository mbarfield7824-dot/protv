import { useNavigate } from 'react-router-dom';
import { FALLBACK_POSTER } from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import { fallbackArtworkUrl } from '../utils/artwork';

export default function StreamingCard({ video, onInfo, showRemove = false }) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useAuth();
  const saved = isFavorite(video.id);
  const watch = () => navigate(`/player/${video.id}`);
  const meta = [video.genreLabel || video.category, video.year].filter(Boolean).join(' • ');

  const stop = (handler) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  };

  return (
    <article className="ptv-card">
      <div
        className="ptv-card__poster"
        role="button"
        tabIndex={0}
        aria-label={`Watch ${video.title}`}
        onClick={watch}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            watch();
          }
        }}
      >
        <img
          src={video.thumbnailUrl || fallbackArtworkUrl(video, FALLBACK_POSTER)}
          alt={video.title}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = fallbackArtworkUrl(video, FALLBACK_POSTER);
          }}
        />
        <div className="ptv-card__actions">
          <button type="button" className="ptv-card__action ptv-card__action--play" aria-label={`Watch ${video.title}`} onClick={stop(watch)}>
            <span aria-hidden="true">▶</span>
          </button>
          <button
            type="button"
            className={`ptv-card__action ${saved ? 'is-on' : ''}`}
            aria-label={saved ? `Remove ${video.title} from My List` : `Add ${video.title} to My List`}
            aria-pressed={saved}
            onClick={stop(() => void toggleFavorite(video.id))}
          >
            <span aria-hidden="true">{saved ? '✓' : '＋'}</span>
          </button>
          {onInfo && (
            <button type="button" className="ptv-card__action" aria-label={`Details for ${video.title}`} onClick={stop(() => navigate(`/title/${video.id}`))}>
              <span aria-hidden="true">i</span>
            </button>
          )}
        </div>
      </div>
      <h3 className="ptv-card__title">{video.title}</h3>
      {meta && <p className="ptv-card__meta">{meta}</p>}
      {showRemove && saved && (
        <button type="button" className="ptv-card__remove" onClick={() => void toggleFavorite(video.id)}>
          ✕ Remove
        </button>
      )}
    </article>
  );
}

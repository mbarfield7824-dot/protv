import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function SpotlightFeature({ video }) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useAuth();
  if (!video) return null;

  const saved = isFavorite(video.id);
  const runtime = video.duration
    ? `${Math.floor(video.duration / 60) ? `${Math.floor(video.duration / 60)}h ` : ''}${video.duration % 60}m`
    : null;
  const meta = [video.year, runtime, video.genreLabel].filter(Boolean);

  return (
    <section className="ptv-spotlight" aria-labelledby="ptv-spotlight-title">
      <div className="ptv-spotlight__art" aria-hidden="true">
        <img
          src={video.backdrop}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => {
            if (video.backdropFallback && event.currentTarget.src !== video.backdropFallback) {
              event.currentTarget.src = video.backdropFallback;
            }
          }}
        />
      </div>
      <div className="ptv-spotlight__shade" aria-hidden="true" />
      <div className="ptv-spotlight__content">
        <p className="ptv-eyebrow">PROtv Spotlight</p>
        <h2 id="ptv-spotlight-title" className="ptv-spotlight__title">{video.title}</h2>
        {meta.length > 0 && (
          <div className="ptv-meta">
            {meta.map((item) => <span key={item}>{item}</span>)}
          </div>
        )}
        {video.description && <p className="ptv-spotlight__desc">{video.description}</p>}
        <div className="ptv-hero__actions">
          <button type="button" className="ptv-btn ptv-btn--primary ptv-btn--lg" onClick={() => navigate(`/player/${video.id}`)}>
            <span aria-hidden="true">▶</span> Watch Now
          </button>
          <button type="button" className="ptv-btn ptv-btn--ghost ptv-btn--lg" onClick={() => void toggleFavorite(video.id)}>
            <span aria-hidden="true">{saved ? '✓' : '＋'}</span> {saved ? 'In My List' : 'My List'}
          </button>
          <button type="button" className="ptv-btn ptv-btn--quiet ptv-btn--lg" onClick={() => navigate(`/player/${video.id}`)}>
            <span aria-hidden="true">ⓘ</span> More Info
          </button>
        </div>
      </div>
    </section>
  );
}

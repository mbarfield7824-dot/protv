import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fallbackArtworkUrl } from '../utils/artwork';
import { FALLBACK_HERO } from '../data/mockData';
import '../styles/Spotlight.css';

export default function Spotlight({ video }) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useAuth();
  if (!video) return null;

  const artwork = video.heroImageUrl || video.thumbnailUrl || fallbackArtworkUrl(video, FALLBACK_HERO);
  const genre = video.category || video.genre || video.genres?.[0];
  const runtime = video.duration || video.runtime;

  return (
    <section className="spotlight-section" aria-labelledby="spotlight-title">
      <div className="spotlight-art" style={{ backgroundImage: `url(${artwork})` }} />
      <div className="spotlight-overlay" />
      <div className="spotlight-content">
        <p className="section-kicker">PROtv Spotlight</p>
        <h2 id="spotlight-title">{video.title}</h2>
        <div className="spotlight-meta">
          {[video.year, runtime ? `${runtime}m` : null, genre].filter(Boolean).map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
        {video.description && <p>{video.description}</p>}
        <div className="spotlight-actions">
          <button type="button" className="spotlight-primary" onClick={() => navigate(`/player/${video.id}`)}>
            <span aria-hidden="true">▶</span> Watch Now
          </button>
          <button type="button" onClick={() => void toggleFavorite(video.id)}>
            {isFavorite(video.id) ? '✓ In My List' : '+ My List'}
          </button>
          <button type="button" onClick={() => navigate(`/player/${video.id}`)}>More Info</button>
        </div>
      </div>
    </section>
  );
}

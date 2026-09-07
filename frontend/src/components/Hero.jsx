import { useState } from 'react';
import { FALLBACK_HERO } from '../data/mockData';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import '../styles/Hero.css';

export default function Hero({ featured }) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imgError, setImgError] = useState(false);

  if (!featured) return null;

  const slides = Array.isArray(featured) ? featured : [featured];

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
    setImgError(false);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    setImgError(false);
  };

  const current = slides[currentSlide];
  const backdropUrl = imgError ? FALLBACK_HERO : current.heroImageUrl || current.thumbnailUrl;

  return (
    <div className="hero-section">
      {/* Hidden probe image detects load failures so we can swap to the PROtv fallback backdrop */}
      <img
        src={current.heroImageUrl || current.thumbnailUrl}
        alt=""
        className="hero-image-probe"
        onError={() => setImgError(true)}
      />
      <div
        className="hero-background"
        style={{
          backgroundImage: `url(${backdropUrl})`,
        }}
      >
        <div className="hero-overlay" />
        <div className="hero-glow" />
      </div>

      <div className="hero-content">
        <div className="hero-label">TRENDING NOW</div>
        <h1 className="hero-title">{current.title}</h1>
        {current.subtitle && <div className="hero-subtitle">{current.subtitle}</div>}
        <p className="hero-description">{current.description}</p>

        <div className="hero-metadata">
          <span className="meta-item">{current.year}</span>
          <span className="meta-divider">•</span>
          <span className="meta-item">{current.duration}m</span>
          <span className="meta-divider">•</span>
          <span className="meta-item">{current.genres.join(', ')}</span>
          <span className="meta-divider">•</span>
          <span className="meta-rating">
            <span className="rating-star">★</span> {current.rating}
          </span>
        </div>

        <div className="hero-actions">
          <button className="btn-play" onClick={() => navigate(`/player/${current.id}`)}>
            <span className="play-icon">▶</span>
            Watch Now
          </button>
          <button className="btn-list" onClick={() => void toggleFavorite(current.id)}>
            <span className="list-icon">{isFavorite(current.id) ? '✓' : '+'}</span>
            {isFavorite(current.id) ? 'In My List' : 'My List'}
          </button>
        </div>
      </div>

      {slides.length > 1 && (
        <>
          <button className="hero-nav prev" onClick={prevSlide}>
            ‹
          </button>
          <button className="hero-nav next" onClick={nextSlide}>
            ›
          </button>
          <div className="hero-dots">
            {slides.map((_, idx) => (
              <div
                key={idx}
                className={`dot ${idx === currentSlide ? 'active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

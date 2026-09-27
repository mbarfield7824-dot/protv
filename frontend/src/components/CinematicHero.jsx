import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const ROTATE_MS = 9000;

function Backdrop({ src, fallback, active, isTitle, portrait }) {
  const [failed, setFailed] = useState(false);
  const url = failed ? fallback : src;
  return (
    <div className={`ptv-hero__art ${isTitle ? 'is-title' : ''} ${portrait ? 'is-portrait' : ''} ${active ? 'is-active' : ''}`} aria-hidden="true">
      {url && portrait && <img className="ptv-hero__fill" src={url} alt="" decoding="async" />}
      {url && (
        <img
          className="ptv-hero__img"
          src={url}
          alt=""
          decoding="async"
          fetchPriority={active ? 'high' : 'low'}
          loading={active ? 'eager' : 'lazy'}
          onError={() => { if (!failed && fallback) setFailed(true); }}
        />
      )}
    </div>
  );
}

function formatMeta(video) {
  return [
    video.genreLabel,
    video.year,
    video.duration ? `${Math.floor(video.duration / 60) ? `${Math.floor(video.duration / 60)}h ` : ''}${video.duration % 60}m` : null,
    video.ageRating,
  ].filter(Boolean);
}

export default function CinematicHero({ brand, titles = [] }) {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useAuth();
  const slides = [{ kind: 'brand', ...brand }, ...titles.map((video) => ({ kind: 'title', video }))];
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const count = slides.length;
  const go = useCallback((next) => setIndex((next + count) % count), [count]);
  const activeIndex = index % count;

  useEffect(() => {
    if (count < 2 || paused || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setTimeout(() => go(index + 1), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [index, count, paused, go]);

  const current = slides[activeIndex] || slides[0];

  return (
    <section
      className="ptv-hero"
      aria-roledescription="carousel"
      aria-label="Featured on PROtv"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      {slides.map((slide, slideIndex) => (
        <Backdrop
          key={slide.kind === 'brand' ? 'brand' : slide.video.id}
          src={slide.kind === 'brand' ? slide.imageUrl : slide.video.backdrop}
          fallback={slide.kind === 'brand' ? slide.fallbackUrl : slide.video.backdropFallback}
          active={slideIndex === activeIndex}
          isTitle={slide.kind === 'title'}
          portrait={slide.kind === 'brand' && slide.portrait}
        />
      ))}
      <div className="ptv-hero__shade" aria-hidden="true" />

      {current.kind === 'brand' ? (
        <div className="ptv-hero__content" key="brand">
          <p className="ptv-hero__kicker">
            Independent Stories. <strong>Unlimited Possibilities.</strong>
          </p>
          <h1 className="ptv-hero__brand">PRO<span>tv</span></h1>
          <p className="ptv-hero__lede">
            The home for independent films, documentaries,{' '}
            <br />
            Black cinema, anime, music and more.
          </p>
          <div className="ptv-hero__actions">
            <button
              type="button"
              className="ptv-btn ptv-btn--primary ptv-btn--lg"
              onClick={() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <span aria-hidden="true">▶</span> Start Watching
            </button>
            <button type="button" className="ptv-btn ptv-btn--ghost ptv-btn--lg" onClick={() => navigate('/#my-list')}>
              <span aria-hidden="true">＋</span> My List
            </button>
          </div>
        </div>
      ) : (
        <div className="ptv-hero__content is-title" key={current.video.id}>
          <p className="ptv-hero__kicker">Featured on <strong>PROtv</strong></p>
          <h1 className="ptv-hero__title">{current.video.title}</h1>
          <div className="ptv-meta">
            {formatMeta(current.video).map((item) => <span key={item}>{item}</span>)}
          </div>
          {current.video.description && <p className="ptv-hero__desc">{current.video.description}</p>}
          <div className="ptv-hero__actions">
            <button type="button" className="ptv-btn ptv-btn--primary ptv-btn--lg" onClick={() => navigate(`/player/${current.video.id}`)}>
              <span aria-hidden="true">▶</span> Watch Now
            </button>
            <button type="button" className="ptv-btn ptv-btn--ghost ptv-btn--lg" onClick={() => void toggleFavorite(current.video.id)}>
              <span aria-hidden="true">{isFavorite(current.video.id) ? '✓' : '＋'}</span>
              {isFavorite(current.video.id) ? 'In My List' : 'My List'}
            </button>
            <button type="button" className="ptv-btn ptv-btn--quiet ptv-btn--lg" onClick={() => navigate(`/title/${current.video.id}`)}>
              <span aria-hidden="true">ⓘ</span> More Info
            </button>
          </div>
        </div>
      )}

      {current.kind === 'brand' && (
        <p className="ptv-hero__slogan" aria-hidden="true">Real<br />Stories.<br />Real<br />Voices.</p>
      )}

      {count > 1 && (
        <>
          <button type="button" className="ptv-hero__arrow ptv-hero__arrow--prev" aria-label="Previous featured slide" onClick={() => go(index - 1)}>‹</button>
          <button type="button" className="ptv-hero__arrow ptv-hero__arrow--next" aria-label="Next featured slide" onClick={() => go(index + 1)}>›</button>
          <div className="ptv-hero__dots" role="tablist" aria-label="Choose featured slide">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.kind === 'brand' ? 'brand' : slide.video.id}
                type="button"
                role="tab"
                aria-selected={slideIndex === activeIndex}
                aria-label={slide.kind === 'brand' ? 'PROtv brand hero' : slide.video.title}
                className={slideIndex === activeIndex ? 'is-active' : ''}
                onClick={() => go(slideIndex)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

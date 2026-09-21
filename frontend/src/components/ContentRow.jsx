import MovieCard from './MovieCard';
import { useHorizontalScrollState } from '../hooks/useHorizontalScrollState';
import '../styles/ContentRow.css';

export default function ContentRow({ id, title, subtitle, content, viewAllLink, onInfo, showListRemoval = false }) {
  const {
    scrollRef,
    canScrollLeft,
    canScrollRight,
    hasOverflow,
    progress,
    update,
  } = useHorizontalScrollState();

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = Math.max(260, scrollRef.current.clientWidth * 0.82);
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(update, 350);
    }
  };

  return (
    <div id={id} className="content-row">
      <div className="row-header">
        <div className="row-titles">
          <h2 className="row-title">{title}</h2>
          {subtitle && <p className="row-subtitle">{subtitle}</p>}
        </div>
        {viewAllLink && (
          <a href={viewAllLink} className="view-all">
            View All <span>›</span>
          </a>
        )}
        {hasOverflow && (
          <span className="mobile-swipe-hint" aria-hidden="true">
            {canScrollLeft ? '← ' : ''}Swipe to explore{canScrollRight ? ' →' : ''}
          </span>
        )}
      </div>

      <div className={`row-container ${canScrollLeft ? 'has-more-left' : ''} ${canScrollRight ? 'has-more-right' : ''}`}>
        {canScrollLeft && (
          <button className="scroll-btn scroll-left" onClick={() => scroll('left')}>
            ‹
          </button>
        )}

        <div
          className="content-carousel"
          ref={scrollRef}
          aria-label={`${title} titles. Swipe horizontally for more.`}
        >
          {content.map((item) => (
            <div key={item.id} className="carousel-item">
              <MovieCard video={item} onInfo={onInfo} showListRemoval={showListRemoval} />
            </div>
          ))}
        </div>
        {hasOverflow && (
          <div className="mobile-scroll-progress" aria-hidden="true">
            <span style={{ left: `${progress * 0.72}%` }} />
          </div>
        )}

        {canScrollRight && (
          <button className="scroll-btn scroll-right" onClick={() => scroll('right')}>
            ›
          </button>
        )}
      </div>
    </div>
  );
}

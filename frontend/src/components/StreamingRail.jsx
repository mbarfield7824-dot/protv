import { Link } from 'react-router-dom';
import { useHorizontalScrollState } from '../hooks/useHorizontalScrollState';

export default function StreamingRail({ id, title, viewAll, variant = 'poster', children, className = '' }) {
  const { scrollRef, canScrollLeft, canScrollRight } = useHorizontalScrollState();
  const headingId = id ? `${id}-title` : undefined;

  const page = (direction) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section id={id} className={`ptv-rail ptv-rail--${variant} ${className}`} aria-labelledby={headingId}>
      <div className="ptv-rail__head">
        <h2 id={headingId} className="ptv-section-title">{title}</h2>
        {viewAll && (
          viewAll.to
            ? <Link className="ptv-view-all" to={viewAll.to}>{viewAll.label || 'View All'}</Link>
            : <button type="button" className="ptv-view-all" onClick={viewAll.onClick}>{viewAll.label || 'View All'}</button>
        )}
      </div>
      <div className="ptv-rail__viewport">
        {canScrollLeft && (
          <button type="button" className="ptv-rail__arrow ptv-rail__arrow--prev" aria-label={`Scroll ${title} left`} onClick={() => page(-1)}>‹</button>
        )}
        <div className="ptv-rail__track" ref={scrollRef}>
          {children}
        </div>
        {canScrollRight && (
          <button type="button" className="ptv-rail__arrow ptv-rail__arrow--next" aria-label={`Scroll ${title} right`} onClick={() => page(1)}>›</button>
        )}
      </div>
    </section>
  );
}

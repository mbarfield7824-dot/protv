import { useRef, useState } from 'react';
import MovieCard from './MovieCard';
import '../styles/ContentRow.css';

export default function ContentRow({ title, subtitle, content, viewAllLink, onInfo }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScroll, 300);
    }
  };

  return (
    <div className="content-row">
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
      </div>

      <div className="row-container">
        {canScrollLeft && (
          <button className="scroll-btn scroll-left" onClick={() => scroll('left')}>
            ‹
          </button>
        )}

        <div className="content-carousel" ref={scrollRef} onScroll={checkScroll}>
          {content.map((item) => (
            <div key={item.id} className="carousel-item">
              <MovieCard video={item} onInfo={onInfo} />
            </div>
          ))}
        </div>

        {canScrollRight && (
          <button className="scroll-btn scroll-right" onClick={() => scroll('right')}>
            ›
          </button>
        )}
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import StreamingRail from './StreamingRail';

export default function CategoryShowcase({ tiles, activeId }) {
  if (!tiles?.length) return null;

  return (
    <StreamingRail id="categories" title="Browse by Category" variant="category">
      {tiles.map(({ category, artwork, fallback, count }) => (
        <Link
          key={category.id}
          to={`/#${category.id}`}
          className={`ptv-cat ${activeId === category.id ? 'is-active' : ''}`}
          aria-label={`${category.name}, ${count} ${count === 1 ? 'title' : 'titles'}`}
        >
          <img
            src={artwork}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
            }}
          />
          <span className="ptv-cat__shade" aria-hidden="true" />
          <span className="ptv-cat__name">{category.name}</span>
        </Link>
      ))}
    </StreamingRail>
  );
}

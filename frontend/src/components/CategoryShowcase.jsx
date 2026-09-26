import { Link } from 'react-router-dom';
import StreamingRail from './StreamingRail';

export default function CategoryShowcase({ tiles, activeId }) {
  if (!tiles?.length) return null;

  return (
    <StreamingRail id="categories" title="Browse by Category" variant="category">
      {tiles.map(({ category, artwork, fallback, count, comingSoon }) => (
        <Link
          key={category.id}
          to={`/#${category.id}`}
          className={`ptv-cat ${comingSoon ? 'is-coming' : ''} ${activeId === category.id ? 'is-active' : ''}`}
          aria-label={comingSoon
            ? `${category.name}, coming to PROtv`
            : `${category.name}, ${count} ${count === 1 ? 'title' : 'titles'}`}
        >
          {artwork && (
            <img
              src={artwork}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(event) => {
                if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                else event.currentTarget.remove();
              }}
            />
          )}
          <span className="ptv-cat__shade" aria-hidden="true" />
          {comingSoon && <span className="ptv-cat__soon" aria-hidden="true">Coming soon</span>}
          <span className="ptv-cat__name">{category.name.replace(/-/g, '\u2011')}</span>
        </Link>
      ))}
    </StreamingRail>
  );
}

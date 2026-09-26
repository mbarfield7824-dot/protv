import { Link } from 'react-router-dom';
import StreamingRail from './StreamingRail';
import { CATEGORY_SPRITE } from '../data/brandArt';

export default function CategoryShowcase({ tiles, activeId }) {
  if (!tiles?.length) return null;

  return (
    <StreamingRail id="categories" title="Browse by Category" variant="category">
      {tiles.map(({ category, artwork, fallback, count, comingSoon }) => {
        const cell = CATEGORY_SPRITE.cells[category.id];
        return (
          <Link
            key={category.id}
            to={`/#${category.id}`}
            className={`ptv-cat ${cell ? 'ptv-cat--sprite' : ''} ${comingSoon ? 'is-coming' : ''} ${activeId === category.id ? 'is-active' : ''}`}
            aria-label={comingSoon
              ? `${category.name}, coming to PROtv`
              : `${category.name}, ${count} ${count === 1 ? 'title' : 'titles'}`}
          >
            {cell ? (
              <span
                className="ptv-cat__sprite"
                aria-hidden="true"
                style={{
                  backgroundImage: `url(${CATEGORY_SPRITE.url})`,
                  '--col': cell[0],
                  '--row': cell[1],
                }}
              />
            ) : (
              <>
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
                <span className="ptv-cat__name">{category.name.replace(/-/g, '\u2011')}</span>
              </>
            )}
          </Link>
        );
      })}
    </StreamingRail>
  );
}

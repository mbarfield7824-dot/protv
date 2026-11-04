import { Link } from 'react-router-dom';
import { FALLBACK_POSTER } from '../data/mockData';

function premiereLabel(premiereAt) {
  if (!premiereAt) return 'Premiere date to be announced';
  return `Premieres ${new Date(premiereAt).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
  })}`;
}

function availability(item) {
  if (item.comingSoon !== false) return `${premiereLabel(item.premiereAt)}${item.trailerAvailable ? ' • Trailer' : ''}`;
  if (item.kind === 'series') return `${item.episodeCount} ${item.episodeCount === 1 ? 'episode' : 'episodes'}`;
  return item.watchAvailable ? 'Now streaming' : premiereLabel(item.premiereAt);
}

// A discovery card for Coming Soon and PROtv Originals. It opens the title or show page, where Watch Trailer and any
// released playback live. The card itself never starts playback.
export default function ComingSoonCard({ item }) {
  const upcoming = item.comingSoon !== false;
  return (
    <article className={`ptv-card ptv-card--discovery ${upcoming ? 'ptv-card--coming' : ''}`}>
      <Link className="ptv-card__poster" to={item.href}
        aria-label={`${item.title}${item.protvOriginal ? ', a PROtv Original' : ''}${upcoming ? ', coming soon' : ''}. ${availability(item)}.`}>
        <img
          src={item.artwork || FALLBACK_POSTER}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = FALLBACK_POSTER;
          }}
        />
        <span className="ptv-card__badges" aria-hidden="true">
          {item.protvOriginal && <span className="ptv-card__badge ptv-card__badge--original">PROtv Original</span>}
          {upcoming && <span className="ptv-card__badge">Coming Soon</span>}
        </span>
      </Link>
      <h3 className="ptv-card__title"><Link to={item.href}>{item.title}</Link></h3>
      <p className="ptv-card__meta">{availability(item)}</p>
    </article>
  );
}

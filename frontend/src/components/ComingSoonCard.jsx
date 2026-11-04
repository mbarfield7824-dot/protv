import { Link } from 'react-router-dom';
import { FALLBACK_POSTER } from '../data/mockData';

function premiereLabel(premiereAt) {
  if (!premiereAt) return 'Premiere date to be announced';
  return `Premieres ${new Date(premiereAt).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
  })}`;
}

// A Coming Soon title: opens its detail page (Watch Trailer lives there). Never offers playback.
export default function ComingSoonCard({ item }) {
  return (
    <article className="ptv-card ptv-card--coming">
      <Link className="ptv-card__poster" to={item.href} aria-label={`${item.title}, coming soon. ${premiereLabel(item.premiereAt)}.`}>
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
        <span className="ptv-card__badge" aria-hidden="true">Coming Soon</span>
      </Link>
      <h3 className="ptv-card__title"><Link to={item.href}>{item.title}</Link></h3>
      <p className="ptv-card__meta">
        {premiereLabel(item.premiereAt)}{item.trailerAvailable ? ' • Trailer' : ''}
      </p>
    </article>
  );
}

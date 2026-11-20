import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FALLBACK_POSTER } from '../data/mockData';
import TrailerPlayer from './TrailerPlayer';

function premiereLabel(premiereAt) {
  if (!premiereAt) return 'Premiere date TBD';
  return `Premieres ${new Date(premiereAt).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
  })}`;
}

function availability(item) {
  if (item.comingSoon !== false) return `${item.contentType ? `${item.contentType} • ` : ''}${premiereLabel(item.premiereAt)}${item.trailerAvailable ? ' • Trailer' : ''}`;
  if (item.kind === 'series') return `${item.episodeCount} ${item.episodeCount === 1 ? 'episode' : 'episodes'}`;
  return item.watchAvailable ? 'Now streaming' : premiereLabel(item.premiereAt);
}

// A discovery card for Coming Soon and PROtv Originals. It opens the title or show page, where Watch Trailer and any
// released playback live. The card itself never starts full playback. Administrator promotions with a trailer also
// offer Watch Trailer here, and promotions for titles not yet in the catalog have no page to open.
export default function ComingSoonCard({ item }) {
  const [trailerOpen, setTrailerOpen] = useState(false);
  const upcoming = item.comingSoon !== false;
  const label = `${item.title}${item.protvOriginal ? ', a PROtv Original' : ''}${upcoming ? ', coming soon' : ''}. ${availability(item)}.`;
  const poster = (
    <>
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
    </>
  );
  const promotionTrailer = item.promotion && item.trailerAvailable && item.promotionId;
  return (
    <article className={`ptv-card ptv-card--discovery ${upcoming ? 'ptv-card--coming' : ''}`}>
      {item.href
        ? <Link className="ptv-card__poster" to={item.href} aria-label={label}>{poster}</Link>
        : <div className="ptv-card__poster" role="img" aria-label={label}>{poster}</div>}
      <h3 className="ptv-card__title">{item.href ? <Link to={item.href}>{item.title}</Link> : item.title}</h3>
      <p className="ptv-card__meta">{availability(item)}</p>
      {promotionTrailer && (
        <button type="button" className="ptv-card__trailer" onClick={() => setTrailerOpen(true)}
          aria-label={`Watch the ${item.title} trailer`}>
          <span aria-hidden="true">▶</span> Watch Trailer
        </button>
      )}
      {trailerOpen && <TrailerPlayer videoId={item.promotionId} source="promotion" onClose={() => setTrailerOpen(false)} />}
    </article>
  );
}

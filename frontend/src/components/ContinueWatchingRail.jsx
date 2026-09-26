import { useNavigate } from 'react-router-dom';
import StreamingRail from './StreamingRail';

export default function ContinueWatchingRail({ items }) {
  const navigate = useNavigate();
  if (!items?.length) return null;

  return (
    <StreamingRail id="continue-watching" title="Continue Watching" variant="landscape" className="ptv-rail--continue">
      {items.map((item) => {
        const episode = item.season && item.episode ? `S${item.season} E${item.episode}` : null;
        return (
          <article className="ptv-cw" key={item.id}>
            <button
              type="button"
              className="ptv-cw__frame"
              aria-label={`Resume ${item.title}, ${item.minutesLeft} minutes left`}
              onClick={() => navigate(`/player/${item.id}`)}
            >
              <img
                src={item.still || item.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  if (item.thumbnailUrl && event.currentTarget.src !== item.thumbnailUrl) {
                    event.currentTarget.src = item.thumbnailUrl;
                  }
                }}
              />
              <span className="ptv-cw__play" aria-hidden="true">▶</span>
            </button>
            <div className="ptv-cw__info">
              <div>
                <h3>{item.title}</h3>
                {(item.genreLabel || episode) && <p>{episode || item.genreLabel}</p>}
              </div>
              <span className="ptv-cw__left">{item.minutesLeft} min left</span>
            </div>
            <div
              className="ptv-cw__progress"
              role="progressbar"
              aria-label={`${item.title} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.progressPercent}
            >
              <span style={{ width: `${item.progressPercent}%` }} />
            </div>
          </article>
        );
      })}
    </StreamingRail>
  );
}

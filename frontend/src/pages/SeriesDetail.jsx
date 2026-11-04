import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import ProTVFooter from '../components/ProTVFooter';
import ProTVHeader from '../components/ProTVHeader';
import ProTVShell from '../components/ProTVShell';
import { api } from '../api';
import TrailerPlayer from '../components/TrailerPlayer';
import { airingText, premiereText } from '../utils/premiere';
import '../styles/Series.css';

function episodeRuntime(episode) {
  const seconds = Number(episode.runtime || episode.duration);
  return Number.isFinite(seconds) && seconds > 0 ? `${Math.round(seconds / 60)} min` : '';
}

export default function SeriesDetail() {
  const { seriesKey } = useParams();
  const [seriesCatalog, setSeriesCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getSeriesDetails()
      .then((items) => { if (active) setSeriesCatalog(items); })
      .catch((error) => { if (active) setError(error.message); })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const series = useMemo(
    () => seriesCatalog.find((item) => item.key === seriesKey),
    [seriesCatalog, seriesKey],
  );
  const activeSeason = series?.seasons.includes(season) ? season : series?.seasons[0];
  const episodes = series?.episodes.filter((episode) => episode.seasonNumber === activeSeason) || [];

  useEffect(() => {
    if (!series?.episodes.some(episode => episode.releaseAt && !episode.watchAvailable)) return undefined;
    let active = true;
    const timer = window.setInterval(async () => {
      if (!series.episodes.some(episode => episode.releaseAt && !episode.watchAvailable
        && Date.parse(episode.releaseAt) <= Date.now())) return;
      try {
        const items = await api.getSeriesDetails();
        if (active) { setSeriesCatalog(items); setError(''); }
      } catch (error) {
        if (active) setError(error.message);
      }
    }, 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [series]);

  if (loading) {
    return (
      <ProTVShell>
        <ProTVHeader />
        <main className="series-page series-page--state">
          <p className="series-state" role="status">Loading series...</p>
        </main>
        <ProTVFooter />
      </ProTVShell>
    );
  }

  if (!series) {
    return (
      <ProTVShell>
        <ProTVHeader />
        <main className="series-page series-page--state">
          <section className="series-empty">
            <p className="series-kicker">PROtv Series</p>
            <h1>{error || 'Series not found'}</h1>
            <p>This series may no longer be available.</p>
            <Link className="series-button" to="/series">Back to Series</Link>
          </section>
        </main>
        <ProTVFooter />
      </ProTVShell>
    );
  }

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="series-detail">
        {error && <p role="alert">{error}</p>}
        <Link className="series-back" to="/series"><span aria-hidden="true">←</span> All Series</Link>
        <section className={`series-detail-hero ${series.artwork ? '' : 'series-detail-hero--no-art'}`}>
          {series.artwork && <img className="series-detail-hero__art" src={series.artwork} alt="" />}
          <div className="series-detail-hero__shade" />
          <div className="series-detail-hero__copy">
            <p className="series-kicker">{series.comingSoon ? 'Coming Soon to PROtv' : 'PROtv Series'}</p>
            <h1>{series.title}</h1>
            {series.comingSoon && (
              <p className="series-detail-hero__premiere">
                {series.premiereAt
                  ? <time dateTime={series.premiereAt}>{premiereText(series.premiereAt)}</time>
                  : 'Premiere date to be announced'}
                {series.airingSchedule && <><span aria-hidden="true"> · </span>{airingText(series.airingSchedule)}</>}
              </p>
            )}
            {series.description && <p>{series.description}</p>}
            {series.trailerAvailable && (
              <button type="button" className="series-button" onClick={() => setTrailerOpen(true)}>Watch Trailer</button>
            )}
            {series.episodeCount > 0 && <p className="series-detail-hero__meta">
              {series.seasonCount} {series.seasonCount === 1 ? 'season' : 'seasons'}
              <span aria-hidden="true">·</span>
              {series.episodeCount} {series.episodeCount === 1 ? 'episode' : 'episodes'}
              {series.category && <><span aria-hidden="true">·</span>{series.category}</>}
            </p>}
          </div>
        </section>

        {series.episodeCount === 0 ? (
          <section className="series-episodes series-episodes--upcoming" aria-label="Episodes">
            <p className="series-kicker">Episodes</p>
            <p>Episodes will appear here as they premiere.</p>
          </section>
        ) : <section className="series-episodes" aria-label="Episodes">
          <div className="series-episodes__heading">
            <div>
              <p className="series-kicker">Watch the episodes</p>
              <h2>{series.title}</h2>
            </div>
            {series.seasons.length > 1 && (
              <label className="series-season-select">
                <span>Season</span>
                <select
                  value={activeSeason}
                  onChange={(event) => setSeason(Number(event.target.value))}
                >
                  {series.seasons.map((number) => (
                    <option value={number} key={number}>Season {number}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <ol className="series-episode-list">
            {episodes.map((episode) => {
              const title = episode.episodeTitle?.trim() || episode.title;
              const runtime = episodeRuntime(episode);
              const artwork = episode.thumbnailUrl || episode.posterUrl;
              return (
                <li className={`series-episode ${artwork ? 'series-episode--with-art' : ''}`} key={episode.id}>
                  <span className="series-episode__position">
                    S{episode.seasonNumber} · E{episode.episodeNumber}
                  </span>
                  {artwork && (
                    <img className="series-episode__art" src={artwork} alt="" loading="lazy" />
                  )}
                  <div className="series-episode__copy">
                    <h3>{title}</h3>
                    <p className="series-episode__meta">
                      {runtime && <span>{runtime}</span>}
                      {episode.category && <span>{episode.category}</span>}
                    </p>
                    {episode.description && <p className="series-episode__description">{episode.description}</p>}
                  </div>
                  <div className="series-episode__actions">
                    <Link className="series-button series-button--quiet" to={`/title/${episode.id}`}>Details</Link>
                    {episode.watchAvailable ? (
                      <Link className="series-button" to={`/player/${episode.id}`}>▶ Play</Link>
                    ) : episode.releaseAt && (
                      <time dateTime={episode.releaseAt}>Premiere: {new Date(episode.releaseAt).toLocaleString('en-US', {
                        timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short',
                      })} ET</time>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>}
      </main>
      <ProTVFooter />
      {trailerOpen && <TrailerPlayer videoId={series.trailerTitleId} onClose={() => setTrailerOpen(false)} />}
    </ProTVShell>
  );
}

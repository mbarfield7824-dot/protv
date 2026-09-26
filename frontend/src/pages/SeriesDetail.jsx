import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import ProTVFooter from '../components/ProTVFooter';
import ProTVHeader from '../components/ProTVHeader';
import ProTVShell from '../components/ProTVShell';
import { api } from '../api';
import { getSeriesCatalog } from '../utils/seriesCatalog';
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

  useEffect(() => {
    let active = true;
    api.getVideos()
      .then((videos) => {
        const availableEpisodes = videos.filter((video) => (
          video.status === 'ready' && video.muxPlaybackId
        ));
        if (active) setSeriesCatalog(getSeriesCatalog(availableEpisodes));
      })
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
            <h1>Series not found</h1>
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
        <Link className="series-back" to="/series"><span aria-hidden="true">←</span> All Series</Link>
        <section className={`series-detail-hero ${series.artwork ? '' : 'series-detail-hero--no-art'}`}>
          {series.artwork && <img className="series-detail-hero__art" src={series.artwork} alt="" />}
          <div className="series-detail-hero__shade" />
          <div className="series-detail-hero__copy">
            <p className="series-kicker">PROtv Series</p>
            <h1>{series.title}</h1>
            <p className="series-detail-hero__meta">
              {series.seasonCount} {series.seasonCount === 1 ? 'season' : 'seasons'}
              <span aria-hidden="true">·</span>
              {series.episodeCount} {series.episodeCount === 1 ? 'episode' : 'episodes'}
              {series.category && <><span aria-hidden="true">·</span>{series.category}</>}
            </p>
          </div>
        </section>

        <section className="series-episodes" aria-label="Episodes">
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
                    <Link className="series-button" to={`/player/${episode.id}`}>▶ Play</Link>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
      <ProTVFooter />
    </ProTVShell>
  );
}

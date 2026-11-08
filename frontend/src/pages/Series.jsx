import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ProTVFooter from '../components/ProTVFooter';
import ProTVHeader from '../components/ProTVHeader';
import ProTVShell from '../components/ProTVShell';
import { api } from '../api';
import '../styles/Series.css';
import SponsoredNativeBanner from '../components/SponsoredNativeBanner';
import { seriesPath } from '../utils/publicPaths';

function SeriesPresentation({ series }) {
  return (
    <Link className="series-feature" to={seriesPath(series)}>
      <div className={`series-feature__art ${series.artwork ? '' : 'series-feature__art--empty'}`}>
        {series.artwork
          ? <img src={series.artwork} alt="" />
          : <span aria-hidden="true">{series.title}</span>}
        <div className="series-feature__shade" />
        <p className="series-feature__eyebrow">{[series.protvOriginal && 'PROtv Original', series.comingSoon ? 'Coming Soon' : !series.protvOriginal && 'PROtv Series'].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="series-feature__details">
        <div>
          <p className="series-kicker">{series.comingSoon ? 'Coming soon to PROtv' : 'A series to discover'}</p>
          <h2>{series.title}</h2>
          {series.episodeCount > 0 && <p className="series-feature__meta">
            {series.seasonCount} {series.seasonCount === 1 ? 'season' : 'seasons'}
            <span aria-hidden="true">·</span>
            {series.episodeCount} {series.episodeCount === 1 ? 'episode' : 'episodes'}
            {series.category && <><span aria-hidden="true">·</span>{series.category}</>}
          </p>}
        </div>
        <span className="series-feature__enter">{series.comingSoon ? 'See what’s coming' : 'Explore series'} <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

export default function Series() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getSeriesDetails()
      .then((items) => { if (active) setSeries(items); })
      .catch((error) => { if (active) setError(error.message); })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="series-page">
        <header className="series-page__intro">
          <p className="series-kicker">PROtv Collection</p>
          <h1>Series</h1>
          <p>Discover episodic stories streaming on PROtv.</p>
        </header>

        {error ? <p role="alert">{error}</p> : loading ? (
          <p className="series-state" role="status">Discovering series...</p>
        ) : series.length > 0 ? (
          <section className="series-catalog" aria-label="Available series">
            {series.map((item) => <SeriesPresentation key={item.key} series={item} />)}
          </section>
        ) : (
          <section className="series-empty">
            <span className="series-empty__line" aria-hidden="true" />
            <p className="series-kicker">PROtv Series</p>
            <h2>More series are coming to PROtv</h2>
            <p>New episodic stories will appear here as they become available.</p>
          </section>
        )}
        {/* Below the browse grid, once it has loaded. */}
        {!loading && <SponsoredNativeBanner />}
      </main>
      <ProTVFooter />
    </ProTVShell>
  );
}

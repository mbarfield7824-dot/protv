import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { api } from '../api';
import { FALLBACK_POSTER } from '../data/mockData';
import { episodeDetailsFor, getShows } from '../utils/shows';
import '../styles/Shows.css';

export default function ShowDetail() {
  const { slug } = useParams();
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(1);

  useEffect(() => {
    api.getVideos()
      .then((videos) => setShows(getShows(videos.filter((video) => video.status === 'ready' && video.muxPlaybackId))))
      .finally(() => setLoading(false));
  }, []);

  const show = useMemo(() => shows.find((item) => item.slug === slug), [shows, slug]);
  const seasons = useMemo(() => show ? [...new Set(show.episodes.map((episode) => episodeDetailsFor(episode).seasonNumber))].sort((a, b) => a - b) : [], [show]);
  const episodes = useMemo(() => show?.episodes
    .filter((episode) => episodeDetailsFor(episode).seasonNumber === season)
    .sort((a, b) => episodeDetailsFor(a).episodeNumber - episodeDetailsFor(b).episodeNumber) || [], [show, season]);

  if (loading) return <div className="loading">Loading PROtv...</div>;
  if (!show) return <div className="loading">Show not found.</div>;

  return (
    <div className="shows-page">
      <Header />
      <main className="show-detail">
        <Link className="shows-back" to="/shows">← All TV Shows</Link>
        <section className="show-detail-hero">
          <img src={show.poster || FALLBACK_POSTER} alt={`${show.title} poster`} onError={(event) => { event.currentTarget.src = FALLBACK_POSTER; }} />
          <div><p>PROtv Series</p><h1>{show.title}</h1><span>{show.seasons} {show.seasons === 1 ? 'season' : 'seasons'} · {show.episodes.length} episodes</span><p className="show-description">{show.description}</p></div>
        </section>
        <section className="episode-section">
          <div className="season-tabs">{seasons.map((number) => <button className={season === number ? 'active' : ''} key={number} onClick={() => setSeason(number)}>Season {number}</button>)}</div>
          <div className="episode-list">
            {episodes.map((episode) => {
              const details = episodeDetailsFor(episode);
              return <Link className="episode-item" to={`/player/${episode.id}`} key={episode.id}><span className="episode-number">{details.episodeNumber}</span><img src={episode.thumbnailUrl || FALLBACK_POSTER} alt="" /><div><h2>{episode.episodeTitle || episode.title.replace(/\s*S\d+\s*E\d+\s*/i, '')}</h2><p>{episode.description}</p></div><span className="episode-play">▶</span></Link>;
            })}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

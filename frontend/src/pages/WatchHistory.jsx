import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useAuth } from '../hooks/useAuth';
import { mockVideoData, blackCinemaData, independentData, animeData, FALLBACK_POSTER } from '../data/mockData';
import { api } from '../api';
import { useEffect, useState } from 'react';
import '../styles/InfoPages.css';

const CURATED_CATALOG = [...mockVideoData, ...blackCinemaData, ...independentData, ...animeData];

export default function WatchHistory() {
  const navigate = useNavigate();
  const { user, progress, removeProgress, openAuthModal } = useAuth();
  const [apiVideos, setApiVideos] = useState([]);

  useEffect(() => {
    api.getVideos().then((data) => setApiVideos(Array.isArray(data) ? data : []));
  }, []);

  if (!user) {
    return (
      <div className="info-page">
        <Header />
        <main className="info-content">
          <section className="info-hero">
            <p className="info-eyebrow">Your account</p>
            <h1>Sign in to see your watch history.</h1>
            <p className="info-lead">PROtv remembers where you left off once you're signed in.</p>
          </section>
          <section className="info-copy">
            <button type="button" className="info-link-button" onClick={openAuthModal}>Sign In</button>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  const catalog = [...CURATED_CATALOG, ...apiVideos];
  const history = Object.entries(progress || {})
    .map(([videoId, entry]) => {
      const source = catalog.find((video) => video.id === videoId);
      if (!source) return null;
      return {
        id: videoId,
        title: source.title,
        thumbnailUrl: source.thumbnailUrl,
        ...entry,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero">
          <p className="info-eyebrow">Your account</p>
          <h1>Watch History</h1>
          <p className="info-lead">Everything you've started watching, most recent first.</p>
        </section>

        {history.length === 0 ? (
          <section className="info-copy">
            <p>You haven't started watching anything yet.</p>
            <Link className="info-link-button" to="/#trending">Browse Trending</Link>
          </section>
        ) : (
          <section className="watch-history-list">
            {history.map((item) => (
              <div key={item.id} className="watch-history-row">
                <img
                  src={item.thumbnailUrl || FALLBACK_POSTER}
                  alt={item.title}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = FALLBACK_POSTER;
                  }}
                />
                <div className="watch-history-info">
                  <h3>{item.title}</h3>
                  <p>{item.progressPercent >= 95 ? 'Watched' : `${item.progressPercent}% watched`}</p>
                  <div className="watch-history-progress-track">
                    <div className="watch-history-progress-fill" style={{ width: `${item.progressPercent}%` }} />
                  </div>
                </div>
                <div className="watch-history-actions">
                  <button type="button" onClick={() => navigate(`/player/${item.id}`)}>
                    {item.progressPercent >= 95 ? 'Watch Again' : 'Resume'}
                  </button>
                  <button type="button" className="secondary" onClick={() => void removeProgress(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ContentRow from '../components/ContentRow';
import { api } from '../api';
import {
  mockVideoData,
  blackCinemaData,
  independentData,
  animeData,
  FALLBACK_POSTER,
} from '../data/mockData';
import '../styles/Player.css';

const ALL_MOCK_VIDEOS = [...mockVideoData, ...blackCinemaData, ...independentData, ...animeData];

export default function Player() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchVideo();
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchVideo() {
    // First check the curated mock catalog (covers Trending/Black Cinema/
    // Independent/Anime rails), then fall back to the live backend API.
    const mockMatch = ALL_MOCK_VIDEOS.find((v) => v.id === id);
    if (mockMatch) {
      setVideo(mockMatch);
      setLoading(false);
      return;
    }

    try {
      const data = await api.getVideo(id);
      setVideo(data);
    } catch (error) {
      console.error('Failed to load video:', error);
      setVideo(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="player-loading">
        <div className="player-loading-spinner" />
        <p>Loading PROtv...</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="player-loading">
        <p>Video not found.</p>
        <button className="back-btn" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
      </div>
    );
  }

  const hasRealPlayback =
    video.muxPlaybackId && !video.muxPlaybackId.startsWith('demo-playback');

  const related = ALL_MOCK_VIDEOS.filter(
    (v) => v.id !== video.id && v.genres?.some((g) => video.genres?.includes(g))
  ).slice(0, 10);

  return (
    <div className="player-page">
      <Header />

      <div className="player-container">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← Back to Home
        </button>

        <div className="player-main">
          <div className="video-player">
            {hasRealPlayback ? (
              <MuxPlayer
                streamType="on-demand"
                playbackId={video.muxPlaybackId}
                metadata={{ video_title: video.title }}
                accentColor="#4169E1"
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <div
                className="placeholder-player"
                style={{
                  backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url(${
                    video.heroImageUrl || video.thumbnailUrl || FALLBACK_POSTER
                  })`,
                }}
              >
                <div className="placeholder-glow" />
                <button className="placeholder-play-btn" aria-label="Play">
                  <span className="play-icon">▶</span>
                </button>
                <p>Playback coming soon</p>
                <small>Mux streaming will appear here once this title is live</small>
              </div>
            )}
          </div>

          <div className="video-details">
            <h1>{video.title}</h1>

            <div className="meta">
              {video.category && <span className="category-badge">{video.category}</span>}
              {video.year && <span className="meta-pill">{video.year}</span>}
              {video.duration && (
                <span className="meta-pill">
                  {video.contentType === 'SERIES' ? `${video.duration}m/ep` : `${video.duration}m`}
                </span>
              )}
              {video.ageRating && <span className="meta-pill">{video.ageRating}</span>}
              {typeof video.rating === 'number' && (
                <span className="meta-rating">
                  <span className="rating-star">★</span> {video.rating}
                </span>
              )}
              {typeof video.views === 'number' && (
                <span className="views">{video.views.toLocaleString()} views</span>
              )}
            </div>

            {video.genres && video.genres.length > 0 && (
              <div className="genre-tags">
                {video.genres.map((g) => (
                  <span key={g} className="genre-tag">
                    {g}
                  </span>
                ))}
              </div>
            )}

            <p className="description">{video.description}</p>

            <div className="player-actions">
              <button className="action-btn primary">+ My List</button>
              <button className="action-btn">Share</button>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <div className="related-section">
            <ContentRow title="More Like This" content={related} />
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

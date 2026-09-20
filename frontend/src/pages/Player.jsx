import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ContentRow from '../components/ContentRow';
import VastMuxPlayer from '../components/VastMuxPlayer';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { fallbackArtworkUrl } from '../utils/artwork';
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
  const [loadedVideoId, setLoadedVideoId] = useState(null);
  const { user, isFavorite, toggleFavorite, progress, updateProgress } = useAuth();
  const playerRef = useRef(null);
  const resumeAppliedRef = useRef(null);

  const fetchVideo = useCallback(async () => {
    // First check the curated mock catalog (covers Trending/Black Cinema/
    // Independent/Anime rails), then fall back to the live backend API.
    const mockMatch = ALL_MOCK_VIDEOS.find((v) => v.id === id);
    if (mockMatch) {
      setVideo(mockMatch);
      setLoadedVideoId(id);
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
      setLoadedVideoId(id);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(fetchVideo);
    window.scrollTo(0, 0);
  }, [fetchVideo]);

  useEffect(() => {
    const playerEl = playerRef.current;
    const playbackReady = video?.muxPlaybackId && !video.muxPlaybackId.startsWith('demo-playback');
    if (!playerEl || !playbackReady || !user) return undefined;

    const videoId = video.id;

    const applyResume = () => {
      if (resumeAppliedRef.current === videoId) return;
      const saved = progress?.[videoId];
      if (saved?.positionSeconds > 5 && saved.progressPercent < 95) {
        playerEl.currentTime = saved.positionSeconds;
        resumeAppliedRef.current = videoId;
      }
    };

    if (playerEl.readyState >= 1) {
      applyResume();
      return undefined;
    }

    playerEl.addEventListener('loadedmetadata', applyResume);
    return () => playerEl.removeEventListener('loadedmetadata', applyResume);
  }, [progress, user, video]);

  // Saves playback position periodically and before the player is removed.
  useEffect(() => {
    const playerEl = playerRef.current;
    const playbackReady = video?.muxPlaybackId && !video.muxPlaybackId.startsWith('demo-playback');
    if (!playerEl || !playbackReady || !user) return undefined;

    const videoId = video.id;

    const saveProgress = () => {
      const { currentTime, duration } = playerEl;
      if (!duration || Number.isNaN(duration) || currentTime < 1) return;
      void updateProgress(videoId, { positionSeconds: currentTime, durationSeconds: duration });
    };

    let lastSaved = 0;
    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSaved < 15000) return;
      lastSaved = now;
      saveProgress();
    };

    playerEl.addEventListener('timeupdate', handleTimeUpdate);
    playerEl.addEventListener('pause', saveProgress);

    return () => {
      playerEl.removeEventListener('timeupdate', handleTimeUpdate);
      playerEl.removeEventListener('pause', saveProgress);
      saveProgress();
    };
  }, [video, user, updateProgress]);

  if (loading || loadedVideoId !== id) {
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
  const category = video.category || video.genre;
  const duration = video.runtime || (video.duration ? Math.round(video.duration / 60) : 0);
  const genres = video.genres?.length ? video.genres : [category].filter(Boolean);
  const maturityRating = video.maturityRating || video.ageRating;

  const related = ALL_MOCK_VIDEOS.filter(
    (v) => v.id !== video.id && v.genres?.some((g) => genres.includes(g))
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
              <VastMuxPlayer video={video} playerRef={playerRef} />
            ) : (
              <div
                className="placeholder-player"
                style={{
                  backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url(${
                    video.heroImageUrl || video.thumbnailUrl || fallbackArtworkUrl(video, FALLBACK_POSTER)
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
              {category && <span className="category-badge">{category}</span>}
              {video.year && <span className="meta-pill">{video.year}</span>}
              {duration > 0 && (
                <span className="meta-pill">
                  {video.contentType === 'SERIES' ? `${duration}m/ep` : `${duration}m`}
                </span>
              )}
              {maturityRating && <span className="meta-pill">{maturityRating}</span>}
              {typeof video.rating === 'number' && (
                <span className="meta-rating">
                  <span className="rating-star">★</span> {video.rating}
                </span>
              )}
              {typeof video.views === 'number' && (
                <span className="views">{video.views.toLocaleString()} views</span>
              )}
            </div>

            {genres.length > 0 && (
              <div className="genre-tags">
                {genres.map((g) => (
                  <span key={g} className="genre-tag">
                    {g}
                  </span>
                ))}
              </div>
            )}

            <p className="description">{video.description}</p>

            {(video.cast || video.creator || video.language || video.subtitles) && (
              <dl className="metadata-details">
                {video.cast && <div><dt>Cast</dt><dd>{video.cast}</dd></div>}
                {video.creator && <div><dt>Creator / Director</dt><dd>{video.creator}</dd></div>}
                {video.language && <div><dt>Language</dt><dd>{video.language}</dd></div>}
                {video.subtitles && <div><dt>Subtitles</dt><dd>{video.subtitles}</dd></div>}
              </dl>
            )}

            <div className="player-actions">
              <button className="action-btn primary" onClick={() => void toggleFavorite(video.id)}>
                {isFavorite(video.id) ? '✓ In My List' : '+ My List'}
              </button>
              {video.trailerUrl && (
                <a className="action-btn" href={video.trailerUrl} target="_blank" rel="noreferrer">
                  Watch Trailer
                </a>
              )}
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

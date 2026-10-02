import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import ContentRow from '../components/ContentRow';
import VastMuxPlayer from '../components/VastMuxPlayer';
import { api } from '../api';
import { podcastParentUrl } from '../data/playerCatalog';
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
  const location = useLocation();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedVideoId, setLoadedVideoId] = useState(null);
  const [error, setError] = useState('');
  const { user, isFavorite, toggleFavorite, progress, updateProgress } = useAuth();
  const playerRef = useRef(null);
  const resumeAppliedRef = useRef(null);
  const request = useRef(0);
  const activeRequest = useRef(null);
  const podcastHandoff = Boolean(location.state?.podcastShowId);
  const isPodcast = video?.contentType === 'PODCAST_EPISODE';
  const parentShowId = loadedVideoId === id && isPodcast
    ? video.podcastShowId : location.state?.podcastShowId;
  const goBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
      return;
    }
    navigate('/');
  };
  const playerChrome = (
    <div className="player-chrome">
      <button className="player-back" type="button" onClick={goBack}>
        <span aria-hidden="true">←</span> Back
      </button>
      <Link className="player-brand" to="/" aria-label="PROtv home">
        PRO<span>tv</span>
      </Link>
      <span className="player-chrome__spacer" aria-hidden="true" />
    </div>
  );

  const fetchVideo = useCallback(async () => {
    const current = ++request.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    // First check the curated mock catalog (covers Trending/Black Cinema/
    // Independent/Anime rails), then fall back to the live backend API.
    const mockMatch = !podcastHandoff && ALL_MOCK_VIDEOS.find((v) => v.id === id
      && !['PODCAST_SHOW', 'PODCAST_EPISODE'].includes(v.contentType));
    if (mockMatch) {
      setVideo(mockMatch);
      setLoadedVideoId(id);
      setLoading(false);
      setError('');
      return;
    }

    try {
      const data = await api.getPlayerTitle(id, { signal: controller.signal });
      if (request.current === current) {
        setVideo(data);
        setError('');
      }
    } catch (error) {
      if (request.current === current) {
        console.error('Failed to load video:', error);
        setError(error.message);
        setVideo(null);
      }
    } finally {
      if (request.current === current) {
        setLoadedVideoId(id);
        setLoading(false);
      }
    }
  }, [id, podcastHandoff]);

  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => { if (!disposed) void fetchVideo(); });
    window.scrollTo(0, 0);
    return () => {
      disposed = true;
      request.current += 1;
      activeRequest.current?.abort();
    };
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
      <div className="player-page player-page--state">
        {playerChrome}
        <main className="player-loading" role="status">
          <div className="player-loading-spinner" />
          <p>Loading PROtv...</p>
        </main>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="player-page player-page--state">
        {playerChrome}
        <main className="player-loading player-not-found" role={error ? 'alert' : undefined}>
          <h1>{error ? 'Playback is unavailable right now.' : 'Video unavailable'}</h1>
          <p>{error || 'This Episode or title, or its parent Show, may no longer be available.'}</p>
          {error && (
            <button className="player-back player-back--state" type="button" onClick={() => {
              setLoading(true);
              void fetchVideo();
            }}>Try Again</button>
          )}
          <Link className="player-back" to={podcastParentUrl(parentShowId)}>
            {parentShowId ? 'Return to Show' : 'Browse Podcasts'}
          </Link>
          <button className="player-back player-back--state" onClick={goBack}>
            ← Back
          </button>
        </main>
      </div>
    );
  }

  const hasRealPlayback =
    video.muxPlaybackId && !video.muxPlaybackId.startsWith('demo-playback');
  const category = video.category || video.genre;
  const duration = video.runtime || (video.duration ? Math.round(video.duration / 60) : 0);
  const genres = [...new Set([...(video.genres || []), category, video.subgenre].filter(Boolean))];
  const maturityRating = video.maturityRating || video.ageRating;
  const isEpisode = video.contentType === 'EPISODE';
  const episodePosition = [
    video.seasonNumber !== undefined && video.seasonNumber !== null && video.seasonNumber !== ''
      ? `S${video.seasonNumber}`
      : '',
    video.episodeNumber !== undefined && video.episodeNumber !== null && video.episodeNumber !== ''
      ? `E${video.episodeNumber}`
      : '',
  ].filter(Boolean).join(' · ');

  const related = isPodcast ? [] : ALL_MOCK_VIDEOS.filter(
    (v) => v.id !== video.id && v.genres?.some((g) => genres.includes(g))
  ).slice(0, 10);

  return (
    <div className="player-page">
      {playerChrome}

      <div className="player-container">
        <div
          className="player-main"
          style={{
            '--detail-backdrop': `url(${video.heroImageUrl || video.thumbnailUrl || fallbackArtworkUrl(video, FALLBACK_POSTER)})`,
          }}
        >
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
            {isPodcast && (
              <>
                <Link className="player-back" to={podcastParentUrl(video.podcastShowId)}>Return to Show</Link>
                <p className="episode-position">Podcast Episode {video.episodeNumber}</p>
              </>
            )}
            {isEpisode && video.seriesTitle && <p className="episode-series">{video.seriesTitle}</p>}
            {isEpisode && episodePosition && <p className="episode-position">{episodePosition}</p>}
            <h1>{isEpisode && video.episodeTitle ? video.episodeTitle : video.title}</h1>
            {isEpisode && video.episodeTitle && video.episodeTitle !== video.title && (
              <p className="episode-video-title">{video.title}</p>
            )}

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

            {video.description && <p className="description">{video.description}</p>}

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
              <a
                className="action-btn report-content-btn"
                href={`mailto:support@watchprotv.com?subject=${encodeURIComponent(`Report Content: ${video.title}`)}&body=${encodeURIComponent(`I would like to report the following content:\n\nTitle: ${video.title}\nVideo ID: ${video.id}\n\nReason for report:\n`)}`}
              >
                Report Content
              </a>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <div className="related-section">
            <ContentRow title="More Like This" content={related} />
          </div>
        )}
      </div>

    </div>
  );
}

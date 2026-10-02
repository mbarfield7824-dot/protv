import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import ProTVFooter from '../components/ProTVFooter';
import { api } from '../api';
import {
  mockVideoData,
  blackCinemaData,
  independentData,
  animeData,
  FALLBACK_POSTER,
} from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import { fallbackArtworkUrl } from '../utils/artwork';
import { safetyReportUrl } from '../data/safetyReports';
import '../styles/Title.css';

const ALL_MOCK_VIDEOS = [...mockVideoData, ...blackCinemaData, ...independentData, ...animeData];

function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export default function Title() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedId, setLoadedId] = useState(null);
  const [failedArtworkId, setFailedArtworkId] = useState(null);
  const { isFavorite, toggleFavorite } = useAuth();

  const loadTitle = useCallback(async () => {
    setLoading(true);
    setVideo(null);
    setLoadedId(null);

    const mockMatch = ALL_MOCK_VIDEOS.find((item) => item.id === id);
    if (mockMatch) {
      setVideo(mockMatch);
      setLoadedId(id);
      setLoading(false);
      return;
    }

    try {
      const result = await api.getVideo(id);
      setVideo(result);
    } catch (error) {
      console.error('Failed to load title details:', error);
      setVideo(null);
    } finally {
      setLoadedId(id);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(loadTitle);
  }, [loadTitle]);

  if (loading || loadedId !== id) {
    return (
      <ProTVShell>
        <ProTVHeader />
        <main className="title-page title-page--loading" role="status" aria-label="Loading title">
          <div className="title-loading-art" />
          <div className="title-loading-copy">
            <span />
            <span />
            <span />
          </div>
        </main>
        <ProTVFooter />
      </ProTVShell>
    );
  }

  if (!video) {
    return (
      <ProTVShell>
        <ProTVHeader />
        <main className="title-page title-page--state">
          <section className="title-state">
            <p className="title-eyebrow">PROtv Collection</p>
            <h1>Title not found</h1>
            <p>This title may no longer be available.</p>
            <Link to="/movies" className="title-action title-action--secondary">Browse PROtv</Link>
          </section>
        </main>
        <ProTVFooter />
      </ProTVShell>
    );
  }

  const category = video.category || video.genre;
  const genres = [...new Set([...(video.genres || []), category, video.subgenre].filter(present))];
  const duration = video.runtime || (video.duration ? Math.round(video.duration / 60) : 0);
  const maturityRating = video.maturityRating || video.ageRating;
  const creator = video.creator || video.director;
  const isEpisode = video.contentType === 'EPISODE';
  const episodeNumber = present(video.episodeNumber) ? `E${video.episodeNumber}` : '';
  const seasonNumber = present(video.seasonNumber) ? `S${video.seasonNumber}` : '';
  const episodePosition = [seasonNumber, episodeNumber].filter(Boolean).join(' · ');
  const posterUrl = video.thumbnailUrl || video.posterUrl || fallbackArtworkUrl(video, FALLBACK_POSTER);
  const hasLandscapeArtwork = failedArtworkId !== id
    && present(video.heroImageUrl)
    && video.heroImageUrl !== video.thumbnailUrl
    && video.heroImageUrl !== video.posterUrl;

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className={`title-page ${hasLandscapeArtwork ? 'title-page--landscape' : 'title-page--poster'}`}>
        <section className="title-hero">
          {hasLandscapeArtwork ? (
            <img
              className="title-hero__backdrop"
              src={video.heroImageUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.onerror = null;
                setFailedArtworkId(id);
              }}
            />
          ) : (
            <div className="title-hero__poster-wrap">
              <img
                className="title-hero__poster"
                src={failedArtworkId === id ? fallbackArtworkUrl(video, FALLBACK_POSTER) : posterUrl}
                alt={`${video.title} poster`}
                onError={() => setFailedArtworkId(id)}
              />
            </div>
          )}

          <div className="title-hero__content">
            <p className="title-eyebrow">
              {isEpisode ? 'PROtv Episode' : 'PROtv Collection'}
            </p>
            {isEpisode && present(video.seriesTitle) && (
              <p className="title-series">{video.seriesTitle}</p>
            )}
            {isEpisode && episodePosition && <p className="title-episode-position">{episodePosition}</p>}
            <h1>{video.title}</h1>
            {isEpisode && present(video.episodeTitle) && video.episodeTitle !== video.title && (
              <p className="title-episode-title">{video.episodeTitle}</p>
            )}

            <div className="title-meta">
              {present(video.year) && <span>{video.year}</span>}
              {present(category) && <span>{category}</span>}
              {duration > 0 && <span>{duration} min</span>}
              {present(maturityRating) && <span>{maturityRating}</span>}
              {typeof video.rating === 'number' && <span>★ {video.rating}</span>}
            </div>

            {genres.length > 0 && (
              <div className="title-genres">
                {genres.map((genre) => <span key={genre}>{genre}</span>)}
              </div>
            )}

            {present(video.description) && <p className="title-description">{video.description}</p>}

            <div className="title-actions">
              <button
                type="button"
                className="title-action title-action--primary"
                onClick={() => navigate(`/player/${video.id}`)}
              >
                <span aria-hidden="true">▶</span> Watch Now
              </button>
              <button
                type="button"
                className="title-action title-action--secondary"
                aria-pressed={isFavorite(video.id)}
                onClick={() => void toggleFavorite(video.id)}
              >
                {isFavorite(video.id) ? '✓ In My List' : '+ My List'}
              </button>
              <Link
                className="title-action title-action--secondary"
                to={safetyReportUrl('content', {
                  targetId: video.id,
                  targetUrl: `${window.location.origin}${window.location.pathname}`,
                  targetDescription: `Title: ${video.title}`,
                })}
              >
                Report this title
              </Link>
            </div>
          </div>
        </section>

        {(present(creator) || present(video.cast) || present(video.language) || present(video.subtitles)) && (
          <section className="title-credits" aria-label="Additional information">
            {present(creator) && <div><h2>Creator / Director</h2><p>{creator}</p></div>}
            {present(video.cast) && <div><h2>Cast</h2><p>{video.cast}</p></div>}
            {present(video.language) && <div><h2>Language</h2><p>{video.language}</p></div>}
            {present(video.subtitles) && <div><h2>Subtitles</h2><p>{video.subtitles}</p></div>}
          </section>
        )}
      </main>
      <ProTVFooter />
    </ProTVShell>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { CATEGORY_SUBGENRES, UPLOAD_CATEGORY_OPTIONS } from '../data/categories';
import { episodeDetailsFor, seriesTitleFor } from '../utils/shows';

function catalogCategory(video) {
  return video.category || video.genre || video.categories?.[0] || 'General';
}

function normalizeCatalogVideo(video) {
  const isEpisode = video.contentType === 'EPISODE' || Boolean(seriesTitleFor(video));
  const details = episodeDetailsFor(video);
  return {
    ...video,
    category: catalogCategory(video),
    contentType: isEpisode ? 'EPISODE' : 'MOVIE',
    seriesTitle: video.seriesTitle || seriesTitleFor(video),
    seasonNumber: video.seasonNumber || (isEpisode ? details.seasonNumber : ''),
    episodeNumber: video.episodeNumber || (isEpisode ? details.episodeNumber : ''),
    episodeTitle: video.episodeTitle || '',
  };
}

export default function AdminCatalogEditor() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [refreshingRatings, setRefreshingRatings] = useState(false);
  const [ratingStatus, setRatingStatus] = useState('');
  const [savedId, setSavedId] = useState(null);

  const loadVideos = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getAdminAllVideos();
      if (!Array.isArray(response)) throw new Error(response.error || 'Unable to load catalog.');
      setVideos(response.map(normalizeCatalogVideo));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api.getAdminAllVideos()
      .then((response) => {
        if (!Array.isArray(response)) throw new Error(response.error || 'Unable to load catalog.');
        if (active) setVideos(response.map(normalizeCatalogVideo));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateDraft = (id, field, value) => {
    setVideos((items) =>
      items.map((video) => (video.id === id ? { ...video, [field]: value } : video))
    );
  };

  const saveVideo = async (video) => {
    setSavingId(video.id);
    setSavedId(null);
    setError('');
    try {
      const savedVideo = await api.updateVideoMetadata(video.id, {
        title: video.title.trim(),
        description: video.description || '',
        category: catalogCategory(video),
        subgenre: video.subgenre || '',
        thumbnailUrl: video.thumbnailUrl || '',
        year: video.year || '',
        maturityRating: video.maturityRating || video.ageRating || '',
        cast: video.cast || '',
        creator: video.creator || '',
        language: video.language || '',
        subtitles: video.subtitles || video.subtitleInfo || '',
        trailerUrl: video.trailerUrl || '',
        contentType: video.contentType,
        seriesTitle: video.seriesTitle || '',
        seasonNumber: video.seasonNumber || '',
        episodeNumber: video.episodeNumber || '',
        episodeTitle: video.episodeTitle || '',
      });
      setVideos((items) => items.map((item) => (
        item.id === video.id ? normalizeCatalogVideo(savedVideo) : item
      )));
      setSavedId(video.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingId(null);
    }
  };

  const removeUnpublishedVideo = async (video) => {
    if (!window.confirm(`Remove "${video.title}" from the unpublished catalog? This cannot be undone.`)) {
      return;
    }
    setSavingId(video.id);
    setError('');
    try {
      await api.deleteUnpublishedVideo(video.id);
      setVideos((items) => items.filter((item) => item.id !== video.id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingId(null);
    }
  };

  const refreshImdbRatings = async () => {
    setRefreshingRatings(true);
    setError('');
    setRatingStatus('');
    const failures = [];

    for (const [index, video] of videos.entries()) {
      setRatingStatus(`Refreshing IMDb ratings: ${index + 1} of ${videos.length}`);
      try {
        const rating = await api.refreshImdbRating(video.id);
        setVideos((items) => items.map((item) => (
          item.id === video.id ? { ...item, ...rating } : item
        )));
      } catch (requestError) {
        failures.push(`${video.title}: ${requestError.message}`);
      }
    }

    setRefreshingRatings(false);
    setRatingStatus(
      failures.length
        ? `IMDb refresh completed with ${failures.length} unmatched title${failures.length === 1 ? '' : 's'}.`
        : 'IMDb ratings refreshed.'
    );
    if (failures.length) setError(failures.join(' '));
  };

  if (loading) return <p className="admin-subtitle">Loading catalog...</p>;

  return (
    <section className="catalog-editor">
      <div className="catalog-editor-heading">
        <div>
          <h2>Edit Catalog Metadata</h2>
          <p>Rename uploaded videos without re-uploading or changing their Mux playback.</p>
        </div>
        <div className="catalog-editor-heading-actions">
          <button
            className="admin-secondary"
            disabled={refreshingRatings}
            onClick={() => void refreshImdbRatings()}
          >
            {refreshingRatings ? 'Refreshing IMDb...' : 'Refresh IMDb Ratings'}
          </button>
          <button className="admin-refresh-btn" onClick={() => void loadVideos()}>Refresh</button>
        </div>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {ratingStatus && <p className="admin-subtitle">{ratingStatus}</p>}
      {videos.map((video) => (
        <article className="catalog-editor-item" key={video.id}>
          <label>
            Title
            <input value={video.title || ''} onChange={(event) => updateDraft(video.id, 'title', event.target.value)} />
          </label>
          <label>
            Description
            <textarea rows={2} value={video.description || ''} onChange={(event) => updateDraft(video.id, 'description', event.target.value)} />
          </label>
          <label>
            Category
            <select
              value={catalogCategory(video)}
              onChange={(event) => {
                updateDraft(video.id, 'category', event.target.value);
                updateDraft(video.id, 'subgenre', '');
              }}
            >
              {UPLOAD_CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
              {!UPLOAD_CATEGORY_OPTIONS.includes(catalogCategory(video)) && (
                <option>{catalogCategory(video)}</option>
              )}
            </select>
          </label>
          {CATEGORY_SUBGENRES[video.category]?.length > 0 && (
            <label>
              Subcategory
              <select value={video.subgenre || ''} onChange={(event) => updateDraft(video.id, 'subgenre', event.target.value)}>
                <option value="">Select a subcategory</option>
                {CATEGORY_SUBGENRES[video.category].map((subcategory) => (
                  <option key={subcategory}>{subcategory}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Poster image URL
            <input
              type="url"
              placeholder="https://example.com/poster.jpg"
              value={video.thumbnailUrl || ''}
              onChange={(event) => updateDraft(video.id, 'thumbnailUrl', event.target.value)}
            />
          </label>
          <label>
            Release Year
            <input min="1888" max="2100" type="number" value={video.year || ''} onChange={(event) => updateDraft(video.id, 'year', event.target.value)} />
          </label>
          <label>
            Maturity Rating
            <input value={video.maturityRating || ''} onChange={(event) => updateDraft(video.id, 'maturityRating', event.target.value)} placeholder="e.g. PG-13" />
          </label>
          <label>
            Cast
            <input value={video.cast || ''} onChange={(event) => updateDraft(video.id, 'cast', event.target.value)} placeholder="Names, separated by commas" />
          </label>
          <label>
            Creator / Director
            <input value={video.creator || ''} onChange={(event) => updateDraft(video.id, 'creator', event.target.value)} />
          </label>
          <label>
            Primary Language
            <input value={video.language || ''} onChange={(event) => updateDraft(video.id, 'language', event.target.value)} placeholder="e.g. English" />
          </label>
          <label>
            Subtitles
            <input value={video.subtitles || ''} onChange={(event) => updateDraft(video.id, 'subtitles', event.target.value)} placeholder="e.g. English, Spanish" />
          </label>
          <label>
            Trailer Link
            <input type="url" value={video.trailerUrl || ''} onChange={(event) => updateDraft(video.id, 'trailerUrl', event.target.value)} placeholder="https://youtube.com/…" />
          </label>
          {typeof video.rating === 'number' && (
            <p className="catalog-imdb-rating">
              IMDb: ★ {video.rating.toFixed(1)}
              {video.ratingCount > 0 ? ` (${video.ratingCount.toLocaleString()} votes)` : ''}
            </p>
          )}
          <label>
            Format
            <select value={video.contentType || 'MOVIE'} onChange={(event) => updateDraft(video.id, 'contentType', event.target.value)}>
              <option value="MOVIE">Movie</option>
              <option value="EPISODE">TV Episode</option>
            </select>
          </label>
          {video.contentType === 'EPISODE' && (
            <>
              <label>
                Series title
                <input value={video.seriesTitle || ''} onChange={(event) => updateDraft(video.id, 'seriesTitle', event.target.value)} />
              </label>
              <label>
                Season
                <input min="1" type="number" value={video.seasonNumber || ''} onChange={(event) => updateDraft(video.id, 'seasonNumber', event.target.value)} />
              </label>
              <label>
                Episode
                <input min="1" type="number" value={video.episodeNumber || ''} onChange={(event) => updateDraft(video.id, 'episodeNumber', event.target.value)} />
              </label>
              <label>
                Episode title <span className="optional">(optional)</span>
                <input value={video.episodeTitle || ''} onChange={(event) => updateDraft(video.id, 'episodeTitle', event.target.value)} />
              </label>
            </>
          )}
          <div className="catalog-editor-actions">
            <button className="admin-secondary" disabled={!video.title?.trim() || savingId === video.id} onClick={() => void saveVideo(video)}>
              {savingId === video.id ? 'Saving...' : 'Save'}
            </button>
            {savedId === video.id && <span role="status">Saved</span>}
            {(video.status !== 'ready' || !video.muxPlaybackId) && (
              <button className="catalog-delete-button" disabled={savingId === video.id} onClick={() => void removeUnpublishedVideo(video)}>
                Remove unpublished
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

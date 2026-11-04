import { useEffect, useState } from 'react';
import { validateEpisodeMetadata } from '../admin/episodeMetadata';
import { api } from '../api';
import { CATEGORY_SUBGENRES, MUSIC_FORMAT_OPTIONS, UPLOAD_CATEGORY_OPTIONS } from '../data/categories';
import { isPodcast } from '../admin/podcastAdmin';
import TrailerPlayer from './TrailerPlayer';

function catalogCategory(video) {
  return video.category || video.genre || video.categories?.[0] || 'General';
}

function normalizeCatalogVideo(video) {
  return {
    ...video,
    category: catalogCategory(video),
  };
}

function validateCatalogVideo(video) {
  const errors = validateEpisodeMetadata(video);
  if (video.contentType === 'MUSIC') {
    if (!MUSIC_FORMAT_OPTIONS.some((option) => option.value === video.musicFormat)) {
      errors.musicFormat = 'Select a valid Music format.';
    }
    if (typeof video.rightsHolder !== 'string' || !video.rightsHolder.trim()) {
      errors.rightsHolder = 'Rights holder is required for Music.';
    }
    if (typeof video.rightsVerificationNotes !== 'string' || !video.rightsVerificationNotes.trim()) {
      errors.rightsVerificationNotes = 'Rights verification notes are required for Music.';
    }
  }
  return errors;
}

export default function AdminCatalogEditor() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [refreshingRatings, setRefreshingRatings] = useState(false);
  const [ratingStatus, setRatingStatus] = useState('');
  const [savedId, setSavedId] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [posterUpload, setPosterUpload] = useState({ id: null, message: '', failed: false });
  const [trailerUpload, setTrailerUpload] = useState({ id: null, message: '', failed: false });
  const [trailerPreviewId, setTrailerPreviewId] = useState(null);
  const [creatingShow, setCreatingShow] = useState(false);

  const createShow = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setCreatingShow(true);
    setError('');
    try {
      const record = await api.createSeriesTrailerRecord(Object.fromEntries(new FormData(form)));
      setVideos(items => [...items, normalizeCatalogVideo(record)]);
      form.reset();
    } catch (error) {
      setError(error.message);
    } finally {
      setCreatingShow(false);
    }
  };

  const loadVideos = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getAdminAllVideos();
      if (!Array.isArray(response)) throw new Error(response.error || 'Unable to load catalog.');
      setVideos(response.filter((video) => !isPodcast(video)).map(normalizeCatalogVideo));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadTrailer = async (video, file) => {
    if (!file) return;
    setTrailerUpload({ id: video.id, message: 'Preparing secure trailer upload...', failed: false });
    try {
      const { uploadUrl } = await api.createTitleTrailerUpload(video.id);
      setTrailerUpload({ id: video.id, message: 'Uploading trailer (0%)...', failed: false });
      await api.uploadFileToMux(uploadUrl, file, (progress) => {
        setTrailerUpload({ id: video.id, message: `Uploading trailer (${progress}%)...`, failed: false });
      });

      const deadline = Date.now() + 15 * 60 * 1000;
      let result;
      do {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        result = await api.getTitleTrailerStatus(video.id);
        if (result.status === 'errored') throw new Error(result.error || 'Mux could not process the trailer.');
      } while (result.status === 'processing' && Date.now() < deadline);
      if (result.status !== 'ready' || !result.available) {
        throw new Error('Trailer processing is taking longer than expected. Refresh the catalog to check again.');
      }
      setVideos((items) => items.map((item) => item.id === video.id
        ? { ...item, trailerStatus: 'ready', trailerAvailable: true, trailerUrl: '' } : item));
      setTrailerUpload({ id: video.id, message: 'Trailer uploaded and ready for preview.', failed: false });
    } catch (uploadError) {
      setTrailerUpload({ id: video.id, message: uploadError.message, failed: true });
    }
  };

  const removeTrailer = async (video) => {
    if (!window.confirm(`Remove the trailer for "${video.title}"?`)) return;
    setTrailerUpload({ id: video.id, message: 'Removing trailer...', failed: false });
    try {
      await api.deleteTitleTrailer(video.id);
      setVideos((items) => items.map((item) => item.id === video.id
        ? { ...item, trailerStatus: null, trailerAvailable: false, trailerUrl: '' } : item));
      setTrailerUpload({ id: video.id, message: 'Trailer removed.', failed: false });
    } catch (removeError) {
      setTrailerUpload({ id: video.id, message: removeError.message, failed: true });
    }
  };

  useEffect(() => {
    let active = true;
    api.getAdminAllVideos()
      .then((response) => {
        if (!Array.isArray(response)) throw new Error(response.error || 'Unable to load catalog.');
        if (active) setVideos(response.filter((video) => !isPodcast(video)).map(normalizeCatalogVideo));
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

  const pendingTrailerIds = videos
    .filter((video) => video.trailerUploadStatus === 'processing' && video.id !== trailerUpload.id)
    .map((video) => video.id).join(',');

  useEffect(() => {
    if (!pendingTrailerIds) return undefined;
    const ids = pendingTrailerIds.split(',');
    const poll = async () => {
      const results = await Promise.allSettled(ids.map((id) => api.getTitleTrailerStatus(id)));
      const statuses = new Map(results.filter((result) => result.status === 'fulfilled')
        .map((result) => [result.value.videoId, result.value]));
      if (statuses.size) {
        setVideos((items) => items.map((item) => {
          const result = statuses.get(item.id);
          if (!result || (item.trailerStatus === result.status && item.trailerError === result.error)) return item;
          return {
            ...item,
            trailerUploadStatus: ['processing', 'errored'].includes(result.status) ? result.status : null,
            ...(result.available ? { trailerStatus: 'ready' } : {}),
            trailerError: result.error,
            trailerAvailable: result.available,
          };
        }));
      }
    };
    const timer = window.setInterval(() => { void poll(); }, 4000);
    return () => window.clearInterval(timer);
  }, [pendingTrailerIds]);

  const updateDraft = (id, field, value) => {
    const currentVideo = videos.find((video) => video.id === id);
    const updatedVideo = {
      ...currentVideo,
      [field]: value,
      ...(field === 'contentType' ? {
        musicFormat: '',
        seriesTitle: '',
        seasonNumber: value === 'EPISODE' ? '' : null,
        episodeNumber: value === 'EPISODE' ? '' : null,
        episodeTitle: '',
      } : {}),
    };
    setVideos((items) => items.map((video) => (
      video.id === id ? updatedVideo : video
    )));
    setValidationErrors((current) => ({
      ...current,
      [id]: validateCatalogVideo(updatedVideo),
    }));
  };

  // Stores a durable copy and updates the title immediately; the draft is
  // synced so a later Save does not send the old link back.
  const uploadPoster = async (video, file) => {
    if (!file) return;
    setPosterUpload({ id: video.id, message: 'Uploading poster...', failed: false });
    try {
      const { posterUrl } = await api.uploadTitlePoster(video.id, file);
      setVideos((items) => items.map((item) => (
        item.id === video.id ? { ...item, posterUrl, thumbnailUrl: posterUrl } : item
      )));
      setPosterUpload({ id: video.id, message: 'Poster uploaded and saved.', failed: false });
    } catch (uploadError) {
      setPosterUpload({ id: video.id, message: uploadError.message, failed: true });
    }
  };

  const saveVideo = async (video) => {
    const errors = validateCatalogVideo(video);
    setValidationErrors((current) => ({ ...current, [video.id]: errors }));
    if (Object.keys(errors).length > 0) return;

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
        ...(video.contentType ? { contentType: video.contentType } : {}),
        ...(video.contentType === 'MUSIC' ? {
          musicFormat: video.musicFormat,
          rightsHolder: video.rightsHolder,
          rightsVerificationNotes: video.rightsVerificationNotes,
        } : {}),
        ...(video.contentType === 'EPISODE' ? {
          seriesTitle: video.seriesTitle?.trim() || '',
          seasonNumber: video.seasonNumber || '',
          episodeNumber: video.episodeNumber || '',
          episodeTitle: video.episodeTitle || '',
        } : {}),
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
          <p>Podcast Shows and Episodes are managed in the Podcasts tab.</p>
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
      <details>
        <summary>Add a show-level trailer record</summary>
        <p>Creates a separate draft, preserving all existing episodes. Upload its trailer and poster below, then approve it in Review Content after reviewing trailer rights.</p>
        <form onSubmit={createShow}>
          <label>Show title<input name="seriesTitle" required maxLength={200} /></label>
          <label>Show synopsis<textarea name="description" required /></label>
          <label>Trailer rights holder<input name="rightsHolder" required /></label>
          <label>Trailer rights evidence<textarea name="rightsVerificationNotes" required /></label>
          <button type="submit" className="admin-secondary" disabled={creatingShow}>Create show draft</button>
        </form>
      </details>
      {videos.map((video) => (
        <article className="catalog-editor-item" key={video.id}>
          <header className="catalog-record-heading">
            <h3>{video.title || 'Untitled content'}</h3>
            <span className="admin-status-pill" data-approval-status={video.approvalStatus}>{video.approvalStatus || 'draft'}</span>
          </header>
          <label>
            Title
            <input value={video.title || ''} onChange={(event) => updateDraft(video.id, 'title', event.target.value)} />
          </label>
          <label className="admin-field-wide">
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
          <label className="admin-field-wide">
            Poster image URL
            <input
              type="url"
              placeholder="https://example.com/poster.jpg"
              value={video.thumbnailUrl || ''}
              onChange={(event) => updateDraft(video.id, 'thumbnailUrl', event.target.value)}
            />
          </label>
          <div className="admin-field-wide admin-poster-upload">
            {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" className="admin-poster-preview" />}
            <label>
              Upload poster image <span className="optional">(PNG or JPEG, recommended)</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={posterUpload.id === video.id && posterUpload.message === 'Uploading poster...'}
                onChange={(event) => { void uploadPoster(video, event.target.files?.[0]); event.target.value = ''; }}
              />
            </label>
            <small>Uploaded posters are stored permanently by PROtv. Links to other sites can expire or be removed.</small>
            {posterUpload.id === video.id && posterUpload.message && (
              <span className={posterUpload.failed ? 'admin-error' : 'admin-subtitle'} role={posterUpload.failed ? 'alert' : 'status'}>
                {posterUpload.message}
              </span>
            )}
          </div>
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
            Existing Trailer Link
            <input type="url" value={video.trailerUrl || ''} onChange={(event) => updateDraft(video.id, 'trailerUrl', event.target.value)} placeholder="https://youtube.com/…" />
          </label>
          <div className="admin-field-wide admin-poster-upload">
            <label>
              Upload secure trailer
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                disabled={trailerUpload.id === video.id && /^(Preparing|Uploading|Removing)/.test(trailerUpload.message)}
                onChange={(event) => { void uploadTrailer(video, event.target.files?.[0]); event.target.value = ''; }}
              />
            </label>
            <small>Trailers are uploaded directly to Mux with signed playback. Public playback is available only after title approval.</small>
            {video.trailerStatus === 'ready' && (
              <div className="admin-actions">
                <button className="admin-secondary" type="button" onClick={() => setTrailerPreviewId(video.id)}>Preview trailer</button>
                <button className="admin-secondary" type="button" onClick={() => void removeTrailer(video)}>Remove trailer</button>
              </div>
            )}
            {video.trailerError && (
              <span className="admin-error" role="alert">{video.trailerError}</span>
            )}
            {trailerUpload.id === video.id && trailerUpload.message && (
              <span className={trailerUpload.failed ? 'admin-error' : 'admin-subtitle'} role={trailerUpload.failed ? 'alert' : 'status'}>
                {trailerUpload.message}
              </span>
            )}
          </div>
          {typeof video.rating === 'number' && (
            <p className="catalog-imdb-rating">
              IMDb: ★ {video.rating.toFixed(1)}
              {video.ratingCount > 0 ? ` (${video.ratingCount.toLocaleString()} votes)` : ''}
            </p>
          )}
          <label>
            Format
            <select disabled={video.contentType === 'SERIES'} value={video.contentType || 'MOVIE'} onChange={(event) => updateDraft(video.id, 'contentType', event.target.value)}>
              <option value="MOVIE">Movie</option>
              <option value="EPISODE">TV Episode</option>
              <option value="MUSIC">Music</option>
              {video.contentType === 'SERIES' && <option value="SERIES">TV Show trailer</option>}
            </select>
          </label>
          {video.contentType === 'MUSIC' && (
            <>
              <label>
                Music format
                <select
                  value={video.musicFormat || ''}
                  onChange={(event) => updateDraft(video.id, 'musicFormat', event.target.value)}
                  aria-invalid={Boolean(validationErrors[video.id]?.musicFormat)}
                >
                  <option value="">Select a music format</option>
                  {MUSIC_FORMAT_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {validationErrors[video.id]?.musicFormat && (
                  <span className="admin-error" role="alert">{validationErrors[video.id].musicFormat}</span>
                )}
              </label>
              <label>
                Rights holder
                <input
                  value={video.rightsHolder || ''}
                  onChange={(event) => updateDraft(video.id, 'rightsHolder', event.target.value)}
                  aria-invalid={Boolean(validationErrors[video.id]?.rightsHolder)}
                />
                {validationErrors[video.id]?.rightsHolder && (
                  <span className="admin-error" role="alert">{validationErrors[video.id].rightsHolder}</span>
                )}
              </label>
              <label>
                Rights verification notes
                <textarea
                  rows={3}
                  value={video.rightsVerificationNotes || ''}
                  onChange={(event) => updateDraft(video.id, 'rightsVerificationNotes', event.target.value)}
                  aria-invalid={Boolean(validationErrors[video.id]?.rightsVerificationNotes)}
                />
                {validationErrors[video.id]?.rightsVerificationNotes && (
                  <span className="admin-error" role="alert">{validationErrors[video.id].rightsVerificationNotes}</span>
                )}
              </label>
            </>
          )}
          {video.contentType === 'EPISODE' && (
            <>
              <label>
                Series title
                <input
                  value={video.seriesTitle || ''}
                  onChange={(event) => updateDraft(video.id, 'seriesTitle', event.target.value)}
                  aria-invalid={Boolean(validationErrors[video.id]?.seriesTitle)}
                />
                {validationErrors[video.id]?.seriesTitle && (
                  <span className="admin-error" role="alert">{validationErrors[video.id].seriesTitle}</span>
                )}
              </label>
              <label>
                Season
                <input
                  min="1"
                  step="1"
                  type="number"
                  value={video.seasonNumber ?? ''}
                  onChange={(event) => updateDraft(video.id, 'seasonNumber', event.target.value)}
                  aria-invalid={Boolean(validationErrors[video.id]?.seasonNumber)}
                />
                {validationErrors[video.id]?.seasonNumber && (
                  <span className="admin-error" role="alert">{validationErrors[video.id].seasonNumber}</span>
                )}
              </label>
              <label>
                Episode
                <input
                  min="1"
                  step="1"
                  type="number"
                  value={video.episodeNumber ?? ''}
                  onChange={(event) => updateDraft(video.id, 'episodeNumber', event.target.value)}
                  aria-invalid={Boolean(validationErrors[video.id]?.episodeNumber)}
                />
                {validationErrors[video.id]?.episodeNumber && (
                  <span className="admin-error" role="alert">{validationErrors[video.id].episodeNumber}</span>
                )}
              </label>
              <label>
                Episode title <span className="optional">(optional)</span>
                <input value={video.episodeTitle || ''} onChange={(event) => updateDraft(video.id, 'episodeTitle', event.target.value)} />
              </label>
            </>
          )}
          <div className="catalog-editor-actions">
            <button className="admin-secondary admin-button-primary" disabled={!video.title?.trim() || savingId === video.id} onClick={() => void saveVideo(video)}>
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
      {trailerPreviewId && (
        <TrailerPlayer videoId={trailerPreviewId} admin onClose={() => setTrailerPreviewId(null)} />
      )}
    </section>
  );
}

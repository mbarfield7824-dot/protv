import { useEffect, useState } from 'react';
import { api } from '../api';
import { episodeDetailsFor, seriesTitleFor } from '../utils/shows';

const CATEGORY_OPTIONS = ['Comedy', 'Action', 'Documentary', 'Horror', 'Drama', 'AI Cinema', 'Food', 'Sports'];

export default function AdminCatalogEditor() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);

  const loadVideos = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getAdminAllVideos();
      if (!Array.isArray(response)) throw new Error(response.error || 'Unable to load catalog.');
      setVideos(response);
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
        if (active) setVideos(response.map((video) => {
          const isEpisode = video.contentType === 'EPISODE' || Boolean(seriesTitleFor(video));
          const details = episodeDetailsFor(video);
          return {
            ...video,
            contentType: isEpisode ? 'EPISODE' : 'MOVIE',
            seriesTitle: video.seriesTitle || seriesTitleFor(video),
            seasonNumber: video.seasonNumber || (isEpisode ? details.seasonNumber : ''),
            episodeNumber: video.episodeNumber || (isEpisode ? details.episodeNumber : ''),
            episodeTitle: video.episodeTitle || '',
          };
        }));
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
    setError('');
    try {
      await api.updateVideoMetadata(video.id, {
        title: video.title.trim(),
        description: video.description || '',
        category: video.category || 'Comedy',
        thumbnailUrl: video.thumbnailUrl || '',
        contentType: video.contentType,
        seriesTitle: video.seriesTitle || '',
        seasonNumber: video.seasonNumber || '',
        episodeNumber: video.episodeNumber || '',
        episodeTitle: video.episodeTitle || '',
      });
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

  if (loading) return <p className="admin-subtitle">Loading catalog...</p>;

  return (
    <section className="catalog-editor">
      <div className="catalog-editor-heading">
        <div>
          <h2>Edit Catalog Metadata</h2>
          <p>Rename uploaded videos without re-uploading or changing their Mux playback.</p>
        </div>
        <button className="admin-refresh-btn" onClick={() => void loadVideos()}>Refresh</button>
      </div>
      {error && <p className="admin-error">{error}</p>}
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
            <select value={video.category || 'Comedy'} onChange={(event) => updateDraft(video.id, 'category', event.target.value)}>
              {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
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

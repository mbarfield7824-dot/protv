import { useEffect, useState } from 'react';
import { api } from '../api';

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
        if (active) setVideos(response);
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
      });
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
          <button className="admin-secondary" disabled={!video.title?.trim() || savingId === video.id} onClick={() => void saveVideo(video)}>
            {savingId === video.id ? 'Saving...' : 'Save'}
          </button>
        </article>
      ))}
    </section>
  );
}

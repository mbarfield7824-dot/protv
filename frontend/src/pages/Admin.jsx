import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import AdminContentForm from '../components/AdminContentForm';
import AdminContentReview from '../components/AdminContentReview';
import AdminCatalogEditor from '../components/AdminCatalogEditor';
import AdminBotPanel from '../components/AdminBotPanel';
import DistributorIngestionPanel from '../components/DistributorIngestionPanel';
import AdminAssistantPanel from '../admin/AdminAssistantPanel';
import { api } from '../api';
import { UPLOAD_CATEGORY_OPTIONS } from '../data/categories';
import { useAuth } from '../hooks/useAuth';
import '../styles/Admin.css';
import '../styles/AdminContent.css';

const BULK_UPLOAD_CONCURRENCY = 3;

function titleFromFileName(name) {
  return name.replace(/\.[^/.]+$/, '');
}

export default function Admin() {
  const { user, loading, isAdmin, adminLoading, openAuthModal } = useAuth();
  const [mode, setMode] = useState('file'); // 'file' | 'url' | 'bulk' | 'add-content' | 'review-content'
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: UPLOAD_CATEGORY_OPTIONS[0],
    thumbnailUrl: '',
    sourceUrl: '',
    year: '',
    maturityRating: '',
    cast: '',
    creator: '',
    language: '',
    subtitles: '',
    trailerUrl: '',
    contentType: 'MOVIE',
    seriesTitle: '',
    seasonNumber: 1,
    episodeNumber: 1,
  });
  const [file, setFile] = useState(null);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkMetadata, setBulkMetadata] = useState([]);
  const [bulkUploads, setBulkUploads] = useState([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | uploading | processing | ready | errored
  const [videoId, setVideoId] = useState(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const bulkPollRef = useRef(null);

  useEffect(
    () => () => {
      clearInterval(pollRef.current);
      clearInterval(bulkPollRef.current);
    },
    []
  );

  const activateOwnerAccess = async () => {
    setError('');
    try {
      await api.claimOwnerAdmin();
      await user.getIdToken(true);
      window.location.reload();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (!loading && !user) {
    return (
      <div className="admin-page">
        <Header />
        <main className="admin-content">
          <h1 className="admin-title">Sign in to manage content</h1>
          <p className="admin-subtitle">
            Use your PROtv account to upload authorized videos and manage the catalog.
          </p>
          <button className="admin-tab active" onClick={openAuthModal}>
            Sign In
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading PROtv...</div>;
  }

  if (user && adminLoading) {
    return <div className="loading">Checking account permissions...</div>;
  }

  if (user && !isAdmin) {
    return (
      <div className="admin-page">
        <Header />
        <main className="admin-content">
          <h1 className="admin-title">Owner access required</h1>
          <p className="admin-subtitle">
            Content management is restricted to the PROtv owner account.
          </p>
          {error && <p className="admin-error">{error}</p>}
          <button className="admin-tab active" onClick={() => void activateOwnerAccess()}>
            Activate Owner Access
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  const updateField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const selectBulkFiles = (files) => {
    const selectedFiles = Array.from(files || []);
    setBulkFiles(selectedFiles);
    setBulkMetadata(
      selectedFiles.map((selectedFile, index) => ({
        id: `${index}-${selectedFile.name}`,
        title: titleFromFileName(selectedFile.name),
        episodeNumber: index + 1,
      }))
    );
  };

  const updateBulkTitle = (id, title) => {
    setBulkMetadata((items) =>
      items.map((item) => (item.id === id ? { ...item, title } : item))
    );
  };

  const updateBulkEpisodeNumber = (id, episodeNumber) => {
    setBulkMetadata((items) =>
      items.map((item) => (item.id === id ? { ...item, episodeNumber } : item))
    );
  };

  const startPolling = (id) => {
    setVideoId(id);
    setStatus('processing');
    pollRef.current = setInterval(async () => {
      try {
        const video = await api.getVideoStatus(id);
        if (video.status === 'ready') {
          setStatus('ready');
          clearInterval(pollRef.current);
        } else if (video.status === 'errored') {
          setStatus('errored');
          clearInterval(pollRef.current);
        }
      } catch {
        // ignore transient poll failures
      }
    }, 4000);
  };

  const handleFileSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Please choose a video file.');
      return;
    }
    try {
      setStatus('uploading');
      const { videoId: id, uploadUrl, error: apiError } = await api.getUploadUrl(form);
      if (apiError) throw new Error(apiError);

      await api.uploadFileToMux(uploadUrl, file, setProgress);
      startPolling(id);
    } catch (err) {
      setError(err.message || 'Upload failed');
      setStatus('idle');
    }
  };

  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.sourceUrl.trim()) {
      setError('Please paste a video file URL.');
      return;
    }
    try {
      setStatus('uploading');
      const { videoId: id, error: apiError } = await api.addVideoFromUrl(form);
      if (apiError) throw new Error(apiError);
      startPolling(id);
    } catch (err) {
      setError(err.message || 'Ingestion failed');
      setStatus('idle');
    }
  };

  const updateBulkUpload = (id, update) => {
    setBulkUploads((uploads) =>
      uploads.map((upload) => (upload.id === id ? { ...upload, ...update } : upload))
    );
  };

  const pollBulkUploads = (uploads) => {
    clearInterval(bulkPollRef.current);
    bulkPollRef.current = setInterval(async () => {
      const processingUploads = uploads.filter(
        (upload) => upload.videoId && upload.status === 'processing'
      );
      const results = await Promise.allSettled(
        processingUploads.map(async (upload) => ({
          id: upload.id,
          video: await api.getVideoStatus(upload.videoId),
        }))
      );

      let allFinished = true;
      results.forEach((result) => {
        if (result.status !== 'fulfilled') {
          allFinished = false;
          return;
        }
        const { id, video } = result.value;
        if (video.status === 'ready' || video.status === 'errored') {
          const upload = uploads.find((item) => item.id === id);
          if (upload) upload.status = video.status;
          updateBulkUpload(id, { status: video.status });
        } else {
          allFinished = false;
        }
      });

      if (allFinished) {
        clearInterval(bulkPollRef.current);
      }
    }, 4000);
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (bulkFiles.length === 0) {
      setError('Please choose one or more video files.');
      return;
    }
    if (bulkMetadata.some((item) => !item.title.trim())) {
      setError('Every episode needs a title before uploading.');
      return;
    }

    const uploads = bulkFiles.map((selectedFile, index) => ({
      id: bulkMetadata[index].id,
      file: selectedFile,
      title: bulkMetadata[index].title.trim(),
      progress: 0,
      status: 'queued',
      videoId: null,
    }));
    setBulkUploads(uploads);
    setStatus('bulk-uploading');

    let nextIndex = 0;
    const uploadOne = async () => {
      while (nextIndex < uploads.length) {
        const upload = uploads[nextIndex];
        nextIndex += 1;
        upload.status = 'uploading';
        updateBulkUpload(upload.id, { status: upload.status });

        try {
          const response = await api.getUploadUrl({
            title: upload.title,
            description: form.description,
            category: form.category,
            thumbnailUrl: form.thumbnailUrl,
            year: form.year,
            maturityRating: form.maturityRating,
            cast: form.cast,
            creator: form.creator,
            language: form.language,
            subtitles: form.subtitles,
            trailerUrl: form.trailerUrl,
            contentType: 'EPISODE',
            seriesTitle: form.seriesTitle,
            seasonNumber: form.seasonNumber,
            episodeNumber: Number(bulkMetadata.find((item) => item.id === upload.id).episodeNumber),
            episodeTitle: upload.title,
          });
          if (response.error) throw new Error(response.error);

          upload.videoId = response.videoId;
          updateBulkUpload(upload.id, { videoId: response.videoId });
          await api.uploadFileToMux(response.uploadUrl, upload.file, (progressValue) =>
            updateBulkUpload(upload.id, { progress: progressValue })
          );
          upload.status = 'processing';
          updateBulkUpload(upload.id, { progress: 100, status: upload.status });
        } catch (err) {
          upload.status = 'errored';
          updateBulkUpload(upload.id, {
            status: upload.status,
            error: err.message || 'Upload failed',
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(BULK_UPLOAD_CONCURRENCY, uploads.length) }, uploadOne)
    );
    pollBulkUploads(uploads);
  };

  const reset = () => {
    clearInterval(pollRef.current);
    clearInterval(bulkPollRef.current);
    setForm({ title: '', description: '', category: UPLOAD_CATEGORY_OPTIONS[0], thumbnailUrl: '', sourceUrl: '', year: '', maturityRating: '', cast: '', creator: '', language: '', subtitles: '', trailerUrl: '', contentType: 'MOVIE', seriesTitle: '', seasonNumber: 1, episodeNumber: 1 });
    setFile(null);
    setBulkFiles([]);
    setBulkMetadata([]);
    setBulkUploads([]);
    setProgress(0);
    setStatus('idle');
    setVideoId(null);
    setError('');
  };

  const handleContentFormSubmit = async (formData) => {
    try {
      setError('');
      // Submit structured content to backend
      const response = await api.addVideo(formData);
      if (response.error) throw new Error(response.error);
      setStatus('ready');
      setVideoId(response.videoId);
      // Could also trigger a toast or modal here
    } catch (err) {
      setError(err.message || 'Failed to submit content');
      throw err;
    }
  };

  return (
    <div className="admin-page">
      <Header />

      <div className={`admin-content ${['admin-bot', 'distributor-ingestion', 'assistant'].includes(mode) ? 'admin-content-wide' : ''}`}>
        <h1 className="admin-title">
          {mode === 'admin-bot'
            ? 'Public Domain Admin Bot'
            : mode === 'distributor-ingestion'
              ? 'Distributor Ingestion Adapter'
              : mode === 'assistant'
                ? 'Administrator Assistant'
              : 'Add a Real Movie'}
        </h1>
        <p className="admin-subtitle">
          {mode === 'admin-bot'
            ? 'Safely prepare and publish new Public Domain movies from your approved content folder.'
            : mode === 'distributor-ingestion'
              ? 'Import licensed titles from a secure distributor feed with rights and playback checks.'
              : mode === 'assistant'
                ? 'Ask operational questions or prepare confirmed catalog metadata and poster corrections.'
              : 'Upload a video file directly, or paste a link to a file already hosted online. Mux transcodes it in the background — this page will update automatically when it is ready.'}
        </p>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${mode === 'file' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('file');
            }}
          >
            📁 Upload File
          </button>
          <button
            className={`admin-tab ${mode === 'url' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('url');
            }}
          >
            🔗 Paste URL
          </button>
          <button
            className={`admin-tab ${mode === 'bulk' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('bulk');
            }}
          >
            🗂️ Upload Season
          </button>
          <button
            className={`admin-tab ${mode === 'add-content' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('add-content');
            }}
          >
            ➕ Add Content (With Rights)
          </button>
          <button
            className={`admin-tab ${mode === 'review-content' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('review-content');
            }}
          >
            📋 Review Content
          </button>
          <button
            className={`admin-tab ${mode === 'edit-catalog' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('edit-catalog');
            }}
          >
            ✏️ Edit Catalog
          </button>
          <button
            className={`admin-tab ${mode === 'admin-bot' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('admin-bot');
            }}
          >
            Public Domain Bot
          </button>
          <button
            className={`admin-tab ${mode === 'distributor-ingestion' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('distributor-ingestion');
            }}
          >
            Distributor Feed
          </button>
          <button
            className={`admin-tab ${mode === 'assistant' ? 'active' : ''}`}
            onClick={() => {
              reset();
              setMode('assistant');
            }}
          >
            Assistant
          </button>
        </div>

        {status === 'idle' && (mode === 'file' || mode === 'url') && (
          <form
            className="admin-form"
            onSubmit={mode === 'file' ? handleFileSubmit : handleUrlSubmit}
          >
            <label>
              Title
              <input value={form.title} onChange={updateField('title')} required />
            </label>

            <label>
              Description <span className="optional">(optional)</span>
              <textarea value={form.description} onChange={updateField('description')} rows={3} />
            </label>

            <label>
              Category
              <select value={form.category} onChange={updateField('category')}>
                {UPLOAD_CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Poster / Thumbnail URL <span className="optional">(optional)</span>
              <input value={form.thumbnailUrl} onChange={updateField('thumbnailUrl')} placeholder="https://…" />
            </label>
            <div className="admin-form-row">
              <label>
                Release Year <span className="optional">(optional)</span>
                <input min="1888" max="2100" type="number" value={form.year} onChange={updateField('year')} placeholder="e.g. 1960" />
              </label>
              <label>
                Maturity Rating <span className="optional">(optional)</span>
                <select value={form.maturityRating} onChange={updateField('maturityRating')}>
                  <option value="">Not rated</option>
                  <option value="G">G</option>
                  <option value="PG">PG</option>
                  <option value="PG-13">PG-13</option>
                  <option value="R">R</option>
                  <option value="NC-17">NC-17</option>
                  <option value="TV-Y">TV-Y</option>
                  <option value="TV-Y7">TV-Y7</option>
                  <option value="TV-G">TV-G</option>
                  <option value="TV-PG">TV-PG</option>
                  <option value="TV-14">TV-14</option>
                  <option value="TV-MA">TV-MA</option>
                </select>
              </label>
            </div>
            <div className="admin-form-row">
              <label>
                Cast <span className="optional">(optional)</span>
                <input value={form.cast} onChange={updateField('cast')} placeholder="Names, separated by commas" />
              </label>
              <label>
                Creator / Director <span className="optional">(optional)</span>
                <input value={form.creator} onChange={updateField('creator')} placeholder="Creator, director, or host" />
              </label>
            </div>
            <div className="admin-form-row">
              <label>
                Primary Language <span className="optional">(optional)</span>
                <input value={form.language} onChange={updateField('language')} placeholder="e.g. English" />
              </label>
              <label>
                Subtitles <span className="optional">(optional)</span>
                <input value={form.subtitles} onChange={updateField('subtitles')} placeholder="e.g. English, Spanish" />
              </label>
            </div>
            <label>
              Trailer Link <span className="optional">(optional)</span>
              <input type="url" value={form.trailerUrl} onChange={updateField('trailerUrl')} placeholder="https://youtube.com/…" />
            </label>
            <label>
              Format
              <select value={form.contentType} onChange={updateField('contentType')}>
                <option value="MOVIE">Movie</option>
                <option value="EPISODE">TV Episode</option>
              </select>
            </label>
            {form.contentType === 'EPISODE' && (
              <>
                <label>
                  Series Title
                  <input value={form.seriesTitle} onChange={updateField('seriesTitle')} required />
                </label>
                <label>
                  Season Number
                  <input min="1" type="number" value={form.seasonNumber} onChange={updateField('seasonNumber')} required />
                </label>
                <label>
                  Episode Number
                  <input min="1" type="number" value={form.episodeNumber} onChange={updateField('episodeNumber')} required />
                </label>
              </>
            )}

            {mode === 'file' ? (
              <label>
                Video File
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
              </label>
            ) : (
              <label>
                Video File URL
                <input
                  value={form.sourceUrl}
                  onChange={updateField('sourceUrl')}
                  placeholder="https://cdn.example.com/movie.mp4"
                  required
                />
              </label>
            )}

            {error && <p className="admin-error">{error}</p>}

            <button type="submit" className="admin-submit">
              {mode === 'file' ? 'Upload & Process' : 'Ingest Video'}
            </button>
          </form>
        )}

        {status === 'idle' && mode === 'bulk' && (
         <form className="admin-form" onSubmit={handleBulkSubmit}>
           <label>
             Series Title
             <input value={form.seriesTitle} onChange={updateField('seriesTitle')} required />
           </label>
           <label>
             Season Number
             <input min="1" type="number" value={form.seasonNumber} onChange={updateField('seasonNumber')} required />
           </label>
           <label>
             Shared Description <span className="optional">(optional)</span>
             <textarea value={form.description} onChange={updateField('description')} rows={3} />
           </label>
           <div className="admin-form-row">
             <label>
               Release Year <span className="optional">(optional)</span>
               <input min="1888" max="2100" type="number" value={form.year} onChange={updateField('year')} />
             </label>
             <label>
               Maturity Rating <span className="optional">(optional)</span>
               <input value={form.maturityRating} onChange={updateField('maturityRating')} placeholder="e.g. TV-PG" />
             </label>
           </div>
           <div className="admin-form-row">
             <label>
               Cast <span className="optional">(optional)</span>
               <input value={form.cast} onChange={updateField('cast')} placeholder="Names, separated by commas" />
             </label>
             <label>
               Creator / Director <span className="optional">(optional)</span>
               <input value={form.creator} onChange={updateField('creator')} />
             </label>
           </div>
           <div className="admin-form-row">
             <label>
               Primary Language <span className="optional">(optional)</span>
               <input value={form.language} onChange={updateField('language')} />
             </label>
             <label>
               Subtitles <span className="optional">(optional)</span>
               <input value={form.subtitles} onChange={updateField('subtitles')} />
             </label>
           </div>
           <label>
             Trailer Link <span className="optional">(optional)</span>
             <input type="url" value={form.trailerUrl} onChange={updateField('trailerUrl')} placeholder="https://youtube.com/…" />
           </label>

           <label>
             Category
             <select value={form.category} onChange={updateField('category')}>
               {UPLOAD_CATEGORY_OPTIONS.map((c) => (
                 <option key={c} value={c}>
                   {c}
                 </option>
               ))}
             </select>
           </label>

           <label>
             Poster / Thumbnail URL <span className="optional">(optional)</span>
             <input value={form.thumbnailUrl} onChange={updateField('thumbnailUrl')} placeholder="https://…" />
           </label>

           <label>
             Episode Video Files
             <input
               type="file"
               accept="video/*"
               multiple
               onChange={(e) => selectBulkFiles(e.target.files)}
               required
             />
             <span className="admin-file-help">
               Review and edit titles before uploading. {bulkFiles.length} file
               {bulkFiles.length === 1 ? '' : 's'} selected.
             </span>
           </label>
           {bulkMetadata.length > 0 && (
             <div className="bulk-metadata-editor">
               <h2>Episode Titles</h2>
               {bulkMetadata.map((item, index) => (
                 <div className="bulk-episode-metadata" key={item.id}>
                   <label>
                     Episode {index + 1} Title
                     <input value={item.title} onChange={(event) => updateBulkTitle(item.id, event.target.value)} required />
                   </label>
                   <label>
                     Episode Number
                     <input min="1" type="number" value={item.episodeNumber} onChange={(event) => updateBulkEpisodeNumber(item.id, event.target.value)} required />
                   </label>
                 </div>
               ))}
             </div>
           )}

           {error && <p className="admin-error">{error}</p>}
           <button type="submit" className="admin-submit">
             Upload Season
           </button>
         </form>
        )}

        {status === 'uploading' && (
          <div className="admin-status">
            <div className="admin-spinner" />
            <p>{mode === 'file' ? `Uploading… ${progress}%` : 'Sending to Mux…'}</p>
            {mode === 'file' && (
              <div className="admin-progress-track">
                <div className="admin-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {status === 'processing' && (
          <div className="admin-status">
            <div className="admin-spinner" />
            <p>Mux is transcoding your video. This usually takes 1–3 minutes…</p>
            <p className="admin-video-id">Video ID: {videoId}</p>
          </div>
        )}

        {status === 'bulk-uploading' && (
          <div className="admin-bulk-status">
            <h2>Uploading season</h2>
            <p>Up to {BULK_UPLOAD_CONCURRENCY} episodes upload at a time. Mux then processes each episode.</p>
            <ul className="admin-upload-list">
              {bulkUploads.map((upload) => (
                <li key={upload.id}>
                  <div className="admin-upload-title">
                    <span>{upload.title}</span>
                    <strong>{upload.status === 'uploading' ? `${upload.progress}%` : upload.status}</strong>
                  </div>
                  {(upload.status === 'uploading' || upload.status === 'processing') && (
                    <div className="admin-progress-track">
                      <div className="admin-progress-fill" style={{ width: `${upload.progress}%` }} />
                    </div>
                  )}
                  {upload.error && <p className="admin-error">{upload.error}</p>}
                </li>
              ))}
            </ul>
            {bulkUploads.length > 0 &&
              bulkUploads.every((upload) => ['ready', 'errored'].includes(upload.status)) && (
                <button className="admin-secondary" onClick={reset}>
                  Upload another season
                </button>
              )}
          </div>
        )}

        {status === 'ready' && (
          <div className="admin-status admin-status-ready">
            <p>✅ Ready! Your video is now live in the catalog.</p>
            <div className="admin-actions">
              <a className="admin-submit" href={`/player/${videoId}`}>
                Watch it now
              </a>
              <button className="admin-secondary" onClick={reset}>
                Add another
              </button>
            </div>
          </div>
        )}

        {status === 'errored' && (
          <div className="admin-status admin-status-error">
            <p>⚠️ Mux couldn't process this video. Check the file/URL and try again.</p>
            <button className="admin-secondary" onClick={reset}>
              Try again
            </button>
          </div>
        )}

        {mode === 'add-content' && (
          <div className="admin-form-section">
            <AdminContentForm onSubmit={handleContentFormSubmit} />
            {status === 'ready' && (
              <div className="admin-status admin-status-ready">
                <p>✅ Content submitted successfully!</p>
                <div className="admin-actions">
                  <button className="admin-secondary" onClick={reset}>
                    Add another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'review-content' && (
          <AdminContentReview />
        )}
        {mode === 'edit-catalog' && <AdminCatalogEditor />}
        {mode === 'admin-bot' && <AdminBotPanel />}
        {mode === 'distributor-ingestion' && <DistributorIngestionPanel />}
        {mode === 'assistant' && <AdminAssistantPanel />}
      </div>

      <Footer />
    </div>
  );
}

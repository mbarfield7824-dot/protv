import { useEffect, useRef, useState } from 'react';
import AdminCommandCenter, { AdminShell } from '../admin/AdminCommandCenter';
import AdminContentForm from '../components/AdminContentForm';
import AdminContentReview from '../components/AdminContentReview';
import AdminCatalogEditor from '../components/AdminCatalogEditor';
import AdminPodcasts from '../components/AdminPodcasts';
import AdminSafetyReports from '../components/AdminSafetyReports';
import AdminBotPanel from '../components/AdminBotPanel';
import DistributorIngestionPanel from '../components/DistributorIngestionPanel';
import AdminAssistantPanel from '../admin/AdminAssistantPanel';
import { validateEpisodeMetadata } from '../admin/episodeMetadata';
import { api } from '../api';
import { CATEGORY_SUBGENRES, MUSIC_FORMAT_OPTIONS, UPLOAD_CATEGORY_OPTIONS } from '../data/categories';
import { useAuth } from '../hooks/useAuth';
import '../styles/Admin.css';
import '../styles/AdminContent.css';
import '../styles/AdminTools.css';

const BULK_UPLOAD_CONCURRENCY = 3;

export default function Admin() {
  const { user, loading, isAdmin, adminLoading, openAuthModal } = useAuth();
  const [mode, setMode] = useState('overview');
  const [visitedModes, setVisitedModes] = useState([]);
  const [resetVersion, setResetVersion] = useState(0);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: UPLOAD_CATEGORY_OPTIONS[0],
    subgenre: '',
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
    musicFormat: '',
    seriesTitle: '',
    seasonNumber: 1,
    episodeNumber: 1,
    rightsHolder: '',
    rightsVerificationNotes: '',
  });
  const [file, setFile] = useState(null);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkMetadata, setBulkMetadata] = useState([]);
  const [bulkUploads, setBulkUploads] = useState([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | uploading | processing | ready | errored
  const [videoId, setVideoId] = useState(null);
  const [error, setError] = useState('');
  const [manualUploadDraft, setManualUploadDraft] = useState(null);
  const [contentSubmitting, setContentSubmitting] = useState(false);
  const pollRef = useRef(null);
  const bulkPollRef = useRef(null);
  const uploadActive = contentSubmitting || ['uploading', 'processing'].includes(status)
    || (status === 'bulk-uploading' && bulkUploads.some((upload) => !['ready', 'errored'].includes(upload.status)));

  useEffect(() => {
    if (!user || !isAdmin || visitedModes.length === 0) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [user, isAdmin, visitedModes.length]);

  const confirmLeavingWorkspace = () => visitedModes.length === 0
    || window.confirm('Leave Admin? Unsaved drafts may be lost and active operations may no longer be monitored. Stay in Admin to preserve your workspace.');

  const guardConsumerNavigation = (event) => {
    const link = event.target.closest('a[href]');
    const button = event.target.closest('.ptv-header button');
    const leavingButton = button && (button.getAttribute('aria-label') === 'Search PROtv'
      || button.textContent.trim() === 'Sign Out');
    if ((!link && !leavingButton) || visitedModes.length === 0) return;
    if (link) {
      if (link.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = new URL(link.href, window.location.href);
      if (target.pathname === '/admin' && target.origin === window.location.origin) return;
    }
    if (!confirmLeavingWorkspace()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

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

  const openOwnerCreatorPortal = async () => {
    if (!confirmLeavingWorkspace()) return;
    setError('');
    try {
      const { url } = await api.createOwnerCreatorSso();
      window.location.assign(url);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (!loading && !user) {
    return (
      <AdminShell>
        <main className="admin-command__gate">
          <h1>Sign in to manage content</h1>
          <p className="admin-subtitle">
            Use your PROtv account to upload authorized videos and manage the catalog.
          </p>
          <button className="ptv-btn ptv-btn--primary" onClick={openAuthModal}>
            Sign In
          </button>
        </main>
      </AdminShell>
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
      <AdminShell>
        <main className="admin-command__gate">
          <h1>Owner access required</h1>
          <p className="admin-subtitle">
            Content management is restricted to the PROtv owner account.
          </p>
          {error && <p className="admin-error">{error}</p>}
          <button className="ptv-btn ptv-btn--primary" onClick={() => void activateOwnerAccess()}>
            Activate Owner Access
          </button>
        </main>
      </AdminShell>
    );
  }

  const updateField = (field) => (e) => {
    if (['seriesTitle', 'seasonNumber', 'episodeNumber', 'musicFormat'].includes(field)) setError('');
    setForm((current) => ({
      ...current,
      [field]: e.target.value,
      ...(field === 'contentType'
        ? {
          musicFormat: '',
          seriesTitle: e.target.value === 'EPISODE' ? current.seriesTitle : '',
          seasonNumber: e.target.value === 'EPISODE' ? '' : 1,
          episodeNumber: e.target.value === 'EPISODE' ? '' : 1,
        }
        : {}),
      ...(field === 'category' ? { subgenre: '' } : {}),
    }));
  };

  const selectBulkFiles = (files) => {
    const selectedFiles = Array.from(files || []);
    setBulkFiles(selectedFiles);
    setBulkMetadata(
      selectedFiles.map((selectedFile, index) => ({
        id: `${index}-${selectedFile.name}`,
        title: '',
        episodeNumber: '',
      }))
    );
  };

  const updateBulkTitle = (id, title) => {
    setBulkMetadata((items) =>
      items.map((item) => (item.id === id ? { ...item, title } : item))
    );
  };

  const updateBulkEpisodeNumber = (id, episodeNumber) => {
    setError('');
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
    const episodeErrors = validateEpisodeMetadata(form);
    if (Object.keys(episodeErrors).length > 0) {
      setError(Object.values(episodeErrors).join(' '));
      return;
    }
    if (form.contentType === 'MUSIC' && (!form.musicFormat || !form.rightsHolder.trim() || !form.rightsVerificationNotes.trim())) {
      setError('Music format, rights holder, and rights verification notes are required.');
      return;
    }
    if (!file) {
      setError('Please choose a video file.');
      return;
    }
    try {
      setStatus('uploading');
      const metadata = form.contentType === 'EPISODE'
        ? { ...form, seriesTitle: form.seriesTitle.trim() }
        : form;
      const { videoId: id, uploadUrl, error: apiError } = await api.getUploadUrl(metadata);
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
    const episodeErrors = validateEpisodeMetadata(form);
    if (Object.keys(episodeErrors).length > 0) {
      setError(Object.values(episodeErrors).join(' '));
      return;
    }
    if (form.contentType === 'MUSIC' && (!form.musicFormat || !form.rightsHolder.trim() || !form.rightsVerificationNotes.trim())) {
      setError('Music format, rights holder, and rights verification notes are required.');
      return;
    }
    if (!form.sourceUrl.trim()) {
      setError('Please paste a video file URL.');
      return;
    }
    try {
      setStatus('uploading');
      const metadata = form.contentType === 'EPISODE'
        ? { ...form, seriesTitle: form.seriesTitle.trim() }
        : form;
      const { videoId: id, error: apiError } = await api.addVideoFromUrl(metadata);
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
    const seriesErrors = validateEpisodeMetadata({
      contentType: 'EPISODE',
      seriesTitle: form.seriesTitle,
      seasonNumber: form.seasonNumber,
      episodeNumber: 1,
    });
    if (Object.keys(seriesErrors).length > 0) {
      setError(Object.values(seriesErrors).slice(0, 2).join(' '));
      return;
    }
    if (bulkMetadata.some((item) => !item.title.trim())) {
      setError('Every episode needs a title before uploading.');
      return;
    }
    const invalidEpisodeIndex = bulkMetadata.findIndex((item) => (
      Object.keys(validateEpisodeMetadata({
        contentType: 'EPISODE',
        seriesTitle: form.seriesTitle,
        seasonNumber: form.seasonNumber,
        episodeNumber: item.episodeNumber,
      })).length > 0
    ));
    if (invalidEpisodeIndex >= 0) {
      setError(`Episode ${invalidEpisodeIndex + 1} needs a positive whole episode number.`);
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
            subgenre: form.subgenre,
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
    setResetVersion((current) => current + 1);
    clearInterval(pollRef.current);
    clearInterval(bulkPollRef.current);
    setForm({
      title: '',
      description: '',
      category: UPLOAD_CATEGORY_OPTIONS[0],
      subgenre: '',
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
      musicFormat: '',
      seriesTitle: '',
      seasonNumber: 1,
      episodeNumber: 1,
      rightsHolder: '',
      rightsVerificationNotes: '',
    });
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
    setContentSubmitting(true);
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
    } finally {
      setContentSubmitting(false);
    }
  };

  const prepareReferenceUpload = (candidate) => {
    if (visitedModes.includes('add-content')
      && !window.confirm('Replace the current rights-content draft with this source reference? Unsaved changes in that draft will be lost.')) return;
    reset();
    setManualUploadDraft({
      title: candidate.title || '',
      year: candidate.year || new Date().getFullYear(),
      genre: 'Drama',
      subgenre: '',
      description: candidate.description || '',
      runtime: 0,
      country: '',
      maturityRating: '',
      cast: '',
      creator: '',
      language: '',
      subtitles: '',
      videoUrl: '',
      trailerUrl: '',
      posterUrl: candidate.thumbnailUrl || '',
      backdropUrl: '',
      audioInfo: '',
      copyrightStatus: 'unknown',
      licenseType: 'Other',
      rightsHolder: '',
      commercialUseStatus: 'requires-verification',
      attributionRequired: false,
      attributionText: '',
      rightsVerificationNotes: `Reference reviewed from ${candidate.sourceLabel || candidate.source}. Confirm the authorized media source and document the rights evidence before approval.`,
      sourceUrl: candidate.sourceUrl || '',
      approvalStatus: 'draft',
    });
    setMode('add-content');
    setVisitedModes((current) => [...new Set([...current, 'add-content'])]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectMode = (nextMode) => {
    if (uploadActive) return;
    if (nextMode !== mode && ['file', 'url', 'bulk', 'add-content'].includes(nextMode)) {
      setStatus('idle');
    }
    if (nextMode !== 'overview') {
      setVisitedModes((current) => [...new Set([...current, nextMode])]);
    }
    setMode(nextMode);
  };

  return (
    <AdminCommandCenter mode={mode} onSelect={selectMode}
      onOwnerPortal={() => void openOwnerCreatorPortal()}
      navigationLocked={uploadActive} error={error} onNavigateAway={guardConsumerNavigation}>
        {['file', 'url', 'add-content'].includes(mode) && (
          <nav className="admin-command__upload-methods" aria-label="Upload method">
            {[
              { id: 'file', label: 'Upload File' },
              { id: 'url', label: 'Paste URL' },
              { id: 'add-content', label: 'Add Content With Rights' },
            ].map((method) => (
              <button key={method.id} type="button" disabled={uploadActive}
                className={`ptv-btn ${mode === method.id ? 'ptv-btn--primary' : 'ptv-btn--quiet'}`}
                aria-current={mode === method.id ? 'page' : undefined}
                onClick={() => selectMode(method.id)}>{method.label}</button>
            ))}
          </nav>
        )}

        {visitedModes.some((item) => item === 'file' || item === 'url') && (
          <form
            className="admin-form"
            hidden={status !== 'idle' || !['file', 'url'].includes(mode)}
            onSubmit={mode === 'file' ? handleFileSubmit : handleUrlSubmit}
          >
            <h3 className="admin-form-section-title">Content details</h3>
            <label className="admin-field-wide">
              Title
              <input value={form.title} onChange={updateField('title')} required />
            </label>

            <label className="admin-field-wide">
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
            {CATEGORY_SUBGENRES[form.category]?.length > 0 && (
              <label>
                Subcategory
                <select value={form.subgenre} onChange={updateField('subgenre')} required>
                  <option value="">Select a subcategory</option>
                  {CATEGORY_SUBGENRES[form.category].map((subcategory) => (
                    <option key={subcategory}>{subcategory}</option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Poster / Thumbnail URL <span className="optional">(optional)</span>
              <input value={form.thumbnailUrl} onChange={updateField('thumbnailUrl')} placeholder="https://…" />
            </label>
            <h3 className="admin-form-section-title">Metadata</h3>
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
                <option value="MUSIC">Music</option>
              </select>
            </label>
            {form.contentType === 'MUSIC' && (
              <>
                <label>
                  Music format
                  <select value={form.musicFormat} onChange={updateField('musicFormat')} required>
                    <option value="">Select a music format</option>
                    {MUSIC_FORMAT_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Rights holder
                  <input value={form.rightsHolder} onChange={updateField('rightsHolder')} required />
                </label>
                <label>
                  Rights verification notes
                  <textarea value={form.rightsVerificationNotes} onChange={updateField('rightsVerificationNotes')} rows={3} required />
                </label>
                <p className="admin-file-help">Music uploads remain drafts until explicitly reviewed and approved.</p>
              </>
            )}
            {form.contentType === 'EPISODE' && (
              <>
                <label>
                  Series Title
                  <input
                    value={form.seriesTitle}
                    onChange={updateField('seriesTitle')}
                    onInvalid={() => setError('Series title is required for an episode.')}
                    required
                  />
                </label>
                <label>
                  Season Number
                  <input
                    min="1"
                    step="1"
                    type="number"
                    value={form.seasonNumber}
                    onChange={updateField('seasonNumber')}
                    onInvalid={() => setError('Season number must be a positive whole number.')}
                    required
                  />
                </label>
                <label>
                  Episode Number
                  <input
                    min="1"
                    step="1"
                    type="number"
                    value={form.episodeNumber}
                    onChange={updateField('episodeNumber')}
                    onInvalid={() => setError('Episode number must be a positive whole number.')}
                    required
                  />
                </label>
              </>
            )}

              <h3 className="admin-form-section-title">Media source</h3>
              <label className="admin-upload-area admin-field-wide" hidden={mode !== 'file'}>
                Video File
                <input
                  key={resetVersion}
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required={mode === 'file'}
                />
              </label>
              <label className="admin-field-wide" hidden={mode !== 'url'}>
                Video File URL
                <input
                  value={form.sourceUrl}
                  onChange={updateField('sourceUrl')}
                  placeholder="https://cdn.example.com/movie.mp4"
                  required={mode === 'url'}
                />
              </label>

            {error && <p className="admin-error">{error}</p>}

            <button type="submit" className="admin-submit">
              {mode === 'file' ? 'Upload & Process' : 'Ingest Video'}
            </button>
          </form>
        )}

        {visitedModes.includes('bulk') && (
         <form className="admin-form" hidden={status !== 'idle' || mode !== 'bulk'} onSubmit={handleBulkSubmit}>
           <h3 className="admin-form-section-title">Season information</h3>
           <label>
             Series Title
             <input
               value={form.seriesTitle}
               onChange={updateField('seriesTitle')}
               onInvalid={() => setError('Series title is required for an episode.')}
               required
             />
           </label>
           <label>
             Season Number
             <input
               min="1"
               step="1"
               type="number"
               value={form.seasonNumber}
               onChange={updateField('seasonNumber')}
               onInvalid={() => setError('Season number must be a positive whole number.')}
               required
             />
           </label>
           <label className="admin-field-wide">
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
           {CATEGORY_SUBGENRES[form.category]?.length > 0 && (
             <label>
               Subcategory
               <select value={form.subgenre} onChange={updateField('subgenre')} required>
                 <option value="">Select a subcategory</option>
                 {CATEGORY_SUBGENRES[form.category].map((subcategory) => (
                   <option key={subcategory}>{subcategory}</option>
                 ))}
               </select>
             </label>
           )}

           <label>
             Poster / Thumbnail URL <span className="optional">(optional)</span>
             <input value={form.thumbnailUrl} onChange={updateField('thumbnailUrl')} placeholder="https://…" />
           </label>

           <label className="admin-upload-area admin-field-wide">
             Episode Video Files
             <input
               key={resetVersion}
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
                     <input
                       min="1"
                       step="1"
                       type="number"
                       value={item.episodeNumber}
                       onChange={(event) => updateBulkEpisodeNumber(item.id, event.target.value)}
                       onInvalid={() => setError(`Episode ${index + 1} number must be a positive whole number.`)}
                       required
                     />
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

        {status === 'bulk-uploading' && mode === 'bulk' && (
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

        {status === 'ready' && ['file', 'url', 'bulk'].includes(mode) && (
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

        {visitedModes.includes('add-content') && (
          <div className="admin-form-section" hidden={mode !== 'add-content'}>
            {manualUploadDraft && (
              <p className="admin-reference-notice">
                This reference is not approved for automatic ingestion. Add an authorized direct
                video URL and complete the rights fields before saving the draft.
              </p>
            )}
            <AdminContentForm
              key={manualUploadDraft?.sourceUrl || 'blank-content-form'}
              initialData={manualUploadDraft}
              onSubmit={handleContentFormSubmit}
            />
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

        {visitedModes.includes('review-content') && (
          <div hidden={mode !== 'review-content'}><AdminContentReview /></div>
        )}
        {visitedModes.includes('edit-catalog') && <div hidden={mode !== 'edit-catalog'}><AdminCatalogEditor /></div>}
        {visitedModes.includes('podcasts') && <div hidden={mode !== 'podcasts'}><AdminPodcasts /></div>}
        {visitedModes.includes('safety-reports') && <div hidden={mode !== 'safety-reports'}><AdminSafetyReports /></div>}
        {visitedModes.includes('admin-bot') && <div hidden={mode !== 'admin-bot'}><AdminBotPanel onPrepareManualUpload={prepareReferenceUpload} /></div>}
        {visitedModes.includes('distributor-ingestion') && <div hidden={mode !== 'distributor-ingestion'}><DistributorIngestionPanel /></div>}
        {visitedModes.includes('assistant') && <div hidden={mode !== 'assistant'}><AdminAssistantPanel /></div>}
    </AdminCommandCenter>
  );
}

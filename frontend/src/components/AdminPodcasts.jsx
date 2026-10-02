import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  createPodcastReconciler, episodeActions, episodeAfterShowSave, episodeForm, episodePayload, mergeEpisodeStatus,
  recoverPodcastConflict, showForm, showPayload,
} from '../admin/podcastAdmin';

const MAX_POLLS = 45;

export default function AdminPodcasts() {
  const [catalog, setCatalog] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState('');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const [showDraft, setShowDraft] = useState(showForm());
  const [episodeDraft, setEpisodeDraft] = useState(episodeForm());
  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const busy = useRef(false);
  const pollTimer = useRef(null);
  const reconciler = useRef(createPodcastReconciler());
  const active = useRef(true);

  const refresh = useCallback(async () => {
    const records = await api.getAdminAllVideos();
    if (!Array.isArray(records)) throw new Error(records.error || 'Unable to load Admin catalog.');
    const recovered = reconciler.current.reconcile(records);
    if (active.current) {
      setCatalog(records);
      setStale(false);
      if (recovered.PODCAST_SHOW) {
        setSelectedShowId(recovered.PODCAST_SHOW.id);
        setShowDraft(showForm(recovered.PODCAST_SHOW));
        setEpisodeDraft((draft) => episodeAfterShowSave(draft, recovered.PODCAST_SHOW.id));
      }
      if (recovered.PODCAST_EPISODE) {
        setSelectedEpisodeId(recovered.PODCAST_EPISODE.id);
        setEpisodeDraft(episodeForm(recovered.PODCAST_EPISODE));
      }
    }
    return records;
  }, []);

  useEffect(() => {
    active.current = true;
    const timer = window.setTimeout(() => {
      refresh().catch((requestError) => {
        if (active.current) { setStale(true); setError(requestError.message); }
      }).finally(() => {
        if (active.current) setLoading(false);
      });
    }, 0);
    return () => {
      active.current = false;
      window.clearTimeout(timer);
      window.clearTimeout(pollTimer.current);
    };
  }, [refresh]);

  const shows = catalog.filter((item) => item.contentType === 'PODCAST_SHOW');
  const selectedShow = shows.find((item) => item.id === selectedShowId);
  const episodes = catalog.filter((item) =>
    item.contentType === 'PODCAST_EPISODE' && item.podcastShowId === selectedShowId
  ).sort((a, b) => a.episodeNumber - b.episodeNumber || a.id.localeCompare(b.id));
  const selectedEpisode = catalog.find((item) => item.id === selectedEpisodeId && item.contentType === 'PODCAST_EPISODE');
  const parent = shows.find((item) => item.id === episodeDraft.podcastShowId);
  const showHasEdits = selectedShow && JSON.stringify(showDraft) !== JSON.stringify(showForm(selectedShow));
  const episodeHasEdits = selectedEpisode && JSON.stringify(episodeDraft) !== JSON.stringify(episodeForm(selectedEpisode));
  const { canIngest, canApprove } = episodeActions(selectedEpisode);

  const selectShow = (show) => {
    window.clearTimeout(pollTimer.current);
    setProcessing('');
    setFile(null);
    setSourceUrl('');
    setProgress(0);
    setSelectedShowId(show?.id || '');
    setShowDraft(showForm(show));
    setSelectedEpisodeId('');
    setEpisodeDraft(episodeForm(null, show?.id));
    setError('');
    setNotice('');
  };
  const selectEpisode = (episode) => {
    window.clearTimeout(pollTimer.current);
    setProcessing('');
    setSelectedEpisodeId(episode?.id || '');
    setEpisodeDraft(episodeForm(episode, selectedShowId));
    setProgress(0);
    setSourceUrl('');
    setFile(null);
    setError('');
    setNotice('');
  };

  const run = async (label, action, { after, onAccepted, allowStaleResult = false } = {}) => {
    if (busy.current) return;
    busy.current = true;
    setPending(label);
    setError('');
    setNotice('');
    let accepted = false;
    try {
      const result = await action();
      accepted = true;
      if (onAccepted) onAccepted(result);
      let records;
      try {
        records = await refresh();
      } catch (refreshError) {
        if (active.current) {
          setStale(true);
          setError(`${label} was accepted, but the Admin catalog could not refresh: ${refreshError.message}. Refresh before further changes.`);
        }
        return allowStaleResult ? result : null;
      }
      if (active.current) {
        if (after) after(result, records);
        setNotice(`${label} completed.`);
      }
      return result;
    } catch (requestError) {
      if (active.current) {
        if (accepted) {
          setStale(true);
          setError(`${label} was accepted but could not be reconciled: ${requestError.message}. Refresh before further changes.`);
        } else if (requestError.status === 409) {
          const outcome = await recoverPodcastConflict(requestError, refresh);
          setStale(outcome.stale);
          setError(outcome.message);
        } else {
          setError(requestError.message);
        }
      }
      return null;
    } finally {
      busy.current = false;
      if (active.current) setPending('');
    }
  };

  const saveShow = () => run('Save Show draft', async () => {
    const payload = showPayload(showDraft);
    const id = reconciler.current.idFor('PODCAST_SHOW', selectedShowId);
    return id
      ? api.editPodcastShow(id, payload)
      : api.createPodcastShow(payload);
  }, { onAccepted: selectedShowId ? undefined
    : (result) => reconciler.current.accept('PODCAST_SHOW', result),
  after: (result, records) => {
    const show = records.find((item) => item.id === result.id);
    if (!show) throw new Error('Saved Show not found in Admin catalog.');
    setSelectedShowId(show.id);
    setShowDraft(showForm(show));
  } });

  const saveEpisode = () => run('Save Episode draft', async () => {
    const payload = episodePayload(episodeDraft, shows);
    const id = reconciler.current.idFor('PODCAST_EPISODE', selectedEpisodeId);
    return id
      ? api.editPodcastEpisode(id, payload)
      : api.createPodcastEpisode(payload);
  }, { onAccepted: selectedEpisodeId ? undefined
    : (result) => reconciler.current.accept('PODCAST_EPISODE', result),
  after: (result, records) => {
    const episode = records.find((item) => item.id === result.id);
    if (!episode) throw new Error('Saved Episode not found in Admin catalog.');
    setSelectedEpisodeId(episode.id);
    setEpisodeDraft(episodeForm(episode));
    if (episode.podcastShowId !== selectedShowId) {
      setSelectedShowId(episode.podcastShowId);
      setShowDraft(showForm(records.find((item) => item.id === episode.podcastShowId)));
    }
  } });

  const poll = (id, count = 0, immediate = false) => {
    if (!active.current) return;
    if (count >= MAX_POLLS) {
      setProcessing('');
      setError('Processing is taking longer than expected. Use Check / Resume Status to try again later.');
      return;
    }
    pollTimer.current = window.setTimeout(async () => {
      if (!active.current) return;
      try {
        const status = await api.getVideoStatus(id);
        if (!active.current) return;
        if (status.id !== id || status.contentType !== 'PODCAST_EPISODE') {
          throw new Error('Unexpected Podcast status response.');
        }
        setCatalog((records) => records.map((item) =>
          item.id === id ? mergeEpisodeStatus(item, status) : item
        ));
        if (status.status === 'ready' || status.status === 'errored') {
          setProcessing('');
          try {
            await refresh();
          } catch (refreshError) {
            setStale(true);
            setError(`Status is ${status.status}, but the Admin catalog could not refresh: ${refreshError.message}`);
            return;
          }
          if (active.current && status.status === 'errored') setError('Mux could not process this Episode. Review it before retrying.');
        } else {
          poll(id, count + 1);
        }
      } catch (requestError) {
        if (!active.current) return;
        if (requestError.status === 409) {
          setProcessing('');
          const outcome = await recoverPodcastConflict(requestError, refresh);
          setStale(outcome.stale);
          setError(outcome.message);
        } else if ([401, 403].includes(requestError.status) || count + 1 >= MAX_POLLS
          || requestError.message === 'Unexpected Podcast status response.') {
          setProcessing('');
          setError(requestError.message);
        } else {
          poll(id, count + 1);
        }
      }
    }, immediate ? 0 : 4000);
  };

  const resumeStatus = () => {
    if (!selectedEpisode || selectedEpisode.status !== 'processing' || processing || pending || stale) return;
    setError('');
    setProcessing('processing');
    poll(selectedEpisode.id, 0, true);
  };

  const ingest = async (kind) => {
    if (!selectedEpisodeId || !canIngest || processing || busy.current || stale || episodeHasEdits) return;
    const id = selectedEpisodeId;
    if (kind === 'file' && !file) { setError('Select a video file.'); return; }
    if (kind === 'url' && !sourceUrl.trim()) { setError('Enter a video file URL.'); return; }
    const started = await run('Start Episode ingestion', () => kind === 'file'
      ? api.podcastUploadUrl(id)
      : api.podcastFromUrl(id, sourceUrl.trim()), { allowStaleResult: true });
    if (!started || !active.current) return;
    setProcessing(kind === 'file' ? 'uploading' : 'processing');
    if (kind === 'file') {
      if (busy.current) return;
      busy.current = true;
      setPending('Uploading video');
      try {
        await api.uploadFileToMux(started.uploadUrl, file, (value) => {
          if (active.current) setProgress(value);
        });
      } catch (uploadError) {
        if (active.current) {
          setError(`${uploadError.message} The Episode is still marked processing; check its status before starting another ingestion.`);
          setProcessing('');
          try { await refresh(); } catch (refreshError) { setError(`${uploadError.message} Refresh failed: ${refreshError.message}`); }
        }
        return;
      } finally {
        busy.current = false;
        if (active.current) setPending('');
      }
    }
    if (active.current) {
      setProcessing('processing');
      poll(id);
    }
  };

  const showAction = (action) => run(action === 'approve' ? 'Publish Show' : 'Unpublish Show',
    () => action === 'approve' ? api.approvePodcastShow(selectedShowId) : api.unpublishPodcastShow(selectedShowId));
  const episodeAction = (action) => run(action === 'approve' ? 'Approve Episode' : 'Unpublish Episode',
    () => action === 'approve' ? api.approvePodcastEpisode(selectedEpisodeId) : api.unpublishPodcastEpisode(selectedEpisodeId));

  const showField = (name) => (event) => setShowDraft((draft) => ({ ...draft, [name]: event.target.value }));
  const episodeField = (name) => (event) => setEpisodeDraft((draft) => ({ ...draft, [name]: event.target.value }));
  const formsDisabled = Boolean(pending || stale || processing);

  return (
    <section className="podcast-admin">
      <div className="podcast-admin-heading">
        <h2>Podcast Shows &amp; Episodes</h2>
        <button type="button" className="admin-refresh-btn" disabled={Boolean(pending)}
          onClick={() => {
            setError('');
            refresh().catch((requestError) => {
              if (active.current) { setStale(true); setError(requestError.message); }
            });
          }}>Refresh</button>
      </div>
      {loading && <p role="status">Loading protected Admin catalog...</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-success" role="status">{notice}</p>}
      {!loading && <>
        <div className="podcast-admin-layout">
          <div className="podcast-admin-list">
            <h3>Shows ({shows.length})</h3>
            <button type="button" className="admin-secondary" disabled={Boolean(pending || stale || processing)} onClick={() => selectShow(null)}>New Show</button>
            {shows.map((show) => (
              <div key={show.id}>
                <button type="button" className={`podcast-admin-select ${selectedShowId === show.id ? 'active' : ''}`}
                  disabled={Boolean(pending || stale || processing)} onClick={() => selectShow(show)}>
                  {show.title} — {show.approvalStatus || 'draft'}
                </button>
                {selectedShowId === show.id && <div className="podcast-admin-episodes">
                  <h4>Episodes ({episodes.length})</h4>
                  <button type="button" className="admin-secondary" disabled={Boolean(pending || stale || processing)} onClick={() => selectEpisode(null)}>New Episode</button>
                  {episodes.map((episode) => (
                    <button type="button" key={episode.id}
                      className={`podcast-admin-select ${selectedEpisodeId === episode.id ? 'active' : ''}`}
                      disabled={Boolean(pending || stale || processing)} onClick={() => selectEpisode(episode)}>
                      {episode.episodeNumber}. {episode.title} — {episode.approvalStatus || 'draft'}
                    </button>
                  ))}
                </div>}
              </div>
            ))}
          </div>
          <div className="podcast-admin-forms">
            <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void saveShow(); }}>
              <fieldset className="podcast-admin-fields" disabled={formsDisabled}>
              <h3>{selectedShowId ? 'Edit Show' : 'Create Show'}</h3>
              {selectedShowId && <p className="admin-subtitle">Stable Show ID: {selectedShowId}</p>}
              <label>Title<input required value={showDraft.title} onChange={showField('title')} /></label>
              <label>Description<textarea value={showDraft.description} onChange={showField('description')} /></label>
              <label>Show artwork URL<input type="url" value={showDraft.artworkUrl} onChange={showField('artworkUrl')} /></label>
              <div className="admin-form-row">
                <label>Host<input value={showDraft.host} onChange={showField('host')} /></label>
                <label>Creator<input value={showDraft.creator} onChange={showField('creator')} /></label>
              </div>
              <div className="admin-form-row">
                <label>Category<input value={showDraft.category} onChange={showField('category')} /></label>
                <label>Genres (comma-separated)<input value={showDraft.genres} onChange={showField('genres')} /></label>
              </div>
              <p className="admin-subtitle">To publish: title, description, artwork, host or creator, and category or genre are required. Saving does not publish.</p>
              <div className="form-actions">
                <button className="admin-submit" disabled={Boolean(pending || stale)} type="submit">{pending || (selectedShow?.approvalStatus === 'approved' ? 'Save Metadata' : 'Save Draft')}</button>
                {selectedShow && (selectedShow.approvalStatus === 'approved'
                  ? <button type="button" className="admin-secondary" disabled={Boolean(pending || stale)}
                    onClick={() => void showAction('unpublish')}>Unpublish Show</button>
                  : <button type="button" className="admin-secondary" disabled={Boolean(pending || stale || showHasEdits)}
                    onClick={() => void showAction('approve')}>Approve / Publish Show</button>)}
              </div>
              {showHasEdits && <p className="admin-subtitle">Save Show changes before publishing.</p>}
              <p className="admin-subtitle">Unpublishing a Show hides its Episodes without changing their individual approval status.</p>
              </fieldset>
            </form>
            {(selectedShowId || shows.length > 0) && (
              <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void saveEpisode(); }}>
                <fieldset className="podcast-admin-fields" disabled={formsDisabled}>
                <h3>{selectedEpisodeId ? 'Edit Episode' : 'Create Episode'}</h3>
                <label>Parent Show
                  <select required value={episodeDraft.podcastShowId} onChange={episodeField('podcastShowId')}>
                    <option value="">Select a Show</option>
                    {shows.map((show) => <option key={show.id} value={show.id}>{show.title} — {show.approvalStatus || 'draft'} ({show.id})</option>)}
                  </select>
                </label>
                <p className="admin-subtitle">
                  {parent?.approvalStatus === 'approved'
                    ? 'The parent Show is published. This Episode also needs its own approval and ready video to appear publicly.'
                    : 'This Show is a draft. Its Episodes remain hidden until the Show is published, even if independently approved.'}
                </p>
                <div className="admin-form-row">
                  <label>Episode title<input required value={episodeDraft.title} onChange={episodeField('title')} /></label>
                  <label>Episode number<input required min="1" step="1" type="number" value={episodeDraft.episodeNumber} onChange={episodeField('episodeNumber')} /></label>
                </div>
                <label>Description<textarea value={episodeDraft.description} onChange={episodeField('description')} /></label>
                <div className="admin-form-row">
                  <label>Episode thumbnail URL<input type="url" value={episodeDraft.thumbnailUrl} onChange={episodeField('thumbnailUrl')} /></label>
                  <label>Episode poster URL<input type="url" value={episodeDraft.posterUrl} onChange={episodeField('posterUrl')} /></label>
                </div>
                <div className="admin-form-row">
                  <label>Category<input value={episodeDraft.category} onChange={episodeField('category')} /></label>
                  <label>Genres (comma-separated)<input value={episodeDraft.genres} onChange={episodeField('genres')} /></label>
                </div>
                <label>Rights holder<input required value={episodeDraft.rightsHolder} onChange={episodeField('rightsHolder')} /></label>
                <label>Rights verification notes<textarea required value={episodeDraft.rightsVerificationNotes} onChange={episodeField('rightsVerificationNotes')} /></label>
                <p className="admin-subtitle">Rights notes document review; they do not independently establish clearance. Changing an approved Episode’s Show or rights resets its approval to draft.</p>
                <div className="form-actions">
                  <button className="admin-submit" type="submit" disabled={Boolean(pending || stale)}>{pending || (selectedEpisode?.approvalStatus === 'approved' ? 'Save Metadata' : 'Save Draft')}</button>
                  {selectedEpisode && (selectedEpisode.approvalStatus === 'approved'
                    ? <button type="button" className="admin-secondary" disabled={Boolean(pending || stale)}
                      onClick={() => void episodeAction('unpublish')}>Unpublish Episode</button>
                    : <button type="button" className="admin-secondary" disabled={Boolean(pending || stale || episodeHasEdits || processing || !canApprove)}
                      onClick={() => void episodeAction('approve')}>Approve Episode</button>)}
                </div>
                {episodeHasEdits && <p className="admin-subtitle">Save Episode changes before approval or ingestion.</p>}
                {!canApprove && selectedEpisode?.approvalStatus !== 'approved' && <p className="admin-subtitle">Approval requires ready video with a Mux playback ID.</p>}
                </fieldset>
              </form>
            )}
            {selectedEpisode && <div className="admin-form podcast-admin-ingestion">
              <h3>Episode video ingestion</h3>
              <p role="status">Status: {processing || selectedEpisode.status || 'Not uploaded'}{selectedEpisode.status === 'ready' ? ' (approval is separate)' : ''}</p>
              {selectedEpisode.status === 'processing' && <button type="button" className="admin-secondary"
                disabled={Boolean(pending || stale || processing)} onClick={resumeStatus}>Check / Resume Status</button>}
              <label>Video file<input key={`${selectedShowId}:${selectedEpisodeId}`} type="file" accept="video/*" disabled={Boolean(pending || processing || stale)}
                onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
              <button type="button" className="admin-secondary" disabled={Boolean(pending || stale || processing || !canIngest || episodeHasEdits || !file)}
                onClick={() => void ingest('file')}>Upload File</button>
              {(processing === 'uploading' || progress > 0) && <p role="status">Upload: {progress}%</p>}
              <label>Or video file URL<input type="url" value={sourceUrl} disabled={Boolean(pending || processing || stale)}
                onChange={(event) => setSourceUrl(event.target.value)} /></label>
              <button type="button" className="admin-secondary" disabled={Boolean(pending || stale || processing || !canIngest || episodeHasEdits || !sourceUrl.trim())}
                onClick={() => void ingest('url')}>Ingest URL</button>
              <p className="admin-subtitle">Only saved, draft Episodes can start ingestion. Upload and transcoding never approve an Episode.</p>
            </div>}
          </div>
        </div>
      </>}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import TrailerPlayer from './TrailerPlayer';

// Coming Soon promotions: promote an existing upcoming catalog title, or a new upcoming title that is not in the
// catalog yet, with artwork, copy, a premiere date (or TBD) and an optional promotional trailer. Promotions only change
// the homepage card. They never publish, unpublish or edit a title, never expose full-length media, and retire
// automatically when the title is released (or, for a title not yet in the catalog, when its premiere date passes).
const EMPTY = {
  source: 'catalog', targetKey: '', contentType: 'film', seasonNumber: '', episodeNumber: '', title: '', description: '',
  artworkUrl: '', premiereDate: '', tbd: true, status: 'published', sortOrder: 0, rightsConfirmed: false,
};
const CONTENT_TYPES = [['film', 'Film'], ['series', 'Series'], ['documentary', 'Documentary'], ['episode', 'Episode']];
const STATE_LABELS = {
  live: 'Live on the homepage',
  hidden: 'Hidden',
  released: 'Released, retired automatically',
  premiered: 'Premiere date passed, retired automatically',
  unavailable: 'Not public, so not shown',
};
const RIGHTS_TEXT = 'I confirm PROtv has the rights to publish this promotional artwork, description and trailer.';
// Midday UTC keeps the chosen calendar day in Eastern time, which is how premiere dates are displayed.
const toPremiereAt = (date) => (date ? `${date}T17:00:00.000Z` : null);
const toDateInput = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '');
const keyOf = (target) => `${target.kind}:${target.id}`;
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function draftFrom(item) {
  const upcoming = item.target.kind === 'upcoming';
  return {
    source: upcoming ? 'upcoming' : 'catalog',
    targetKey: upcoming ? '' : keyOf(item.target),
    contentType: upcoming ? item.target.contentType : 'film',
    seasonNumber: item.target.seasonNumber ? String(item.target.seasonNumber) : '',
    episodeNumber: item.target.episodeNumber ? String(item.target.episodeNumber) : '',
    title: item.title || '', description: item.description || '', artworkUrl: item.artworkUrl || '',
    premiereDate: toDateInput(item.premiereAt), tbd: !item.premiereAt, status: item.status, sortOrder: item.sortOrder || 0,
    rightsConfirmed: false,
  };
}

const trailerLabel = (item) => {
  const trailer = item.trailerStatus || {};
  if (trailer.status === 'processing') return 'Trailer processing';
  if (trailer.status === 'ready') return trailer.source === 'title' ? 'Trailer: catalog trailer' : trailer.source === 'upload' ? 'Trailer: uploaded' : 'Trailer: from the title';
  return 'No trailer';
};

export default function AdminComingSoon() {
  const [items, setItems] = useState([]);
  const [targets, setTargets] = useState({ series: [], titles: [], trailers: [] });
  const [draft, setDraft] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(null);
  const [trailerChoice, setTrailerChoice] = useState('');
  const [trailerProgress, setTrailerProgress] = useState('');
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const active = useRef(true);

  const refresh = async () => {
    const result = await api.getComingSoonPromotions();
    if (!active.current) return [];
    setItems(result.items || []);
    setTargets({ series: [], titles: [], trailers: [], ...(result.targets || {}) });
    setLoaded(true);
    return result.items || [];
  };
  // Keeps the open editor in step after a trailer change (trailer changes never alter the saved version).
  const refreshSelected = async (id) => {
    const next = await refresh();
    const match = next.find((item) => item.id === id);
    if (active.current && match) setSelected(match);
  };
  useEffect(() => {
    active.current = true;
    refresh().catch((e) => { if (active.current) setError(e.message); });
    return () => { active.current = false; };
  }, []);

  const execute = async (action) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true); setError(''); setNotice('');
    try { await action(); } catch (e) { if (active.current) setError(e.message); } finally {
      busy.current = false;
      if (active.current) { setPending(false); setTrailerProgress(''); }
    }
  };

  const options = [
    ...targets.titles.map((item) => ({ key: keyOf(item), label: `${item.kind === 'episode' ? 'Episode' : 'Film'}: ${item.title}`, item })),
    ...targets.series.map((item) => ({ key: keyOf(item), label: `Show: ${item.title}${item.comingSoon ? ' (not yet streaming)' : ''}`, item })),
  ];
  // A promotion for a title that is no longer offered (released or withdrawn) can still be edited, hidden or removed.
  if (selected && draft.targetKey && !options.some((option) => option.key === draft.targetKey)) {
    options.unshift({ key: draft.targetKey, label: `Current target: ${selected.preview?.title || selected.title || selected.target.id}`, item: selected.target });
  }
  const chosen = options.find((option) => option.key === draft.targetKey)?.item;
  const isSeries = draft.source === 'catalog' && draft.targetKey.startsWith('series:');
  const linking = selected?.target.kind === 'upcoming' && draft.source === 'catalog';

  const body = () => {
    let target;
    if (draft.source === 'upcoming') target = { kind: 'upcoming', contentType: draft.contentType };
    else {
      const [kind, ...rest] = draft.targetKey.split(':');
      target = { kind, id: rest.join(':'), ...(kind === 'series' && draft.episodeNumber ? { seasonNumber: draft.seasonNumber || '1', episodeNumber: draft.episodeNumber } : {}) };
    }
    return {
      target, title: draft.title, description: draft.description, artworkUrl: draft.artworkUrl,
      premiereAt: draft.tbd ? null : toPremiereAt(draft.premiereDate), status: draft.status, sortOrder: Number(draft.sortOrder) || 0,
      rightsConfirmed: draft.rightsConfirmed, ...(selected ? { version: selected.version } : {}),
    };
  };

  const save = (event) => {
    event.preventDefault();
    void execute(async () => {
      if (draft.source === 'catalog' && !draft.targetKey) throw new Error('Choose the catalog title to promote.');
      if (draft.source === 'upcoming' && !draft.title.trim()) throw new Error('Enter the title of the upcoming film, series, documentary or episode.');
      if (!draft.tbd && !draft.premiereDate) throw new Error('Choose a premiere date or tick TBD.');
      if (draft.status === 'published' && !draft.rightsConfirmed) throw new Error('Confirm the promotional rights before publishing, or save as Hidden.');
      const saved = await api.saveComingSoonPromotion(selected?.id, body());
      if (!active.current) return;
      await refreshSelected(saved.id);
      setDraft((current) => ({ ...current, rightsConfirmed: false }));
      setNotice(`${linking ? 'Linked to the catalog title; artwork, description and trailer were kept. ' : ''}${saved.status === 'published'
        ? 'Saved and published to Coming Soon.' : 'Saved as hidden. It is not on the homepage.'}${selected ? '' : ' You can add a trailer below.'}`);
    });
  };

  const setStatus = (item, status) => void execute(async () => {
    await api.saveComingSoonPromotion(item.id, { ...item, status, version: item.version, rightsConfirmed: status === 'published' });
    setConfirmPublish(null);
    await refresh();
    setNotice(status === 'published' ? 'Published to Coming Soon.' : 'Hidden from the homepage. Nothing else changed.');
  });

  const remove = (item) => void execute(async () => {
    await api.removeComingSoonPromotion(item.id, item.version);
    setConfirmRemove(null);
    if (selected?.id === item.id) { setSelected(null); setDraft(EMPTY); }
    await refresh();
    setNotice('Promotion removed. The title, its media and its rights were not changed.');
  });

  const uploadArtwork = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void execute(async () => {
      const artworkUrl = await api.uploadComingSoonArtwork(file);
      if (active.current) { setDraft((value) => ({ ...value, artworkUrl })); setNotice('Artwork uploaded. Save the promotion to use it.'); }
    });
  };

  // ---- Trailer (same signed Mux uploads as catalog trailers) -------------------------------------------------------
  const uploadTrailer = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    const id = selected.id;
    void execute(async () => {
      if (!file.type.startsWith('video/')) throw new Error('Choose a video file for the trailer.');
      setTrailerProgress('Preparing secure trailer upload...');
      const { uploadUrl } = await api.createComingSoonTrailerUpload(id);
      await api.uploadFileToMux(uploadUrl, file, (progress) => setTrailerProgress(`Uploading trailer (${progress}%)...`));
      setTrailerProgress('Processing trailer...');
      const deadline = Date.now() + 15 * 60 * 1000;
      let result;
      do {
        await wait(4000);
        result = await api.getComingSoonTrailerStatus(id);
      } while (result.status === 'processing' && Date.now() < deadline);
      await refreshSelected(id);
      if (result.error) throw new Error(result.error);
      if (result.status !== 'ready') throw new Error('Trailer processing is taking longer than expected. Refresh to check again.');
      setNotice('Trailer uploaded and ready. Visitors see Watch Trailer while the promotion is live.');
    });
  };
  const selectTrailer = () => void execute(async () => {
    if (!trailerChoice) throw new Error('Choose a catalog trailer.');
    await api.selectComingSoonTrailer(selected.id, trailerChoice);
    await refreshSelected(selected.id);
    setNotice('Catalog trailer selected for this promotion. The catalog title was not changed.');
  });
  const removeTrailer = () => void execute(async () => {
    await api.removeComingSoonTrailer(selected.id);
    await refreshSelected(selected.id);
    setNotice('Promotional trailer removed. No catalog trailer was changed.');
  });

  const field = (name) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setDraft((current) => ({ ...current, [name]: value }));
  };
  const trailer = selected?.trailerStatus || { status: 'empty' };

  return (
    <section className="admin-coming-soon admin-short-links">
      <h2>Coming Soon Promotions</h2>
      <p>Promote an upcoming film, series, documentary or episode in the homepage Coming Soon row, whether or not it is
        in the catalog yet. A promotion only changes the card: it never publishes, plays or edits the title, and it
        retires automatically when the title premieres.</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-success" role="status">{notice}</p>}
      <div className="form-actions">
        <button type="button" disabled={pending} onClick={() => void execute(async () => { await refresh(); setNotice('Promotions refreshed.'); })}>Refresh</button>
        <button type="button" disabled={pending || !loaded} onClick={() => { setSelected(null); setDraft(EMPTY); setError(''); setNotice(''); }}>New Promotion</button>
      </div>

      <form className="admin-form" onSubmit={save}>
        <fieldset disabled={pending || !loaded}>
          <legend>{selected ? `Edit ${selected.preview?.title || selected.title || 'promotion'}` : 'Create a Promotion'}</legend>
          <div className="admin-coming-soon__source" role="radiogroup" aria-label="What are you promoting?">
            <label><input type="radio" name="promotion-source" value="catalog" checked={draft.source === 'catalog'} onChange={field('source')} /> Existing catalog title</label>
            <label><input type="radio" name="promotion-source" value="upcoming" checked={draft.source === 'upcoming'} onChange={field('source')} /> New upcoming title (not in the catalog yet)</label>
          </div>
          {linking && <p className="admin-success">Linking to a catalog title keeps this promotion&apos;s artwork, description and trailer.</p>}

          {draft.source === 'catalog' ? (
            <>
              <label>What to promote
                <select value={draft.targetKey} onChange={field('targetKey')}>
                  <option value="">Choose a film, episode or show</option>
                  {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
              {isSeries && (
                <>
                  <p>For a show that is already streaming, enter the upcoming episode. Leave both blank to promote a show that has not premiered.</p>
                  <div className="admin-coming-soon__episode">
                    <label>Season<input type="number" min="1" value={draft.seasonNumber} onChange={field('seasonNumber')} placeholder="1" /></label>
                    <label>Episode<input type="number" min="1" value={draft.episodeNumber} onChange={field('episodeNumber')} placeholder="3" /></label>
                  </div>
                  {chosen?.episodes?.length > 0 && (
                    <p>Streaming now: {chosen.episodes.filter((e) => e.released).map((e) => `S${e.seasonNumber} E${e.episodeNumber}`).join(', ') || 'none'}</p>
                  )}
                </>
              )}
              <label>Card title (optional)<input maxLength={160} value={draft.title} onChange={field('title')} placeholder="2212 · Episode 3: C-Fluid" /></label>
            </>
          ) : (
            <>
              <label>Title<input maxLength={160} value={draft.title} onChange={field('title')} placeholder="Title of the upcoming release" /></label>
              <label>Content type
                <select value={draft.contentType} onChange={field('contentType')}>
                  {CONTENT_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                </select>
              </label>
              <p>Nothing is added to the catalog and nothing becomes playable. When the real title is added, edit this promotion and choose it under Existing catalog title.</p>
            </>
          )}
          <label>Promotional description (optional)<textarea maxLength={1000} rows={3} value={draft.description} onChange={field('description')} /></label>
          <label>Artwork<input type="file" accept="image/png,image/jpeg" onChange={uploadArtwork} /></label>
          <label>Or artwork link<input value={draft.artworkUrl} onChange={field('artworkUrl')} placeholder={draft.source === 'catalog' ? "Leave blank to use the title's own poster" : 'https://...'} /></label>
          {draft.artworkUrl && <img className="admin-coming-soon__preview" src={draft.artworkUrl} alt="Artwork preview" />}
          <label className="short-link-active"><input type="checkbox" checked={draft.tbd} onChange={field('tbd')} /> Premiere date TBD</label>
          {!draft.tbd && <label>Premiere date<input type="date" value={draft.premiereDate} onChange={field('premiereDate')} /></label>}
          <label>Order in the row<input type="number" value={draft.sortOrder} onChange={field('sortOrder')} /></label>
          <label>Status
            <select value={draft.status} onChange={field('status')}>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
          {draft.status === 'published' && (
            <label className="short-link-active"><input type="checkbox" checked={draft.rightsConfirmed} onChange={field('rightsConfirmed')} /> {RIGHTS_TEXT}</label>
          )}
          <button type="submit">{pending ? 'Saving...' : 'Save Promotion'}</button>
        </fieldset>
      </form>

      <section className="admin-coming-soon__trailer" aria-label="Promotional trailer">
        <h3>Promotional Trailer</h3>
        {!selected ? (
          <p>Save the promotion first (Hidden is fine), then add a trailer here.</p>
        ) : (
          <fieldset disabled={pending}>
            <p>{trailerLabel(selected)}{trailer.error ? ` · ${trailer.error}` : ''}</p>
            {trailerProgress && <p role="status">{trailerProgress}</p>}
            <label>{trailer.status === 'ready' ? 'Replace with a new trailer video' : 'Upload a trailer video'}
              <input type="file" accept="video/*" onChange={uploadTrailer} />
            </label>
            {targets.trailers.length > 0 && (
              <div className="form-actions">
                <label>Or use an existing catalog trailer
                  <select value={trailerChoice} onChange={(event) => setTrailerChoice(event.target.value)}>
                    <option value="">Choose a title with a trailer</option>
                    {targets.trailers.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <button type="button" onClick={selectTrailer}>Use This Trailer</button>
              </div>
            )}
            {trailer.status === 'ready' && (
              <div className="form-actions">
                <button type="button" onClick={() => setPreview(selected.id)}>Preview Trailer</button>
                <button type="button" onClick={removeTrailer}>Remove Trailer</button>
              </div>
            )}
          </fieldset>
        )}
      </section>

      <h3>Promotions ({items.length})</h3>
      <ul className="short-link-list admin-coming-soon__list">
        {items.map((item) => (
          <li className="admin-tool-intro" key={item.id}>
            <h4>{item.preview?.title || item.title || item.target.id} <small>{STATE_LABELS[item.state] || item.state}</small></h4>
            <p>
              {item.target.kind === 'upcoming' ? `New ${item.preview?.contentType || 'title'} (not in the catalog yet) · ` : ''}
              {item.premiereAt ? `Premieres ${new Date(item.premiereAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })}` : 'Premiere date TBD'}
              {' · '}{trailerLabel(item)}
              {item.preview?.href ? <> &middot; <a href={item.preview.href} target="_blank" rel="noreferrer">{item.preview.href}</a></> : null}
            </p>
            <div className="form-actions">
              <button type="button" disabled={pending} onClick={() => { setSelected(item); setDraft(draftFrom(item)); setError(''); setNotice(''); }}>Edit</button>
              {item.status === 'published' && <button type="button" disabled={pending} onClick={() => setStatus(item, 'hidden')}>Hide</button>}
              {item.status !== 'published' && (confirmPublish === item.id
                ? <button type="button" disabled={pending} onClick={() => setStatus(item, 'published')}>Confirm rights &amp; publish</button>
                : <button type="button" disabled={pending || ['released', 'premiered', 'unavailable'].includes(item.state)} onClick={() => setConfirmPublish(item.id)}>Publish</button>)}
              {confirmRemove === item.id
                ? <button type="button" disabled={pending} onClick={() => remove(item)}>Confirm remove</button>
                : <button type="button" disabled={pending} onClick={() => setConfirmRemove(item.id)}>Remove</button>}
            </div>
            {confirmPublish === item.id && <p>{RIGHTS_TEXT}</p>}
          </li>
        ))}
      </ul>
      {preview && <TrailerPlayer videoId={preview} source="promotion" admin onClose={() => setPreview(null)} />}
    </section>
  );
}

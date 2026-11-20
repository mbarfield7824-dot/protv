import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

// Coming Soon promotions: choose an existing upcoming film, episode or show, add artwork, copy and a premiere date
// (or TBD), then publish or hide it. Promotions only change the homepage card. They never publish, unpublish or edit
// the title itself, and they retire automatically when the title is released.
const EMPTY = {
  targetKey: '', seasonNumber: '', episodeNumber: '', title: '', description: '', artworkUrl: '',
  premiereDate: '', tbd: true, status: 'published', sortOrder: 0,
};
const STATE_LABELS = {
  live: 'Live on the homepage',
  hidden: 'Hidden',
  released: 'Released, retired automatically',
  unavailable: 'Not public, so not shown',
};
// Midday UTC keeps the chosen calendar day in Eastern time, which is how premiere dates are displayed.
const toPremiereAt = (date) => (date ? `${date}T17:00:00.000Z` : null);
const toDateInput = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '');
const keyOf = (target) => `${target.kind}:${target.id}`;

function draftFrom(item) {
  return {
    targetKey: keyOf(item.target),
    seasonNumber: item.target.seasonNumber ? String(item.target.seasonNumber) : '',
    episodeNumber: item.target.episodeNumber ? String(item.target.episodeNumber) : '',
    title: item.title || '', description: item.description || '', artworkUrl: item.artworkUrl || '',
    premiereDate: toDateInput(item.premiereAt), tbd: !item.premiereAt, status: item.status, sortOrder: item.sortOrder || 0,
  };
}

export default function AdminComingSoon() {
  const [items, setItems] = useState([]);
  const [targets, setTargets] = useState({ series: [], titles: [] });
  const [draft, setDraft] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const active = useRef(true);

  const refresh = async () => {
    const result = await api.getComingSoonPromotions();
    if (!active.current) return;
    setItems(result.items || []);
    setTargets(result.targets || { series: [], titles: [] });
    setLoaded(true);
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
      if (active.current) setPending(false);
    }
  };

  const options = [
    ...targets.titles.map((item) => ({ key: keyOf(item), label: `${item.kind === 'episode' ? 'Episode' : 'Film'}: ${item.title}`, item })),
    ...targets.series.map((item) => ({ key: keyOf(item), label: `Show: ${item.title}${item.comingSoon ? ' (not yet streaming)' : ''}`, item })),
  ];
  // A promotion for a title that is no longer offered (released or withdrawn) can still be edited, hidden or removed.
  if (selected && !options.some((option) => option.key === draft.targetKey)) {
    options.unshift({ key: draft.targetKey, label: `Current target: ${selected.preview?.title || selected.title || selected.target.id}`, item: selected.target });
  }
  const chosen = options.find((option) => option.key === draft.targetKey)?.item;
  const isSeries = draft.targetKey.startsWith('series:');

  const body = () => {
    const [kind, ...rest] = draft.targetKey.split(':');
    return {
      target: {
        kind, id: rest.join(':'),
        ...(kind === 'series' && draft.episodeNumber ? { seasonNumber: draft.seasonNumber || '1', episodeNumber: draft.episodeNumber } : {}),
      },
      title: draft.title, description: draft.description, artworkUrl: draft.artworkUrl,
      premiereAt: draft.tbd ? null : toPremiereAt(draft.premiereDate), status: draft.status, sortOrder: Number(draft.sortOrder) || 0,
      ...(selected ? { version: selected.version } : {}),
    };
  };

  const save = (event) => {
    event.preventDefault();
    void execute(async () => {
      if (!draft.targetKey) throw new Error('Choose what to promote.');
      if (!draft.tbd && !draft.premiereDate) throw new Error('Choose a premiere date or tick TBD.');
      const saved = await api.saveComingSoonPromotion(selected?.id, body());
      if (!active.current) return;
      await refresh();
      setSelected(null); setDraft(EMPTY);
      setNotice(saved.status === 'published' ? 'Saved and published to Coming Soon.' : 'Saved as hidden. It is not on the homepage.');
    });
  };

  const setStatus = (item, status) => void execute(async () => {
    await api.saveComingSoonPromotion(item.id, { ...item, status, version: item.version });
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

  const field = (name) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setDraft((current) => ({ ...current, [name]: value }));
  };

  return (
    <section className="admin-coming-soon admin-short-links">
      <h2>Coming Soon Promotions</h2>
      <p>Promote an upcoming film, episode or show in the homepage Coming Soon row. A promotion only changes the card:
        it never publishes, plays or edits the title, and it retires automatically when the title is released.</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-success" role="status">{notice}</p>}
      <div className="form-actions">
        <button type="button" disabled={pending} onClick={() => void execute(async () => { await refresh(); setNotice('Promotions refreshed.'); })}>Refresh</button>
        <button type="button" disabled={pending || !loaded} onClick={() => { setSelected(null); setDraft(EMPTY); setError(''); setNotice(''); }}>New Promotion</button>
      </div>

      <form className="admin-form" onSubmit={save}>
        <fieldset disabled={pending || !loaded}>
          <legend>{selected ? `Edit ${selected.preview?.title || selected.title || 'promotion'}` : 'Create a Promotion'}</legend>
          <label>What to promote
            <select required value={draft.targetKey} onChange={field('targetKey')}>
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
          <label>Promotional description (optional)<textarea maxLength={1000} rows={3} value={draft.description} onChange={field('description')} /></label>
          <label>Artwork<input type="file" accept="image/png,image/jpeg" onChange={uploadArtwork} /></label>
          <label>Or artwork link<input value={draft.artworkUrl} onChange={field('artworkUrl')} placeholder="Leave blank to use the title's own poster" /></label>
          {draft.artworkUrl && <img className="admin-coming-soon__preview" src={draft.artworkUrl} alt="Artwork preview" />}
          <label className="short-link-active"><input type="checkbox" checked={draft.tbd} onChange={field('tbd')} /> Premiere date TBD</label>
          {!draft.tbd && <label>Premiere date<input type="date" required value={draft.premiereDate} onChange={field('premiereDate')} /></label>}
          <label>Order in the row<input type="number" value={draft.sortOrder} onChange={field('sortOrder')} /></label>
          <label>Status
            <select value={draft.status} onChange={field('status')}>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
          <button type="submit">{pending ? 'Saving...' : 'Save Promotion'}</button>
        </fieldset>
      </form>

      <h3>Promotions ({items.length})</h3>
      <ul className="short-link-list admin-coming-soon__list">
        {items.map((item) => (
          <li className="admin-tool-intro" key={item.id}>
            <h4>{item.preview?.title || item.title || item.target.id} <small>{STATE_LABELS[item.state] || item.state}</small></h4>
            <p>{item.premiereAt ? `Premieres ${new Date(item.premiereAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })}` : 'Premiere date TBD'}
              {item.preview?.href ? <> &middot; <a href={item.preview.href} target="_blank" rel="noreferrer">{item.preview.href}</a></> : null}</p>
            <div className="form-actions">
              <button type="button" disabled={pending} onClick={() => { setSelected(item); setDraft(draftFrom(item)); setError(''); setNotice(''); }}>Edit</button>
              {item.status === 'published'
                ? <button type="button" disabled={pending} onClick={() => setStatus(item, 'hidden')}>Hide</button>
                : <button type="button" disabled={pending || item.state === 'released' || item.state === 'unavailable'} onClick={() => setStatus(item, 'published')}>Publish</button>}
              {confirmRemove === item.id
                ? <button type="button" disabled={pending} onClick={() => remove(item)}>Confirm remove</button>
                : <button type="button" disabled={pending} onClick={() => setConfirmRemove(item.id)}>Remove</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

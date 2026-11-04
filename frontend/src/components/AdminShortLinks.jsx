import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const EMPTY = { slug: '', kind: 'podcast', destination: '', active: false };
const FLAGSHIP = { slug: 'MMWF', kind: 'podcast', destination: '/podcast/me-and-my-white-friend', active: true };
export default function AdminShortLinks() {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stale, setStale] = useState(true);
  const busy = useRef(false);
  const active = useRef(true);
  const refresh = async () => {
    const result = await api.getAdminShortLinks();
    if (active.current) { setItems(result.items); setNextCursor(result.nextCursor); setStale(false); }
  };
  useEffect(() => {
    active.current = true;
    refresh().catch(e => { if (active.current) setError(e.message); });
    return () => { active.current = false; };
  }, []);
  const execute = async action => {
    if (busy.current) return;
    busy.current = true;
    setPending(true); setError(''); setNotice('');
    try { await action(); } catch (e) { if (active.current) setError(e.message); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };
  const save = async event => {
    event.preventDefault();
    await execute(async () => {
      const body = { ...draft, ...(selected ? { version: selected.version } : {}) };
      const saved = await api.saveAdminShortLink(selected?.id, body);
      if (!active.current) return;
      setSelected(saved); setDraft({ slug: saved.slug, kind: saved.kind, destination: saved.destination, active: saved.active });
      setStale(true);
      await refresh();
      setNotice(`/${saved.slug} saved${saved.active ? ' and active' : ' as inactive'}.`);
    });
  };
  const field = name => event => setDraft(value => ({ ...value, [name]: name === 'active' ? event.target.checked : event.target.value }));
  return <section className="admin-short-links">
    <h2>Creator &amp; Content Short Links</h2>
    <p>Share memorable PROtv links without changing long-form URLs. Only public, approved destinations are eligible. No private creator records are exposed.</p>
    <p>Visit and qualified-view attribution are off. These links do not increment playback views or duplicate existing analytics.</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status">{notice}</p>}
    <div className="form-actions">
      <button type="button" disabled={pending} onClick={() => void execute(async () => { await refresh(); setNotice('Links refreshed.'); })}>Refresh Links</button>
      <button type="button" disabled={pending || stale} onClick={() => { setSelected(null); setDraft(EMPTY); setError(''); setNotice(''); }}>New Short Link</button>
      {!items.some(item => item.id === 'mmwf') && <button type="button" disabled={pending || stale}
        onClick={() => { setSelected(null); setDraft(FLAGSHIP); setNotice('Review and save the official MMWF link. This does not publish episodes.'); }}>Prepare Official /MMWF</button>}
    </div>
    <form className="admin-form" onSubmit={event => void save(event)}>
      <fieldset disabled={pending || stale}>
        <legend>{selected ? `Edit /${selected.slug}` : 'Create a Short Link'}</legend>
        <label>Slug<input required maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9-]*" value={draft.slug}
          onChange={field('slug')} placeholder="MMWF" /></label>
        <p>Case-insensitive uniqueness; capitalization is preserved for sharing. Only capitalization can change after saving. Inactive slugs remain reserved.</p>
        <label>Content kind<select value={draft.kind} onChange={field('kind')}>
          {['creator', 'film', 'series', 'podcast', 'music', 'featured'].map(kind => <option key={kind} value={kind}>{kind}</option>)}
        </select></label>
        <label>Internal destination<input required value={draft.destination} onChange={field('destination')} placeholder="/podcast/me-and-my-white-friend" /></label>
        <p>Use a public /title/ID, /player/ID, /series/KEY, /podcasts/ID or featured Podcast path. Creator links can point to approved public work or /creators, not private Portal profiles.</p>
        <label className="short-link-active"><input type="checkbox" checked={draft.active} onChange={field('active')} /> Active</label>
        <button type="submit">{pending ? 'Saving...' : 'Save Short Link'}</button>
      </fieldset>
    </form>
    <h3>Registered Links ({items.length})</h3>
    <ul className="short-link-list">
      {items.map(item => <li className="admin-tool-intro" key={item.id}>
        <h4>/{item.slug} <small>{item.active ? 'Active' : 'Inactive'}</small></h4>
        <p>{item.kind} &middot; {item.destination}</p>
        <p>https://watchprotv.com/{item.slug}</p>
        <div className="form-actions">
          <button type="button" disabled={pending} onClick={() => {
            setSelected(item); setDraft({ slug: item.slug, kind: item.kind, destination: item.destination, active: item.active }); setError(''); setNotice('');
          }}>Edit /{item.slug}</button>
          <button type="button" onClick={() => void execute(async () => {
            await navigator.clipboard.writeText(`https://watchprotv.com/${item.slug}`);
            setNotice(`Copied https://watchprotv.com/${item.slug}`);
          })} disabled={pending}>Copy /{item.slug}</button>
          {item.active && <a href={`/${item.slug}`} target="_blank" rel="noreferrer">Open /{item.slug}</a>}
        </div>
      </li>)}
    </ul>
    {nextCursor && <button type="button" disabled={pending} onClick={() => void execute(async () => {
      const result = await api.getAdminShortLinks(nextCursor);
      setItems(current => [...current, ...result.items]); setNextCursor(result.nextCursor);
    })}>Load More Links</button>}
  </section>;
}

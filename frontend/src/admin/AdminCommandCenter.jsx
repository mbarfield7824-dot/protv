import { useState } from 'react';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import ProTVFooter from '../components/ProTVFooter';
import { ADMIN_GROUPS, adminDestination } from './commandCenterNavigation';
import '../styles/AdminCommandCenter.css';

export function AdminShell({ children, onNavigateAway }) {
  return (
    <ProTVShell>
      <div className="admin-command" onClickCapture={onNavigateAway}>
        <ProTVHeader />
        {children}
        <ProTVFooter />
      </div>
    </ProTVShell>
  );
}

export default function AdminCommandCenter({
  mode, onSelect, onOwnerPortal, navigationLocked, error, onNavigateAway, children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const destination = adminDestination(mode);
  const select = (nextMode) => {
    onSelect(nextMode);
    setMenuOpen(false);
  };

  return (
    <AdminShell onNavigateAway={onNavigateAway}>
      <main className="admin-command__main">
        <header className="admin-command__heading">
          <p className="ptv-eyebrow">PROtv / Administration</p>
          <h1>Admin Command Center</h1>
          <p>Manage your catalog, review content and keep PROtv moving. Your streaming site, with administrator powers.</p>
        </header>
        <div className="admin-command__layout">
          <aside className="admin-command__sidebar">
            <button className="admin-command__menu-toggle" type="button"
              aria-expanded={menuOpen} aria-controls="admin-command-navigation"
              onClick={() => setMenuOpen((open) => !open)}>
              Admin menu <span>{destination.label}</span>
            </button>
            <nav id="admin-command-navigation"
              className={`admin-command__navigation ${menuOpen ? 'is-open' : ''}`}
              aria-label="Admin tools">
              {ADMIN_GROUPS.map((group) => (
                <section className="admin-command__nav-group" key={group.title}>
                  <h2>{group.title}</h2>
                  {group.items.map((item) => (
                    <button key={item.mode} type="button" disabled={navigationLocked}
                      aria-current={destination.mode === item.mode ? 'page' : undefined}
                      onClick={() => select(item.mode)}>
                      {item.label}
                    </button>
                  ))}
                </section>
              ))}
              <section className="admin-command__nav-group">
                <h2>Creator Portal</h2>
                <button type="button" disabled={navigationLocked} onClick={onOwnerPortal}>Owner Portal <span aria-hidden="true">↗</span></button>
              </section>
            </nav>
          </aside>
          <section className="admin-command__workspace" aria-label={destination.label}>
            {error && <p className="admin-error" role="alert">{error}</p>}
            {navigationLocked && (
              <p className="admin-reference-notice" role="status">
                Upload, processing or draft saving is active. Admin section switching is paused until this workflow finishes.
              </p>
            )}
            {mode === 'overview' && (
              <div className="admin-command__overview">
                <div className="admin-command__intro">
                  <p className="ptv-eyebrow">Your workspace</p>
                  <h2>Welcome to PROtv Admin</h2>
                  <p>Choose a workspace below. Publishing, rights checks and confirmations stay inside their existing tools.</p>
                </div>
                {ADMIN_GROUPS.filter((group) => group.title !== 'Overview').map((group) => (
                  <section className="admin-command__quick-group" key={group.title}>
                    <h3>{group.title}</h3>
                    <div className="admin-command__cards">
                      {group.items.map((item) => (
                        <button className="admin-command__card" key={item.mode} type="button"
                          onClick={() => select(item.mode)}>
                          <strong>{item.label}</strong>
                          <span>{item.description}</span>
                          <span className="admin-command__card-action">Open workspace <span aria-hidden="true">→</span></span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
                <section className="admin-command__portal">
                  <div><h3>Creator Portal</h3><p>Open the existing owner workspace through your authenticated PROtv session.</p></div>
                  <button type="button" className="ptv-btn ptv-btn--ghost" onClick={onOwnerPortal}>Open Owner Portal</button>
                </section>
              </div>
            )}
            {mode !== 'overview' && (
              <header className="admin-command__tool-heading">
                <h2>{destination.label}</h2>
                <p>{destination.description}</p>
              </header>
            )}
            {children}
          </section>
        </div>
      </main>
    </AdminShell>
  );
}

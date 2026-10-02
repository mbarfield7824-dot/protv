import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/movies', label: 'Movies' },
  { to: '/series', label: 'Series' },
  { to: '/music', label: 'Music' },
  { to: '/podcasts', label: 'Podcasts' },
  { to: '/documentaries', label: 'Documentaries' },
  { to: '/#originals', label: 'Originals' },
  { to: '/creators', label: 'Submit Your Film' },
  { to: '/report', label: 'Report Safety' },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c1.2-3.6 3.8-5.4 7-5.4s5.8 1.8 7 5.4" />
    </svg>
  );
}

export default function ProTVHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);
  const { user, isAdmin, openAuthModal, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen && !mobileOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    };
    const onPointer = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen, mobileOpen]);

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/' && !location.hash;
    if (to.startsWith('/#')) return location.pathname === '/' && location.hash === to.slice(1);
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const initial = (user?.displayName || user?.email || 'U').charAt(0).toUpperCase();
  const closeAll = () => {
    setMenuOpen(false);
    setMobileOpen(false);
  };

  return (
    <header className={`ptv-header ${scrolled || mobileOpen ? 'is-solid' : ''}`}>
      <div className="ptv-header__bar">
        <button
          type="button"
          className="ptv-header__burger"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span className={mobileOpen ? 'is-open' : ''} />
        </button>

        <Link to="/" className="ptv-wordmark" aria-label="PROtv home">
          PRO<span>tv</span>
        </Link>

        <nav className="ptv-header__nav" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className={isActive(link.to) ? 'is-active' : ''}
              aria-current={isActive(link.to) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ptv-header__actions">
          <button
            type="button"
            className="ptv-icon-button"
            aria-label="Search PROtv"
            onClick={() => navigate('/search')}
          >
            <SearchIcon />
          </button>

          {user ? (
            <div className="ptv-account" ref={menuRef}>
              <button
                type="button"
                className="ptv-avatar"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {initial}
              </button>
              {menuOpen && (
                <div className="ptv-account__menu" role="menu">
                  <p className="ptv-account__name">{user.displayName || user.email}</p>
                  <Link role="menuitem" to="/profile" onClick={closeAll}>Profile</Link>
                  <Link role="menuitem" to="/my-list" onClick={closeAll}>My List</Link>
                  <Link role="menuitem" to="/history" onClick={closeAll}>Watch History</Link>
                  {isAdmin && <Link role="menuitem" to="/admin" onClick={closeAll}>Admin</Link>}
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      closeAll();
                      void signOut();
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" className="ptv-signin" onClick={openAuthModal}>
              <span className="ptv-avatar ptv-avatar--ghost" aria-hidden="true"><UserIcon /></span>
              <span className="ptv-signin__label">Sign In</span>
            </button>
          )}
        </div>
      </div>

      <nav className={`ptv-mobile-nav ${mobileOpen ? 'is-open' : ''}`} aria-label="Mobile" hidden={!mobileOpen}>
        {NAV_LINKS.map((link) => (
          <Link key={link.label} to={link.to} className={isActive(link.to) ? 'is-active' : ''} onClick={closeAll}>
            {link.label}
          </Link>
        ))}
        <Link to="/my-list" onClick={closeAll}>My List</Link>
        {user && <Link to="/profile" onClick={closeAll}>Profile</Link>}
        {isAdmin && <Link to="/admin" onClick={closeAll}>Admin</Link>}
      </nav>
    </header>
  );
}

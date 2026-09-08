import { Link } from 'react-router-dom';
import { useState } from 'react';
import SearchOverlay from './SearchOverlay';
import { useAuth } from '../hooks/useAuth';
import '../styles/Header.css';

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAdmin, openAuthModal, signOut } = useAuth();

  const navLinks = [
    { to: '/', label: 'Home', active: true },
    { to: '/#trending', label: 'Trending' },
    { to: '/#discover', label: 'Discover' },
    { to: '/#categories', label: 'Categories' },
    { to: '/#my-list', label: 'My List' },
    { to: '/#continue-watching', label: 'Continue Watching' },
  ];

  return (
    <header className="header-premium">
      <div className="header-content">
        {/* Logo */}
        <Link to="/" className="logo">
          <span className="logo-icon">▶</span>
          <span className="logo-text">PROtv</span>
        </Link>

        {/* Navigation Menu */}
        <nav className="nav-menu">
          {navLinks.map((link) => (
            <Link key={link.label} to={link.to} className={`nav-link ${link.active ? 'active' : ''}`}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Header Actions */}
        <div className="header-actions">
          {/* Search */}
          <button className="search-btn" onClick={() => setSearchOpen(true)} aria-label="Search">
            🔍
          </button>

          {/* Notifications */}
          <button className="icon-btn" title="Notifications">
            🔔
          </button>

          {/* Profile */}
          {user && (
            <Link to="/profile" className="profile-btn" title="Your profile" aria-label="Your profile">
              <div className="profile-avatar">{(user.displayName || user.email || 'U').charAt(0).toUpperCase()}</div>
            </Link>
          )}

          {/* Admin: Add Movie - Only show if admin */}
          {isAdmin && (
            <Link to="/admin" className="admin-link" title="Add a movie">
              ➕
            </Link>
          )}
          {user && (
            <Link to="/profile" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Profile
            </Link>
          )}

          {/* Sign In */}
          {!user ? (
            <button className="login-btn" onClick={openAuthModal}>
              Sign In
            </button>
          ) : (
            <button className="login-btn" onClick={signOut}>
              Sign Out
            </button>
          )}

          {/* Mobile Menu Toggle */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Slide-Out Menu */}
      <div className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`}>
        {navLinks.map((link) => (
          <Link
            key={link.label}
            to={link.to}
            className={`mobile-nav-link ${link.active ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        {isAdmin && (
          <Link
            to="/admin"
            className="mobile-nav-link"
            onClick={() => setMobileMenuOpen(false)}
          >
            ➕ Add Movie
          </Link>
        )}
      </div>
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}

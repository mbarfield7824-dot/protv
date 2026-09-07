import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import SearchOverlay from './SearchOverlay';
import '../styles/Header.css';

export default function Header() {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = localStorage.getItem('isAdmin') === 'true';

  const navLinks = [
    { to: '/', label: 'Home', active: true },
    { to: '/trending', label: 'Trending' },
    { to: '/discover', label: 'Discover' },
    { to: '/categories', label: 'Categories' },
    { to: '/my-list', label: 'My List' },
    { to: '/continue-watching', label: 'Continue Watching' },
  ];

  const handleSignIn = () => {
    localStorage.setItem('isAdmin', 'true');
    window.location.reload();
  };

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
          <Link to="/" className="nav-link active">
            Home
          </Link>
          <Link to="/trending" className="nav-link">
            Trending
          </Link>
          <Link to="/discover" className="nav-link">
            Discover
          </Link>
          <Link to="/categories" className="nav-link">
            Categories
          </Link>
          <Link to="/my-list" className="nav-link">
            My List
          </Link>
          <Link to="/continue-watching" className="nav-link">
            Continue Watching
          </Link>
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
          <button className="profile-btn">
            <div className="profile-avatar">U</div>
          </button>

          {/* Admin: Add Movie - Only show if admin */}
          {isAdmin && (
            <Link to="/admin" className="admin-link" title="Add a movie">
              ➕
            </Link>
          )}

          {/* Sign In */}
          {!isAdmin ? (
            <button className="login-btn" onClick={handleSignIn}>
              Sign In
            </button>
          ) : (
            <button className="login-btn" onClick={() => {
              localStorage.removeItem('isAdmin');
              window.location.reload();
            }}>
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

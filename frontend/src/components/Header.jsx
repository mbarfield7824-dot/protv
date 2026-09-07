import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import SearchOverlay from './SearchOverlay';
import '../styles/Header.css';

export default function Header() {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { to: '/', label: 'Home', active: true },
    { href: '#trending', label: 'Trending' },
    { href: '#discover', label: 'Discover' },
    { href: '#categories', label: 'Categories' },
    { href: '#mylist', label: 'My List' },
    { href: '#continuing', label: 'Continue Watching' },
    { to: '/admin', label: '+ Add Movie' },
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
          <Link to="/" className="nav-link active">
            Home
          </Link>
          <a href="#trending" className="nav-link">
            Trending
          </a>
          <a href="#discover" className="nav-link">
            Discover
          </a>
          <a href="#categories" className="nav-link">
            Categories
          </a>
          <a href="#mylist" className="nav-link">
            My List
          </a>
          <a href="#continuing" className="nav-link">
            Continue Watching
          </a>
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

          {/* Admin: Add Movie */}
          <Link to="/admin" className="admin-link" title="Add a movie">
            ➕
          </Link>

          {/* Sign In */}
          <button className="login-btn">Sign In</button>

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
        {navLinks.map((link) =>
          link.to ? (
            <Link
              key={link.label}
              to={link.to}
              className={`mobile-nav-link ${link.active ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ) : (
            <a
              key={link.label}
              href={link.href}
              className="mobile-nav-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          )
        )}
      </div>
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}

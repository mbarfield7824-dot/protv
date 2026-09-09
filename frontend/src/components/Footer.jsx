import { Link } from 'react-router-dom';
import '../styles/Footer.css';

export default function Footer() {
  return (
    <footer className="protv-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <Link to="/" className="footer-logo">
            <span className="footer-logo-icon">▶</span>
            <span className="footer-logo-text">PROtv</span>
          </Link>
          <p className="footer-tagline">Your entertainment, your way.</p>
        </div>

        <div className="footer-columns">
          <div className="footer-column">
            <h4>Browse</h4>
            <Link to="/shows">TV Shows</Link>
            <a href="#categories">Categories</a>
            <a href="#black-cinema">Black Cinema</a>
            <a href="#independent">Independent</a>
            <a href="#anime">Anime</a>
          </div>

          <div className="footer-column">
            <h4>Account</h4>
            <Link to="/#my-list">My List</Link>
            <a href="#history">Watch History</a>
            <Link to="/profile">Settings</Link>
          </div>

          <div className="footer-column">
            <h4>Help</h4>
            <a href="#faq">FAQ</a>
            <Link to="/about">About Us</Link>
            <Link to="/contact">Contact Us</Link>
            <a href="#terms">Terms</a>
            <a href="#privacy">Privacy</a>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} PROtv. All rights reserved.</p>
      </div>
    </footer>
  );
}

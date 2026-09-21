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
            <Link to="/music">Music</Link>
            <Link to="/cartoons">Cartoons</Link>
            <Link to="/#categories">Categories</Link>
            <Link to="/#black-cinema">Black Cinema</Link>
            <Link to="/#independent">Independent</Link>
            <Link to="/#anime">Anime</Link>
          </div>

          <div className="footer-column">
            <h4>Account</h4>
            <Link to="/#my-list">My List</Link>
            <Link to="/history">Watch History</Link>
            <Link to="/profile">Settings</Link>
          </div>

          <div className="footer-column">
            <h4>Help</h4>
            <Link to="/faq">FAQ</Link>
            <Link to="/about">About Us</Link>
            <Link to="/contact">Contact Us</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} PROtv. All rights reserved.</p>
      </div>
    </footer>
  );
}

import { Link } from 'react-router-dom';

const COLUMNS = [
  {
    title: 'Quick Links',
    links: [
      { to: '/', label: 'Home' },
      { to: '/#movies', label: 'Movies' },
      { to: '/shows', label: 'Series' },
      { to: '/#documentary', label: 'Documentaries' },
      { to: '/music', label: 'Music' },
      { to: '/cartoons', label: 'Cartoons' },
    ],
  },
  {
    title: 'Browse',
    links: [
      { to: '/#categories', label: 'Categories' },
      { to: '/#black-cinema', label: 'Black Cinema' },
      { to: '/#independent', label: 'Independent' },
      { to: '/#anime', label: 'Anime' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/#my-list', label: 'My List' },
      { to: '/history', label: 'Watch History' },
      { to: '/profile', label: 'Settings' },
    ],
  },
  {
    title: 'Support',
    links: [
      { to: '/report', label: 'Report Safety' },
      { to: '/faq', label: 'FAQ' },
      { to: '/about', label: 'About Us' },
      { to: '/contact', label: 'Contact Us' },
    ],
  },
  {
    title: 'For Filmmakers',
    links: [
      { to: '/creators', label: 'Submit Your Film' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/terms', label: 'Terms of Service' },
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/acceptable-use-policy', label: 'Acceptable Use' },
      { to: '/dmca-policy', label: 'DMCA & Copyright' },
    ],
  },
];

export default function ProTVFooter() {
  return (
    <footer className="ptv-footer">
      <div className="ptv-footer__brand">
        <Link to="/" className="ptv-wordmark ptv-wordmark--footer" aria-label="PROtv home">PRO<span>tv</span></Link>
        <p>Independent Stories. Unlimited Possibilities.</p>
        <small>© {new Date().getFullYear()} PROtv. All rights reserved.</small>
      </div>
      <div className="ptv-footer__cols">
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h3>{column.title}</h3>
            {column.links.map((link) => <Link key={link.label} to={link.to}>{link.label}</Link>)}
          </nav>
        ))}
      </div>
    </footer>
  );
}

import { useNavigate } from 'react-router-dom';
import { fallbackArtworkUrl } from '../utils/artwork';
import { FALLBACK_HERO } from '../data/mockData';
import '../styles/CategoryCard.css';

export default function CategoryCard({ category, content }) {
  const navigate = useNavigate();
  const artwork = content?.heroImageUrl || content?.thumbnailUrl || fallbackArtworkUrl(content, FALLBACK_HERO);

  return (
    <button
      type="button"
      className="category-card"
      onClick={() => navigate(`/#${category.id}`)}
      aria-label={`Explore ${category.name}`}
    >
      <img src={artwork} alt="" loading="lazy" decoding="async" />
      <span className="category-card-overlay" />
      <span className="category-card-content">
        <strong>{category.name}</strong>
        <span>Explore <span aria-hidden="true">→</span></span>
      </span>
    </button>
  );
}

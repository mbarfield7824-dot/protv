import CategoryCard from './CategoryCard';
import { BROWSE_CATEGORIES } from '../data/browseCategories';
import '../styles/CategoryGrid.css';

export default function CategoryGrid({ catalog }) {
  const populated = BROWSE_CATEGORIES
    .map((category) => ({
      category,
      content: catalog.find((video) => {
        const values = [video.category, video.subgenre, ...(video.genres || [])]
          .filter(Boolean)
          .map((value) => value.toLowerCase());
        return category.matches.some((match) => values.includes(match.toLowerCase()));
      }),
    }))
    .filter(({ content }) => content);

  if (!populated.length) return null;

  return (
    <section className="category-grid-section" aria-labelledby="browse-category-title">
      <div className="category-section-heading">
        <div>
          <p className="section-kicker">Find your next favorite</p>
          <h2 id="browse-category-title">Browse by Category</h2>
        </div>
      </div>
      <div className="category-grid">
        {populated.map(({ category, content }) => (
          <CategoryCard key={category.id} category={category} content={content} />
        ))}
      </div>
    </section>
  );
}

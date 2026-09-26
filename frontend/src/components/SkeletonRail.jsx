import '../styles/Skeleton.css';

export default function SkeletonRail({ count = 6 }) {
  return (
    <section className="skeleton-rail" aria-label="Loading content">
      <div className="skeleton-line skeleton-heading" />
      <div className="skeleton-cards">
        {Array.from({ length: count }, (_, index) => <div className="skeleton-card" key={index} />)}
      </div>
    </section>
  );
}

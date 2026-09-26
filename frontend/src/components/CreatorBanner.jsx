import { Link } from 'react-router-dom';
import { CreatorPortalButton } from './CreatorExperience';

export default function CreatorBanner({ imageUrl, stats = [] }) {
  return (
    <section id="submit" className="ptv-creator" aria-labelledby="ptv-creator-title">
      <div className="ptv-creator__art" aria-hidden="true">
        {imageUrl && <img src={imageUrl} alt="" loading="lazy" decoding="async" />}
      </div>
      <div className="ptv-creator__shade" aria-hidden="true" />

      <div className="ptv-creator__copy">
        <h2 id="ptv-creator-title">Get your story on <span>PRO<em>tv</em></span></h2>
        <p>
          Are you an independent filmmaker, producer, artist or content creator?{' '}
          PROtv is looking for independent content to showcase to a growing audience.
        </p>
        <div className="ptv-creator__actions">
          <CreatorPortalButton className="ptv-btn ptv-btn--primary">Submit Your Film <span aria-hidden="true">→</span></CreatorPortalButton>
          <Link className="ptv-btn ptv-btn--ghost" to="/creators">Learn More</Link>
        </div>
      </div>

      <div className="ptv-creator__side">
        <div className="ptv-creator__badge">
          <span className="ptv-creator__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M3 7h13v10H3zM16 10l5-3v10l-5-3" /></svg>
          </span>
          <div>
            <strong>Independent Creators</strong>
            <span>Change the Culture</span>
          </div>
        </div>
        {stats.length > 0 && (
          <dl className="ptv-creator__stats">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

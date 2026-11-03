import { useState } from 'react';
import banner from '../assets/me-and-my-white-friend-banner.png';
import original from '../assets/me-and-my-white-friend.png';

export default function PodcastArtwork({ priority = false }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="mmwf-artwork">
      <div className="mmwf-artwork__orbit" aria-hidden="true" />
      <div className="mmwf-artwork__frame">
        <img
          src={failed ? original : banner}
          alt="Me and My White Friend - official podcast artwork"
          width={failed ? 500 : 418}
          height={failed ? 500 : 173}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onError={() => {
            if (!failed) setFailed(true);
            else console.error('The supplied Me and My White Friend artwork failed to load.');
          }}
        />
      </div>
      <figcaption><span /> REG &amp; MARV <span /> TWO PERSPECTIVES. ONE FRIENDSHIP.</figcaption>
    </figure>
  );
}

import { useEffect, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react';
import { api } from '../api';
import '../styles/TrailerPlayer.css';

export default function TrailerPlayer({ videoId, admin = false, onClose }) {
  const [playback, setPlayback] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = admin ? api.getAdminTitleTrailerPreview : api.getTitleTrailerPlayback;
    load(videoId)
      .then((result) => { if (active) setPlayback(result); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [admin, videoId]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="trailer-player-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="trailer-player-dialog" role="dialog" aria-modal="true" aria-label="Trailer preview">
        <button className="trailer-player-close" type="button" onClick={onClose}>Close</button>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {!error && !playback && <p role="status">Preparing trailer...</p>}
        {playback && (
          <MuxPlayer
            streamType="on-demand"
            playbackId={playback.muxPlaybackId}
            tokens={{ playback: playback.playbackToken }}
            metadata={{ video_id: videoId, video_title: 'PROtv trailer' }}
            style={{ width: '100%', aspectRatio: '16 / 9' }}
          />
        )}
      </section>
    </div>
  );
}

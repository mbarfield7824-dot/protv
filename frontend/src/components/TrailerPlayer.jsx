import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MuxPlayer from '@mux/mux-player-react';
import { api } from '../api';
import '../styles/TrailerPlayer.css';

export default function TrailerPlayer({ videoId, admin = false, onClose }) {
  const [playback, setPlayback] = useState(null);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    let active = true;
    const load = admin ? api.getAdminTitleTrailerPreview : api.getTitleTrailerPlayback;
    load(videoId)
      .then((result) => { if (active) setPlayback(result); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [admin, videoId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const { scrollX, scrollY } = window;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      window.scrollTo(scrollX, scrollY);
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} className="trailer-player-overlay" aria-label="Watch trailer"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
      <section className="trailer-player-dialog" aria-label="Trailer preview">
        <button className="trailer-player-close" type="button" onClick={onClose}>Close</button>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {!error && !playback && <p role="status">Preparing trailer...</p>}
        {playback && (
          <MuxPlayer
            streamType="on-demand"
            autoPlay={false}
            playbackId={playback.muxPlaybackId}
            tokens={{ playback: playback.playbackToken }}
            metadata={{ video_id: videoId, video_title: 'PROtv trailer' }}
            style={{ width: '100%', aspectRatio: '16 / 9' }}
          />
        )}
      </section>
    </dialog>,
    document.body,
  );
}

export function muxThumbnailUrl(video) {
  if (!video?.muxPlaybackId) return '';
  return `https://image.mux.com/${video.muxPlaybackId}/thumbnail.jpg?time=1&width=800&height=1200&fit_mode=preserve`;
}

// Landscape/square frame grabbed from the title's own Mux asset. `time` is in
// seconds; when omitted we sample a point inside the runtime so we avoid
// opening title cards and black frames.
export function muxStillUrl(video, { width = 1280, height = 720, time } = {}) {
  if (!video?.muxPlaybackId) return '';
  const duration = Number(video.durationSeconds) || 0;
  const sampled = Number.isFinite(time) ? time : Math.round(duration * 0.42) || 30;
  const safeTime = duration ? Math.min(sampled, Math.max(1, duration - 5)) : sampled;
  if (!height) {
    return `https://image.mux.com/${video.muxPlaybackId}/thumbnail.jpg?time=${safeTime}&width=${width}&fit_mode=preserve`;
  }
  return `https://image.mux.com/${video.muxPlaybackId}/thumbnail.jpg?time=${safeTime}&width=${width}&height=${height}&fit_mode=smartcrop`;
}

export function fallbackArtworkUrl(video, fallbackUrl) {
  return muxThumbnailUrl(video) || fallbackUrl;
}

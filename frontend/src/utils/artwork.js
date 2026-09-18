export function muxThumbnailUrl(video) {
  if (!video?.muxPlaybackId) return '';
  return `https://image.mux.com/${video.muxPlaybackId}/thumbnail.jpg?time=1&width=800&height=1200&fit_mode=preserve`;
}

export function fallbackArtworkUrl(video, fallbackUrl) {
  return muxThumbnailUrl(video) || fallbackUrl;
}

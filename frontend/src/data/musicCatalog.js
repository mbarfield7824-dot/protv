import { MUSIC_FORMAT_OPTIONS } from './categories.js';

export function musicCatalogUrl(apiBaseUrl) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('The PROtv API base URL is not configured.');
  return `${base}/v1/catalog?view=music`;
}

export function musicCatalogItems(payload) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('The Music catalog response is invalid.');
  }
  return payload.items;
}

export function normalizeMusicTitle(raw, fallbackPoster) {
  const category = raw.category || raw.genre || '';
  return {
    ...raw,
    category,
    genreLabel: musicFormatLabel(raw.musicFormat) || category,
    description: raw.description || '',
    thumbnailUrl: raw.thumbnailUrl || raw.posterUrl || fallbackPoster,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl || raw.posterUrl || fallbackPoster,
    duration: raw.runtime ? Math.round(raw.runtime) : raw.duration ? Math.round(raw.duration / 60) : 0,
    genres: Array.isArray(raw.genres) ? raw.genres : [],
    ageRating: raw.maturityRating || raw.ageRating || '',
  };
}

export function musicFormatLabel(musicFormat) {
  return MUSIC_FORMAT_OPTIONS.find((format) => format.value === musicFormat)?.label || '';
}

export function matchesMusicClassification(video) {
  if (String(video.contentType || '').toUpperCase() === 'MUSIC') return true;
  return [video.category, video.genre].some(
    (value) => typeof value === 'string' && value.trim().toLowerCase() === 'music'
  );
}

export function matchesMusicFormat(video, selectedFormat) {
  return selectedFormat === 'all' || video.musicFormat === selectedFormat;
}

export function isMovieSearchResult(video) {
  const type = String(video.contentType || '').toUpperCase();
  return !['MUSIC', 'SERIES', 'EPISODE'].includes(type);
}

export function isSeriesSearchResult(video) {
  const type = String(video.contentType || '').toUpperCase();
  return type === 'SERIES' || type === 'EPISODE';
}

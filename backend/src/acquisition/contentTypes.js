// Maps existing catalog records onto PROtv's content families without inventing new schemas.
const CONTENT_FAMILIES = ['movie', 'music', 'podcast-show', 'podcast-episode', 'original', 'episode', 'other'];

function upper(value) {
  return String(value || '').trim().toUpperCase();
}

function isOriginalRecord(record = {}) {
  return String(record.category || '').trim().toLowerCase() === 'originals'
    || String(record.contentType || '').trim().toLowerCase() === 'original'
    || (Array.isArray(record.categories)
      && record.categories.some((value) => String(value).trim().toLowerCase() === 'originals'));
}

function classifyCatalogItem(record = {}) {
  const type = upper(record.contentType);
  if (type === 'PODCAST_SHOW') return 'podcast-show';
  if (type === 'PODCAST_EPISODE') return 'podcast-episode';
  if (type === 'MUSIC') return 'music';
  if (isOriginalRecord(record)) return 'original';
  if (type === 'EPISODE' || type === 'SHOW') return 'episode';
  if (type === 'MOVIE' || !type) return 'movie';
  return 'other';
}

// Families whose titles can collide with a film acquisition.
const FILM_COMPARABLE = new Set(['movie', 'original', 'episode', 'other']);

function comparableToFilm(record) {
  return FILM_COMPARABLE.has(classifyCatalogItem(record));
}

const FAMILY_LABELS = {
  movie: 'Movie',
  music: 'Music video',
  'podcast-show': 'Podcast show',
  'podcast-episode': 'Podcast episode',
  original: 'PROtv Original',
  episode: 'Series episode',
  other: 'Other',
};

module.exports = {
  CONTENT_FAMILIES,
  FAMILY_LABELS,
  classifyCatalogItem,
  comparableToFilm,
  isOriginalRecord,
};

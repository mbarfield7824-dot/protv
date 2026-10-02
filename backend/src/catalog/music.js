const MUSIC_FORMATS = Object.freeze([
  'music_video',
  'live_performance',
  'artist_showcase',
  'interview',
  'music_documentary',
  'premiere_special',
]);

function isMusicFormat(value) {
  return typeof value === 'string' && MUSIC_FORMATS.includes(value);
}

function validateMusicFormat(value) {
  if (!isMusicFormat(value)) {
    throw new Error(`musicFormat must be one of: ${MUSIC_FORMATS.join(', ')}.`);
  }
  return value;
}

function documentaryGenres(genres) {
  return [...new Set([
    ...(Array.isArray(genres) ? genres.filter((genre) => typeof genre === 'string' && genre.trim()) : []),
    'Documentary',
  ])];
}

module.exports = { MUSIC_FORMATS, documentaryGenres, isMusicFormat, validateMusicFormat };

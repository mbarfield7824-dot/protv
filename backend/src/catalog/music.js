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

module.exports = { MUSIC_FORMATS, isMusicFormat, validateMusicFormat };

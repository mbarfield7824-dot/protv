// Genre vocabulary for Internet Archive film searches. Collections are real IA collections
// (verified by read-only metadata searches); subjects/keywords broaden recall beyond them.
const GENRES = {
  horror: {
    label: 'Horror',
    aliases: ['horror', 'scary', 'creepy', 'monster', 'monsters', 'vampire', 'zombie', 'ghost', 'haunted', 'gothic', 'supernatural'],
    collections: ['SciFi_Horror'],
    subjects: ['horror', 'horror films', 'monster', 'vampire', 'zombie', 'ghost', 'haunted house', 'gothic'],
    keywords: ['dracula', 'frankenstein', 'nosferatu', 'haunted', 'ghost', 'monster', 'vampire', 'zombie', 'phantom', 'terror', 'creature', 'mummy', 'werewolf', 'witch'],
    omdbGenres: ['horror'],
  },
  scifi: {
    label: 'Science fiction',
    aliases: ['sci-fi', 'scifi', 'science fiction', 'sci fi', 'space', 'alien', 'aliens', 'robot', 'futuristic'],
    collections: ['SciFi_Horror'],
    subjects: ['science fiction', 'sci-fi', 'space', 'alien', 'robot'],
    keywords: ['space', 'alien', 'robot', 'planet', 'moon', 'mars', 'invaders', 'rocket', 'metropolis'],
    omdbGenres: ['sci-fi'],
  },
  silent: {
    label: 'Silent film',
    aliases: ['silent', 'silent film', 'silent films', 'silents', 'silent era'],
    collections: ['silent_films'],
    subjects: ['silent film', 'silent films'],
    keywords: [],
    omdbGenres: [],
  },
  comedy: {
    label: 'Comedy',
    aliases: ['comedy', 'comedies', 'funny', 'slapstick', 'screwball', 'laugh'],
    collections: ['feature_films'],
    subjects: ['comedy', 'slapstick', 'screwball comedy', 'comedies'],
    keywords: ['comedy', 'laugh', 'funny', 'clown', 'slapstick'],
    omdbGenres: ['comedy'],
  },
  noir: {
    label: 'Film noir / crime',
    aliases: ['noir', 'film noir', 'crime', 'detective', 'gangster', 'mystery', 'thriller'],
    collections: ['feature_films'],
    subjects: ['film noir', 'crime', 'detective', 'gangster', 'mystery', 'thriller'],
    keywords: ['murder', 'detective', 'crime', 'gangster', 'mystery', 'killer', 'blackmail'],
    omdbGenres: ['crime', 'film-noir', 'mystery', 'thriller'],
  },
  western: {
    label: 'Western',
    aliases: ['western', 'westerns', 'cowboy', 'cowboys', 'outlaw'],
    collections: ['feature_films'],
    subjects: ['western', 'westerns', 'cowboy'],
    keywords: ['cowboy', 'outlaw', 'sheriff', 'frontier', 'ranger', 'texas', 'rio'],
    omdbGenres: ['western'],
  },
  drama: {
    label: 'Drama',
    aliases: ['drama', 'dramas', 'melodrama', 'romance', 'romantic', 'love story'],
    collections: ['feature_films'],
    subjects: ['drama', 'melodrama', 'romance'],
    keywords: ['love', 'heart', 'marriage', 'wife', 'woman', 'drama'],
    omdbGenres: ['drama', 'romance'],
  },
  adventure: {
    label: 'Adventure / action',
    aliases: ['adventure', 'action', 'swashbuckler', 'jungle', 'serial'],
    collections: ['feature_films'],
    subjects: ['adventure', 'action', 'jungle', 'pirates'],
    keywords: ['adventure', 'jungle', 'pirate', 'treasure', 'island', 'expedition'],
    omdbGenres: ['adventure', 'action'],
  },
  war: {
    label: 'War',
    aliases: ['war', 'wwii', 'ww2', 'world war', 'military', 'battle'],
    collections: ['feature_films'],
    subjects: ['war', 'world war', 'military'],
    keywords: ['war', 'battle', 'soldier', 'army', 'navy'],
    omdbGenres: ['war'],
  },
  animation: {
    label: 'Animation / cartoons',
    aliases: ['animation', 'animated', 'cartoon', 'cartoons'],
    collections: ['classic_cartoons', 'vintage_cartoons'],
    subjects: ['animation', 'cartoon', 'cartoons'],
    keywords: ['cartoon'],
    omdbGenres: ['animation'],
  },
  classic: {
    label: 'Classic feature films',
    aliases: ['classic', 'classics', 'feature', 'features', 'movies', 'films', 'movie', 'film', 'old movies', 'best'],
    collections: ['feature_films'],
    subjects: [],
    keywords: [],
    omdbGenres: [],
  },
};

const ROTATION = ['horror', 'silent', 'noir', 'comedy', 'scifi', 'western', 'drama', 'adventure', 'classic'];

function detectGenre(input) {
  const text = ` ${String(input || '').toLowerCase().replace(/[^a-z0-9+ -]+/g, ' ')} `;
  let best = null;
  for (const [key, genre] of Object.entries(GENRES)) {
    if (key === 'classic') continue;
    for (const alias of genre.aliases) {
      if (text.includes(` ${alias} `) || text.includes(` ${alias}s `)) {
        if (!best || alias.length > best.length) best = { key, length: alias.length };
      }
    }
  }
  return best ? best.key : null;
}

function escapeTerm(value) {
  return String(value || '').replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Builds a Lucene query for the IA advancedsearch API.
function buildFilmQuery({ genreKey, keyword = '', minYear = null, maxYear = null }) {
  const genre = GENRES[genreKey] || null;
  const clauses = [];
  if (genre) {
    for (const collection of genre.collections) clauses.push(`collection:(${collection})`);
    for (const subject of genre.subjects) clauses.push(`subject:("${escapeTerm(subject)}")`);
  }
  const term = escapeTerm(keyword);
  let query = 'mediatype:(movies)';
  if (clauses.length) query += ` AND (${clauses.join(' OR ')})`;
  if (term) query += ` AND (title:(${term}) OR subject:(${term}) OR description:(${term}))`;
  if (minYear || maxYear) query += ` AND year:[${minYear || 1890} TO ${maxYear || 2030}]`;
  query += ' AND NOT collection:(podcasts) AND NOT collection:(youtubearchive) AND NOT collection:(tv)';
  return query;
}

module.exports = { GENRES, ROTATION, buildFilmQuery, detectGenre };

const { GENRES } = require('./genres');
const { displayTitle, normalizeTitle, yearRelation } = require('./titleMatcher');

const MINUTE = 60;

// feature | short | collection | trailer | tv-episode | clip
function classifyFilmKind({ title = '', runtimeSeconds = null, subjects = [], description = '', collections = [] } = {}) {
  const heading = String(title).toLowerCase();
  const subjectText = (subjects || []).join(' ').toLowerCase();
  const collectionText = (collections || []).join(' ').toLowerCase();
  const minutes = runtimeSeconds ? runtimeSeconds / MINUTE : null;

  if (/\b(?:trailer|teaser|promo(?:tional)?|preview|coming attractions)\b/.test(heading)) return 'trailer';
  if (/\bs\d{1,2}\s*e\d{1,3}\b|\bseason\s*\d+\b|\bepisode\s*\d+\b|\bep\.?\s*\d+\b/.test(heading)
    || /\btelevision\b|\btv series\b/.test(subjectText) || /\btelevisionarchive|classic_tv\b/.test(collectionText)) {
    return 'tv-episode';
  }
  if (/\b(?:clip|scene|excerpt|outtake|behind the scenes|intro|opening titles)\b/.test(heading)) return 'clip';
  if (/\b(?:collection|compilation|anthology|vol(?:ume)?\.?\s*\d+|\d+\s+(?:films|movies|shorts|cartoons)|double feature|triple feature|boxset|box set)\b/.test(heading)) {
    return 'collection';
  }
  if (minutes !== null) {
    if (minutes < 3) return 'clip';
    if (minutes < 40) return 'short';
    if (minutes > 240) return 'collection';
    return 'feature';
  }
  if (/\b(?:short|cartoon|two-reeler|one-reeler)\b/.test(`${heading} ${subjectText}`)) return 'short';
  if (/feature_films|feature film/.test(`${collectionText} ${subjectText}`)) return 'feature';
  return 'feature';
}

function runtimeMinutes(seconds) {
  return seconds ? Math.round(seconds / MINUTE) : null;
}

function genreRelevance(candidate, genreKey) {
  const genre = GENRES[genreKey];
  if (!genre || genreKey === 'classic') return { points: 12, reasons: [] };
  const reasons = [];
  let points = 0;
  const collections = (candidate.collections || []).map((value) => String(value).toLowerCase());
  if (genre.collections.some((collection) => collections.includes(collection.toLowerCase()))) {
    points += 9;
    reasons.push(`listed in the Internet Archive ${genre.label} collection`);
  }
  const subjectText = (candidate.subjects || []).join(' ').toLowerCase();
  const matchedSubject = genre.subjects.find((subject) => subjectText.includes(subject.toLowerCase()));
  if (matchedSubject) {
    points += 9;
    reasons.push(`tagged "${matchedSubject}"`);
  }
  const prose = `${candidate.title} ${candidate.description || ''}`.toLowerCase();
  const keyword = genre.keywords.find((word) => new RegExp(`\\b${word}`).test(prose));
  if (keyword) {
    points += 7;
    reasons.push(`mentions "${keyword}"`);
  }
  if (candidate.reference?.genres?.length) {
    const hit = candidate.reference.genres.find((value) => genre.omdbGenres.includes(String(value).toLowerCase()));
    if (hit) {
      points += 6;
      reasons.push(`OMDb lists it as ${hit}`);
    }
  }
  return { points: Math.min(25, points), reasons };
}

function scoreCandidate(candidate, { genreKey = 'classic' } = {}) {
  const reasons = [];
  const concerns = [];
  const relevance = genreRelevance(candidate, genreKey);
  reasons.push(...relevance.reasons);

  let appeal = 0;
  const reference = candidate.reference;
  if (reference && Number.isFinite(reference.rating)) {
    appeal += Math.round((reference.rating / 10) * 20);
    if (reference.votes) appeal += Math.min(10, Math.round(Math.log10(reference.votes + 1) * 2.5));
    reasons.push(`IMDb rating ${reference.rating}/10${reference.votes ? ` (${reference.votes.toLocaleString('en-US')} votes)` : ''} via OMDb`);
  } else {
    const downloads = Number(candidate.downloads) || 0;
    appeal += Math.min(30, Math.round((Math.log10(downloads + 1) / 6) * 30));
    if (downloads) reasons.push(`${downloads.toLocaleString('en-US')} Internet Archive downloads (popularity proxy, not a quality rating)`);
    concerns.push('No independent rating available; appeal is estimated from archive popularity.');
  }

  const kindPoints = { feature: 10, short: 6, collection: 5 }[candidate.kind] ?? 0;
  const minutes = runtimeMinutes(candidate.runtimeSeconds);
  let runtimePoints = 0;
  if (minutes === null) concerns.push('Runtime is not listed.');
  else if (candidate.kind === 'feature') runtimePoints = minutes >= 60 && minutes <= 180 ? 5 : 3;
  else runtimePoints = 2;
  if (minutes !== null) reasons.push(`${candidate.kind} of ${minutes} min`);

  let source = 0;
  if (candidate.year) source += 3; else concerns.push('Release year is missing.');
  if ((candidate.description || '').length > 80) source += 2;
  if (minutes !== null) source += 1;
  if (candidate.avgRating >= 4 && candidate.reviewCount >= 3) {
    source += 4;
    reasons.push(`${candidate.avgRating.toFixed(1)}/5 from ${candidate.reviewCount} archive reviews`);
  } else if (candidate.reviewCount >= 3) source += 2;

  const rightsClass = candidate.rights?.classification;
  const rightsPoints = rightsClass === 'likely-pd' ? 20 : rightsClass === 'needs-review' ? 8 : 0;
  if (rightsClass === 'likely-pd') reasons.push('rights evidence supports public domain');
  if (rightsClass === 'needs-review') concerns.push('Rights need a quick review before approval.');
  if ((candidate.alternateUploads || []).length) reasons.push(`${candidate.alternateUploads.length} alternate upload(s) compared; best copy chosen`);

  const score = Math.max(0, Math.min(100, Math.round(
    relevance.points + appeal + kindPoints + runtimePoints + source + rightsPoints
  )));
  return { score, reasons, concerns };
}

// Groups alternate uploads of the same film and returns one representative per film.
function clusterAlternateUploads(items, better) {
  const clusters = [];
  for (const item of items) {
    const key = normalizeTitle(item.title);
    const home = key && clusters.find((cluster) => (
      cluster.key === key && yearRelation(cluster.rep.year, item.year) !== 'different'
    ));
    if (home) home.members.push(item);
    else clusters.push({ key, rep: item, members: [item] });
  }
  return clusters.map((cluster) => {
    const rep = cluster.members.reduce((best, item) => (better(item, best) > 0 ? item : best));
    return {
      ...rep,
      alternateUploads: cluster.members
        .filter((item) => item !== rep)
        .map((item) => ({ identifier: item.externalId || item.identifier, title: item.title, sourceUrl: item.sourceUrl })),
    };
  });
}

module.exports = {
  classifyFilmKind,
  clusterAlternateUploads,
  displayTitle,
  runtimeMinutes,
  scoreCandidate,
};

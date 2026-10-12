// Title normalization shared by duplicate detection, clustering and scoring.
const EDITION_PATTERN = new RegExp(
  '\\b(?:'
  + 'full\\s+(?:movie|film|length)|complete\\s+(?:movie|film)|(?:public\\s+domain|pd)\\s+(?:movie|film)?|'
  + 'restored|restoration|remastered|re-?mastered|colou?rized|colou?rised|digitally\\s+(?:restored|remastered|enhanced)|'
  + 'hd|4k|1080p|720p|480p|blu-?ray|dvd(?:rip)?|vhs|ntsc|pal|uncut|extended|theatrical|'
  + 'director\'?s\\s+cut|special\\s+edition|ultimate\\s+edition|silent\\s+(?:version|film)|'
  + 'with\\s+(?:english\\s+)?subtitles|english\\s+subtitles|dubbed|ipod|mpeg4|mp4|avi|ogv|h264|'
  + 'cinematic\\s+version|original\\s+version|new\\s+score|version\\s*\\d*'
  + ')\\b',
  'gi'
);
const LEADING_ARTICLE = /^(?:the|a|an|le|la|les|el|los|las|der|die|das|il|l)\s+/;

function ascii(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function extractYear(value) {
  const match = String(value || '').match(/(?:^|[^\d])(18[89]\d|19\d{2}|20[0-4]\d)(?!\d)/);
  return match ? Number(match[1]) : null;
}

function stripDecorations(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\b(?:dvd|hd|vhs|video|audio)\s+quality(?:\s+upgrade)?\b/gi, ' ')
    .replace(EDITION_PATTERN, ' ');
}

function normalizeTitle(value) {
  let text = ascii(stripDecorations(value))
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:18[89]\d|19\d{2}|20[0-4]\d)\b\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutArticle = text.replace(LEADING_ARTICLE, '');
  if (withoutArticle) text = withoutArticle;
  return text.replace(/\band\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleTokens(value) {
  return normalizeTitle(value).split(' ').filter(Boolean);
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function containment(left, right) {
  const small = left.length <= right.length ? left : right;
  const large = new Set(left.length <= right.length ? right : left);
  if (!small.length) return 0;
  return small.filter((token) => large.has(token)).length / small.length;
}

// Returns { relation: 'exact' | 'contained' | 'similar' | 'none', score }.
function compareTitles(leftTitle, rightTitle) {
  const left = normalizeTitle(leftTitle);
  const right = normalizeTitle(rightTitle);
  if (!left || !right) return { relation: 'none', score: 0 };
  if (left === right || left.replace(/ /g, '') === right.replace(/ /g, '')) {
    return { relation: 'exact', score: 1 };
  }
  const leftTokens = left.split(' ');
  const rightTokens = right.split(' ');
  const overlap = jaccard(leftTokens, rightTokens);
  const contained = containment(leftTokens, rightTokens);
  const shorter = Math.min(leftTokens.length, rightTokens.length);
  if (shorter >= 2 && contained === 1) return { relation: 'contained', score: Math.max(overlap, 0.8) };
  if (leftTokens.length >= 3 && rightTokens.length >= 3 && overlap >= 0.75) {
    return { relation: 'similar', score: overlap };
  }
  return { relation: 'none', score: overlap };
}

function yearRelation(leftYear, rightYear) {
  const left = Number(leftYear);
  const right = Number(rightYear);
  const valid = (value) => Number.isInteger(value) && value >= 1850 && value <= 2100;
  if (!valid(left) || !valid(right)) return 'unknown';
  if (left === right) return 'same';
  return Math.abs(left - right) === 1 ? 'adjacent' : 'different';
}

function displayTitle(value) {
  const cleaned = String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b(?:dvd|hd|vhs|video|audio)\s+quality(?:\s+upgrade)?\b/gi, ' ')
    .replace(/[([{]\s*(?:18[89]\d|19\d{2}|20[0-4]\d)\s*[)\]}]/g, ' ')
    .replace(EDITION_PATTERN, ' ')
    .replace(/[\s\-–—:,|]+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || String(value || '').trim();
}

module.exports = {
  compareTitles,
  displayTitle,
  extractYear,
  normalizeTitle,
  titleTokens,
  yearRelation,
};

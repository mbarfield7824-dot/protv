const { deduplicateCandidates } = require('./candidateStore');
const { partitionCandidates, normalizedUrl } = require('../acquisition/duplicateDetector');
const { classifyCandidateRights } = require('../acquisition/rightsClassifier');
const { normalizeTitle } = require('../acquisition/titleMatcher');

function exclusionKind(match) {
  if (/^Same source URL/.test(match.reason)) return 'sourceUrl';
  if (/^(?:Same source item|Candidate was already drafted)/.test(match.reason)) return 'sourceId';
  return 'titleYear';
}

// Compares candidates against EVERY catalog record (draft, processing, errored, hidden,
// approved). Exact matches are excluded; possible duplicates stay visible with reasons.
function filterExistingCatalogCandidates(candidates, videos) {
  const split = partitionCandidates(candidates, videos);
  const excluded = { sourceId: 0, sourceUrl: 0, titleYear: 0, total: 0 };
  for (const candidate of split.existing) {
    excluded[exclusionKind(candidate.duplicateMatches[0])] += 1;
    excluded.total += 1;
  }
  const items = [...split.items, ...split.possible].map((candidate) => {
    const rights = classifyCandidateRights(candidate);
    return {
      ...candidate,
      rightsClassification: rights.classification,
      rightsLabel: rights.label,
      rightsBasis: rights.basis,
      rightsConcerns: rights.concerns,
    };
  });
  const order = new Map(candidates.map((candidate, index) => [candidate.id, index]));
  items.sort((left, right) => order.get(left.id) - order.get(right.id));
  return { items, excluded };
}

function activeReviewCandidates(candidates, videos) {
  const active = candidates.filter((candidate) => (
    ['pending', 'processing', 'failed'].includes(candidate.decision)
  ));
  const filtered = filterExistingCatalogCandidates(active, videos);
  return {
    ...filtered,
    items: deduplicateCandidates(filtered.items)
      .sort((left, right) => String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || ''))),
  };
}

module.exports = {
  activeReviewCandidates,
  filterExistingCatalogCandidates,
  normalizedSourceUrl: normalizedUrl,
  normalizedTitle: normalizeTitle,
};

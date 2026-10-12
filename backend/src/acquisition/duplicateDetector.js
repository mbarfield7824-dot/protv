// Catalog-wide duplicate detection. Considers EVERY record regardless of status
// (draft, processing, errored, hidden, rejected, approved).
const { comparableToFilm, classifyCatalogItem } = require('./contentTypes');
const { compareTitles, extractYear, yearRelation } = require('./titleMatcher');

const SOURCE_ALIASES = {
  internetarchive: 'internet-archive',
  wikimediacommons: 'wikimedia',
  wikimedia: 'wikimedia',
  youtubecreativecommons: 'youtube',
  youtube: 'youtube',
  publicdomainmovienet: 'publicdomainmovie',
  publicdomainmovie: 'publicdomainmovie',
};

function sourceKey(value) {
  const compact = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return SOURCE_ALIASES[compact] || compact;
}

function normalizedUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function recordYear(record) {
  const year = Number(record.year);
  if (Number.isInteger(year) && year >= 1850 && year <= 2100) return year;
  return extractYear(record.title);
}

function alternateTitles(record) {
  const values = [record.title];
  for (const key of ['alternateTitles', 'alternativeTitles', 'aka']) {
    if (Array.isArray(record[key])) values.push(...record[key]);
  }
  return values.filter((value) => typeof value === 'string' && value.trim());
}

function describe(record) {
  return {
    id: record.id || '',
    title: record.title || '',
    year: recordYear(record),
    contentType: record.contentType || '',
    family: classifyCatalogItem(record),
    approvalStatus: record.approvalStatus || '',
    status: record.status || '',
  };
}

function statusNote(record) {
  const parts = [];
  if (record.approvalStatus && record.approvalStatus !== 'approved') parts.push(record.approvalStatus);
  if (record.status && record.status !== 'ready') parts.push(record.status);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function candidateTitles(candidate) {
  const values = [candidate.title];
  if (Array.isArray(candidate.alternateTitles)) values.push(...candidate.alternateTitles);
  return values.filter((value) => typeof value === 'string' && value.trim());
}

function candidateYear(candidate) {
  const year = Number(candidate.year);
  if (Number.isInteger(year) && year >= 1850 && year <= 2100) return year;
  return extractYear(candidate.title);
}

function checkDuplicate(candidate, records = []) {
  const alreadyMatches = [];
  const possibleMatches = [];
  const cSource = sourceKey(candidate.source || candidate.sourceLabel);
  const cId = String(candidate.externalId || candidate.identifier || '').trim();
  const cUrl = normalizedUrl(candidate.sourceUrl);
  const cYear = candidateYear(candidate);
  const cTitles = candidateTitles(candidate);

  for (const record of records) {
    if (!record || (record.id && candidate.catalogId && record.id === candidate.catalogId)) continue;
    const note = statusNote(record);
    const rSource = sourceKey(record.publicDomainSource);
    const rId = String(record.publicDomainSourceId || '').trim();
    if (cSource && cId && rSource === cSource && rId && rId === cId) {
      alreadyMatches.push({ ...describe(record), reason: `Same source item (${cSource}:${cId})${note}` });
      continue;
    }
    const rUrl = normalizedUrl(record.publicDomainSourceUrl || record.sourceUrl);
    if (cUrl && rUrl && cUrl === rUrl) {
      alreadyMatches.push({ ...describe(record), reason: `Same source URL${note}` });
      continue;
    }
    if (record.publicDomainCandidateId && candidate.id && record.publicDomainCandidateId === candidate.id) {
      alreadyMatches.push({ ...describe(record), reason: `Candidate was already drafted${note}` });
      continue;
    }
    if (!comparableToFilm(record)) continue;

    const rYear = recordYear(record);
    const years = yearRelation(cYear, rYear);
    if (years === 'different') continue;
    let best = null;
    for (const left of cTitles) {
      for (const right of alternateTitles(record)) {
        const result = compareTitles(left, right);
        if (result.relation !== 'none' && (!best || result.score > best.score)) best = result;
      }
    }
    if (!best) continue;

    if (best.relation === 'exact' && years === 'same') {
      alreadyMatches.push({ ...describe(record), reason: `Same title and year (${rYear})${note}` });
    } else if (best.relation === 'exact') {
      const why = years === 'unknown'
        ? 'Same title; the release year is missing on one side'
        : `Same title; release years differ by one (${cYear} vs ${rYear})`;
      possibleMatches.push({ ...describe(record), reason: `${why}${note}` });
    } else {
      const why = best.relation === 'contained'
        ? 'One title contains the other'
        : `Very similar title (${Math.round(best.score * 100)}% word overlap)`;
      const yearText = years === 'same' ? `same year ${rYear}` : years === 'adjacent' ? 'years differ by one' : 'year unknown';
      possibleMatches.push({ ...describe(record), reason: `${why}; ${yearText}${note}` });
    }
  }

  if (alreadyMatches.length) {
    return buildResult('already-in-catalog', alreadyMatches);
  }
  if (possibleMatches.length) {
    return buildResult('possible-duplicate', possibleMatches);
  }
  return { status: 'new', label: 'New to PROtv', reasons: [], matches: [] };
}

function buildResult(status, matches) {
  return {
    status,
    label: status === 'already-in-catalog' ? 'Already in catalog' : 'Possible duplicate',
    reasons: [...new Set(matches.map((match) => `${match.title}: ${match.reason}`))].slice(0, 5),
    matches: matches.slice(0, 5),
  };
}

function annotateCandidates(candidates, records) {
  return candidates.map((candidate) => {
    const duplicate = checkDuplicate(candidate, records);
    return {
      ...candidate,
      duplicateStatus: duplicate.status,
      duplicateLabel: duplicate.label,
      duplicateReasons: duplicate.reasons,
      duplicateMatches: duplicate.matches,
    };
  });
}

// Splits candidates into new items, possible duplicates and exact catalog hits.
function partitionCandidates(candidates, records) {
  const result = { items: [], possible: [], existing: [] };
  for (const annotated of annotateCandidates(candidates, records)) {
    if (annotated.duplicateStatus === 'already-in-catalog') result.existing.push(annotated);
    else if (annotated.duplicateStatus === 'possible-duplicate') result.possible.push(annotated);
    else result.items.push(annotated);
  }
  return result;
}

// A retry of this candidate's own earlier draft is not a new duplicate.
function isOwnRetry(candidate, duplicate) {
  return ['processing', 'failed'].includes(candidate.decision)
    && duplicate.matches.length > 0
    && duplicate.matches.every((match) => /^(?:Same source item|Candidate was already drafted)/.test(match.reason));
}

module.exports = {
  annotateCandidates,
  checkDuplicate,
  isOwnRetry,
  normalizedUrl,
  partitionCandidates,
  recordYear,
};

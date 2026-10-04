const { isViewerEligible } = require('../catalog/readModel');
const { deduplicateCandidates } = require('./candidateStore');

function normalizedSource(source) {
  const value = String(source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    internetarchive: 'internetarchive',
    wikimediacommons: 'wikimedia',
    wikimedia: 'wikimedia',
    youtubecreativecommons: 'youtube',
    youtube: 'youtube',
    publicdomainmovienet: 'publicdomainmovie',
    publicdomainmovie: 'publicdomainmovie',
  };
  return aliases[value] || value;
}

function normalizedSourceUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function sourceIdentity(candidate, video) {
  const candidateSource = normalizedSource(candidate.source || candidate.sourceLabel);
  const videoSource = normalizedSource(video.publicDomainSource);
  const candidateId = String(candidate.externalId || candidate.identifier || '').trim();
  const videoId = String(video.publicDomainSourceId || '').trim();
  return Boolean(
    candidateSource
    && videoSource
    && candidateSource === videoSource
    && candidateId
    && videoId
    && candidateId === videoId
  );
}

function sourceUrlIdentity(candidate, video) {
  const candidateUrl = normalizedSourceUrl(candidate.sourceUrl);
  const catalogUrl = normalizedSourceUrl(video.publicDomainSourceUrl || video.sourceUrl);
  return Boolean(candidateUrl && catalogUrl && candidateUrl === catalogUrl);
}

function normalizedTitle(value, year) {
  if (typeof value !== 'string') return '';
  let title = value.normalize('NFKC').trim();
  if (year) {
    const escapedYear = String(year);
    title = title.replace(new RegExp(`(?:\\s*\\(${escapedYear}\\)|\\s*\\[${escapedYear}\\]|\\s+${escapedYear})\\s*$`), '');
  }
  return title
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchingYear(candidate, video) {
  const candidateYear = Number(candidate.year);
  const videoYear = Number(video.year);
  return Number.isInteger(candidateYear)
    && candidateYear >= 1800
    && candidateYear <= 2100
    && candidateYear === videoYear;
}

function matchingCatalogKind(candidate, video) {
  const kind = String(candidate.contentKind || '').toLowerCase();
  const catalogKind = String(video.contentType || '').toUpperCase();
  if (kind === 'movie') return catalogKind === 'MOVIE';
  if (kind === 'show') return catalogKind === 'SHOW' && Boolean(video.title);
  return false;
}

function titleAndYearIdentity(candidate, video) {
  if (!matchingCatalogKind(candidate, video) || !matchingYear(candidate, video)) return false;
  const candidateTitle = normalizedTitle(candidate.title, candidate.year);
  const catalogTitle = normalizedTitle(video.title, candidate.year);
  return Boolean(candidateTitle && candidateTitle === catalogTitle);
}

function filterExistingCatalogCandidates(candidates, videos) {
  const publicVideos = videos.filter((video) => isViewerEligible(video, videos));
  const items = [];
  const excluded = { sourceId: 0, sourceUrl: 0, titleYear: 0, total: 0 };

  for (const candidate of candidates) {
    const matchType = publicVideos.some((video) => sourceIdentity(candidate, video))
      ? 'sourceId'
      : publicVideos.some((video) => sourceUrlIdentity(candidate, video))
        ? 'sourceUrl'
        : publicVideos.some((video) => titleAndYearIdentity(candidate, video))
          ? 'titleYear'
          : '';
    if (matchType) {
      excluded[matchType] += 1;
      excluded.total += 1;
    } else {
      items.push(candidate);
    }
  }

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
  normalizedSourceUrl,
  normalizedTitle,
};

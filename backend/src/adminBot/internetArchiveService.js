const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov']);
const path = require('path');
const { classifyRights } = require('../acquisition/rightsClassifier');
const { GENRES, ROTATION, buildFilmQuery } = require('../acquisition/genres');
const { classifyFilmKind } = require('../acquisition/filmAnalysis');
const MAX_SEARCH_PAGE = 1000;
const DISCOVERY_GENRES_PER_RUN = 3;
const DISCOVERY_ROWS = 50;
const FILM_FIELDS = [
  'identifier', 'title', 'description', 'date', 'year', 'subject', 'licenseurl', 'rights',
  'downloads', 'runtime', 'creator', 'collection', 'avg_rating', 'num_reviews', 'mediatype',
];

function scalar(value) {
  if (Array.isArray(value)) return value.find((entry) => typeof entry === 'string' && entry.trim()) || '';
  return typeof value === 'string' ? value.trim() : '';
}

function listOf(value) {
  return (Array.isArray(value) ? value : [value]).filter((entry) => typeof entry === 'string' && entry.trim());
}

// Rights triage built on the acquisition classifier. `eligible` means "may enter the
// review queue" (not cleared items cannot); owner approval is still always required.
function explicitPublicDomainEvidence(metadata = {}) {
  const licenseUrl = scalar(metadata.licenseurl);
  const rights = scalar(metadata.rights);
  const year = Number.parseInt(scalar(metadata.year) || scalar(metadata.date).slice(0, 4), 10) || null;
  const verdict = classifyRights({
    title: scalar(metadata.title),
    year,
    licenseUrl,
    rights,
    description: scalar(metadata.description).replace(/<[^>]+>/g, ' '),
    subjects: listOf(metadata.subject),
    source: 'internet-archive',
  });
  const lowered = licenseUrl.toLowerCase();
  let label = verdict.basis;
  if (verdict.classification !== 'not-cleared') {
    if (lowered.includes('/publicdomain/zero/')) label = 'CC0 dedication';
    else if (lowered.includes('/publicdomain/mark/')) label = 'Public Domain Mark';
    else if (/\bpublic domain\b/i.test(rights)) label = rights;
  }
  return {
    eligible: verdict.classification !== 'not-cleared',
    label,
    url: licenseUrl,
    classification: verdict.classification,
    basis: verdict.basis,
    concerns: verdict.concerns,
    evidenceUrls: verdict.evidenceUrls,
    year: verdict.year,
  };
}

function normalizeText(value) {
  const text = scalar(value);
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRuntime(value) {
  const raw = scalar(value);
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Math.round(Number(raw));
    return seconds > 0 ? seconds : null;
  }
  const minuteMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?\.?)$/i);
  if (minuteMatch) return Math.round(Number(minuteMatch[1]) * 60) || null;
  const parts = raw.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? Math.round(seconds) : null;
}

function parseFilmDoc(doc) {
  const identifier = safeIdentifier(doc.identifier);
  const evidence = explicitPublicDomainEvidence(doc);
  const subjects = listOf(doc.subject).slice(0, 12);
  const collections = listOf(doc.collection);
  const title = normalizeText(doc.title) || identifier;
  const runtimeSeconds = parseRuntime(doc.runtime);
  const description = normalizeText(doc.description) || 'No source description is available.';
  const kind = classifyFilmKind({ title, runtimeSeconds, subjects, description, collections });
  return {
    id: `internet-archive:${identifier}`,
    source: 'internet-archive',
    sourceLabel: 'Internet Archive',
    externalId: identifier,
    identifier,
    title,
    year: Number.parseInt(scalar(doc.year) || scalar(doc.date).slice(0, 4), 10) || null,
    description,
    subjects,
    collections,
    creator: scalar(doc.creator),
    runtimeSeconds,
    downloads: Number(scalar(doc.downloads) || doc.downloads) || 0,
    avgRating: Number(scalar(doc.avg_rating) || doc.avg_rating) || 0,
    reviewCount: Number(scalar(doc.num_reviews) || doc.num_reviews) || 0,
    kind,
    contentKind: collections.some((name) => /^(?:classic_tv|televisionarchive)$/i.test(name)) ? 'show' : 'movie',
    sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    licenseEvidence: evidence,
    ingestionAvailable: evidence.eligible,
    ingestionReason: evidence.eligible ? '' : 'Rights are not cleared for this source copy.',
  };
}

function safeIdentifier(value) {
  const identifier = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(identifier)) {
    throw new Error('The Internet Archive identifier is invalid.');
  }
  return identifier;
}

function escapeSearchTerm(value) {
  return String(value || '')
    .trim()
    .slice(0, 120)
    .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
}

function boundedPage(value) {
  const page = Math.floor(Number(value));
  return Number.isFinite(page) ? Math.min(MAX_SEARCH_PAGE, Math.max(1, page)) : 1;
}

function selectVideoFile(files, maximumBytes) {
  const candidates = (Array.isArray(files) ? files : [])
    .filter((file) => {
      const extension = path.extname(String(file.name || '')).toLowerCase();
      const size = Number(file.size || 0);
      return VIDEO_EXTENSIONS.has(extension)
        && file.private !== 'true'
        && size > 0
        && size <= maximumBytes;
    })
    .sort((left, right) => {
      const originalDifference = Number(right.source === 'original') - Number(left.source === 'original');
      if (originalDifference) return originalDifference;
      const mp4Difference = Number(String(right.name).toLowerCase().endsWith('.mp4'))
        - Number(String(left.name).toLowerCase().endsWith('.mp4'));
      if (mp4Difference) return mp4Difference;
      return Number(right.size) - Number(left.size);
    });
  return candidates[0] || null;
}

class InternetArchiveService {
  constructor({ maximumFileBytes = 20 * 1024 * 1024 * 1024, paginationStore = null, fetchImpl = null } = {}) {
    this.name = 'Internet Archive';
    this.fetchImpl = fetchImpl;
    this.maximumFileBytes = maximumFileBytes;
    this.paginationStore = paginationStore;
  }

  async search({ query, contentKind = 'movie', page = 1 }) {
    const requestedPage = boundedPage(page);
    const term = escapeSearchTerm(query);
    if (term.length < 2) throw new Error('Enter at least two characters to search.');
    const kindQuery = contentKind === 'show'
      ? '(subject:television OR collection:televisionarchive)'
      : 'mediatype:movies';
    const searchQuery = `(${kindQuery}) AND (title:(${term}) OR subject:(${term}))`;
    const params = new URLSearchParams({
      q: searchQuery,
      output: 'json',
      rows: '20',
      page: String(requestedPage),
      sort: 'downloads desc',
    });
    for (const field of ['identifier', 'title', 'description', 'date', 'year', 'subject', 'licenseurl', 'rights']) {
      params.append('fl[]', field);
    }

    const requestPage = async (selectedPage) => {
      params.set('page', String(selectedPage));
      const response = await fetch(`https://archive.org/advancedsearch.php?${params}`, {
        headers: { 'User-Agent': 'PROtv-Admin-Bot/1.0' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Internet Archive search failed (${response.status}).`);
      return response.json();
    };
    let payload = await requestPage(requestedPage);
    const total = Number(payload.response?.numFound || 0);
    const pageCount = Math.min(MAX_SEARCH_PAGE, Math.max(1, Math.ceil(total / 20)));
    const actualPage = requestedPage > pageCount ? 1 : requestedPage;
    if (actualPage !== requestedPage) payload = await requestPage(actualPage);
    const docs = payload.response?.docs || [];
    return {
      total: Number(payload.response?.numFound || 0),
      page: actualPage,
      items: docs.map((item) => {
        const identifier = safeIdentifier(item.identifier);
        const evidence = explicitPublicDomainEvidence(item);
        return {
          identifier,
          title: normalizeText(item.title) || identifier,
          year: Number.parseInt(scalar(item.year) || scalar(item.date).slice(0, 4), 10) || null,
          description: normalizeText(item.description) || 'No source description is available.',
          subjects: (Array.isArray(item.subject) ? item.subject : [item.subject])
            .filter((value) => typeof value === 'string')
            .slice(0, 8),
          contentKind,
          sourceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
          thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
          licenseEvidence: evidence,
        };
      }),
    };
  }

  // Broad genre/keyword film search (no per-title hardcoding). Returns parsed, rights-triaged
  // candidates carrying the extra metadata needed for scoring and clustering.
  async searchFilms({ query, rows = DISCOVERY_ROWS, page = 1, sort = 'downloads desc' }) {
    const params = new URLSearchParams({
      q: query,
      output: 'json',
      rows: String(Math.min(100, Math.max(1, Math.floor(rows)))),
      page: String(boundedPage(page)),
      sort,
    });
    for (const field of FILM_FIELDS) params.append('fl[]', field);
    const response = await (this.fetchImpl || fetch)(`https://archive.org/advancedsearch.php?${params}`, {
      headers: { 'User-Agent': 'PROtv-Admin-Bot/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Internet Archive search failed (${response.status}).`);
    const payload = await response.json();
    const docs = payload.response?.docs || [];
    return {
      total: Number(payload.response?.numFound || 0),
      page: boundedPage(page),
      items: docs.filter((doc) => /^[A-Za-z0-9._-]+$/.test(String(doc.identifier || ''))).map(parseFilmDoc),
    };
  }

  async discover() {
    const items = [];
    const saved = await this.paginationStore?.get('internet-archive:genre-rotation');
    const start = Math.max(0, Number(saved?.cursor) || 0) % ROTATION.length;
    const warnings = [];
    for (let offset = 0; offset < DISCOVERY_GENRES_PER_RUN; offset += 1) {
      const genreKey = ROTATION[(start + offset) % ROTATION.length];
      const stateKey = `internet-archive:film-genre:${genreKey}`;
      const pageState = await this.paginationStore?.get(stateKey);
      try {
        const result = await this.searchFilms({
          query: buildFilmQuery({ genreKey }),
          page: boundedPage(pageState?.nextPage),
        });
        const pageCount = Math.min(MAX_SEARCH_PAGE, Math.max(1, Math.ceil(result.total / DISCOVERY_ROWS)));
        await this.paginationStore?.set(stateKey, {
          nextPage: result.page >= pageCount ? 1 : result.page + 1,
        });
        items.push(...result.items
          .filter((item) => item.licenseEvidence.eligible)
          .filter((item) => !['trailer', 'tv-episode', 'clip'].includes(item.kind))
          .map((item) => ({ ...item, discoveryGenre: GENRES[genreKey].label })));
      } catch (error) {
        warnings.push(`Internet Archive ${GENRES[genreKey].label} search failed: ${error.message}`);
      }
    }
    await this.paginationStore?.set('internet-archive:genre-rotation', {
      cursor: (start + DISCOVERY_GENRES_PER_RUN) % ROTATION.length,
    });
    if (warnings.length && !items.length) throw new Error(warnings[0]);
    return { items, ...(warnings.length ? { warning: warnings.join(' ') } : {}) };
  }

  async resolve(identifier, contentKind) {
    const safeId = safeIdentifier(identifier);
    if (!['movie', 'show'].includes(contentKind)) throw new Error('Content type must be movie or show.');
    const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(safeId)}`, {
      headers: { 'User-Agent': 'PROtv-Admin-Bot/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Internet Archive metadata request failed (${response.status}).`);
    const payload = await response.json();
    const metadata = payload.metadata || {};
    const evidence = explicitPublicDomainEvidence(metadata);
    if (!evidence.eligible) {
      throw new Error(`Rights are not cleared for this copy: ${evidence.basis}`);
    }
    const file = selectVideoFile(payload.files, this.maximumFileBytes);
    if (!file) throw new Error('No supported downloadable video file was found for this item.');
    const title = normalizeText(metadata.title) || safeId;
    const year = Number.parseInt(scalar(metadata.year) || scalar(metadata.date).slice(0, 4), 10) || null;
    const runtime = parseRuntime(metadata.runtime) || parseRuntime(file.length);
    return {
      identifier: safeId,
      source: 'Internet Archive',
      title,
      year,
      contentKind,
      sourceDescription: normalizeText(metadata.description),
      creator: scalar(metadata.creator),
      subjects: (Array.isArray(metadata.subject) ? metadata.subject : [metadata.subject])
        .filter((value) => typeof value === 'string')
        .slice(0, 20),
      runtime,
      mediaUrl: `https://archive.org/download/${encodeURIComponent(safeId)}/${encodeURIComponent(file.name)}`,
      posterUrl: `https://archive.org/services/img/${encodeURIComponent(safeId)}`,
      sourceUrl: `https://archive.org/details/${encodeURIComponent(safeId)}`,
      licenseEvidence: evidence,
      sourceFile: {
        name: file.name,
        format: file.format || '',
        size: Number(file.size),
        sha1: file.sha1 || '',
      },
    };
  }
}

module.exports = {
  InternetArchiveService,
  boundedPage,
  explicitPublicDomainEvidence,
  parseFilmDoc,
  parseRuntime,
  safeIdentifier,
  selectVideoFile,
};

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov']);
const path = require('path');
const PUBLIC_DOMAIN_LICENSE_PATHS = ['/publicdomain/zero/', '/publicdomain/mark/'];
const MAX_SEARCH_PAGE = 1000;
const DISCOVERY_SEARCHES = [
  { query: 'night of the living dead', contentKind: 'movie' },
  { query: 'his girl friday', contentKind: 'movie' },
  { query: 'public domain cartoons', contentKind: 'movie' },
  { query: 'classic television', contentKind: 'show' },
];

function scalar(value) {
  if (Array.isArray(value)) return value.find((entry) => typeof entry === 'string' && entry.trim()) || '';
  return typeof value === 'string' ? value.trim() : '';
}

function explicitPublicDomainEvidence(metadata = {}) {
  const licenseUrl = scalar(metadata.licenseurl).toLowerCase();
  const rights = scalar(metadata.rights);
  if (PUBLIC_DOMAIN_LICENSE_PATHS.some((part) => licenseUrl.includes(part))) {
    return { eligible: true, label: licenseUrl.includes('/zero/') ? 'CC0 dedication' : 'Public Domain Mark', url: scalar(metadata.licenseurl) };
  }
  if (/\bpublic domain\b/i.test(rights)) {
    return { eligible: true, label: rights, url: '' };
  }
  return {
    eligible: false,
    label: 'No explicit Public Domain or CC0 statement was supplied by the source.',
    url: scalar(metadata.licenseurl),
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
  const parts = raw.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? Math.round(seconds) : null;
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
  constructor({ maximumFileBytes = 20 * 1024 * 1024 * 1024, paginationStore = null } = {}) {
    this.name = 'Internet Archive';
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

  async discover() {
    const items = [];
    for (const search of DISCOVERY_SEARCHES) {
      const stateKey = `internet-archive:${search.contentKind}:${search.query}`;
      const saved = await this.paginationStore?.get(stateKey);
      const page = boundedPage(saved?.nextPage);
      const result = await this.search({ ...search, page });
      if (this.paginationStore) {
        const pageCount = Math.min(MAX_SEARCH_PAGE, Math.max(1, Math.ceil(result.total / 20)));
        await this.paginationStore.set(stateKey, {
          nextPage: result.page >= pageCount ? 1 : result.page + 1,
        });
      }
      items.push(...result.items
        .filter((item) => item.licenseEvidence.eligible)
        .map((item) => ({
          ...item,
          id: `internet-archive:${item.identifier}`,
          source: 'internet-archive',
          sourceLabel: 'Internet Archive',
          externalId: item.identifier,
          ingestionAvailable: true,
          ingestionReason: '',
        })));
    }
    return { items };
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
      throw new Error('The source does not provide explicit Public Domain or CC0 evidence.');
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
  parseRuntime,
  safeIdentifier,
  selectVideoFile,
};

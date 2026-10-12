// Read-only tools for the Administrator Assistant. None of these tools write to the catalog,
// call Mux, download media, or approve anything.
const { classifyCatalogItem, FAMILY_LABELS, isOriginalRecord } = require('../acquisition/contentTypes');
const { checkDuplicate, recordYear } = require('../acquisition/duplicateDetector');
const { classifyCandidateRights } = require('../acquisition/rightsClassifier');
const { compareTitles, normalizeTitle, yearRelation } = require('../acquisition/titleMatcher');
const { MUSIC_FORMATS } = require('../catalog/music');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'does', 'any', 'our', 'are', 'you',
  'movie', 'movies', 'film', 'films', 'video', 'videos', 'show', 'shows', 'episode', 'episodes',
  'podcast', 'podcasts', 'music', 'song', 'songs', 'find', 'search', 'list', 'about', 'titled', 'called',
]);
const TYPE_FILTERS = {
  all: null,
  movie: ['movie'],
  music: ['music'],
  podcast: ['podcast-show', 'podcast-episode'],
  'podcast-show': ['podcast-show'],
  'podcast-episode': ['podcast-episode'],
  original: ['original'],
  episode: ['episode'],
};
const MAX_LIST = 25;

function clampLimit(value, fallback = 10) {
  const limit = Math.floor(Number(value));
  return Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_LIST) : fallback;
}

function significantTokens(text) {
  return normalizeTitle(text).split(' ').filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function hasPoster(record) {
  return Boolean(String(record.posterUrl || record.thumbnailUrl || '').trim());
}

function summarize(record, shows = new Map()) {
  const family = classifyCatalogItem(record);
  const summary = {
    id: record.id,
    title: record.title || '',
    year: recordYear(record),
    type: FAMILY_LABELS[family],
    family,
    approval: record.approvalStatus || 'unknown',
    processing: record.status || 'unknown',
    playbackReady: Boolean(record.muxPlaybackId),
    categories: record.categories || [record.category || record.genre].filter(Boolean),
  };
  if (family === 'music') summary.musicFormat = record.musicFormat || null;
  if (family === 'podcast-episode') {
    summary.showId = record.podcastShowId || null;
    summary.showTitle = shows.get(record.podcastShowId)?.title || null;
    summary.episodeNumber = record.episodeNumber ?? null;
  }
  return summary;
}

class AssistantToolkit {
  constructor({ getCatalog, getCandidates = async () => [], getQueueStatus = async () => ({}), getFilmDiscovery = () => null }) {
    this.getCatalog = getCatalog;
    this.getCandidates = getCandidates;
    this.getQueueStatus = getQueueStatus;
    this.getFilmDiscovery = getFilmDiscovery;
  }

  definitions() {
    const type = { type: 'string', enum: Object.keys(TYPE_FILTERS), description: 'Content type filter.' };
    const fn = (name, description, properties = {}, required = []) => ({
      type: 'function',
      function: { name, description, parameters: { type: 'object', properties, required } },
    });
    return [
      fn('search_catalog', 'Search the ENTIRE PROtv catalog (all statuses, including drafts, hidden and errored) by title, creator or tag. Distinguishes movies, music videos, podcast shows, podcast episodes and originals.',
        { query: { type: 'string' }, contentType: type, limit: { type: 'integer' } }, ['query']),
      fn('check_duplicate', 'Check whether a film is already in the catalog or is a possible duplicate (handles articles, alternate titles, years and edition labels).',
        { title: { type: 'string' }, year: { type: 'integer' } }, ['title']),
      fn('search_film_candidates', 'Research public-domain FILM candidates on the Internet Archive that PROtv does not already have. Returns scored, explained, rights-triaged results. Films only (not music, podcasts or originals).',
        { genre: { type: 'string', description: 'e.g. horror, scifi, silent, comedy, noir, western, drama, adventure, war, animation' }, query: { type: 'string', description: 'optional keywords' }, limit: { type: 'integer' }, offset: { type: 'integer', description: 'skip this many already-shown results, for "more" requests' } }),
      fn('inspect_acquisition_evidence', 'Show source and rights evidence for a discovery candidate (by title or identifier) or for a catalog title.',
        { title: { type: 'string' }, identifier: { type: 'string' }, catalogId: { type: 'string' } }),
      fn('check_mux_asset_status', 'Inspect STORED playback/Mux state for a catalog title, or list titles with broken or stuck playback when no title is given. Does not call Mux.',
        { title: { type: 'string' }, catalogId: { type: 'string' } }),
      fn('find_catalog_gaps', 'List catalog titles missing posters or metadata, using the rules for each content type.',
        { kind: { type: 'string', enum: ['posters', 'metadata', 'all'] }, contentType: type, limit: { type: 'integer' } }),
      fn('catalog_health_summary', 'Summarize catalog health: counts by type and status, stuck/errored items, missing posters, internal duplicates and review-queue size.'),
    ];
  }

  async run(name, args = {}) {
    const handlers = {
      search_catalog: () => this.searchCatalog(args),
      check_duplicate: () => this.checkDuplicate(args),
      search_film_candidates: () => this.searchFilmCandidates(args),
      inspect_acquisition_evidence: () => this.inspectEvidence(args),
      check_mux_asset_status: () => this.checkMuxStatus(args),
      find_catalog_gaps: () => this.findGaps(args),
      catalog_health_summary: () => this.healthSummary(),
    };
    if (!handlers[name]) return { error: `Unknown tool: ${name}` };
    try {
      return await handlers[name]();
    } catch (error) {
      return { error: `${name} failed: ${error.message}` };
    }
  }

  async searchCatalog({ query = '', contentType = 'all', limit }) {
    const catalog = await this.getCatalog();
    const shows = new Map(catalog.filter((record) => classifyCatalogItem(record) === 'podcast-show').map((record) => [record.id, record]));
    const families = TYPE_FILTERS[contentType] === undefined ? null : TYPE_FILTERS[contentType];
    const tokens = significantTokens(query);
    const results = [];
    for (const record of catalog) {
      const family = classifyCatalogItem(record);
      if (families && !families.includes(family)) continue;
      let score = 0;
      if (query && compareTitles(query, record.title).relation === 'exact') score = 100;
      else if (query && ['contained', 'similar'].includes(compareTitles(query, record.title).relation)) score = 75;
      else if (tokens.length) {
        const haystack = new Set(significantTokens([
          record.title, record.creator, record.artist, record.hostName, record.description,
          ...(record.tags || []), ...(record.categories || []),
        ].filter(Boolean).join(' ')));
        const hits = tokens.filter((token) => haystack.has(token)).length;
        if (hits / tokens.length >= 0.6) score = 30 + (hits / tokens.length) * 40;
      } else if (families) score = 10;
      if (score > 0) results.push({ score, record });
    }
    results.sort((a, b) => b.score - a.score);
    const items = results.slice(0, clampLimit(limit)).map(({ record }) => summarize(record, shows));
    const byType = items.reduce((counts, item) => ({ ...counts, [item.type]: (counts[item.type] || 0) + 1 }), {});
    const showSummaries = items.filter((item) => item.family === 'podcast-show').map((item) => ({
      ...item,
      episodeCount: catalog.filter((record) => record.podcastShowId === item.id).length,
    }));
    return {
      catalogSize: catalog.length,
      contentType,
      matches: results.length,
      returned: items.length,
      byType,
      items: items.map((item) => showSummaries.find((show) => show.id === item.id) || item),
    };
  }

  async checkDuplicate({ title, year }) {
    if (!title) return { error: 'A title is required.' };
    const catalog = await this.getCatalog();
    const result = checkDuplicate({ title, year: Number(year) || null }, catalog);
    return {
      checked: { title, year: Number(year) || null },
      catalogSize: catalog.length,
      status: result.status,
      label: result.label,
      reasons: result.reasons,
      matches: result.matches.map((match) => ({
        id: match.id, title: match.title, year: match.year, type: match.family,
        approval: match.approvalStatus, processing: match.status, reason: match.reason,
      })),
    };
  }

  async searchFilmCandidates({ genre = '', query = '', limit = 10, offset = 0, contentType = 'movie' }) {
    if (contentType && contentType !== 'movie') {
      return { unsupported: true, reason: 'Acquisition discovery supports public-domain films only. Music, podcasts and originals are managed through their own admin tools.' };
    }
    const discovery = this.getFilmDiscovery();
    if (!discovery) return { error: 'Film discovery is not available on this server instance.' };
    const result = await discovery.discover({ genre, query, limit: clampLimit(limit), offset });
    return {
      genre: result.genreLabel,
      requested: result.requested,
      returned: result.shortlist.length,
      examined: result.examined,
      totalMatchedOnInternetArchive: result.totalMatched,
      candidates: result.shortlist.map((item) => ({
        rank: item.rank,
        title: item.title,
        year: item.year,
        kind: item.kind,
        runtimeMinutes: item.runtimeMinutes,
        score: item.score,
        why: item.reasons,
        concerns: item.concerns,
        rights: { classification: item.rights.classification, basis: item.rights.basis, concerns: item.rights.concerns },
        rating: item.reference ? { value: item.reference.rating, votes: item.reference.votes, source: item.reference.source } : null,
        identifier: item.identifier,
        sourceUrl: item.sourceUrl,
        alternateUploadsCompared: item.alternateUploads.length,
      })),
      alreadyInCatalogExcluded: result.excluded.alreadyInCatalog.map((entry) => `${entry.title}${entry.year ? ` (${entry.year})` : ''}`),
      possibleDuplicatesHeldBack: result.possibleDuplicates.map((entry) => `${entry.title}: ${entry.reasons[0]}`),
      excludedCounts: { ...result.excluded, alreadyInCatalog: result.excluded.alreadyInCatalog.length },
      enrichment: result.enrichment,
      notes: result.notes,
    };
  }

  async inspectEvidence({ title = '', identifier = '', catalogId = '' }) {
    const candidates = await this.getCandidates();
    const wanted = normalizeTitle(title);
    const candidate = candidates.find((item) => (
      (identifier && (item.externalId === identifier || item.id === identifier))
      || (wanted && normalizeTitle(item.title) === wanted)
    ));
    if (candidate) {
      const rights = classifyCandidateRights(candidate);
      return {
        found: 'discovery-candidate',
        title: candidate.title,
        year: candidate.year || null,
        source: candidate.sourceLabel || candidate.source,
        sourceUrl: candidate.sourceUrl,
        decision: candidate.decision,
        ingestionAvailable: Boolean(candidate.ingestionAvailable),
        rights: { classification: rights.label, basis: rights.basis, concerns: rights.concerns, evidenceUrls: rights.evidenceUrls },
        sourceLabel: candidate.licenseEvidence?.label || '',
      };
    }
    const catalog = await this.getCatalog();
    const record = catalog.find((item) => (catalogId && item.id === catalogId)
      || (wanted && normalizeTitle(item.title) === wanted));
    if (!record) return { found: false, message: 'No discovery candidate or catalog title matched.' };
    return {
      found: 'catalog-title',
      ...summarize(record),
      source: record.publicDomainSource || record.distributorName || null,
      sourceUrl: record.publicDomainSourceUrl || null,
      rightsClassification: record.publicDomainRightsClassification || null,
      rightsBasis: record.publicDomainRightsBasis || null,
      rightsReviewNote: record.publicDomainRightsReviewNote || null,
      licenseEvidence: record.publicDomainLicenseEvidence || record.licenseType || null,
      copyrightStatus: record.copyrightStatus || 'unknown',
      confirmedBy: record.publicDomainConfirmedBy ? 'an administrator' : null,
    };
  }

  async checkMuxStatus({ title = '', catalogId = '' }) {
    const catalog = await this.getCatalog();
    const diagnose = (record) => {
      const status = record.status || 'unknown';
      const issues = [];
      if (status === 'errored') issues.push('Mux processing is recorded as errored.');
      if (status === 'processing' && !record.muxAssetId) issues.push('Marked processing but no Mux asset was ever created (upload did not start).');
      if (status === 'processing' && record.muxAssetId) issues.push('Waiting on Mux to finish preparing the asset.');
      if (status === 'ready' && !record.muxPlaybackId) issues.push('Marked ready but has no playback ID.');
      if (record.muxPlaybackId && record.approvalStatus !== 'approved') issues.push(`Playback is ready but approval status is "${record.approvalStatus || 'unknown'}", so viewers cannot see it.`);
      if (!record.muxAssetId && !record.muxPlaybackId && status !== 'processing') issues.push('No Mux asset or playback ID is recorded.');
      return { ...summarize(record), hasMuxAsset: Boolean(record.muxAssetId), hasPlaybackId: Boolean(record.muxPlaybackId), issues };
    };
    const wanted = normalizeTitle(title);
    if (title || catalogId) {
      const matches = catalog.filter((record) => (catalogId && record.id === catalogId)
        || (wanted && compareTitles(title, record.title).relation !== 'none'));
      return {
        note: 'Based on stored catalog fields; live Mux state was not queried.',
        items: matches.slice(0, 8).map(diagnose),
      };
    }
    const problems = catalog.map(diagnose).filter((entry) => entry.issues.length
      && !(entry.processing === 'processing' && entry.hasMuxAsset));
    return {
      note: 'Based on stored catalog fields; live Mux state was not queried.',
      problemCount: problems.length,
      items: problems.slice(0, MAX_LIST),
    };
  }

  gapsFor(record) {
    const family = classifyCatalogItem(record);
    const gaps = [];
    if (!hasPoster(record)) gaps.push('poster');
    if (String(record.description || '').trim().length < 20) gaps.push('description');
    if (['movie', 'original', 'episode'].includes(family)) {
      if (!recordYear(record)) gaps.push('year');
      if (!(Number(record.runtime) || Number(record.duration))) gaps.push('runtime');
      if (!(record.categories?.length || record.category || record.genre)) gaps.push('category');
    }
    if (family === 'music' && !MUSIC_FORMATS.includes(record.musicFormat)) gaps.push('musicFormat');
    if (family === 'podcast-episode') {
      if (!record.podcastShowId) gaps.push('podcastShowId');
      if (!Number.isSafeInteger(record.episodeNumber)) gaps.push('episodeNumber');
    }
    return gaps;
  }

  async findGaps({ kind = 'all', contentType = 'all', limit }) {
    const catalog = await this.getCatalog();
    const families = TYPE_FILTERS[contentType] === undefined ? null : TYPE_FILTERS[contentType];
    const items = [];
    for (const record of catalog) {
      if (families && !families.includes(classifyCatalogItem(record))) continue;
      let gaps = this.gapsFor(record);
      if (kind === 'posters') gaps = gaps.filter((gap) => gap === 'poster');
      if (kind === 'metadata') gaps = gaps.filter((gap) => gap !== 'poster');
      if (gaps.length) items.push({ ...summarize(record), missing: gaps });
    }
    return {
      catalogSize: catalog.length,
      titlesWithGaps: items.length,
      returned: Math.min(items.length, clampLimit(limit, 15)),
      items: items.slice(0, clampLimit(limit, 15)),
      rules: 'Movies/originals need poster, description, year, runtime, category. Music needs a valid musicFormat. Podcast episodes need a show reference and episode number.',
    };
  }

  async healthSummary() {
    const catalog = await this.getCatalog();
    const byType = {};
    const byApproval = {};
    const byProcessing = {};
    let missingPosters = 0;
    let missingDescriptions = 0;
    for (const record of catalog) {
      const family = classifyCatalogItem(record);
      byType[FAMILY_LABELS[family]] = (byType[FAMILY_LABELS[family]] || 0) + 1;
      byApproval[record.approvalStatus || 'unknown'] = (byApproval[record.approvalStatus || 'unknown'] || 0) + 1;
      byProcessing[record.status || 'unknown'] = (byProcessing[record.status || 'unknown'] || 0) + 1;
      if (!hasPoster(record)) missingPosters += 1;
      if (String(record.description || '').trim().length < 20) missingDescriptions += 1;
    }
    const groups = new Map();
    for (const record of catalog.filter((item) => ['movie', 'episode'].includes(classifyCatalogItem(item)))) {
      const key = normalizeTitle(record.title);
      if (!key) continue;
      const bucket = groups.get(key) || [];
      bucket.push(record);
      groups.set(key, bucket);
    }
    const duplicateGroups = [...groups.values()]
      .filter((group) => group.length > 1 && group.some((a) => group.some((b) => a !== b
        && yearRelation(recordYear(a), recordYear(b)) !== 'different')))
      .slice(0, 10)
      .map((group) => group.map((record) => `${record.title} (${recordYear(record) || 'no year'}) [${record.approvalStatus || '?'}/${record.status || '?'}]${record.id ? ` ${record.id}` : ''}`));
    const broken = (await this.checkMuxStatus({})).problemCount;
    return {
      catalogSize: catalog.length,
      byType,
      byApproval,
      byProcessing,
      missingPosters,
      missingDescriptions,
      brokenPlayback: broken,
      internalDuplicateGroups: duplicateGroups,
      reviewQueue: await this.getQueueStatus(),
      isOriginalCount: catalog.filter(isOriginalRecord).length,
    };
  }
}

module.exports = { AssistantToolkit, TYPE_FILTERS };

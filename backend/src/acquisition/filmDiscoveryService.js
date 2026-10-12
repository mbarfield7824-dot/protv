// Genre-driven public-domain film discovery with catalog-wide duplicate exclusion,
// rights triage, alternate-upload clustering, optional OMDb enrichment and explainable scoring.
const { GENRES, buildFilmQuery, detectGenre } = require('./genres');
const { partitionCandidates } = require('./duplicateDetector');
const {
  classifyFilmKind,
  clusterAlternateUploads,
  displayTitle,
  runtimeMinutes,
  scoreCandidate,
} = require('./filmAnalysis');
const { compareTitles, yearRelation } = require('./titleMatcher');

const DEFAULT_KINDS = ['feature', 'short', 'collection'];
const RIGHTS_RANK = { 'likely-pd': 2, 'needs-review': 1, 'not-cleared': 0 };
const KIND_RANK = { feature: 3, collection: 2, short: 1 };
const MIN_SCORE = 30;
const MAX_LIMIT = 25;

function better(left, right) {
  const rights = (RIGHTS_RANK[left.rights.classification] || 0) - (RIGHTS_RANK[right.rights.classification] || 0);
  if (rights) return rights;
  const kind = (KIND_RANK[left.kind] || 0) - (KIND_RANK[right.kind] || 0);
  if (kind) return kind;
  const withRuntime = Number(Boolean(left.runtimeSeconds)) - Number(Boolean(right.runtimeSeconds));
  if (withRuntime) return withRuntime;
  return (left.downloads || 0) - (right.downloads || 0);
}

function referenceMatches(candidate, reference) {
  if (!reference) return false;
  const title = compareTitles(candidate.title, reference.title);
  if (!['exact', 'contained'].includes(title.relation)) return false;
  return yearRelation(candidate.year, reference.year) !== 'different';
}

class FilmDiscoveryService {
  constructor({ archive, loadCatalog, candidateStore = null, getReference = null, enrichTop = 12 }) {
    this.archive = archive;
    this.loadCatalog = loadCatalog;
    this.candidateStore = candidateStore;
    this.getReference = getReference;
    this.enrichTop = enrichTop;
  }

  async discover({
    genre = '',
    query = '',
    limit = 10,
    kinds = DEFAULT_KINDS,
    minYear = null,
    maxYear = null,
    pages = 2,
    minScore = MIN_SCORE,
    offset: rawOffset = 0,
  } = {}) {
    const offset = Math.max(0, Math.min(200, Math.floor(Number(rawOffset)) || 0));
    const requested = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit)) || 10));
    const genreKey = GENRES[genre] ? genre : detectGenre(`${genre} ${query}`);
    const keyword = String(query || '').trim();
    const searchQuery = buildFilmQuery({
      genreKey,
      keyword: genreKey ? '' : keyword,
      minYear,
      maxYear,
    });
    const notes = [];
    const excluded = {
      alreadyInCatalog: [], possibleDuplicates: 0, notCleared: 0, wrongKind: 0,
      previouslyRejected: 0, alternateUploads: 0, lowScore: 0,
    };

    const raw = new Map();
    let totalFound = 0;
    for (let page = 1; page <= Math.max(1, Math.min(4, pages)); page += 1) {
      const result = await this.archive.searchFilms({ query: searchQuery, rows: 100, page });
      totalFound = result.total;
      for (const item of result.items) raw.set(item.id, item);
      if (result.items.length < 100) break;
    }

    const catalog = await this.loadCatalog();
    const stored = this.candidateStore ? await this.candidateStore.all() : [];
    const rejected = new Set(stored.filter((entry) => entry.decision === 'rejected').map((entry) => entry.id));

    let pool = [...raw.values()].map((item) => ({
      ...item,
      kind: classifyFilmKind({ ...item }),
      rights: item.licenseEvidence,
    }));
    excluded.notCleared = pool.filter((item) => item.rights.classification === 'not-cleared').length;
    pool = pool.filter((item) => item.rights.classification !== 'not-cleared');
    const allowedKinds = new Set(kinds);
    excluded.wrongKind = pool.filter((item) => !allowedKinds.has(item.kind)).length;
    pool = pool.filter((item) => allowedKinds.has(item.kind));
    excluded.previouslyRejected = pool.filter((item) => rejected.has(item.id)).length;
    pool = pool.filter((item) => !rejected.has(item.id));

    const clustered = clusterAlternateUploads(pool, better);
    excluded.alternateUploads = pool.length - clustered.length;

    const split = partitionCandidates(clustered, catalog);
    excluded.alreadyInCatalog = split.existing.map((item) => ({
      title: item.title,
      year: item.year,
      reasons: item.duplicateReasons,
    }));
    excluded.possibleDuplicates = split.possible.length;

    const evaluate = (item) => ({ ...item, ...scoreCandidate(item, { genreKey: genreKey || 'classic' }) });
    let scored = split.items.map(evaluate).sort((a, b) => b.score - a.score);

    const enrichment = await this.enrich(scored.slice(0, this.enrichTop));
    if (enrichment.applied) {
      scored = scored.map((item) => evaluate(enrichment.applied.get(item.id) || item))
        .sort((a, b) => b.score - a.score);
    }

    const qualified = scored.filter((item) => item.score >= minScore);
    excluded.lowScore = scored.length - qualified.length;
    const shortlist = qualified.slice(offset, offset + requested).map((item, index) => this.present(item, offset + index + 1));

    if (shortlist.length < requested) {
      const reasons = [];
      reasons.push(`${totalFound.toLocaleString('en-US')} Internet Archive items matched the search; ${raw.size} were examined`);
      if (excluded.alreadyInCatalog.length) reasons.push(`${excluded.alreadyInCatalog.length} already in PROtv`);
      if (excluded.possibleDuplicates) reasons.push(`${excluded.possibleDuplicates} possible duplicates held back`);
      if (excluded.notCleared) reasons.push(`${excluded.notCleared} not cleared for public-domain use`);
      if (excluded.wrongKind) reasons.push(`${excluded.wrongKind} were trailers, clips or TV episodes`);
      if (excluded.alternateUploads) reasons.push(`${excluded.alternateUploads} were alternate uploads of other films`);
      if (excluded.lowScore) reasons.push(`${excluded.lowScore} scored below the quality bar of ${minScore}`);
      notes.push(`Only ${shortlist.length} of the ${requested} requested films qualified: ${reasons.join('; ')}.`);
    }
    if (!enrichment.available) notes.push(enrichment.note);

    return {
      genre: genreKey,
      genreLabel: genreKey ? GENRES[genreKey].label : 'Any',
      query: keyword,
      requested,
      searchQuery,
      examined: raw.size,
      totalMatched: totalFound,
      shortlist,
      possibleDuplicates: split.possible.slice(0, 10).map((item) => ({
        title: item.title,
        year: item.year,
        identifier: item.externalId,
        sourceUrl: item.sourceUrl,
        reasons: item.duplicateReasons,
      })),
      excluded,
      enrichment: { status: enrichment.available ? 'ok' : 'unavailable', enriched: enrichment.count, note: enrichment.note || '' },
      notes,
    };
  }

  async enrich(items) {
    if (!this.getReference) {
      return { available: false, count: 0, note: 'No OMDb key is configured, so ratings are not shown; appeal is estimated from Internet Archive popularity.' };
    }
    const applied = new Map();
    let failures = 0;
    let unconfigured = false;
    for (const item of items) {
      if (unconfigured) break;
      try {
        const reference = await this.getReference({ title: displayTitle(item.title), year: item.year });
        if (referenceMatches(item, reference)) applied.set(item.id, { ...item, reference });
      } catch (error) {
        if (/not configured/i.test(error.message)) unconfigured = true;
        else if (!/No .*match|not found/i.test(error.message)) failures += 1;
      }
    }
    if (unconfigured) {
      return { available: false, count: 0, note: 'OMDb is not configured, so ratings are not shown; appeal is estimated from Internet Archive popularity.' };
    }
    return {
      available: true,
      count: applied.size,
      applied,
      note: failures ? `OMDb lookups failed for ${failures} title(s).` : '',
    };
  }

  present(item, rank) {
    return {
      rank,
      id: item.id,
      title: displayTitle(item.title),
      originalTitle: item.title,
      year: item.year,
      kind: item.kind,
      runtimeMinutes: runtimeMinutes(item.runtimeSeconds),
      score: item.score,
      reasons: item.reasons,
      concerns: item.concerns,
      rights: {
        classification: item.rights.classification,
        label: item.rights.label || '',
        basis: item.rights.basis,
        concerns: item.rights.concerns,
        evidenceUrls: item.rights.evidenceUrls,
      },
      reference: item.reference
        ? {
          source: 'OMDb (IMDb data)',
          rating: item.reference.rating ?? null,
          votes: item.reference.votes ?? null,
          genres: item.reference.genres || [],
          plot: item.reference.plot || '',
        }
        : null,
      downloads: item.downloads,
      identifier: item.externalId,
      sourceUrl: item.sourceUrl,
      thumbnailUrl: item.thumbnailUrl,
      alternateUploads: item.alternateUploads || [],
      duplicateStatus: item.duplicateStatus,
      candidate: {
        id: item.id,
        source: item.source,
        sourceLabel: item.sourceLabel,
        externalId: item.externalId,
        title: displayTitle(item.title),
        year: item.year,
        description: item.description,
        subjects: item.subjects,
        contentKind: item.contentKind,
        sourceUrl: item.sourceUrl,
        thumbnailUrl: item.thumbnailUrl,
        licenseEvidence: item.licenseEvidence,
        ingestionAvailable: item.ingestionAvailable,
        ingestionReason: item.ingestionReason,
        acquisitionScore: item.score,
        acquisitionReasons: item.reasons,
        filmKind: item.kind,
      },
    };
  }

  async queue(shortlist) {
    if (!this.candidateStore) throw new Error('The review queue is not available.');
    return this.candidateStore.upsert(shortlist.map((entry) => entry.candidate));
  }
}

module.exports = { DEFAULT_KINDS, FilmDiscoveryService, MIN_SCORE, referenceMatches };

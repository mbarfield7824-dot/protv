// Readable public addresses: /title/<slug> for films, episodes and music, /series/<slug> for shows.
//
// A slug is assigned once, the first time its title or show is publicly listed, and is then kept for good:
// renaming a title never changes its published address. Internal IDs (Firestore document IDs, series keys)
// stay the identity everywhere else; a slug is only another name for the public page. Slugs are stored in the
// Firestore collection publicSlugs, one document per slug ("title:<slug>" / "series:<slug>"), so an address can
// never be claimed twice. Nothing here decides what is public: callers pass only content that already passed
// the public eligibility rules, and every page re-checks eligibility by internal ID after a slug is resolved.
const crypto = require('node:crypto');
const { detailEligible, seriesDetails, showTitle } = require('./details');
const { seriesKey } = require('./readModel');

const COLLECTION = 'publicSlugs';
const KINDS = new Set(['title', 'series']);
const TITLE_TYPES = new Set(['MOVIE', 'EPISODE', 'MUSIC', 'PODCAST_EPISODE']);
const MAX_LENGTH = 80;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function slugify(value) {
  const slug = text(value).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['‘’ʼ`]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length <= MAX_LENGTH) return slug;
  const cut = slug.slice(0, MAX_LENGTH);
  return cut.slice(0, cut.lastIndexOf('-') > 20 ? cut.lastIndexOf('-') : MAX_LENGTH).replace(/-+$/, '');
}

// A well-formed slug: lowercase letters, digits and single hyphens.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const shortHash = (target, length) => BigInt(`0x${crypto.createHash('sha256').update(target).digest('hex').slice(0, 16)}`)
  .toString(36).padStart(length, '0').slice(0, length);

// "Show - Episode" names keep the show in front exactly once.
function withShow(show, name) {
  const showSlug = slugify(show);
  const nameSlug = slugify(name);
  if (!showSlug) return nameSlug;
  if (!nameSlug) return showSlug;
  // A name that already contains every word of the show ("Fleischer Studios' Superman") is used as it is.
  const words = new Set(nameSlug.split('-'));
  if (showSlug.split('-').every((word) => words.has(word))) return nameSlug;
  return `${showSlug}-${nameSlug}`;
}

// Readable candidates in order of preference, then stable hashed ones derived from the internal ID.
function candidates(entry) {
  const base = slugify(entry.name) || (entry.kind === 'series' ? 'series' : 'title');
  const preferred = [base];
  if (entry.episode) {
    // An episode named only after its show leads with its season and episode number.
    const marker = `s${entry.episode.season}-e${entry.episode.number}`;
    const numbered = base.endsWith(`-${marker}`) ? base : `${base}-${marker}`;
    if (base === entry.showSlug) preferred[0] = numbered;
    else preferred.push(numbered);
  }
  if (entry.year) preferred.push(`${base}-${entry.year}`);
  return [...new Set([...preferred, `${base}-${shortHash(entry.target, 6)}`, `${base}-${shortHash(entry.target, 12)}`])];
}

// What each public title and show would be called. Only content that has a public page is listed.
function publicSlugEntries(videos) {
  const records = Array.isArray(videos) ? videos : [];
  const shows = new Map(records.filter((record) => record.contentType === 'PODCAST_SHOW')
    .map((record) => [record.id, text(record.title)]));
  const entries = [];
  for (const record of records) {
    if (!TITLE_TYPES.has(record?.contentType) || typeof record.id !== 'string' || !record.id) continue;
    if (!detailEligible(record, records)) continue;
    const yearValue = Number(record.year);
    const entry = { kind: 'title', target: record.id, name: text(record.title),
      ...(Number.isInteger(yearValue) && yearValue >= 1000 && yearValue <= 9999 ? { year: yearValue } : {}) };
    if (record.contentType === 'EPISODE') {
      entry.name = withShow(record.seriesTitle, text(record.episodeTitle) || text(record.title));
      entry.showSlug = slugify(record.seriesTitle);
      if (Number.isInteger(record.seasonNumber) && Number.isInteger(record.episodeNumber)) {
        entry.episode = { season: record.seasonNumber, number: record.episodeNumber };
      }
    } else if (record.contentType === 'PODCAST_EPISODE') {
      entry.name = withShow(shows.get(record.podcastShowId), text(record.title));
      entry.showSlug = slugify(shows.get(record.podcastShowId));
      if (Number.isInteger(record.episodeNumber)) entry.episode = { season: record.seasonNumber || 1, number: record.episodeNumber };
    }
    entries.push(entry);
  }
  // A show is identified by its title (its key), so its address also remembers the records that make it up:
  // after a rename the show keeps its address through any record it still shares.
  const membersByKey = new Map();
  for (const record of records) {
    if (!['EPISODE', 'SERIES'].includes(record?.contentType) || !showTitle(record) || typeof record.id !== 'string') continue;
    const key = seriesKey(showTitle(record));
    if (!membersByKey.has(key)) membersByKey.set(key, []);
    membersByKey.get(key).push(record.id);
  }
  for (const series of seriesDetails(records)) {
    entries.push({ kind: 'series', target: series.key, name: series.title, members: (membersByKey.get(series.key) || []).sort() });
  }
  return entries;
}

// The resolved addresses for one request.
// entries: the request's current public titles and shows (publicSlugEntries), used to follow a renamed show.
class PublicPaths {
  constructor(documents = [], entries = []) {
    this.byTarget = new Map();
    this.bySlug = new Map();
    const series = entries.filter((entry) => entry.kind === 'series');
    const currentKeys = new Set(series.map((entry) => entry.target));
    const keyByMember = new Map();
    for (const entry of series) for (const member of entry.members || []) keyByMember.set(member, entry.target);
    // A show's address follows it to its current key: its own key, else the key of a show it shares a record with.
    const currentTarget = (document) => {
      if (document.kind !== 'series' || currentKeys.has(document.target)) return document.target;
      const moved = (Array.isArray(document.members) ? document.members : []).map((member) => keyByMember.get(member)).find(Boolean);
      return moved || document.target;
    };
    // An Administrator's recorded correction (primary, newest first) is the address; otherwise the first slug a
    // target received is. Every other slug of the target permanently redirects to it.
    const time = (document) => String(document.createdAt || '');
    const ordered = [...documents].sort((a, b) => Number(b.primary === true) - Number(a.primary === true)
      || (a.primary === true ? time(b).localeCompare(time(a)) : time(a).localeCompare(time(b)))
      || String(a.slug).localeCompare(String(b.slug)));
    for (const document of ordered) {
      if (!KINDS.has(document.kind) || !SLUG_PATTERN.test(document.slug) || typeof document.target !== 'string') continue;
      const target = currentTarget(document);
      this.bySlug.set(`${document.kind}:${document.slug}`, target);
      const key = `${document.kind}:${target}`;
      if (!this.byTarget.has(key)) this.byTarget.set(key, document.slug);
    }
  }

  slug(kind, target) { return this.byTarget.get(`${kind}:${target}`) || null; }

  // The path segment for a page: its slug, or its internal ID while it has none.
  segment(kind, target) { return this.slug(kind, target) || target; }

  // A requested path segment: an internal ID (checked first, so existing links keep their meaning) or a slug.
  // Returns the internal target, or null. Eligibility is the caller's job.
  target(kind, segment, isTarget) {
    if (isTarget(segment)) return segment;
    const normalized = String(segment).toLowerCase();
    return this.bySlug.get(`${kind}:${normalized}`) || null;
  }

  // Shallow copies carrying publicSlug (the title's) and publicSeriesSlug (its show's), so the public
  // serializers can include them. Records without an address are returned unchanged.
  decorate(videos) {
    return videos.map((video) => {
      const slug = this.slug('title', video.id);
      const show = ['EPISODE', 'SERIES'].includes(video?.contentType) && showTitle(video)
        ? this.slug('series', seriesKey(showTitle(video))) : null;
      return slug || show ? { ...video, ...(slug ? { publicSlug: slug } : {}), ...(show ? { publicSeriesSlug: show } : {}) } : video;
    });
  }
}

function firestoreSlugStore(db) {
  const collection = () => db.collection(COLLECTION);
  return {
    async list() {
      const snapshot = await collection().get();
      const documents = [];
      snapshot.forEach((document) => documents.push(document.data()));
      return documents;
    },
    async create(document) {
      try {
        await collection().doc(`${document.kind}:${document.slug}`).create(document);
        return true;
      } catch (error) {
        if (error?.code === 6 || /already exists/i.test(error?.message || '')) return false;
        throw error;
      }
    },
  };
}

function memorySlugStore(initial = []) {
  const documents = new Map(initial.map((document) => [`${document.kind}:${document.slug}`, document]));
  return {
    documents,
    async list() { return [...documents.values()]; },
    async create(document) {
      const key = `${document.kind}:${document.slug}`;
      if (documents.has(key)) return false;
      documents.set(key, document);
      return true;
    },
  };
}

function createSlugRegistry({ store, ttlMs = 60_000, now = () => Date.now(), logger = console } = {}) {
  let cache = null;
  let loadedAt = 0;
  const load = async (force) => {
    if (!force && cache && now() - loadedAt < ttlMs) return cache;
    cache = await store.list();
    loadedAt = now();
    return cache;
  };

  // Assigns slugs to entries that have none, then returns the request's addresses. Never throws: if the slug
  // store is unavailable the pages keep their internal-ID addresses, exactly as before this feature.
  async function ensure(entries, { reservedTargets = new Set() } = {}) {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const documents = await load(attempt > 0);
        const paths = new PublicPaths(documents, entries);
        const missing = entries.filter((entry) => !paths.slug(entry.kind, entry.target))
          .sort((a, b) => a.kind.localeCompare(b.kind) || a.target.localeCompare(b.target));
        if (!missing.length) return paths;
        const taken = new Set(documents.map((document) => `${document.kind}:${document.slug}`));
        const claims = [];
        for (const entry of missing) {
          const slug = candidates(entry).find((candidate) => SLUG_PATTERN.test(candidate)
            && !taken.has(`${entry.kind}:${candidate}`) && !reservedTargets.has(candidate));
          if (!slug) continue;
          taken.add(`${entry.kind}:${slug}`);
          claims.push({ kind: entry.kind, slug, target: entry.target, name: entry.name, createdAt: new Date(now()).toISOString(),
            ...(entry.members ? { members: entry.members } : {}) });
        }
        const results = await Promise.all(claims.map((claim) => store.create(claim)));
        const created = claims.filter((_, index) => results[index]);
        cache = [...documents, ...created];
        loadedAt = now();
        if (results.every(Boolean)) return new PublicPaths(cache, entries);
        // Another server claimed one of these slugs at the same moment: re-read and try again.
      }
      return new PublicPaths(await load(true), entries);
    } catch (error) {
      logger.error('Public slugs are unavailable; internal-ID addresses are used:', error.message);
      return new PublicPaths(cache || [], entries);
    }
  }

  return { ensure, invalidate() { cache = null; } };
}

// Without a slug store every page keeps its internal-ID address (the behavior before this feature).
const NO_SLUGS = { async ensure() { return new PublicPaths([]); }, invalidate() {} };

let sharedRegistry = null;
// One registry per server instance, backed by Firestore. Local file storage has no shared store to keep
// addresses stable, so it keeps internal-ID addresses.
function defaultSlugRegistry() {
  if (!sharedRegistry) {
    const { db } = require('../firebase');
    sharedRegistry = db ? createSlugRegistry({ store: firestoreSlugStore(db) }) : NO_SLUGS;
  }
  return sharedRegistry;
}

// Tests and local tools may supply their own store for the routes that use the shared registry.
function setDefaultSlugRegistry(registry) { sharedRegistry = registry; }

// The addresses for a list of catalog records (already filtered for the requesting platform).
async function publicPathsFor(videos, registry = defaultSlugRegistry()) {
  return (registry || defaultSlugRegistry()).ensure(publicSlugEntries(videos), {
    reservedTargets: new Set((Array.isArray(videos) ? videos : []).map((video) => video.id)),
  });
}

module.exports = {
  COLLECTION, SLUG_PATTERN, slugify, candidates, publicSlugEntries, PublicPaths,
  firestoreSlugStore, memorySlugStore, createSlugRegistry, defaultSlugRegistry, publicPathsFor, NO_SLUGS, setDefaultSlugRegistry,
};

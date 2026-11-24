const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { comingSoonCatalog, metadataAllowed, titleDetails, seriesDetails } = require('./details');
const { seriesKey } = require('./readModel');
const { EASTERN, PremiereInputError, premiereInput, promotionPremiere } = require('./premiereTime');

// Coming Soon promotions: Administrator-managed promotional cards. A promotion targets either
//   - an existing catalog title: an unreleased film or episode, a show, or one upcoming episode of a streaming show, or
//   - a new upcoming title that is not in the catalog yet (title + content type only; no catalog record is created).
// A promotion stores presentation only: artwork, description, a premiere date or TBD, and an optional promotional
// trailer (its own signed Mux upload, or an existing catalog trailer). It never changes a title, its media, rights,
// contracts or release state, never exposes full-length media, and leaves Coming Soon automatically when the title
// is released (or, for a title not yet linked to the catalog, when its premiere date passes). Records are kept.

const COLLECTION = 'comingSoonPromotions';
const MIGRATIONS = 'comingSoonPromotionMigrations';
const STATUSES = new Set(['published', 'hidden']);
const TARGET_KINDS = new Set(['title', 'episode', 'series', 'upcoming']);
const UPCOMING_TYPES = { film: 'Film', series: 'Series', documentary: 'Documentary', episode: 'Episode' };
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{1,200}$/;
const SITE_PATH = /^\/(?!\/)[A-Za-z0-9._~/-]{1,300}$/;
const TRAILER_TYPES = new Set(['MOVIE', 'EPISODE', 'SERIES']);

class PromotionInputError extends Error {}
class PromotionConflictError extends Error {}
class PromotionNotFoundError extends Error {}

const text = (value, max, label) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new PromotionInputError(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new PromotionInputError(`${label} must be ${max} characters or fewer.`);
  return trimmed;
};
const positive = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 9999) throw new PromotionInputError(`${label} must be a whole number.`);
  return number;
};

function promotionInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PromotionInputError('Invalid promotion.');
  const target = body.target || {};
  if (!TARGET_KINDS.has(target.kind)) throw new PromotionInputError('Choose a catalog title or describe a new upcoming title.');
  let cleanTarget;
  if (target.kind === 'upcoming') {
    if (!Object.hasOwn(UPCOMING_TYPES, target.contentType)) throw new PromotionInputError('Choose film, series, documentary or episode.');
    cleanTarget = { kind: 'upcoming', contentType: target.contentType };
  } else {
    if (typeof target.id !== 'string' || !RECORD_ID.test(target.id)) throw new PromotionInputError('Choose an existing title to promote.');
    const seasonNumber = target.kind === 'series' ? positive(target.seasonNumber, 'Season number') : null;
    const episodeNumber = target.kind === 'series' ? positive(target.episodeNumber, 'Episode number') : null;
    if ((seasonNumber === null) !== (episodeNumber === null)) throw new PromotionInputError('Enter both the season and the episode number, or neither.');
    cleanTarget = { kind: target.kind, id: target.id, ...(seasonNumber ? { seasonNumber, episodeNumber } : {}) };
  }
  const title = text(body.title, 160, 'Card title');
  if (cleanTarget.kind === 'upcoming' && !title) throw new PromotionInputError('Enter the title of the upcoming film, series, documentary or episode.');
  const artworkUrl = text(body.artworkUrl, 2000, 'Artwork');
  if (artworkUrl && !SITE_PATH.test(artworkUrl) && !/^https:\/\/[^\s"'<>]+$/.test(artworkUrl)) {
    throw new PromotionInputError('Artwork must be an uploaded image, an https:// link or a /path on watchprotv.com.');
  }
  // A premiere date in Eastern time with an optional time on that date, or TBD (see premiereTime.js).
  let premiere;
  try { premiere = premiereInput(body); } catch (error) {
    if (error instanceof PremiereInputError) throw new PromotionInputError(error.message);
    throw error;
  }
  const status = body.status === undefined ? 'hidden' : body.status;
  if (!STATUSES.has(status)) throw new PromotionInputError('Status must be published or hidden.');
  const sortOrder = body.sortOrder === undefined || body.sortOrder === null || body.sortOrder === '' ? 0 : Number(body.sortOrder);
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 9999) throw new PromotionInputError('Order must be a whole number.');
  return {
    target: cleanTarget, title, description: text(body.description, 1000, 'Description'),
    artworkUrl, premiereAt: premiere?.premiereAt ?? null, premiereDate: premiere?.premiereDate ?? null,
    premiereTime: premiere?.premiereTime ?? null, status, sortOrder, rightsConfirmed: body.rightsConfirmed === true,
  };
}

// The one-time move of the homepage card that used to be written into the website code. It runs once; removing the
// promotion afterwards keeps it removed.
const SEED_MIGRATIONS = [{
  id: '2212-episode-3',
  promotion: {
    id: '2212-episode-3-c-fluid',
    target: { kind: 'series', id: seriesKey('2212'), seasonNumber: 1, episodeNumber: 3 },
    title: '2212 · Episode 3: C-Fluid', description: '',
    artworkUrl: '/coming-soon/2212-episode-3-c-fluid.jpg', premiereAt: null, status: 'published', sortOrder: 0,
  },
}];

class PromotionStore {
  constructor({ db, filePath, production = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production', seeds = SEED_MIGRATIONS }) {
    this.db = db;
    this.filePath = filePath && path.resolve(filePath);
    this.production = production;
    this.seeds = seeds;
    this.migrated = false;
    this.queue = Promise.resolve();
  }

  async readLocal() {
    if (this.production) throw new Error('Production Coming Soon promotions require Firestore.');
    try {
      const state = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      return { promotions: state.promotions || {}, migrations: state.migrations || {} };
    } catch (error) {
      if (error.code === 'ENOENT') return { promotions: {}, migrations: {} };
      throw error;
    }
  }

  async writeLocal(mutate) {
    const run = this.queue.then(async () => {
      const state = await this.readLocal();
      const result = await mutate(state);
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, this.filePath);
      } finally { await fs.rm(temporary, { force: true }); }
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  // Creates each seed promotion once, with a marker, in one transaction. Never overwrites an existing promotion.
  async migrate() {
    if (this.migrated) return;
    for (const seed of this.seeds) {
      const record = { ...seed.promotion, version: 1, createdAt: new Date().toISOString(), createdBy: `migration:${seed.id}` };
      record.updatedAt = record.createdAt; record.updatedBy = record.createdBy;
      if (this.db) {
        await this.db.runTransaction(async (transaction) => {
          const marker = this.db.collection(MIGRATIONS).doc(seed.id);
          const ref = this.db.collection(COLLECTION).doc(record.id);
          const [done, existing] = [await transaction.get(marker), await transaction.get(ref)];
          if (done.exists) return;
          if (!existing.exists) transaction.set(ref, record);
          transaction.set(marker, { appliedAt: record.createdAt, promotionId: record.id });
        });
      } else {
        await this.writeLocal((state) => {
          if (state.migrations[seed.id]) return;
          if (!state.promotions[record.id]) state.promotions[record.id] = record;
          state.migrations[seed.id] = { appliedAt: record.createdAt, promotionId: record.id };
        });
      }
    }
    this.migrated = true;
  }

  async list() {
    await this.migrate();
    if (this.db) {
      const snapshot = await this.db.collection(COLLECTION).get();
      return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    }
    return Object.values((await this.readLocal()).promotions);
  }

  async get(id) {
    if (!ID.test(id)) throw new PromotionNotFoundError('Promotion not found.');
    if (this.db) {
      const snapshot = await this.db.collection(COLLECTION).doc(id).get();
      if (!snapshot.exists) throw new PromotionNotFoundError('Promotion not found.');
      return { ...snapshot.data(), id: snapshot.id };
    }
    const record = (await this.readLocal()).promotions[id];
    if (!record) throw new PromotionNotFoundError('Promotion not found.');
    return record;
  }

  // Saves the Administrator's fields. The trailer is managed by its own endpoints and is always carried over, so
  // editing details or linking the promotion to a catalog title never loses it.
  async save(input, actor, { id, version } = {}) {
    const now = new Date().toISOString();
    const { rightsConfirmed, ...fields } = input;
    const update = (existing, newId) => {
      if (id && (!existing || existing.version !== version)) throw new PromotionConflictError('This promotion changed. Refresh before editing.');
      return {
        ...fields, id: newId, version: (existing?.version || 0) + 1,
        trailer: existing?.trailer || null,
        promotionRights: rightsConfirmed ? { confirmedBy: actor, confirmedAt: now } : existing?.promotionRights || null,
        createdAt: existing?.createdAt || now, createdBy: existing?.createdBy || actor, updatedAt: now, updatedBy: actor,
      };
    };
    const newId = id || `promo-${crypto.randomUUID().slice(0, 8)}`;
    if (!ID.test(newId)) throw new PromotionInputError('Invalid promotion.');
    if (this.db) {
      return this.db.runTransaction(async (transaction) => {
        const ref = this.db.collection(COLLECTION).doc(newId);
        const snapshot = await transaction.get(ref);
        if (!id && snapshot.exists) throw new PromotionConflictError('Try saving again.');
        const record = update(snapshot.exists ? snapshot.data() : null, newId);
        transaction.set(ref, record);
        return record;
      });
    }
    return this.writeLocal((state) => {
      if (!id && state.promotions[newId]) throw new PromotionConflictError('Try saving again.');
      const record = update(state.promotions[newId] || null, newId);
      state.promotions[newId] = record;
      return record;
    });
  }

  // Replaces only the trailer field. `change` receives the current promotion and returns the new trailer (or null).
  // The version is not bumped, so an open edit form can still be saved afterwards.
  async updateTrailer(id, change) {
    if (!ID.test(id)) throw new PromotionNotFoundError('Promotion not found.');
    const now = new Date().toISOString();
    if (this.db) {
      return this.db.runTransaction(async (transaction) => {
        const ref = this.db.collection(COLLECTION).doc(id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new PromotionNotFoundError('Promotion not found.');
        const current = { ...snapshot.data(), id };
        const trailer = change(current);
        transaction.update(ref, { trailer, trailerUpdatedAt: now });
        return { ...current, trailer, trailerUpdatedAt: now };
      });
    }
    return this.writeLocal((state) => {
      const current = state.promotions[id];
      if (!current) throw new PromotionNotFoundError('Promotion not found.');
      const record = { ...current, trailer: change(current), trailerUpdatedAt: now };
      state.promotions[id] = record;
      return record;
    });
  }

  // Removes only the promotional listing. The promoted title, its media, rights and history are untouched.
  async remove(id, version) {
    if (!ID.test(id)) throw new PromotionInputError('Invalid promotion.');
    if (this.db) {
      return this.db.runTransaction(async (transaction) => {
        const ref = this.db.collection(COLLECTION).doc(id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data().version !== version) throw new PromotionConflictError('This promotion changed. Refresh before removing it.');
        transaction.delete(ref);
      });
    }
    return this.writeLocal((state) => {
      if (!state.promotions[id] || state.promotions[id].version !== version) throw new PromotionConflictError('This promotion changed. Refresh before removing it.');
      delete state.promotions[id];
    });
  }
}

const future = (value, now) => (value && Date.parse(value) > now ? value : null);

// The Eastern date and time the Admin form edits, also for records saved before they were stored separately.
function adminPremiere(promotion) {
  let premiere = null;
  try { premiere = promotionPremiere(promotion); } catch { premiere = null; }
  return { premiereDate: premiere?.premiereDate ?? null, premiereTime: premiere?.premiereTime ?? null };
}

// A public catalog title's own trailer, never its full media.
function catalogTrailer(records, id) {
  const record = id && records.find((item) => item.id === id);
  if (!record || !metadataAllowed(record) || !TRAILER_TYPES.has(record.contentType)
    || record.trailerStatus !== 'ready' || !record.trailerPlaybackId) return null;
  return { playbackId: record.trailerPlaybackId, duration: record.trailerDuration || 0 };
}

// The trailer a promotion plays: its own uploaded trailer, a catalog trailer the Administrator selected, or else the
// promoted title's own trailer.
function promotionTrailerSource(promotion, records, baseTrailerId) {
  const trailer = promotion.trailer;
  if (trailer?.source === 'upload' && trailer.status === 'ready' && trailer.playbackId) {
    return { playbackId: trailer.playbackId, duration: trailer.duration || 0 };
  }
  if (trailer?.source === 'title') return catalogTrailer(records, trailer.titleId);
  return catalogTrailer(records, baseTrailerId);
}

// Resolves a promotion against the public catalog the visitor can see. `state` is:
//   live        - published, target public and unreleased: shown on the homepage
//   hidden      - kept but switched off by an Administrator
//   released    - the linked title is now streaming; retired automatically (the record is kept)
//   premiered   - a title not linked to the catalog reached its premiere (its time, or the end of a date-only premiere
//                 day in Eastern time); retired automatically (record kept)
//   unavailable - the linked title is not public on this platform (draft, rights, removed); nothing is shown
function resolvePromotion(promotion, records, series, now = Date.now()) {
  const { target } = promotion;
  let base = null;
  let released = false;
  let own = null;
  try { own = promotionPremiere(promotion); } catch { own = null; }
  // Still upcoming: before the premiere time, or before the end of a date-only premiere day.
  const ownUpcoming = own && Date.parse(own.endsAt) > now ? own : null;
  if (target.kind === 'upcoming') {
    released = Boolean(own) && !ownUpcoming;
    base = {
      kind: 'upcoming', href: null, supersedes: null, title: promotion.title, description: '', artwork: '', categories: [],
      protvOriginal: false, premiereAt: null, contentType: UPCOMING_TYPES[target.contentType],
    };
  } else if (target.kind === 'series') {
    const show = series.find((item) => item.key === target.id);
    if (show) {
      released = target.episodeNumber
        ? show.episodes.some((episode) => episode.seasonNumber === target.seasonNumber
          && episode.episodeNumber === target.episodeNumber && episode.watchAvailable)
        : !show.comingSoon;
      base = {
        kind: 'series', href: `/series/${encodeURIComponent(show.slug || show.key)}`, supersedes: target.episodeNumber ? null : `series-${show.key}`,
        title: show.title, description: show.description, artwork: show.artwork, categories: show.categories,
        protvOriginal: Boolean(show.protvOriginal), premiereAt: show.premiereAt,
        // A single upcoming episode only plays a trailer chosen for it, never the show's general trailer.
        trailerId: target.episodeNumber ? null : show.trailerTitleId,
      };
    }
  } else {
    const record = records.find((item) => item.id === target.id
      && (target.kind === 'episode' ? item.contentType === 'EPISODE' : item.contentType === 'MOVIE'));
    const detail = record && titleDetails(record, records);
    if (detail) {
      released = Boolean(detail.watchAvailable);
      base = {
        kind: 'title', href: `/title/${encodeURIComponent(detail.slug || detail.id)}`, supersedes: detail.id,
        title: detail.title, description: detail.description, artwork: detail.posterUrl || detail.thumbnailUrl,
        categories: detail.categories, protvOriginal: Boolean(detail.protvOriginal), premiereAt: detail.releaseAt, trailerId: record.id,
      };
    }
  }
  const state = !base ? 'unavailable'
    : released ? (target.kind === 'upcoming' ? 'premiered' : 'released')
      : promotion.status === 'published' ? 'live' : 'hidden';
  if (!base) return { state, card: null, supersedes: null, trailer: null };
  const trailer = promotionTrailerSource(promotion, records, base.trailerId);
  const premiereAt = ownUpcoming ? ownUpcoming.premiereAt : (own ? null : future(base.premiereAt, now));
  // The card says whether a time was set, so a date-only premiere is never shown with an invented time.
  const premiereParts = ownUpcoming ? {
    premiereDate: ownUpcoming.premiereDate,
    ...(ownUpcoming.premiereTime ? { premiereTime: ownUpcoming.premiereTime, premiereTimeZone: EASTERN } : {}),
  } : {};
  return {
    state,
    supersedes: base.supersedes,
    trailer,
    card: {
      id: `promo-${promotion.id}`, promotionId: promotion.id, kind: base.kind, href: base.href,
      title: promotion.title || base.title, description: promotion.description || base.description || '',
      artwork: promotion.artworkUrl || base.artwork || '', categories: base.categories || [],
      comingSoon: true, protvOriginal: base.protvOriginal, trailerAvailable: Boolean(trailer),
      ...(base.contentType ? { contentType: base.contentType } : {}),
      ...(premiereAt ? { premiereAt, ...premiereParts } : {}), promotion: true,
    },
  };
}

// Order by the Administrator's order number, then soonest premiere (TBD last), then the title the visitor sees.
const shown = (promotion, card) => ({ order: promotion.sortOrder || 0, premiere: card?.premiereAt ? Date.parse(card.premiereAt) : Infinity, title: card?.title || promotion.title || '' });
const resultOrder = (a, b) => a.order - b.order || a.premiere - b.premiere || a.title.localeCompare(b.title);
function resolveAll(promotions, records, now = Date.now()) {
  const series = seriesDetails(records);
  return promotions.map((promotion) => {
    const result = resolvePromotion(promotion, records, series, now);
    return { promotion, ...result, ...shown(promotion, result.card) };
  }).sort(resultOrder);
}

// Live promotions lead the Coming Soon row. A promotion for a whole film or show replaces that title's automatic card,
// so nothing appears twice.
function withPromotions(items, promotions, records, now = Date.now()) {
  const live = resolveAll(promotions, records, now).filter((result) => result.state === 'live');
  const replaced = new Set(live.map((result) => result.supersedes).filter(Boolean));
  return [...live.map((result) => result.card), ...items.filter((item) => !replaced.has(item.id))];
}

// Coming Soon for the Roku app. Promotional eligibility and streaming eligibility are kept apart (owner decision
// 2026-11-23):
//   - Promotional: every unreleased production the website promotes gets a card (poster, title, description,
//     premiere), whether or not Roku may stream it yet. `promoRecords` is the website's public catalog less device-app
//     holds. Only unreleased listings qualify: a promotion retires when its title is released, and automatic listings
//     are Coming Soon titles only.
//   - Streaming: cards never carry playback, links or episodes. A trailer is flagged only when the same card also
//     resolves against `streamingRecords` (the titles Roku may carry) with a trailer, and not for an upcoming
//     production's own upload, which has no Roku clearance.
// Artwork is absolute HTTPS, and premiere wording is worked out here in Eastern time, "Premiere Date TBD" when unset.
const DEVICE_ORIGIN = 'https://watchprotv.com';
const easternDate = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN, weekday: 'long', month: 'long', day: 'numeric' });
const easternShort = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN, month: 'short', day: 'numeric' });
const easternTime = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN, hour: 'numeric', minute: '2-digit' });

function deviceArtwork(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (/^https:\/\//i.test(url)) return url;
  if (/^\/(?!\/)[A-Za-z0-9._~/-]{1,300}$/.test(url)) return `${DEVICE_ORIGIN}${url}`;
  return '';
}

function devicePremiere(card) {
  const at = card.premiereAt ? new Date(card.premiereAt) : null;
  if (!at || !Number.isFinite(at.getTime())) return { premiereLabel: 'Premiere Date TBD', premiereShort: 'Date TBD' };
  // A promotion saved with a date and no time is a whole Eastern day: never show an invented time.
  const dateOnly = card.promotion === true && Boolean(card.premiereDate) && !card.premiereTime;
  const day = easternDate.format(at);
  return {
    premiereAt: card.premiereAt,
    premiereLabel: dateOnly ? `Premieres ${day}` : `Premieres ${day} at ${easternTime.format(at)} ET`,
    premiereShort: `Premieres ${easternShort.format(at)}`,
  };
}

function rokuComingSoon({ promotions, promoRecords, streamingRecords, now = Date.now() }) {
  const live = resolveAll(promotions, promoRecords, now).filter((result) => result.state === 'live');
  const replaced = new Set(live.map((result) => result.supersedes).filter(Boolean));
  // Trailers: only where the card also stands on Roku's own titles.
  const rokuPromoTrailers = new Set(resolveAll(promotions, streamingRecords, now)
    .filter((result) => result.state === 'live' && result.trailer && result.promotion.target.kind !== 'upcoming')
    .map((result) => result.promotion.id));
  const rokuListingTrailers = new Set(comingSoonCatalog(streamingRecords).filter((item) => item.trailerAvailable).map((item) => item.id));
  const cards = [
    ...live.map((result) => ({ ...result.card, trailerAvailable: rokuPromoTrailers.has(result.promotion.id) })),
    ...comingSoonCatalog(promoRecords).filter((item) => !replaced.has(item.id))
      .map((item) => ({ ...item, trailerAvailable: rokuListingTrailers.has(item.id) })),
  ];
  return cards.map((card) => ({
    id: card.id,
    kind: card.kind,
    ...(card.promotionId ? { promotionId: card.promotionId } : {}),
    ...(card.contentType ? { contentType: card.contentType } : {}),
    title: card.title,
    description: card.description || '',
    artwork: deviceArtwork(card.artwork),
    ...devicePremiere(card),
    trailerAvailable: Boolean(card.trailerAvailable),
    ...(card.trailerTitleId ? { trailerTitleId: card.trailerTitleId } : {}),
    promotion: card.promotion === true,
  }));
}

// The trailer a visitor may play from a live promotional card (website only). Null when there is none to show.
function livePromotionTrailer(promotions, records, id, now = Date.now()) {
  const promotion = promotions.find((item) => item.id === id);
  if (!promotion) return null;
  const result = resolvePromotion(promotion, records, seriesDetails(records), now);
  return result.state === 'live' ? result.trailer : null;
}

// Choices for the Admin form: unreleased films and episodes, every public show (for a show or one upcoming episode),
// and the public catalog trailers that can be reused.
function promotionTargets(records) {
  const series = seriesDetails(records).map((show) => ({
    kind: 'series', id: show.key, title: show.title, href: `/series/${encodeURIComponent(show.slug || show.key)}`,
    comingSoon: Boolean(show.comingSoon),
    episodes: show.episodes.map((episode) => ({ seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber, title: episode.title, released: Boolean(episode.watchAvailable) })),
  }));
  const titles = records.filter((record) => ['MOVIE', 'EPISODE'].includes(record.contentType))
    .map((record) => ({ record, detail: titleDetails(record, records) }))
    .filter(({ detail }) => detail && !detail.watchAvailable)
    .map(({ record, detail }) => ({
      kind: record.contentType === 'EPISODE' ? 'episode' : 'title', id: detail.id,
      title: record.contentType === 'EPISODE' && detail.seriesTitle ? `${detail.seriesTitle} · ${detail.title}` : detail.title,
      href: `/title/${encodeURIComponent(detail.slug || detail.id)}`,
    }));
  const trailers = records.filter((record) => catalogTrailer(records, record.id))
    .map((record) => ({ id: record.id, title: record.contentType === 'SERIES' ? record.seriesTitle || record.title : record.title }))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return { series, titles: titles.sort((a, b) => a.title.localeCompare(b.title)), trailers };
}

function defaultPromotionStore() {
  return new PromotionStore({
    db: require('../firebase').db,
    filePath: process.env.COMING_SOON_PROMOTION_FILE || path.resolve(__dirname, '../../.data/coming-soon-promotions.json'),
  });
}

const MAX_ARTWORK_BYTES = 4 * 1024 * 1024;
const ARTWORK_TYPES = ['image/png', 'image/jpeg'];

function createAdminPromotionRouter({
  store = defaultPromotionStore(),
  loadRecords,
  authorize = require('../middleware/auth').verifyAdmin,
  posterStore,
  normalizePosterImage = (bytes, mimeType) => require('../integrations/creatorPromotional').normalizePosterImage(bytes, mimeType),
  logAdminEvent = (event) => require('../adminBot/adminAudit').logAdminEvent(event),
  // The same Mux helpers the catalog trailer uploads use. Promotional trailers are always signed playback.
  createDirectUpload = (...args) => require('../mux').createDirectUpload(...args),
  getUpload = (id) => require('../mux').getUpload(id),
  getAsset = (id) => require('../mux').getAsset(id),
  getPlaybackId = (...args) => require('../mux').getPlaybackId(...args),
  signPlayback = (...args) => require('../mux').signPlayback(...args),
  cancelUpload = (id) => require('../mux').cancelUpload(id),
  deleteAsset = (id) => require('../mux').deleteAsset(id),
} = {}) {
  const router = express.Router();
  router.use(authorize);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const fail = (res, error) => {
    if (error instanceof PromotionInputError) return res.status(400).json({ error: error.message });
    if (error instanceof PromotionConflictError) return res.status(409).json({ error: error.message });
    if (error instanceof PromotionNotFoundError) return res.status(404).json({ error: error.message });
    console.error('Coming Soon promotion operation failed:', error);
    return res.status(503).json({ error: 'Coming Soon promotions are temporarily unavailable.' });
  };
  const audit = (req, type, message, details) => logAdminEvent({ type, message, actorId: req.user.uid, details }).catch(() => {});
  const requirePublishable = (input, records) => {
    if (!input.rightsConfirmed) {
      throw new PromotionInputError('Confirm that PROtv has the rights to use this promotional artwork, copy and trailer before publishing.');
    }
    const result = resolvePromotion(input, records, seriesDetails(records));
    if (result.state === 'unavailable') throw new PromotionInputError('That title is not public, so it cannot be promoted yet.');
    if (result.state === 'released') throw new PromotionInputError('That title is already streaming. Coming Soon is only for unreleased titles.');
    if (result.state === 'premiered') throw new PromotionInputError('That premiere date has passed. Choose a future date or TBD.');
  };
  // Best-effort removal of a promotion's own Mux trailer (never a catalog title's).
  const discardOwnAsset = async (trailer) => {
    if (trailer?.source !== 'upload' || !trailer.assetId) return;
    try { await deleteAsset(trailer.assetId); } catch (error) { console.error('Replaced promotional trailer could not be deleted from Mux:', error.message); }
  };

  // Moves a finished upload into place, keeping the previous trailer playable until then.
  const reconcile = async (promotion) => {
    const pending = promotion.trailer?.pendingUploadId;
    if (!pending) return promotion;
    const upload = await getUpload(pending);
    let asset = null;
    if (!['errored', 'cancelled'].includes(upload.status) && upload.asset_id) asset = await getAsset(upload.asset_id);
    const failed = ['errored', 'cancelled'].includes(upload.status) || asset?.status === 'errored';
    if (!failed && asset?.status !== 'ready') return promotion;
    const playbackId = asset && getPlaybackId(asset, 'signed');
    let previous = null;
    const updated = await store.updateTrailer(promotion.id, (current) => {
      const trailer = current.trailer || {};
      if (trailer.pendingUploadId !== pending) return current.trailer;
      const { pendingUploadId, ...rest } = trailer;
      if (failed || !playbackId) return { ...rest, error: 'Mux could not process the trailer upload. Try again.' };
      previous = rest;
      return { source: 'upload', status: 'ready', assetId: asset.id, playbackId, duration: Math.round(asset.duration || 0), error: '' };
    });
    if (previous && previous.assetId !== asset?.id) await discardOwnAsset(previous);
    return updated;
  };
  const trailerStatus = (promotion, records) => {
    const trailer = promotion.trailer || {};
    const source = promotionTrailerSource(promotion, records, null);
    return {
      status: trailer.pendingUploadId ? 'processing' : source ? 'ready' : 'empty',
      source: trailer.pendingUploadId ? 'upload' : trailer.source || null,
      titleId: trailer.source === 'title' ? trailer.titleId : null,
      error: trailer.error || '',
    };
  };

  router.get('/', async (_req, res) => {
    try {
      const [promotions, records] = await Promise.all([store.list(), loadRecords()]);
      const current = await Promise.all(promotions.map((promotion) => reconcile(promotion).catch(() => promotion)));
      const items = resolveAll(current, records).map(({ promotion, state, card }) => ({
        ...promotion, ...adminPremiere(promotion), state, preview: card, trailerStatus: trailerStatus(promotion, records),
      }));
      return res.json({ items, targets: promotionTargets(records) });
    } catch (error) { return fail(res, error); }
  });

  router.post('/', async (req, res) => {
    try {
      const input = promotionInput(req.body);
      const records = await loadRecords();
      if (input.status === 'published') requirePublishable(input, records);
      else if (input.target.kind !== 'upcoming' && resolvePromotion(input, records, seriesDetails(records)).state === 'unavailable') {
        throw new PromotionInputError('That title is not public, so it cannot be promoted yet.');
      }
      const saved = await store.save(input, req.user.uid);
      await audit(req, 'coming_soon_promotion_saved', `Created Coming Soon promotion ${saved.id}.`, { id: saved.id, target: saved.target, status: saved.status });
      return res.status(201).json(saved);
    } catch (error) { return fail(res, error); }
  });

  // Also links a promotion for a new title to its catalog record once it exists: only the target changes, and the
  // artwork, copy and trailer are kept.
  router.patch('/:id', async (req, res) => {
    try {
      const input = promotionInput(req.body);
      // Hiding stays possible even after the target is released or withdrawn.
      if (input.status === 'published') requirePublishable(input, await loadRecords());
      const saved = await store.save(input, req.user.uid, { id: req.params.id, version: req.body.version });
      await audit(req, 'coming_soon_promotion_saved', `Updated Coming Soon promotion ${saved.id}.`, { id: saved.id, target: saved.target, status: saved.status });
      return res.json(saved);
    } catch (error) { return fail(res, error); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      // The version travels in the JSON body: the Vercel entry point does not forward query strings for admin paths.
      await store.remove(req.params.id, Number(req.body?.version));
      await audit(req, 'coming_soon_promotion_removed', `Removed Coming Soon promotion ${req.params.id}. The promoted title was not changed.`, { id: req.params.id });
      return res.status(204).end();
    } catch (error) { return fail(res, error); }
  });

  // ---- Promotional trailer ----------------------------------------------------------------------------------------
  router.post('/:id/trailer/upload-url', async (req, res) => {
    let upload;
    try {
      const promotion = await reconcile(await store.get(req.params.id));
      if (promotion.trailer?.pendingUploadId) throw new PromotionConflictError('A trailer upload is already processing for this promotion.');
      upload = await createDirectUpload(process.env.FRONTEND_URL, { playbackPolicy: 'signed' });
      await store.updateTrailer(req.params.id, (current) => {
        if (current.trailer?.pendingUploadId) throw new PromotionConflictError('A trailer upload is already processing for this promotion.');
        return { ...(current.trailer || {}), pendingUploadId: upload.id, error: '' };
      });
      await audit(req, 'coming_soon_trailer_upload_started', `Started a promotional trailer upload for ${req.params.id}.`, { id: req.params.id, uploadId: upload.id });
      return res.status(201).json({ uploadId: upload.id, uploadUrl: upload.url, status: 'processing' });
    } catch (error) {
      if (upload?.id) await cancelUpload(upload.id).catch(() => {});
      return fail(res, error);
    }
  });

  router.get('/:id/trailer/status', async (req, res) => {
    try {
      const [promotion, records] = await Promise.all([store.get(req.params.id).then(reconcile), loadRecords()]);
      return res.json(trailerStatus(promotion, records));
    } catch (error) { return fail(res, error); }
  });

  // Reuse a trailer that a public catalog title already has.
  router.post('/:id/trailer/select', async (req, res) => {
    try {
      const titleId = req.body?.titleId;
      if (typeof titleId !== 'string' || !RECORD_ID.test(titleId)) throw new PromotionInputError('Choose a catalog trailer.');
      if (!catalogTrailer(await loadRecords(), titleId)) throw new PromotionInputError('That title has no public trailer ready.');
      let previous = null;
      await store.updateTrailer(req.params.id, (current) => {
        if (current.trailer?.pendingUploadId) throw new PromotionConflictError('A trailer upload is still processing. Wait for it or remove the trailer first.');
        previous = current.trailer;
        return { source: 'title', titleId, status: 'ready', error: '' };
      });
      await discardOwnAsset(previous);
      await audit(req, 'coming_soon_trailer_selected', `Selected the catalog trailer of ${titleId} for ${req.params.id}.`, { id: req.params.id, titleId });
      return res.json({ status: 'ready', source: 'title', titleId });
    } catch (error) { return fail(res, error); }
  });

  router.delete('/:id/trailer', async (req, res) => {
    try {
      let previous = null;
      await store.updateTrailer(req.params.id, (current) => { previous = current.trailer; return null; });
      if (previous?.pendingUploadId) {
        try {
          const upload = await getUpload(previous.pendingUploadId);
          if (upload.asset_id) await deleteAsset(upload.asset_id); else await cancelUpload(previous.pendingUploadId);
        } catch (error) { console.error('Pending promotional trailer upload could not be cancelled:', error.message); }
      }
      await discardOwnAsset(previous);
      await audit(req, 'coming_soon_trailer_removed', `Removed the promotional trailer of ${req.params.id}. No catalog trailer was changed.`, { id: req.params.id });
      return res.status(204).end();
    } catch (error) { return fail(res, error); }
  });

  router.get('/:id/trailer/preview', async (req, res) => {
    try {
      const [promotion, records] = await Promise.all([store.get(req.params.id).then(reconcile), loadRecords()]);
      const source = promotionTrailerSource(promotion, records, null);
      if (!source) return res.status(409).json({ error: 'The trailer is not ready to preview.' });
      return res.json({ id: promotion.id, muxPlaybackId: source.playbackId, playbackToken: await signPlayback(source.playbackId, source.duration) });
    } catch (error) { return fail(res, error); }
  });

  // Durable promotional artwork, re-encoded like every Administrator poster. No catalog record changes.
  router.put('/artwork', express.raw({ type: ARTWORK_TYPES, limit: MAX_ARTWORK_BYTES }), async (req, res) => {
    const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ARTWORK_TYPES.includes(mimeType)) return res.status(415).json({ error: 'Upload a PNG or JPEG image.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'The image is empty.' });
    let clean;
    try { clean = await normalizePosterImage(req.body, mimeType); } catch {
      return res.status(422).json({ error: 'The artwork must be a valid, static PNG or JPEG image.' });
    }
    try {
      const current = posterStore || new (require('../integrations/creatorPosterStore').CreatorPosterStore)();
      current.assertAvailable();
      const artworkUrl = await current.save(clean, mimeType, 'title');
      await audit(req, 'coming_soon_artwork_uploaded', 'Uploaded Coming Soon promotional artwork.', { artworkUrl });
      return res.json({ artworkUrl });
    } catch (error) {
      console.error('Coming Soon artwork upload failed:', error);
      return res.status(503).json({ error: 'Artwork storage is temporarily unavailable.' });
    }
  });
  router.use((error, _req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Images must be 4 MB or smaller.' });
    return next(error);
  });
  return router;
}

module.exports = {
  PromotionStore, PromotionInputError, promotionInput, resolvePromotion, withPromotions, rokuComingSoon, promotionTargets, livePromotionTrailer,
  createAdminPromotionRouter, defaultPromotionStore, SEED_MIGRATIONS, UPCOMING_TYPES,
};

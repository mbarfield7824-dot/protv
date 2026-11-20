const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { titleDetails, seriesDetails } = require('./details');
const { seriesKey } = require('./readModel');

// Coming Soon promotions: Administrator-managed promotional cards for an existing upcoming film, episode or series
// (optionally one upcoming episode of a show that is already streaming). A promotion only stores presentation:
// artwork, description and a premiere date or TBD. It never changes the title, its media, rights or release state,
// and it is shown only while its target is publicly eligible and not yet released.

const COLLECTION = 'comingSoonPromotions';
const MIGRATIONS = 'comingSoonPromotionMigrations';
const STATUSES = new Set(['published', 'hidden']);
const TARGET_KINDS = new Set(['title', 'episode', 'series']);
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const RECORD_ID = /^[A-Za-z0-9_-]{1,200}$/;
const SITE_PATH = /^\/(?!\/)[A-Za-z0-9._~/-]{1,300}$/;

class PromotionInputError extends Error {}
class PromotionConflictError extends Error {}

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
  if (!TARGET_KINDS.has(target.kind)) throw new PromotionInputError('Choose a film, episode or series to promote.');
  if (typeof target.id !== 'string' || !RECORD_ID.test(target.id)) throw new PromotionInputError('Choose an existing title to promote.');
  const seasonNumber = target.kind === 'series' ? positive(target.seasonNumber, 'Season number') : null;
  const episodeNumber = target.kind === 'series' ? positive(target.episodeNumber, 'Episode number') : null;
  if ((seasonNumber === null) !== (episodeNumber === null)) throw new PromotionInputError('Enter both the season and the episode number, or neither.');
  const artworkUrl = text(body.artworkUrl, 2000, 'Artwork');
  if (artworkUrl && !SITE_PATH.test(artworkUrl) && !/^https:\/\/[^\s"'<>]+$/.test(artworkUrl)) {
    throw new PromotionInputError('Artwork must be an uploaded image, an https:// link or a /path on watchprotv.com.');
  }
  let premiereAt = null;
  if (body.premiereAt !== undefined && body.premiereAt !== null && body.premiereAt !== '') {
    const time = Date.parse(body.premiereAt);
    if (typeof body.premiereAt !== 'string' || !Number.isFinite(time)) throw new PromotionInputError('Enter a valid premiere date or choose TBD.');
    premiereAt = new Date(time).toISOString();
  }
  const status = body.status === undefined ? 'hidden' : body.status;
  if (!STATUSES.has(status)) throw new PromotionInputError('Status must be published or hidden.');
  const sortOrder = body.sortOrder === undefined || body.sortOrder === null || body.sortOrder === '' ? 0 : Number(body.sortOrder);
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 9999) throw new PromotionInputError('Order must be a whole number.');
  return {
    target: { kind: target.kind, id: target.id, ...(seasonNumber ? { seasonNumber, episodeNumber } : {}) },
    title: text(body.title, 160, 'Card title'),
    description: text(body.description, 1000, 'Description'),
    artworkUrl, premiereAt, status, sortOrder,
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
      const result = mutate(state);
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

  async save(input, actor, { id, version } = {}) {
    const now = new Date().toISOString();
    const update = (existing, newId) => {
      if (id && (!existing || existing.version !== version)) throw new PromotionConflictError('This promotion changed. Refresh before editing.');
      return {
        ...input, id: newId, version: (existing?.version || 0) + 1,
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

// Resolves a promotion against the public catalog the visitor can see. `state` is:
//   live        - published, target public and unreleased: shown on the homepage
//   hidden      - kept but switched off by an Administrator
//   released    - the target is now streaming; retired automatically (the record is kept)
//   unavailable - the target is not public on this platform (draft, rights, removed); nothing is shown
function resolvePromotion(promotion, records, series, now = Date.now()) {
  const { target } = promotion;
  let base = null;
  let released = false;
  if (target.kind === 'series') {
    const show = series.find((item) => item.key === target.id);
    if (show) {
      released = target.episodeNumber
        ? show.episodes.some((episode) => episode.seasonNumber === target.seasonNumber
          && episode.episodeNumber === target.episodeNumber && episode.watchAvailable)
        : !show.comingSoon;
      base = {
        kind: 'series', href: `/series/${encodeURIComponent(show.slug || show.key)}`, supersedes: target.episodeNumber ? null : `series-${show.key}`,
        title: show.title, description: show.description, artwork: show.artwork, categories: show.categories,
        protvOriginal: Boolean(show.protvOriginal), trailerAvailable: Boolean(show.trailerAvailable), premiereAt: show.premiereAt,
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
        categories: detail.categories, protvOriginal: Boolean(detail.protvOriginal), trailerAvailable: Boolean(detail.trailerAvailable),
        premiereAt: detail.releaseAt,
      };
    }
  }
  const state = !base ? 'unavailable' : released ? 'released' : promotion.status === 'published' ? 'live' : 'hidden';
  if (!base) return { state, card: null, supersedes: null };
  const premiereAt = future(promotion.premiereAt, now) || (promotion.premiereAt ? null : future(base.premiereAt, now));
  return {
    state,
    supersedes: base.supersedes,
    card: {
      id: `promo-${promotion.id}`, kind: base.kind, href: base.href,
      title: promotion.title || base.title, description: promotion.description || base.description || '',
      artwork: promotion.artworkUrl || base.artwork || '', categories: base.categories || [],
      comingSoon: true, protvOriginal: base.protvOriginal, trailerAvailable: base.trailerAvailable,
      ...(premiereAt ? { premiereAt } : {}), promotion: true,
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

// Choices for the Admin form: unreleased films and episodes, and every public show (for a show or one upcoming episode).
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
  return { series, titles: titles.sort((a, b) => a.title.localeCompare(b.title)) };
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
} = {}) {
  const router = express.Router();
  router.use(authorize);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const fail = (res, error) => {
    if (error instanceof PromotionInputError) return res.status(400).json({ error: error.message });
    if (error instanceof PromotionConflictError) return res.status(409).json({ error: error.message });
    console.error('Coming Soon promotion operation failed:', error);
    return res.status(503).json({ error: 'Coming Soon promotions are temporarily unavailable.' });
  };
  const audit = (req, type, message, details) => logAdminEvent({ type, message, actorId: req.user.uid, details }).catch(() => {});
  const requireTarget = (input, records) => {
    const result = resolvePromotion(input, records, seriesDetails(records));
    if (result.state === 'unavailable') throw new PromotionInputError('That title is not public, so it cannot be promoted yet.');
    if (result.state === 'released') throw new PromotionInputError('That title is already streaming. Coming Soon is only for unreleased titles.');
  };

  router.get('/', async (_req, res) => {
    try {
      const [promotions, records] = await Promise.all([store.list(), loadRecords()]);
      const items = resolveAll(promotions, records).map(({ promotion, state, card }) => ({ ...promotion, state, preview: card }));
      return res.json({ items, targets: promotionTargets(records) });
    } catch (error) { return fail(res, error); }
  });

  router.post('/', async (req, res) => {
    try {
      const input = promotionInput(req.body);
      requireTarget(input, await loadRecords());
      const saved = await store.save(input, req.user.uid);
      await audit(req, 'coming_soon_promotion_saved', `Created Coming Soon promotion ${saved.id}.`, { id: saved.id, target: saved.target, status: saved.status });
      return res.status(201).json(saved);
    } catch (error) { return fail(res, error); }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const input = promotionInput(req.body);
      // Hiding stays possible even after the target is released or withdrawn.
      if (input.status === 'published') requireTarget(input, await loadRecords());
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
  PromotionStore, PromotionInputError, promotionInput, resolvePromotion, withPromotions, promotionTargets,
  createAdminPromotionRouter, defaultPromotionStore, SEED_MIGRATIONS,
};

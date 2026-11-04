const express = require('express');
const path = require('node:path');
const { db, getApprovedVideos } = require('../firebase');
const { verifyAdmin } = require('../middleware/auth');
const { loadTitleTemplate } = require('../catalog/titleHtml');
const { ShortLinkStore } = require('./store');
const { linkInput, slugKey, RESERVED, LinkInputError, LinkConflictError } = require('./validation');
const { destinationMetadata } = require('./metadata');
const { shareHtml, socialMetadata, unavailableHtml } = require('./html');
const { renderFallback } = require('../catalog/socialArtwork');
const featured = require('../../../shared/featuredPodcast.json');

const FLAGSHIP = { slug: 'MMWF', kind: 'podcast', destination: featured.path, active: true };
function defaultStore() {
  return new ShortLinkStore({ db, filePath: process.env.SHORT_LINK_STORE_FILE || path.resolve(__dirname, '../../.data/short-links.json') });
}
function createShortLinkRouters({
  store = defaultStore(), loadApproved = getApprovedVideos, authorize = verifyAdmin,
  loadTemplate = loadTitleTemplate,
} = {}) {
  const publicRouter = express.Router();
  const adminRouter = express.Router();
  publicRouter.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' });
    next();
  });
  adminRouter.use(authorize);
  adminRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const fail = (res, error) => {
    if (error instanceof LinkInputError || error instanceof LinkConflictError) {
      return res.status(error instanceof LinkConflictError ? 409 : 400).json({ error: error.message });
    }
    console.error('Short-link operation failed:', error);
    return res.status(503).json({ error: 'Short links are temporarily unavailable.' });
  };
  const unavailable = (req, res) => {
    res.status(404).set('X-Robots-Tag', 'noindex');
    return req.query.format === 'json' ? res.json({ error: 'This PROtv link is unavailable.' })
      : res.type('html').send(unavailableHtml());
  };
  publicRouter.get('/artwork/brand', async (_req, res) => {
    try {
      return res.type('png').send(await renderFallback('png'));
    } catch (error) { return fail(res, error); }
  });
  adminRouter.get('/', async (req, res) => {
    try { return res.json(await store.list({ cursor: req.query.cursor })); } catch (error) { return fail(res, error); }
  });
  adminRouter.post('/', async (req, res) => {
    try {
      const input = linkInput(req.body);
      await destinationMetadata(input, loadApproved);
      return res.status(201).json(await store.save(input, req.user.uid));
    } catch (error) { return fail(res, error); }
  });
  adminRouter.patch('/:slug', async (req, res) => {
    try {
      const input = linkInput(req.body);
      const key = slugKey(req.params.slug);
      // Deactivation must remain possible if its content has since been unpublished.
      if (input.active) await destinationMetadata(input, loadApproved);
      return res.json(await store.save(input, req.user.uid, { key, version: req.body.version }));
    } catch (error) { return fail(res, error); }
  });
  publicRouter.get('/artwork/mmwf', (_req, res, next) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.resolve(__dirname, '../../../frontend/src/assets/me-and-my-white-friend-banner.png'), error => {
      if (error) { console.error('Short-link artwork failed:', error.message); next(error); }
    });
  });
  publicRouter.get('/featured-page', async (_req, res) => {
    try {
      const metadata = await destinationMetadata(FLAGSHIP, loadApproved);
      return res.type('html').send(socialMetadata(await loadTemplate(), metadata, `https://watchprotv.com${featured.path}`));
    } catch (error) { return fail(res, error); }
  });
  publicRouter.get('/resolve/:slug', async (req, res) => {
    try {
      if (RESERVED.has(req.params.slug.toLowerCase())) {
        if (req.query.format === 'json') return res.status(404).json({ error: 'Short link not found.' });
        return res.type('html').send(await loadTemplate());
      }
      const key = slugKey(req.params.slug);
      const record = await store.get(key);
      if (!record?.active) return unavailable(req, res);
      let metadata;
      try { metadata = await destinationMetadata(record, loadApproved); } catch (error) {
        if (!(error instanceof LinkInputError)) throw error;
        console.warn('Short-link destination unavailable:', key, error.message);
        return unavailable(req, res);
      }
      if (req.query.format === 'json') return res.json({ slug: record.slug, ...metadata });
      const page = shareHtml(record, metadata);
      res.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${page.nonce}'; style-src 'nonce-${page.nonce}'; img-src https:; base-uri 'none'; frame-ancestors 'none'`);
      res.set('Referrer-Policy', 'no-referrer');
      return res.type('html').send(page.html);
    } catch (error) { return fail(res, error); }
  });
  return { publicRouter, adminRouter };
}
module.exports = { createShortLinkRouters, defaultStore, FLAGSHIP };

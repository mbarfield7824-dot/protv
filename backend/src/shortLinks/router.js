const express = require('express');
const path = require('node:path');
const { db, getApprovedVideos } = require('../firebase');
const { verifyAdmin } = require('../middleware/auth');
const { loadTitleTemplate } = require('../catalog/titleHtml');
const { ShortLinkStore } = require('./store');
const { linkInput, slugKey, RESERVED, LinkInputError, LinkConflictError } = require('./validation');
const { destinationMetadata } = require('./metadata');
const { defaultSlugRegistry, publicPathsFor } = require('../catalog/slugs');
const { shareHtml, socialMetadata, unavailableHtml } = require('./html');
const { renderFallback } = require('../catalog/socialArtwork');
const featured = require('../../../shared/featuredPodcast.json');
const { podcastCatalog } = require('../catalog/readModel');
const { isFeaturedPodcast } = require('../catalog/podcasts');
const { previewEligible } = require('../catalog/socialMetadata');
const { podcastStructuredData } = require('../catalog/structuredData');
const { collectionBody, withBody } = require('../catalog/seoBody');

const FLAGSHIP = { slug: 'MMWF', kind: 'podcast', destination: featured.path, active: true };
function defaultStore() {
  return new ShortLinkStore({ db, filePath: process.env.SHORT_LINK_STORE_FILE || path.resolve(__dirname, '../../.data/short-links.json') });
}
function createShortLinkRouters({
  store = defaultStore(), loadApproved = getApprovedVideos, authorize = verifyAdmin,
  loadTemplate = loadTitleTemplate, slugRegistry = defaultSlugRegistry(),
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
      await destinationMetadata(input, loadApproved, slugRegistry);
      return res.status(201).json(await store.save(input, req.user.uid));
    } catch (error) { return fail(res, error); }
  });
  adminRouter.patch('/:slug', async (req, res) => {
    try {
      const input = linkInput(req.body);
      const key = slugKey(req.params.slug);
      // Deactivation must remain possible if its content has since been unpublished.
      if (input.active) await destinationMetadata(input, loadApproved, slugRegistry);
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
      const metadata = await destinationMetadata(FLAGSHIP, loadApproved, slugRegistry);
      const canonical = `https://watchprotv.com${featured.path}`;
      // Published episodes for the page summary. The page itself works before publication or if the catalog is down.
      let episodes = [];
      try {
        const approved = await loadApproved();
        // Episode links use their readable addresses.
        const decorated = (await publicPathsFor(approved, slugRegistry)).decorate(approved);
        const matches = podcastCatalog(decorated.filter(previewEligible)).filter(isFeaturedPodcast);
        if (matches.length === 1) episodes = matches[0].episodes;
      } catch (error) { console.error('Featured Podcast episodes unavailable for the page summary:', error.message); }
      const data = podcastStructuredData({ title: featured.title, episodes }, canonical,
        new URL(metadata.image, canonical).href, [featured.tagline, ...featured.description]);
      const html = withBody(socialMetadata(await loadTemplate(), metadata, canonical, data), collectionBody({
        title: featured.title, byline: `A podcast with ${featured.hosts}`, lead: featured.tagline,
        description: featured.description, image: 'https://watchprotv.com/api/short-links/artwork/mmwf', episodes,
      }));
      return res.type('html').send(html);
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
      try { metadata = await destinationMetadata(record, loadApproved, slugRegistry); } catch (error) {
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

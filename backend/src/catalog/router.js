const express = require('express');
const { db, getApprovedVideos, getAllVideosAdmin } = require('../firebase');
const { browse, playableCatalog, podcastCatalog, seriesCatalog } = require('./readModel');
const { catalogSitemap } = require('./sitemap');
const { eligibleForPlatform, platformFromRequest } = require('./platformEligibility');
const { loadTitleTemplate, titleHtml } = require('./titleHtml');
const {
  previewContent, contentMetadata, socialMetadata, previewEligible, publicArtworkUrl, ORIGIN,
} = require('./socialMetadata');
const { seriesStructuredData, podcastStructuredData } = require('./structuredData');
const { collectionBody, withBody, podcastPath } = require('./seoBody');

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const { signPlayback } = require('../mux');
const { metadataAllowed, titleDetails, seriesDetails, comingSoonCatalog, originalsCatalog } = require('./details');
const { defaultSlugRegistry, publicPathsFor } = require('./slugs');

// TV and mobile apps read the catalog by internal ID (view=all, /titles/:id, playback) and never receive slugs,
// so their responses stay exactly as they were.
const DEVICE_PLATFORMS = new Set(['roku', 'firetv', 'android', 'ios']);
const websiteRequest = (req) => !DEVICE_PLATFORMS.has(platformFromRequest(req)) && req.query.view !== 'all';
// The visitor's own query parameters. The public rewrites (vercel.json) add `path` and the route parameter
// (`id=<segment>`), which are not the visitor's and must not follow them to the readable address.
const queryString = (req) => {
  const index = req.originalUrl.indexOf('?');
  if (index < 0) return '';
  const query = new URLSearchParams(req.originalUrl.slice(index + 1));
  query.delete('path');
  if (query.get('id') === req.params.id) query.delete('id');
  return query.size ? `?${query}` : '';
};

function createCatalogRouter({
  loadApproved = db
    ? getApprovedVideos
    : async () => (await getAllVideosAdmin()).filter((video) => video.approvalStatus === 'approved'),
  loadHtmlTemplate = loadTitleTemplate,
  signPlaybackToken = signPlayback,
  slugRegistry = defaultSlugRegistry(),
} = {}) {
  const router = express.Router();
  // Records plus their readable addresses. The addresses come from the platform's own public catalog.
  const withPaths = async (videos) => {
    const paths = await publicPathsFor(videos, slugRegistry);
    return { paths, records: paths.decorate(videos) };
  };
  // Without a request (the sitemap) the full public catalog is loaded.
  const load = async (req) => {
    const videos = await loadApproved();
    return req ? eligibleForPlatform(videos, platformFromRequest(req)) : videos;
  };

  // Responses differ by platform, so caches must key on the headers that pick it.
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' });
    res.vary('User-Agent');
    res.vary('X-PROtv-Platform');
    next();
  });

  router.get('/details', async (req, res) => {
    try {
      const { records } = await withPaths(await load(req));
      return res.json({ items: records.filter(record => record.contentType === 'MOVIE')
        .map(record => titleDetails(record, records)).filter(Boolean) });
    } catch (error) {
      console.error('Failed to load title details catalog:', error);
      return res.status(503).json({ error: 'Title details are temporarily unavailable.' });
    }
  });

  router.get('/series-details', async (req, res) => {
    try {
      return res.json({ items: seriesDetails((await withPaths(await load(req))).records) });
    } catch (error) {
      console.error('Failed to load series details:', error);
      return res.status(503).json({ error: 'Series details are temporarily unavailable.' });
    }
  });

  router.get('/coming-soon', async (req, res) => {
    try {
      return res.json({ items: comingSoonCatalog((await withPaths(await load(req))).records) });
    } catch (error) {
      console.error('Failed to load Coming Soon titles:', error);
      return res.status(503).json({ error: 'Coming Soon titles are temporarily unavailable.' });
    }
  });

  router.get('/originals', async (req, res) => {
    try {
      return res.json({ items: originalsCatalog((await withPaths(await load(req))).records) });
    } catch (error) {
      console.error('Failed to load PROtv Originals:', error);
      return res.status(503).json({ error: 'PROtv Originals are temporarily unavailable.' });
    }
  });

  router.get('/titles/:id/details', async (req, res) => {
    try {
      // The website asks by internal ID or by the readable address in its location bar.
      const { paths, records } = await withPaths(await load(req));
      const id = paths.target('title', req.params.id, (value) => records.some(item => item.id === value));
      const record = records.find(item => item.id === id);
      const detail = record && titleDetails(record, records);
      if (!detail) return res.status(404).json({ error: 'Title not found.' });
      return res.json(detail);
    } catch (error) {
      console.error('Failed to load public title details:', error);
      return res.status(503).json({ error: 'Title details are temporarily unavailable.' });
    }
  });

  router.get('/sitemap.xml', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const videos = await load();
      const xml = catalogSitemap(videos, await publicPathsFor(videos, slugRegistry));
      res.type('application/xml').send(xml);
    } catch (error) {
      console.error('Failed to generate public sitemap:', error);
      res.status(503).type('text/plain').send('The sitemap is temporarily unavailable.');
    }
  });

  router.get('/', async (req, res) => {
    try {
      const videos = await load(req);
      const items = browse(websiteRequest(req) ? (await withPaths(videos)).records : videos, req.query);
      res.json({ items });
    } catch (error) {
      if (!(error instanceof RangeError)) console.error('Failed to load viewer catalog:', error);
      res.status(error instanceof RangeError ? 400 : 500).json({
        error: error instanceof RangeError ? error.message : 'The catalog is temporarily unavailable.',
      });
    }
  });

  router.get('/series', async (req, res) => {
    try {
      const items = seriesCatalog(await load(req)).map(({ seasons, ...summary }) => summary);
      res.json({ items });
    } catch (error) {
      console.error('Failed to load viewer series:', error);
      res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  router.get('/series/:key', async (req, res) => {
    try {
      const series = seriesCatalog(await load(req)).find((item) => item.key === req.params.key);
      if (!series) return res.status(404).json({ error: 'Series not found.' });
      return res.json(series);
    } catch (error) {
      console.error('Failed to load viewer series detail:', error);
      return res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  router.get('/podcasts', async (req, res) => {
    try {
      const items = podcastCatalog(await load(req)).map(({ episodes, ...show }) => show);
      res.json({ items });
    } catch (error) {
      console.error('Failed to load viewer podcasts:', error);
      res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  router.get('/podcasts/:id', async (req, res) => {
    try {
      const videos = await load(req);
      const show = podcastCatalog(websiteRequest(req) ? (await withPaths(videos)).records : videos)
        .find((item) => item.id === req.params.id);
      if (!show) return res.status(404).json({ error: 'Podcast show not found.' });
      return res.json(show);
    } catch (error) {
      console.error('Failed to load viewer podcast show:', error);
      return res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  const loadTitle = async (req, id) => playableCatalog(await load(req)).find((item) => item.id === id);

  router.get('/titles/:id/trailer/playback', async (req, res) => {
    try {
      const title = (await load(req)).find((item) => item.id === req.params.id);
      if (!metadataAllowed(title)
        || !['MOVIE', 'EPISODE', 'SERIES'].includes(title.contentType)
        || title.trailerStatus !== 'ready' || !title.trailerPlaybackId) {
        return res.status(404).json({ error: 'Trailer not found.' });
      }
      return res.json({
        id: title.id,
        muxPlaybackId: title.trailerPlaybackId,
        playbackToken: await signPlaybackToken(title.trailerPlaybackId, title.trailerDuration),
      });
    } catch (error) {
      console.error('Failed to load viewer trailer:', error);
      return res.status(500).json({ error: 'The trailer is temporarily unavailable.' });
    }
  });

  // The public show page an episode belongs to, found by catalog relationship (never by title text alone).
  const episodeParent = (videos, content, paths) => {
    if (content.contentType === 'PODCAST_EPISODE') {
      const show = podcastCatalog(videos.filter(previewEligible)).find((item) => item.id === content.podcastShowId);
      return show ? { name: show.title, url: `${ORIGIN}${podcastPath(show)}` } : null;
    }
    if (content.contentType === 'EPISODE') {
      const series = seriesDetails(videos).find((item) => item.episodes.some((episode) => episode.id === content.id));
      return series ? { name: series.title, url: `${ORIGIN}/series/${encodeURIComponent(paths.segment('series', series.key))}` } : null;
    }
    return null;
  };

  const renderPage = (kind) => async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' });
    try {
      const loaded = await load(req);
      const { paths, records: videos } = await withPaths(loaded);
      const player = req.path.endsWith('/player-html');
      // A page is asked for by its readable address, an older one, or its internal ID. Eligibility is then
      // checked by internal ID exactly as before, so an address never reveals what is not public.
      const id = kind === 'podcast' ? req.params.id
        : paths.target(kind, req.params.id, kind === 'series'
          ? (value) => seriesDetails(videos).some((item) => item.key === value)
          : (value) => videos.some((item) => item.id === value));
      const content = id ? previewContent(videos, kind, id) : null;
      if (!content) {
        return res.status(404).set('X-Robots-Tag', 'noindex')
          .type('text/plain').send('Title not found.');
      }
      // One public address per page: internal-ID and older addresses permanently move to it. The player keeps
      // internal IDs (playback and Continue Watching use them), so a readable address there moves to the ID.
      const segment = kind === 'podcast' ? req.params.id : player ? id : paths.segment(kind, id);
      if (segment !== req.params.id) {
        const route = player ? 'player' : kind === 'series' ? 'series' : 'title';
        return res.redirect(301, `/${route}/${encodeURIComponent(segment)}${queryString(req)}`);
      }
      // The featured Podcast has one public page; its catalog address permanently points there
      // (the website already redirects it in the browser).
      if (kind === 'podcast' && podcastPath(content) !== `/podcasts/${encodeURIComponent(req.params.id)}`) {
        return res.redirect(301, podcastPath(content));
      }
      const template = await loadHtmlTemplate();
      const route = kind === 'podcast' ? 'podcasts' : kind === 'series' ? 'series' : 'title';
      const canonical = `${ORIGIN}/${route}/${encodeURIComponent(kind === 'podcast' ? id : paths.segment(kind, id))}`;
      const metadata = contentMetadata(content, kind, id);
      if (kind === 'title' && !player) {
        return res.type('html').send(titleHtml(template, content, episodeParent(videos, content, paths)));
      }
      if (kind === 'title') return res.type('html').send(socialMetadata(template, metadata, canonical));
      const image = publicArtworkUrl(kind === 'series' ? content.artwork : content.artworkUrl) || '';
      const html = kind === 'series'
        ? withBody(socialMetadata(template, metadata, canonical, seriesStructuredData(content, canonical, metadata.image)),
          collectionBody({ title: content.title, description: content.description, image, episodes: content.episodes }))
        : withBody(socialMetadata(template, metadata, canonical, podcastStructuredData(content, canonical, metadata.image)),
          collectionBody({ title: content.title, byline: text(content.host) ? `With ${text(content.host)}` : '',
            description: content.description, image, episodes: content.episodes }));
      return res.type('html').send(html);
    } catch (error) {
      console.error('Failed to render public title metadata:', error);
      return res.status(503).set('X-Robots-Tag', 'noindex')
        .type('text/plain').send('The title page is temporarily unavailable.');
    }
  };
  router.get('/titles/:id/html', renderPage('title'));
  router.get('/titles/:id/player-html', renderPage('title'));
  router.get('/series/:id/html', renderPage('series'));
  router.get('/podcasts/:id/html', renderPage('podcast'));

  router.get('/titles/:id', async (req, res) => {
    try {
      const title = await loadTitle(req, req.params.id);
      if (!title) return res.status(404).json({ error: 'Title not found.' });
      return res.json(title);
    } catch (error) {
      console.error('Failed to load viewer title:', error);
      return res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  router.get('/titles/:id/playback', async (req, res) => {
    try {
      const title = await loadTitle(req, req.params.id);
      if (!title) return res.status(404).json({ error: 'Title not found.' });
      return res.json({
        id: title.id,
        streamType: 'on-demand',
        muxPlaybackId: title.muxPlaybackId,
        ...(title.muxPlaybackPolicy === 'signed' ? {
          playbackToken: await signPlaybackToken(title.muxPlaybackId, title.duration),
        } : {}),
      });
    } catch (error) {
      console.error('Failed to load viewer playback:', error);
      return res.status(500).json({ error: 'The catalog is temporarily unavailable.' });
    }
  });

  return router;
}

module.exports = { createCatalogRouter };

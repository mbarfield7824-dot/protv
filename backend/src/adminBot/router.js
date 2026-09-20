const express = require('express');
const path = require('path');
const { db } = require('../firebase');
const { verifyAdmin } = require('../middleware/auth');
const { getTitleReference } = require('../omdb');
const { AdminBotRunner } = require('./adminBotRunner');
const { AdminBotJobManager } = require('./jobManager');
const { AiMetadataService } = require('./aiMetadataService');
const { CatalogService } = require('./catalogService');
const { discoverFiles } = require('./fileDiscovery');
const { listAdminEvents, logAdminEvent } = require('./adminAudit');
const { MetadataExtractor } = require('./metadataExtractor');
const { PosterService } = require('./posterService');
const { createIngestionStateStore } = require('./stateStore');
const { InternetArchiveService } = require('./internetArchiveService');
const { WebCatalogService } = require('./webCatalogService');
const { WebIngestionRunner } = require('./webIngestionRunner');
const { createCandidateStore } = require('./candidateStore');
const { PublicDomainDiscoveryRunner } = require('./discoveryRunner');
const { DailyDiscoveryScheduler } = require('./discoveryScheduler');
const { PublicDomainMovieDiscoveryService } = require('./publicDomainMovieDiscoveryService');
const { WikimediaVideoService } = require('./wikimediaVideoService');
const { YouTubeDiscoveryService } = require('./youtubeDiscoveryService');

let runtimeStatusProvider = null;

function idleStatus(message) {
  return {
    status: 'idle',
    message,
    addedMovies: [],
    skippedMovies: [],
    failures: [],
    warnings: [],
  };
}

function getAdminBotRuntimeStatus() {
  return runtimeStatusProvider
    ? runtimeStatusProvider()
    : {
      local: idleStatus('The Public Domain folder bot has not started.'),
      discovery: idleStatus('Automatic discovery has not started.'),
      webIngestion: idleStatus('No Public Domain title is being ingested.'),
    };
}

function createAdminBotRouter() {
  const dataDirectory = path.resolve(__dirname, '../../.data');
  const stateFile = path.resolve(process.env.PD_STATE_FILE || path.join(dataDirectory, 'pd-ingestion-state.json'));
  const posterDirectory = path.resolve(process.env.PD_POSTER_DIRECTORY || path.join(dataDirectory, 'posters'));
  const stateStore = createIngestionStateStore({
    db,
    filePath: stateFile,
    collectionName: 'publicDomainLocalIngestionState',
  });
  const aiMetadataService = new AiMetadataService({
    baseUrl: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
  });
  const metadataExtractor = new MetadataExtractor({
    aiMetadataService,
    referenceLookup: getTitleReference,
  });
  const posterService = new PosterService({
    storageDirectory: posterDirectory,
    publicBaseUrl: process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
    imageBaseUrl: process.env.AI_IMAGE_BASE_URL,
    imageApiKey: process.env.AI_IMAGE_API_KEY,
    imageModel: process.env.AI_IMAGE_MODEL,
  });
  const catalogService = new CatalogService({
    frontendUrl: process.env.FRONTEND_URL || '*',
    transcodeTimeoutMs: Number(process.env.PD_TRANSCODE_TIMEOUT_MS || 15 * 60 * 1000),
  });
  const runner = new AdminBotRunner({
    discover: discoverFiles,
    metadataExtractor,
    posterService,
    catalogService,
    stateStore,
    audit: logAdminEvent,
  });
  const jobs = new AdminBotJobManager(runner);
  const archive = new InternetArchiveService({
    maximumFileBytes: Number(process.env.PD_WEB_MAX_FILE_BYTES || 20 * 1024 * 1024 * 1024),
  });
  const wikimedia = new WikimediaVideoService();
  const candidateStore = createCandidateStore({
    db,
    filePath: path.resolve(
      process.env.PD_CANDIDATE_STORE_FILE
        || process.env.PD_CANDIDATE_FILE
        || path.join(dataDirectory, 'pd-candidates.json')
    ),
  });
  const webStateStore = createIngestionStateStore({
    db,
    filePath: path.resolve(
      process.env.PD_WEB_STATE_FILE || path.join(dataDirectory, 'pd-web-ingestion-state.json')
    ),
    collectionName: 'publicDomainWebIngestionState',
  });
  const webRunner = new WebIngestionRunner({
    sources: {
      'internet-archive': archive,
      wikimedia,
    },
    aiMetadataService,
    posterService,
    catalogService: new WebCatalogService({
      transcodeTimeoutMs: Number(process.env.PD_TRANSCODE_TIMEOUT_MS || 15 * 60 * 1000),
    }),
    stateStore: webStateStore,
    candidateStore,
    audit: logAdminEvent,
  });
  const webJobs = new AdminBotJobManager(webRunner, {
    name: 'Public Domain Web Ingestion',
    startMessage: 'Rechecking the selected title and its Public Domain evidence.',
    idleMessage: 'No web title is currently being ingested.',
  });
  const discoveryRunner = new PublicDomainDiscoveryRunner({
    providers: [
      archive,
      wikimedia,
      new YouTubeDiscoveryService({ apiKey: process.env.YOUTUBE_API_KEY }),
      new PublicDomainMovieDiscoveryService(),
    ],
    candidateStore,
    audit: logAdminEvent,
  });
  const discoveryJobs = new AdminBotJobManager(discoveryRunner, {
    name: 'Public Domain Discovery',
    startMessage: 'Searching trusted Public Domain sources.',
    idleMessage: 'Automatic discovery has not run yet.',
  });
  const automaticDiscoveryEnabled = process.env.PD_AUTO_DISCOVERY_ENABLED !== 'false';
  const configuredDiscoveryInterval = Number(process.env.PD_DISCOVERY_INTERVAL_MS);
  const discoveryIntervalMs = Number.isFinite(configuredDiscoveryInterval) && configuredDiscoveryInterval > 0
    ? configuredDiscoveryInterval
    : 24 * 60 * 60 * 1000;
  if (automaticDiscoveryEnabled) {
    new DailyDiscoveryScheduler({
      jobs: discoveryJobs,
      candidateStore,
      intervalMs: discoveryIntervalMs,
    }).start();
  }
  runtimeStatusProvider = () => ({
    local: jobs.status(),
    discovery: discoveryJobs.status(),
    webIngestion: webJobs.status(),
  });
  const router = express.Router();

  router.post('/run', verifyAdmin, (req, res) => {
    const directory = process.env.PD_CONTENT_DIRECTORY || process.env.PUBLIC_DOMAIN_CONTENT_DIR;
    if (!directory) {
      return res.status(503).json({
        error: 'Public Domain content directory is not configured. Add PD_CONTENT_DIRECTORY.',
      });
    }
    try {
      const job = jobs.start({
        directory: path.resolve(directory),
        actorId: req.user.uid,
        dryRun: req.body?.dryRun !== false,
      });
      res.status(202).json(job);
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });

  router.get('/status', verifyAdmin, (req, res) => {
    res.json(jobs.status());
  });

  router.get('/audit', verifyAdmin, async (req, res) => {
    try {
      res.json(await listAdminEvents(100));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/web-search', verifyAdmin, async (req, res) => {
    try {
      const contentKind = req.query.contentKind === 'show' ? 'show' : 'movie';
      const results = await archive.search({
        query: req.query.q,
        contentKind,
        page: req.query.page,
      });
      const candidates = results.items.map((item) => ({
        ...item,
        id: `internet-archive:${item.identifier}`,
        source: 'internet-archive',
        sourceLabel: 'Internet Archive',
        externalId: item.identifier,
        ingestionAvailable: item.licenseEvidence.eligible,
        ingestionReason: item.licenseEvidence.eligible
          ? ''
          : 'Explicit Public Domain evidence is required before ingestion.',
      }));
      await candidateStore.upsert(candidates);
      res.json({ ...results, items: candidates });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/discovery/run', verifyAdmin, (req, res) => {
    try {
      res.status(202).json(discoveryJobs.start({ actorId: req.user.uid }));
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });

  router.get('/discovery/status', verifyAdmin, async (req, res) => {
    try {
      const queueStatus = await candidateStore.status();
      const nextRunAt = automaticDiscoveryEnabled && queueStatus.lastDiscoveryAt
        ? new Date(new Date(queueStatus.lastDiscoveryAt).getTime() + discoveryIntervalMs).toISOString()
        : null;
      res.json({
        ...discoveryJobs.status(),
        schedule: { enabled: automaticDiscoveryEnabled, nextRunAt },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/discovery/candidates', verifyAdmin, async (req, res) => {
    try {
      const requestedDecision = req.query.decision || 'review';
      const allowedDecisions = ['pending', 'processing', 'approved', 'rejected', 'failed'];
      const items = requestedDecision === 'review'
        ? (await Promise.all(
          ['pending', 'processing', 'failed'].map((decision) => candidateStore.list({ decision, limit: 100 }))
        )).flat().sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)).slice(0, 100)
        : await candidateStore.list({
          decision: allowedDecisions.includes(requestedDecision) ? requestedDecision : 'pending',
          limit: 100,
        });
      res.json({
        items,
        status: await candidateStore.status(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/discovery/candidates/:id/reject', verifyAdmin, async (req, res) => {
    try {
      const candidate = await candidateStore.setDecision(req.params.id, 'rejected', {
        rejectedBy: req.user.uid,
      });
      await logAdminEvent({
        type: 'pd.web-rejected',
        message: `Public Domain candidate rejected: ${candidate.title}`,
        actorId: req.user.uid,
        details: { candidateId: candidate.id, source: candidate.source },
      });
      res.json(candidate);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  router.post('/web-ingest', verifyAdmin, async (req, res) => {
    try {
      if (req.body?.confirmation !== true) {
        return res.status(400).json({ error: 'Administrator confirmation is required.' });
      }
      const candidate = await candidateStore.get(req.body.candidateId);
      if (!candidate) return res.status(404).json({ error: 'Discovery candidate was not found.' });
      if (!candidate.ingestionAvailable) {
        return res.status(400).json({ error: candidate.ingestionReason || 'This source is reference only.' });
      }
      if (!['pending', 'processing', 'failed'].includes(candidate.decision)) {
        return res.status(409).json({ error: `This candidate is already ${candidate.decision}.` });
      }
      const report = await webRunner.run({
        source: candidate.source,
        identifier: candidate.externalId,
        contentKind: candidate.contentKind,
        candidateId: candidate.id,
        confirmation: true,
        actorId: req.user.uid,
      });
      res.status(report.status === 'processing' ? 202 : 200).json(report);
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });

  router.get('/web-status', verifyAdmin, async (req, res) => {
    try {
      const processing = await candidateStore.list({ decision: 'processing', limit: 100 });
      const active = processing.filter((candidate) => candidate.catalogId);
      const stalled = processing.filter((candidate) => !candidate.catalogId);
      if (active.length) {
        return res.json({
          status: 'processing',
          message: `Mux is preparing ${active.length} confirmed title${active.length === 1 ? '' : 's'}.`,
          currentItem: active.map((candidate) => candidate.title).join(', '),
          addedMovies: [],
          failures: [],
        });
      }
      const failed = await candidateStore.list({ decision: 'failed', limit: 20 });
      const needsAttention = [
        ...stalled.map((candidate) => ({
          ...candidate,
          lastError: 'The previous serverless upload did not start. Confirm and retry this title.',
        })),
        ...failed,
      ];
      if (needsAttention.length) {
        return res.json({
          status: 'completed-with-errors',
          message: `${needsAttention.length} title${needsAttention.length === 1 ? '' : 's'} need attention.`,
          currentItem: '',
          addedMovies: [],
          failures: needsAttention.map((candidate) => ({
            title: candidate.title,
            message: candidate.lastError || 'The title could not be ingested.',
          })),
        });
      }
      const approved = await candidateStore.list({ decision: 'approved', limit: 1 });
      if (approved.length) {
        return res.json({
          status: 'completed',
          message: `${approved[0].title} was published successfully.`,
          currentItem: '',
          addedMovies: [{
            title: approved[0].title,
            catalogId: approved[0].catalogId,
            message: `${approved[0].title} was published successfully.`,
          }],
          failures: [],
        });
      }
      return res.json(webJobs.status());
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createAdminBotRouter, getAdminBotRuntimeStatus };

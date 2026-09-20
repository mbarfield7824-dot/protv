const express = require('express');
const path = require('path');
const { AdminBotJobManager } = require('../adminBot/jobManager');
const { listAdminEvents, logAdminEvent } = require('../adminBot/adminAudit');
const { PosterService } = require('../adminBot/posterService');
const { IngestionStateStore } = require('../adminBot/stateStore');
const { verifyAdmin } = require('../middleware/auth');
const { DistributorCatalogService } = require('./catalogService');
const { DistributorFeedClient } = require('./feedClient');
const { DistributorIngestionRunner } = require('./runner');

let runtimeStatusProvider = null;

function getDistributorRuntimeStatus() {
  return runtimeStatusProvider
    ? runtimeStatusProvider()
    : {
      status: 'idle',
      message: 'The distributor feed has not been processed yet.',
      addedMovies: [],
      skippedMovies: [],
      failures: [],
      warnings: [],
    };
}

function createDistributorIngestionRouter() {
  const router = express.Router();
  let jobs = null;
  runtimeStatusProvider = () => jobs?.status() || {
    status: 'idle',
    message: 'The distributor feed has not been processed yet.',
    addedMovies: [],
    skippedMovies: [],
    failures: [],
    warnings: [],
  };

  function getJobs() {
    if (jobs) return jobs;
    const feedClient = new DistributorFeedClient({
      feedUrl: process.env.DISTRIBUTOR_FEED_URL,
      bearerToken: process.env.DISTRIBUTOR_FEED_TOKEN,
    });
    const dataDirectory = path.resolve(__dirname, '../../.data');
    const stateStore = new IngestionStateStore(path.resolve(
      process.env.DISTRIBUTOR_STATE_FILE || path.join(dataDirectory, 'distributor-ingestion-state.json')
    ));
    const posterService = new PosterService({
      storageDirectory: path.resolve(
        process.env.PD_POSTER_DIRECTORY || path.join(dataDirectory, 'posters')
      ),
      publicBaseUrl: process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
      imageBaseUrl: process.env.AI_IMAGE_BASE_URL,
      imageApiKey: process.env.AI_IMAGE_API_KEY,
      imageModel: process.env.AI_IMAGE_MODEL,
    });
    const catalogService = new DistributorCatalogService({
      transcodeTimeoutMs: Number(process.env.DISTRIBUTOR_TRANSCODE_TIMEOUT_MS || 15 * 60 * 1000),
    });
    const runner = new DistributorIngestionRunner({
      feedClient,
      posterService,
      catalogService,
      stateStore,
      audit: logAdminEvent,
      requiredTerritory: process.env.DISTRIBUTOR_REQUIRED_TERRITORY || 'US',
    });
    jobs = new AdminBotJobManager(runner, {
      name: 'Distributor Ingestion Adapter',
      startMessage: 'Loading and validating the distributor feed.',
      idleMessage: 'The distributor feed has not been processed yet.',
    });
    return jobs;
  }

  router.post('/run', verifyAdmin, (req, res) => {
    try {
      const job = getJobs().start({ actorId: req.user.uid });
      res.status(202).json(job);
    } catch (error) {
      const configurationError = error.message.includes('DISTRIBUTOR_FEED_');
      res.status(configurationError ? 503 : 409).json({ error: error.message });
    }
  });

  router.get('/status', verifyAdmin, (req, res) => {
    res.json(jobs?.status() || {
      status: 'idle',
      message: 'The distributor feed has not been processed yet.',
      addedMovies: [],
      skippedMovies: [],
      failures: [],
      warnings: [],
      technicalOutput: [],
    });
  });

  router.get('/audit', verifyAdmin, async (req, res) => {
    try {
      const events = await listAdminEvents(200);
      res.json(events.filter((event) => event.type.startsWith('distributor.')).slice(0, 100));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createDistributorIngestionRouter, getDistributorRuntimeStatus };

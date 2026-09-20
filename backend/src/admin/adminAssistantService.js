const crypto = require('crypto');
const path = require('path');
const { db, getAllVideos } = require('../firebase');
const { createCandidateStore } = require('../adminBot/candidateStore');
const { listAdminEvents, logAdminEvent } = require('../adminBot/adminAudit');
const { getAdminBotRuntimeStatus } = require('../adminBot/router');
const { getDistributorRuntimeStatus } = require('../distributorIngestion/router');
const { AiMetadataService } = require('../adminBot/aiMetadataService');
const { PosterService } = require('../adminBot/posterService');
const { AdminCatalogService, validateCatalogId, validateCatalogRights } = require('./catalogService');
const { normalizeMetadataUpdates } = require('./metadataNormalizer');
const {
  AdminAssistantResponseService,
  answerVerifiedQuestion,
  humanizeReply,
  localTimeDescription,
  relevantCatalogItems,
  safeHistory,
} = require('./adminAssistantResponseService');

const MAX_MESSAGE_LENGTH = 4000;
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

function countByStatus(items) {
  return items.reduce((counts, item) => {
    const status = item.approvalStatus || item.status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function currentMetadata(video) {
  return {
    id: video.id,
    title: video.title,
    description: video.description || '',
    year: video.year || null,
    runtime: video.runtime || video.duration || null,
    categories: video.categories || [video.category || video.genre].filter(Boolean),
    posterUrl: video.posterUrl || video.thumbnailUrl || '',
    posterSource: video.posterSource || '',
    copyrightStatus: video.copyrightStatus || 'unknown',
    licenseType: video.licenseType || '',
    rightsHolder: video.rightsHolder || '',
  };
}

function formatCurrentMetadata(video) {
  const metadata = currentMetadata(video);
  return [
    `Current metadata for "${metadata.title}"`,
    `Catalog ID: ${metadata.id}`,
    `Year: ${metadata.year || 'not set'}`,
    `Runtime: ${metadata.runtime ? `${metadata.runtime} seconds` : 'not set'}`,
    `Categories: ${metadata.categories.join(', ') || 'not set'}`,
    `Description: ${metadata.description || 'not set'}`,
    `Poster: ${metadata.posterUrl || 'not set'}`,
    `Rights: ${metadata.copyrightStatus}; ${metadata.licenseType || 'license not labeled'}`,
  ].join('\n');
}

function normalizeRequestedTitle(value) {
  return String(value || '')
    .trim()
    .replace(/^["'“”]|["'“”]$/g, '')
    .replace(/[.!?]+$/, '')
    .trim();
}

function findCatalogTitle(catalog, requestedTitle, contextCatalogId) {
  if (!requestedTitle && contextCatalogId) {
    const contextual = catalog.find((video) => video.id === contextCatalogId);
    if (contextual) return contextual;
  }
  const title = normalizeRequestedTitle(requestedTitle);
  if (!title) throw new Error('Name the catalog title you want to change.');
  const exact = catalog.filter((video) => video.title?.toLowerCase() === title.toLowerCase());
  if (exact.length === 1) return exact[0];
  const partial = catalog.filter((video) => video.title?.toLowerCase().includes(title.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`More than one title matched. Use the exact title: ${partial.slice(0, 5).map((video) => video.title).join(', ')}.`);
  }
  throw new Error(`No catalog title matched "${title}".`);
}

function findMentionedCatalogTitle(message, catalog, contextCatalogId) {
  const ignoredWords = new Set([
    'about', 'artwork', 'can', 'change', 'cover', 'could', 'fix', 'for', 'improve',
    'make', 'please', 'poster', 'replace', 'the', 'this', 'update', 'you',
  ]);
  const words = normalizeRequestedTitle(message)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !ignoredWords.has(word));
  const matches = catalog
    .map((video) => {
      const title = String(video.title || '').toLowerCase();
      return {
        video,
        score: words.filter((word) => title.includes(word)).length,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);
  if (!matches.length && contextCatalogId) {
    const contextual = catalog.find((video) => video.id === contextCatalogId);
    if (contextual) return contextual;
  }
  if (!matches.length) throw new Error('Name the catalog title whose poster you want me to fix.');
  if (matches[1]?.score === matches[0].score) {
    throw new Error(`More than one title matched. Use the exact title: ${matches.slice(0, 5).map(({ video }) => video.title).join(', ')}.`);
  }
  return matches[0].video;
}

function parseRuntimeAmount(amount, unit) {
  const value = Number(amount);
  if (/hour/i.test(unit)) return value * 60 * 60;
  if (/min/i.test(unit)) return value * 60;
  return value;
}

function parseAction(message, catalog, contextCatalogId) {
  let match = message.match(/^regenerate metadata for (.+?)[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      type: 'regenerate-metadata',
      endpoint: 'regenerate-metadata',
      video,
      payload: {},
      summary: 'Regenerate the description, tags, and categories with the configured metadata service.',
    };
  }

  match = message.match(/^generate (?:a )?new ai poster(?: for (.+?))?[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      type: 'regenerate-poster',
      endpoint: 'regenerate-poster',
      video,
      payload: { mode: 'ai' },
      summary: 'Generate and store a new original AI poster.',
    };
  }

  match = message.match(/^swap to (?:the )?ia poster(?: for (.+?))?[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      type: 'regenerate-poster',
      endpoint: 'regenerate-poster',
      video,
      payload: { mode: 'internet-archive' },
      summary: 'Download and store the current Internet Archive item image as the poster.',
    };
  }

  match = message.match(/^replace (?:the )?description for (.+?) (?:with|to) ["“]?([\s\S]+?)["”]?[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      type: 'update-metadata',
      endpoint: 'update-metadata',
      video,
      payload: { updates: { description: match[2] } },
      summary: `Replace the description with: ${match[2]}`,
    };
  }

  match = message.match(/^fix (?:the )?year for (.+?) (?:to|as) (\d{4})[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      type: 'update-metadata',
      endpoint: 'update-metadata',
      video,
      payload: { updates: { year: Number(match[2]) } },
      summary: `Change the release year to ${match[2]}.`,
    };
  }

  match = message.match(/^correct (?:the )?runtime for (.+?) (?:to|as) ([\d.]+)\s*(hours?|minutes?|mins?|seconds?)[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    const runtime = parseRuntimeAmount(match[2], match[3]);
    return {
      type: 'update-metadata',
      endpoint: 'update-metadata',
      video,
      payload: { updates: { runtime } },
      summary: `Change the runtime to ${Math.round(runtime)} seconds.`,
    };
  }

  match = message.match(/^move (?:this title|(.+?)) to category (.+?)[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      type: 'update-metadata',
      endpoint: 'update-metadata',
      video,
      payload: { updates: { category: match[2] } },
      summary: `Move the title to the ${match[2]} category.`,
    };
  }

  match = message.match(/^update (?:the )?poster for (.+?) (?:to|with) (https:\/\/\S+?)[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      type: 'update-poster',
      endpoint: 'update-poster',
      video,
      payload: { posterUrl: match[2] },
      summary: `Download and store the poster from ${match[2]}. Confirming also confirms that PROtv may use this image.`,
    };
  }

  const naturalPosterRequest = (
    /\b(fix|improve|redo|refresh|replace|change|update)\b[\s\S]*\b(poster|artwork|cover)\b/i.test(message)
    || /\b(poster|artwork|cover)\b[\s\S]*\b(ugly|bad|broken|jumbled|wrong|overlap)/i.test(message)
  );
  if (naturalPosterRequest) {
    let video;
    try {
      video = findMentionedCatalogTitle(message, catalog, contextCatalogId);
    } catch (error) {
      return { clarification: error.message };
    }
    const hasInternetArchivePoster = video.publicDomainSource === 'Internet Archive'
      && Boolean(video.publicDomainSourceId);
    return {
      type: 'regenerate-poster',
      endpoint: 'regenerate-poster',
      video,
      payload: { mode: 'best' },
      summary: hasInternetArchivePoster
        ? `Replace the current ${video.posterSource || 'catalog'} poster with the artwork from this title’s verified Internet Archive source.`
        : 'Create and store the best available replacement poster using the configured poster service.',
    };
  }

  if (/^update (?:the )?poster for /i.test(message)) {
    const title = message.replace(/^update (?:the )?poster for /i, '');
    const video = findCatalogTitle(catalog, title, contextCatalogId);
    return {
      clarification: `I found "${video.title}". Send the command again with an HTTPS image URL, for example:\nUpdate the poster for ${video.title} to https://example.com/poster.jpg`,
      video,
    };
  }
  if (/^replace (?:the )?description for /i.test(message)) {
    const title = message.replace(/^replace (?:the )?description for /i, '');
    const video = findCatalogTitle(catalog, title, contextCatalogId);
    return {
      clarification: `I found "${video.title}". Send the command again with the new description after "with".`,
      video,
    };
  }
  match = message.match(/^fix (?:the )?year for (.+?)[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      clarification: `I found "${video.title}". Send the command again with the correct year, for example:\nFix the year for ${video.title} to 1940`,
      video,
    };
  }
  match = message.match(/^correct (?:the )?runtime for (.+?)[.!?]*$/i);
  if (match) {
    const video = findCatalogTitle(catalog, match[1], contextCatalogId);
    return {
      clarification: `I found "${video.title}". Send the command again with the correct runtime, for example:\nCorrect the runtime for ${video.title} to 95 minutes`,
      video,
    };
  }
  return null;
}

function formatFailures(failures) {
  if (!failures.length) return 'No current failures were reported.';
  return failures.slice(0, 5)
    .map((failure) => `- ${failure.title || 'Item'}: ${failure.message || 'No details available.'}`)
    .join('\n');
}

function buildOperationalReply(message, snapshot) {
  const request = message.toLowerCase();
  const sections = [];
  const asksAbout = (...terms) => terms.some((term) => request.includes(term));
  const relevantTitle = snapshot.relevantTitles?.[0];
  const overview = !relevantTitle && asksAbout('status', 'overview', 'everything', 'operations');

  if (relevantTitle) {
    if (asksAbout('source', 'come from', 'origin')) {
      sections.push(
        `${relevantTitle.title} came from ${relevantTitle.source || 'an unlabeled catalog source'}.`
      );
    } else if (asksAbout('ready', 'play', 'watch', 'viewer')) {
      sections.push(
        `${relevantTitle.title} is ${relevantTitle.playbackReady && relevantTitle.processingStatus === 'ready'
          ? 'ready for playback'
          : `not ready for playback (processing status: ${relevantTitle.processingStatus})`}. Its approval status is ${relevantTitle.approvalStatus}.`
      );
    } else if (asksAbout('year', 'runtime', 'category', 'poster', 'right', 'license')) {
      sections.push(
        `${relevantTitle.title}\nYear: ${relevantTitle.year || 'not set'}; runtime: ${relevantTitle.runtime || 'not set'} seconds; categories: ${relevantTitle.categories.join(', ') || 'not set'}; poster source: ${relevantTitle.posterSource || 'not set'}; rights evidence: ${relevantTitle.copyrightStatus}, ${relevantTitle.licenseType || 'license not labeled'}.`
      );
    }
  }

  if (overview || asksAbout('discovery', 'queue')) {
    const queue = snapshot.discoveryQueue;
    sections.push(
      `Discovery queue\nPending: ${queue.pending}; processing: ${queue.processing}; failed: ${queue.failed}; approved: ${queue.approved}; rejected: ${queue.rejected}.`
    );
  }
  if (overview || asksAbout('public domain', 'pd bot')) {
    const pd = snapshot.publicDomain;
    sections.push(
      `Public Domain Bot\nFolder bot: ${pd.local.status}. Automatic discovery: ${pd.discovery.status}. Web ingestion: ${pd.webIngestion.status}.\n${pd.webIngestion.message}`
    );
  }
  if (overview || asksAbout('distributor')) {
    sections.push(
      `Distributor feed\nStatus: ${snapshot.distributor.status}. ${snapshot.distributor.message}\nConfigured: ${snapshot.configuration.distributorFeed ? 'yes' : 'no'}.`
    );
  }
  if (overview || asksAbout('catalog')) {
    sections.push(
      `Catalog\nTotal titles: ${snapshot.catalog.total}. ${Object.entries(snapshot.catalog.byStatus)
        .map(([name, count]) => `${name}: ${count}`).join(', ') || 'No catalog titles.'}`
    );
  }
  if (asksAbout('audit', 'recent', 'history')) {
    sections.push(`Recent Administrator activity\n${snapshot.auditEvents.length
      ? snapshot.auditEvents.slice(0, 8).map((event) => `- ${event.message}`).join('\n')
      : 'No recent audit events were found.'}`);
  }
  if (asksAbout('fail', 'error', 'troubleshoot', 'stuck', 'missing', 'disappear')) {
    const failures = [
      ...(snapshot.publicDomain.local.failures || []),
      ...(snapshot.publicDomain.discovery.failures || []),
      ...(snapshot.publicDomain.webIngestion.failures || []),
      ...(snapshot.distributor.failures || []),
      ...snapshot.failedCandidates.map((candidate) => ({
        title: candidate.title,
        message: candidate.lastError || 'The title is ready for an Administrator retry.',
      })),
    ];
    sections.push(`Troubleshooting\n${formatFailures(failures)}`);
  }
  if (asksAbout('right', 'license', 'copyright', 'warning')) {
    sections.push(
      'Rights guidance\nCatalog changes require verified rights. Internet Archive and Wikimedia require explicit Public Domain or CC0 evidence. YouTube Creative Commons and PublicDomainMovie.net are reference-only. The assistant does not make legal conclusions.'
    );
  }
  if (asksAbout('ingestion', 'upload', 'publish', 'step', 'how')) {
    sections.push(
      'Ingestion steps\n1. Review source rights.\n2. Confirm one title.\n3. PROtv creates a draft and sends media to Mux.\n4. Mux prepares playback.\n5. PROtv publishes only after playback is ready.'
    );
  }
  if (asksAbout('config', 'setup', 'environment')) {
    const config = snapshot.configuration;
    sections.push(
      `Configuration\nPublic Domain directory: ${config.publicDomainDirectory ? 'configured' : 'missing'}.\nMux: ${config.mux ? 'configured' : 'missing'}.\nMetadata AI: ${config.metadataAi ? 'configured' : 'missing'}.\nDistributor feed: ${config.distributorFeed ? 'configured' : 'missing'}.\nYouTube discovery: ${config.youtube ? 'configured' : 'optional and currently missing'}.`
    );
  }
  if (asksAbout('document', 'link', 'guide', 'help')) {
    sections.push(
      'Documentation links\n- PROtv Admin: /admin\n- Distributor schema: backend/docs/distributor-feed.schema.json\n- Internet Archive terms: https://archive.org/about/terms.php\n- Wikimedia licensing: https://commons.wikimedia.org/wiki/Commons:Licensing\n- Mux dashboard: https://dashboard.mux.com'
    );
  }
  if (asksAbout('delete', 'remove', 'publish', 'ingest', 'upload')) {
    sections.push(
      'Safety notice\nThe assistant never publishes, deletes, or uploads media. Its only write actions are confirmed metadata and poster corrections.'
    );
  }
  if (sections.length === 0) {
    return 'I do not have enough matching operational evidence to answer that specifically. Name the title, queue, ingestion job, distributor feed, audit event, rights warning, or configuration item you want me to inspect.';
  }
  return [...new Set(sections)].join('\n\n');
}

async function logMessage({ actorId, conversationId, role, message }) {
  if (!db) throw new Error('Firestore is required for Administrator Assistant logs.');
  const id = crypto.randomUUID();
  await db.collection('adminAssistantLogs').doc(id).set({
    id,
    actorId,
    conversationId,
    role,
    message,
    createdAt: new Date().toISOString(),
  });
}

class AdminAssistantService {
  constructor(dependencies = {}) {
    const dataDirectory = path.resolve(__dirname, '../../.data');
    this.candidateStore = dependencies.candidateStore || createCandidateStore({
      db,
      filePath: path.resolve(
        process.env.PD_CANDIDATE_STORE_FILE
          || process.env.PD_CANDIDATE_FILE
          || path.join(dataDirectory, 'pd-candidates.json')
      ),
    });
    this.listAuditEvents = dependencies.listAuditEvents || listAdminEvents;
    this.getCatalog = dependencies.getCatalog || getAllVideos;
    this.getPublicDomainStatus = dependencies.getPublicDomainStatus || getAdminBotRuntimeStatus;
    this.getDistributorStatus = dependencies.getDistributorStatus || getDistributorRuntimeStatus;
    this.catalogService = dependencies.catalogService || new AdminCatalogService();
    this.posterService = dependencies.posterService || new PosterService({
      storageDirectory: path.resolve(
        process.env.PD_POSTER_DIRECTORY || path.join(dataDirectory, 'posters')
      ),
      publicBaseUrl: process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
      imageBaseUrl: process.env.AI_IMAGE_BASE_URL,
      imageApiKey: process.env.AI_IMAGE_API_KEY,
      imageModel: process.env.AI_IMAGE_MODEL,
    });
    this.metadataService = dependencies.metadataService || new AiMetadataService({
      baseUrl: process.env.AI_BASE_URL,
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL,
    });
    this.responseService = dependencies.responseService || new AdminAssistantResponseService({
      baseUrl: process.env.ADMIN_ASSISTANT_AI_BASE_URL || process.env.AI_BASE_URL,
      apiKey: process.env.ADMIN_ASSISTANT_AI_API_KEY || process.env.AI_API_KEY,
      model: process.env.ADMIN_ASSISTANT_AI_MODEL || process.env.AI_MODEL,
    });
    this.log = dependencies.log || logMessage;
    this.audit = dependencies.audit || logAdminEvent;
    this.confirmations = new Map();
  }

  async logFailureReply(actorId, message) {
    const conversationId = crypto.randomUUID();
    await this.log({
      actorId,
      conversationId,
      role: 'assistant',
      message: `Request failed: ${message}`,
    });
  }

  async query({ message, actorId, contextCatalogId, history }) {
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    if (!normalizedMessage) throw new Error('Enter a message for the Administrator Assistant.');
    if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
    }
    const conversationId = crypto.randomUUID();
    await this.log({ actorId, conversationId, role: 'admin', message: normalizedMessage });
    const catalog = await this.getCatalog();
    const parsedAction = parseAction(normalizedMessage, catalog, contextCatalogId);
    if (parsedAction?.clarification) {
      const reply = `${parsedAction.video ? `${formatCurrentMetadata(parsedAction.video)}\n\n` : ''}${parsedAction.clarification}`;
      await this.log({ actorId, conversationId, role: 'assistant', message: reply });
      return { reply, contextCatalogId: parsedAction.video?.id || contextCatalogId || null };
    }
    if (parsedAction) {
      validateCatalogRights(await this.catalogService.get(parsedAction.video.id));
      const confirmationId = crypto.randomUUID();
      this.confirmations.set(confirmationId, {
        actorId,
        type: parsedAction.type,
        catalogId: parsedAction.video.id,
        payload: parsedAction.payload,
        expiresAt: Date.now() + CONFIRMATION_TTL_MS,
      });
      const reply = `${formatCurrentMetadata(parsedAction.video)}\n\nProposed change\n${parsedAction.summary}\n\nConfirm this change?`;
      await this.log({ actorId, conversationId, role: 'assistant', message: reply });
      return {
        reply,
        contextCatalogId: parsedAction.video.id,
        action: {
          confirmationId,
          endpoint: parsedAction.endpoint,
          catalogId: parsedAction.video.id,
          label: parsedAction.summary,
        },
      };
    }

    const [discoveryQueue, failedCandidates, allCandidates, auditEvents] = await Promise.all([
      this.candidateStore.status(),
      this.candidateStore.list({ decision: 'failed', limit: 10 }),
      this.candidateStore.list({ decision: null, limit: 500 }),
      this.listAuditEvents(25),
    ]);
    const relevantTitles = relevantCatalogItems(
      normalizedMessage,
      catalog,
      contextCatalogId,
      allCandidates,
      auditEvents
    );
    const snapshot = {
      currentTime: localTimeDescription(
        new Date(),
        process.env.ADMIN_TIME_ZONE || 'America/New_York'
      ),
      discoveryQueue,
      failedCandidates,
      auditEvents,
      catalog: { total: catalog.length, byStatus: countByStatus(catalog) },
      publicDomain: this.getPublicDomainStatus(),
      distributor: this.getDistributorStatus(),
      configuration: {
        publicDomainDirectory: Boolean(process.env.PD_CONTENT_DIRECTORY || process.env.PUBLIC_DOMAIN_CONTENT_DIR),
        mux: Boolean(process.env.MUX_ACCESS_TOKEN && process.env.MUX_SECRET_KEY),
        metadataAi: Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL),
        distributorFeed: Boolean(process.env.DISTRIBUTOR_FEED_URL && process.env.DISTRIBUTOR_FEED_TOKEN),
        youtube: Boolean(process.env.YOUTUBE_API_KEY),
      },
      relevantTitles,
      discoveryCandidates: allCandidates
        .filter((candidate) => candidate.decision === 'pending')
        .slice(0, 8)
        .map((candidate) => ({
          title: candidate.title,
          source: candidate.sourceLabel || candidate.source,
          ingestionAvailable: Boolean(candidate.ingestionAvailable),
        })),
    };
    let reply;
    try {
      reply = await this.responseService.answer({
        message: normalizedMessage,
        history: safeHistory(history),
        snapshot,
      });
    } catch (error) {
      console.warn(`Administrator Assistant conversational response unavailable: ${error.message}`);
      reply = answerVerifiedQuestion({ message: normalizedMessage, snapshot })
        || buildOperationalReply(normalizedMessage, snapshot);
    }
    reply = humanizeReply(reply);
    await this.log({ actorId, conversationId, role: 'assistant', message: reply });
    return {
      reply,
      contextCatalogId: relevantTitles.length === 1
        ? relevantTitles[0].id
        : contextCatalogId || null,
    };
  }

  consumeConfirmation({ confirmationId, actorId, type }) {
    const pending = this.confirmations.get(confirmationId);
    if (!pending || pending.expiresAt <= Date.now()) {
      this.confirmations.delete(confirmationId);
      throw new Error('The confirmation expired. Ask the assistant to prepare the change again.');
    }
    if (pending.actorId !== actorId || pending.type !== type) {
      throw new Error('This confirmation does not match the requested Administrator action.');
    }
    this.confirmations.delete(confirmationId);
    return pending;
  }

  async executeConfirmedAction({ confirmationId, catalogId, confirmed, actorId, type }) {
    if (confirmed !== true) throw new Error('Explicit Administrator confirmation is required.');
    const requestedCatalogId = validateCatalogId(catalogId);
    const pending = this.consumeConfirmation({ confirmationId, actorId, type });
    if (pending.catalogId !== requestedCatalogId) {
      throw new Error('This confirmation does not match the requested catalog title.');
    }
    const before = await this.catalogService.get(pending.catalogId);
    validateCatalogRights(before);
    let updates;

    if (type === 'update-metadata') {
      updates = normalizeMetadataUpdates(pending.payload.updates);
    } else if (type === 'regenerate-metadata') {
      const generated = await this.metadataService.enrich({
        title: before.title,
        year: before.year,
        runtime: before.runtime || before.duration,
        sourceMetadata: {
          description: before.description,
          creator: before.creator,
          categories: before.categories,
        },
      });
      updates = normalizeMetadataUpdates(generated);
    } else if (type === 'update-poster') {
      const posterUrl = await this.posterService.storeRemoteImage(
        pending.payload.posterUrl,
        before.title,
        'Administrator-confirmed'
      );
      updates = {
        posterUrl,
        thumbnailUrl: posterUrl,
        posterSource: 'Administrator-confirmed image',
        posterSourcePage: pending.payload.posterUrl,
      };
    } else if (
      type === 'regenerate-poster'
      && ['internet-archive', 'best'].includes(pending.payload.mode)
      && before.publicDomainSource === 'Internet Archive'
      && before.publicDomainSourceId
    ) {
      const sourceUrl = `https://archive.org/services/img/${encodeURIComponent(before.publicDomainSourceId)}`;
      const posterUrl = await this.posterService.storeRemoteImage(sourceUrl, before.title, 'Internet Archive');
      updates = {
        posterUrl,
        thumbnailUrl: posterUrl,
        posterSource: 'Internet Archive',
        posterSourcePage: before.publicDomainSourceUrl || sourceUrl,
      };
    } else if (
      type === 'regenerate-poster'
      && (pending.payload.mode === 'ai'
        || (pending.payload.mode === 'best' && this.posterService.imageBaseUrl
          && this.posterService.imageApiKey && this.posterService.imageModel))
    ) {
      const posterUrl = await this.posterService.generateAiPoster({
        title: before.title,
        year: before.year,
        description: before.description,
        categories: before.categories || [before.category].filter(Boolean),
      });
      updates = {
        posterUrl,
        thumbnailUrl: posterUrl,
        posterSource: 'AI-generated Administrator replacement',
        posterSourcePage: '',
      };
    } else if (type === 'regenerate-poster' && pending.payload.mode === 'best') {
      const posterUrl = await this.posterService.createLocalFallback({
        title: before.title,
        year: before.year,
        categories: before.categories || [before.category].filter(Boolean),
      });
      updates = {
        posterUrl,
        thumbnailUrl: posterUrl,
        posterSource: 'PROtv designed fallback poster',
        posterSourcePage: '',
      };
    } else if (type === 'regenerate-poster' && pending.payload.mode === 'internet-archive') {
      throw new Error('This title does not have a verified Internet Archive source.');
    } else {
      throw new Error('The confirmed Administrator action is unsupported.');
    }

    const updated = await this.catalogService.update(before.id, updates);
    const changedFields = Object.keys(updates);
    await this.audit({
      type: 'admin-assistant.catalog-updated',
      message: `Administrator Assistant updated ${changedFields.join(', ')} for ${before.title}`,
      actorId,
      details: {
        catalogId: before.id,
        action: type,
        changedFields,
      },
    });
    const reply = `Change completed successfully.\n\n${formatCurrentMetadata(updated)}`;
    const conversationId = crypto.randomUUID();
    await this.log({
      actorId,
      conversationId,
      role: 'admin',
      message: `Confirmed ${type} for ${before.title}.`,
    });
    await this.log({ actorId, conversationId, role: 'assistant', message: reply });
    return { success: true, message: 'Catalog update completed.', reply, video: currentMetadata(updated) };
  }
}

module.exports = {
  AdminAssistantService,
  MAX_MESSAGE_LENGTH,
  buildOperationalReply,
  countByStatus,
  currentMetadata,
  findCatalogTitle,
  findMentionedCatalogTitle,
  parseAction,
};

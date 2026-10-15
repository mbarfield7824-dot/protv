const crypto = require('crypto');
const {
  createCreatorVideo,
  getVideoByCreatorProjectId,
  updateVideo,
  updateCreatorPosterTransfer,
} = require('../firebase');
const {
  createAssetFromUrl,
  getAsset,
  getPlaybackId,
} = require('../mux');
const { verifySignedBody } = require('../ads/adRevenueService');
const { logAdminEvent } = require('../adminBot/adminAudit');
const { CreatorEpisodeService, validateEpisodeRequest } = require('./creatorEpisodes');
const { getCreatorEpisode, claimCreatorEpisode, updateCreatorEpisode } = require('../firebase');
const {
  validatePromotional, posterSource, transferPoster, promotionalBinding,
} = require('./creatorPromotional');

const ACTIONS = new Set(['licensing', 'contracting', 'publishing', 'publishing_status', 'distribution', 'episode_publishing', 'episode_status']);
const REQUEST_WINDOW_MS = 5 * 60 * 1000;

function requiredText(value, label, maxLength = 500) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} is required and must be no more than ${maxLength} characters.`);
  }
  return value.trim();
}

function optionalText(value, maxLength = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateCreatorActionRequest(rawBody, signature, secret, now = Date.now()) {
  verifySignedBody(rawBody, signature, secret);
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error('The signed Creator Agent request is not valid JSON.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The Creator Agent request must be an object.');
  }
  requiredText(payload.requestId, 'requestId', 200);
  if (!ACTIONS.has(payload.action)) throw new Error('The requested Creator Agent action is invalid.');
  if (!Number.isFinite(payload.timestamp) || Math.abs(now - payload.timestamp) > REQUEST_WINDOW_MS) {
    throw new Error('The Creator Agent request has expired.');
  }
  const project = payload.project;
  if (payload.action.startsWith('episode_')) return validateEpisodeRequest(payload);
  if (String(project?.contentType).trim().toLowerCase() === 'series') {
    throw new Error('Series require revision-bound episode publishing, not the movie bridge.');
  }
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new Error('Project details are required.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(project.id || ''))) {
    throw new Error('A valid creator project ID is required.');
  }
  if (payload.requestId !== `${project.id}:${payload.action}`) {
    throw new Error('requestId must identify the creator project and action.');
  }
  requiredText(project.title, 'Project title', 300);
  if (project.ownership?.status !== 'verified') {
    throw new Error('Creator ownership must be verified before this action.');
  }
  if (project.approval?.status !== 'approved') {
    throw new Error('Explicit Administrator approval is required for this action.');
  }
  if (payload.action === 'publishing' || payload.action === 'publishing_status' || payload.action === 'distribution') {
    if (project.contract?.status !== 'signed' || !project.contract.signedAt) {
      throw new Error('A signed creator contract is required before publishing or distribution.');
    }
    if (payload.action === 'publishing') validatePromotional(project.promotional);
  }
  return payload;
}

function parseSourceUrl(value, creatorAgentOrigin) {
  let sourceUrl;
  try {
    sourceUrl = new URL(requiredText(value, 'Media source URL', 2000));
  } catch (error) {
    if (error.message.startsWith('Media source URL')) throw error;
    throw new Error('Media source URL must be a valid HTTPS URL.');
  }
  if (sourceUrl.protocol !== 'https:') throw new Error('Media source URL must use HTTPS.');
  if (creatorAgentOrigin) {
    const allowedOrigin = new URL(creatorAgentOrigin).origin;
    if (sourceUrl.origin !== allowedOrigin) {
      throw new Error('Media source URL does not match the configured Creator Agent origin.');
    }
  }
  return sourceUrl.toString();
}

function metadataFromProject(project) {
  const metadata = project.metadata && typeof project.metadata === 'object' && !Array.isArray(project.metadata)
    ? project.metadata
    : {};
  const genre = optionalText(metadata.genre, 100) || 'Independent';
  return {
    title: requiredText(project.title, 'Project title', 300),
    description: optionalText(metadata.synopsis, 5000) || optionalText(project.description, 5000),
    category: genre,
    genre,
    creator: optionalText(project.creatorName, 300),
    contentType: 'MOVIE',
    language: optionalText(metadata.language, 100),
    maturityRating: optionalText(metadata.maturityRating, 50),
  };
}

class CreatorPublishingService {
  constructor({
    creatorAgentOrigin = '',
    publishingSecret = process.env.PROTV_PUBLISHING_SECRET || '',
    dependencies = {
      createCreatorVideo,
      getVideoByCreatorProjectId,
      updateVideo,
      updateCreatorPosterTransfer,
      transferPoster,
      createAssetFromUrl,
      getAsset,
      getPlaybackId,
      logAdminEvent,
      getCreatorEpisode,
      claimCreatorEpisode,
      updateCreatorEpisode,
    },
  } = {}) {
    this.creatorAgentOrigin = creatorAgentOrigin;
    this.publishingSecret = publishingSecret;
    this.dependencies = dependencies;
    this.episodes = new CreatorEpisodeService({ creatorAgentOrigin, dependencies });
  }

  async execute(payload) {
    const { action, project } = payload;
    if (action.startsWith('episode_')) return this.episodes.execute(payload);
    if (String(project?.contentType).trim().toLowerCase() === 'series') {
      throw new Error('Series require revision-bound episode publishing, not the movie bridge.');
    }
    if (action === 'licensing' || action === 'contracting') {
      const externalId = `creator_${action}_${project.id}`;
      await this.audit(action, project.id, externalId, 'Accepted approved Creator Agent milestone.');
      return {
        externalId,
        status: 'recorded',
        message: `PROtv recorded the approved ${action} milestone.`,
      };
    }

    if (action === 'publishing') return this.publish(payload);
    if (action === 'publishing_status') {
      const video = await this.dependencies.getVideoByCreatorProjectId(project.id);
      if (!video || project.catalogId !== video.id) throw new Error('The linked catalog title could not be verified.');
      return this.publicationResult(video);
    }
    return this.distribute(payload);
  }

  publicationResult(video) {
    const published = video.status === 'ready' && Boolean(video.muxPlaybackId) && video.approvalStatus === 'approved';
    const failed = ['ingestion_failed', 'errored', 'poster_transfer_failed'].includes(video.status);
    return {
      externalId: video.id,
      status: published ? 'published' : failed ? 'failed' : 'processing',
      message: published ? 'PROtv confirms approved, playback-ready publication.'
        : failed ? `PROtv ingestion failed for the existing title (${video.status}). Resolve the integration error before recovery; do not create another title.`
          : 'The existing PROtv title is not playback-ready. Publication is not confirmed.',
    };
  }

  async publish({ requestId, project }) {
    const promotional = validatePromotional(project.promotional);
    const binding = promotionalBinding(promotional);
    const existing = await this.dependencies.getVideoByCreatorProjectId(project.id);
    if (existing) {
      if (existing.status === 'ingestion_failed' && !existing.muxAssetId
        && /^401\b/.test(existing.integrationError || '')) {
        if (existing.creatorContractReference !== project.contract.reference
          || existing.creatorPromotionalBinding !== binding) {
          throw new Error('Recovery must retain the original signed contract and promotional package.');
        }
        parseSourceUrl(project.media?.sourceUrl, this.creatorAgentOrigin);
        const token = crypto.randomUUID();
        const claimed = await this.dependencies.updateCreatorPosterTransfer(existing.id, existing, {
          status: 'initializing', posterTransferToken: token, integrationError: '',
        });
        if (!claimed) throw new Error('Recovery reservation changed; no Mux request was made.');
        await this.audit('publishing', project.id, existing.id, 'Administrator-authorized recovery of a definitively rejected Mux request; same catalog title and contract retained.');
        return this.startMovieIngestion(project, existing.id);
      }
      if (['poster_transfer_failed', 'poster_transferring'].includes(existing.status)) {
        if (!promotional.poster || existing.creatorPromotionalBinding !== binding) {
          throw new Error('Poster retry must match the reserved promotional asset and credits.');
        }
        if (existing.status === 'poster_transferring' && existing.posterTransferLeaseUntil > Date.now()) {
          throw new Error('Poster transfer is in progress; retry publishing later.');
        }
        return this.resumePoster(project, promotional, existing);
      }
      await this.audit('publishing', project.id, existing.id, 'Returned existing catalog title for an idempotent retry.');
      return this.publicationResult(existing);
    }

    if (!project.media || typeof project.media !== 'object') {
      throw new Error('A protected media source is required for publishing.');
    }
    const metadata = metadataFromProject(project);
    if (promotional.poster) posterSource(project.id, promotional.poster, this.creatorAgentOrigin, this.publishingSecret);
    const transferState = promotional.poster ? {
      status: 'poster_transferring',
      posterTransferToken: crypto.randomUUID(),
      posterTransferLeaseUntil: Date.now() + 120_000,
      creatorPromotionalBinding: binding,
    } : {};
    const reservation = await this.dependencies.createCreatorVideo(project.id, {
      ...metadata,
      credits: promotional.credits,
      thumbnailUrl: '',
      duration: 0,
      views: 0,
      createdBy: 'creator-agent',
      creatorRequestId: requestId,
      approvalStatus: 'draft',
      status: 'initializing',
      copyrightStatus: 'creator-owned',
      licenseType: optionalText(project.contract.scheduleCode, 20)
        ? `Creator Schedule ${optionalText(project.contract.scheduleCode, 20)}`
        : 'Creator Contract',
      rightsHolder: optionalText(project.ownership.copyrightHolderName, 300)
        || optionalText(project.creatorName, 300),
      commercialUseStatus: 'verified-contract',
      rightsVerificationNotes: 'Ownership and signed contract were verified in the PROtv Creator Agent before Administrator-approved publishing.',
      creatorContractReference: optionalText(project.contract.reference, 300),
      creatorContractSignedAt: project.contract.signedAt,
      ...transferState,
    });
    const catalogId = reservation.id;
    if (!reservation.created) {
      const reserved = await this.dependencies.getVideoByCreatorProjectId(project.id);
      if (!reserved) throw new Error('The existing creator catalog reservation could not be loaded.');
      return this.publicationResult(reserved);
    }

    if (promotional.poster) {
      return this.ingestWithPoster(project, promotional, { id: catalogId, ...transferState });
    }
    return this.startMovieIngestion(project, catalogId);
  }

  async resumePoster(project, promotional, existing) {
    parseSourceUrl(project.media?.sourceUrl, this.creatorAgentOrigin);
    posterSource(project.id, promotional.poster, this.creatorAgentOrigin, this.publishingSecret);
    const state = {
      status: 'poster_transferring', posterTransferToken: crypto.randomUUID(),
      posterTransferLeaseUntil: Date.now() + 120_000, integrationError: '',
    };
    if (!await this.dependencies.updateCreatorPosterTransfer(existing.id, existing, state)) {
      throw new Error('Poster reservation changed; retry publishing later.');
    }
    return this.ingestWithPoster(project, promotional, { ...existing, ...state });
  }

  async ingestWithPoster(project, promotional, reservation) {
    let posterUrl;
    try {
      posterUrl = await this.dependencies.transferPoster(project.id, promotional.poster, {
        origin: this.creatorAgentOrigin, secret: this.publishingSecret,
      });
      if (typeof posterUrl !== 'string' || !posterUrl || posterUrl.includes('/api/integrations/protv/')) {
        throw new Error('Poster storage did not return a durable catalog URL.');
      }
    } catch {
      await this.dependencies.updateCreatorPosterTransfer(reservation.id, reservation, {
        status: 'poster_transfer_failed', posterTransferLeaseUntil: 0,
        integrationError: 'Poster transfer failed before Mux ingestion. Retry publishing with a fresh signed poster URL.',
      });
      throw new Error('Poster transfer failed before Mux ingestion. Retry publishing with a fresh signed poster URL.');
    }
    const updated = await this.dependencies.updateCreatorPosterTransfer(reservation.id, reservation, {
      status: 'initializing', posterTransferLeaseUntil: 0, integrationError: '',
      thumbnailUrl: posterUrl, posterUrl, credits: promotional.credits,
    });
    if (!updated) throw new Error('Poster reservation changed; Mux ingestion was not started.');
    return this.startMovieIngestion(project, reservation.id);
  }

  async startMovieIngestion(project, catalogId) {
    let asset;
    try {
      const sourceUrl = parseSourceUrl(project.media.sourceUrl, this.creatorAgentOrigin);
      asset = await this.dependencies.createAssetFromUrl(sourceUrl, { passthrough: `creator_movie_${project.id}` });
      await this.dependencies.updateVideo(catalogId, {
        approvalStatus: 'approved',
        approvalNotes: 'Published after Creator Agent ownership, contract, and Administrator approval checks.',
        approvedBy: 'creator-agent',
        approvedAt: new Date().toISOString(),
        status: 'processing',
        muxAssetId: asset.id,
      });
    } catch (error) {
      await this.dependencies.updateVideo(catalogId, {
        status: 'ingestion_failed',
        ...(asset?.id ? { muxAssetId: asset.id } : {}),
        integrationError: error instanceof Error ? error.message : 'Mux ingestion failed.',
      });
      throw error;
    }
    await this.audit('publishing', project.id, catalogId, 'Created an approved catalog title and started Mux processing.');
    return {
      externalId: catalogId,
      status: 'processing',
      message: `PROtv catalog title ${catalogId} is reserved; Mux is processing the media. Publication is not confirmed.`,
    };
  }

  async distribute({ project }) {
    const video = await this.dependencies.getVideoByCreatorProjectId(project.id);
    if (!video) throw new Error('Publish this creator project before starting distribution.');
    if (project.catalogId && project.catalogId !== video.id) {
      throw new Error('The Creator Agent catalog reference does not match the linked PROtv title.');
    }

    let current = video;
    if (['ingestion_failed', 'errored', 'poster_transfer_failed'].includes(current.status)) {
      throw new Error(`PROtv ingestion failed (${current.status}); this title is not processing. Resolve the integration error before retrying distribution.`);
    }
    if (current.status === 'processing' && current.muxAssetId) {
      const asset = await this.dependencies.getAsset(current.muxAssetId);
      if (asset.status === 'errored') {
        await this.dependencies.updateVideo(current.id, { status: 'errored' });
        throw new Error('Mux could not process this title, so distribution cannot begin.');
      }
      if (asset.status === 'ready') {
        const playbackId = this.dependencies.getPlaybackId(asset);
        if (!playbackId) throw new Error('Mux finished processing without a public playback ID.');
        const updates = {
          status: 'ready',
          muxPlaybackId: playbackId,
          duration: asset.duration ? Math.round(asset.duration) : current.duration,
        };
        await this.dependencies.updateVideo(current.id, updates);
        current = { ...current, ...updates };
      }
    }
    if (current.status !== 'ready' || !current.muxPlaybackId) {
      throw new Error('Mux is still processing this title. Retry distribution after playback is ready.');
    }

    const distributedAt = current.distributedAt || new Date().toISOString();
    await this.dependencies.updateVideo(current.id, {
      distributionStatus: 'active',
      distributedAt,
      distributedBy: 'creator-agent',
    });
    await this.audit('distribution', project.id, current.id, 'Activated distribution for the playback-ready catalog title.');
    return {
      externalId: current.id,
      status: 'active',
      message: `Distribution is active for PROtv catalog title ${current.id}.`,
    };
  }

  async audit(action, projectId, externalId, message) {
    await this.dependencies.logAdminEvent({
      type: `creator-agent.${action}`,
      message,
      actorId: 'creator-agent',
      details: { projectId, externalId },
    });
  }
}

module.exports = {
  CreatorPublishingService,
  validateCreatorActionRequest,
};

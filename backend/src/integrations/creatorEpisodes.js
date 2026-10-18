const crypto = require('crypto');
const { publicationResult } = require('../catalog/releases');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BINDING = ['creatorProjectId', 'creatorSubmissionId', 'creatorEpisodeId', 'creatorMediaId', 'creatorMediaSha256', 'creatorContractReference', 'seriesId', 'seasonId', 'episodeNumber', 'seasonNumber'];

function validateEpisodeRequest(payload) {
  const { project, episode, submission, authorization } = payload;
  for (const id of [project?.id, episode?.id, episode?.seasonId, episode?.media?.assetId, submission?.id, authorization?.actorId]) {
    if (!UUID.test(String(id || ''))) throw new Error('Valid series, submission, season, episode, media and Administrator IDs are required.');
  }
  if (!['episode_publishing', 'episode_status'].includes(payload.action)
    || payload.requestId !== `episode:${project.id}:${submission.id}:${episode.id}`
    || project.contentType !== 'Series' || submission.status !== 'approved'
    || !Number.isInteger(submission.revision) || submission.revision < 1
    || authorization.role !== 'admin' || !Number.isFinite(Date.parse(authorization.authorizedAt))
    || project.ownership?.status !== 'verified' || project.contract?.status !== 'signed'
    || !Number.isFinite(Date.parse(project.contract.signedAt)) || project.contract.revokedAt
    || project.contract.seriesSubmissionId !== submission.id || project.contract.contentType !== 'Series'
    || project.contractApproval !== 'approved' || typeof project.contract.reference !== 'string'
    || !project.contract.reference.trim()) {
    throw new Error('Approved exact revision, valid signed agreement and explicit Administrator authorization are required.');
  }
  if (![episode.title, episode.synopsis, project.title, episode.seasonTitle, project.ownership.copyrightHolderName]
      .every((value) => typeof value === 'string' && value.trim() && value.length <= 10_000)
    || !Number.isInteger(episode.number) || episode.number < 1
    || !Number.isInteger(episode.seasonNumber) || episode.seasonNumber < 1
    || typeof episode.media.mimeType !== 'string' || !episode.media.mimeType.startsWith('video/') || !Number.isSafeInteger(episode.media.bytes)
    || episode.media.bytes <= 0 || !/^[a-f0-9]{64}$/.test(episode.media.sha256 || '')) {
    throw new Error('Complete episode metadata and an immutable video revision are required.');
  }
  return payload;
}

function episodeData(payload) {
  const { project, episode, submission, authorization } = validateEpisodeRequest(payload);
  return {
    contentType: 'EPISODE', title: episode.title, episodeTitle: episode.title, description: episode.synopsis,
    seriesId: project.id, seriesTitle: project.title, seasonId: episode.seasonId, seasonTitle: episode.seasonTitle,
    seasonNumber: episode.seasonNumber, episodeId: episode.id, episodeNumber: episode.number,
    category: project.genre || 'Independent', genre: project.genre || 'Independent',
    thumbnailUrl: '', duration: 0,
    creatorProjectId: project.id, creatorSubmissionId: submission.id, creatorSubmissionRevision: submission.revision,
    creatorEpisodeId: episode.id, creatorMediaId: episode.media.assetId, creatorMediaSha256: episode.media.sha256,
    creatorContractReference: project.contract.reference, creatorContractSignedAt: project.contract.signedAt,
    creatorEpisodeAuthorization: authorization, approvalStatus: 'approved',
    approvedBy: authorization.actorId, approvedAt: authorization.authorizedAt,
    copyrightStatus: 'creator-owned', rightsHolder: project.ownership.copyrightHolderName,
    commercialUseStatus: 'verified-contract',
  };
}

// Pure state transition shared by Firestore transactions and isolated test stores.
function claimEpisode(existing, data, now, token) {
  if (existing && existing.approvalStatus !== 'approved') {
    throw new Error('PROtv approval was withdrawn; episode ingestion remains blocked.');
  }
  if (existing && BINDING.some((key) => existing[key] !== data[key])) {
    throw new Error('The catalog episode is already bound to a different approved media revision or agreement.');
  }
  if (existing?.status === 'ready' || existing?.status === 'processing'
    || (existing?.status === 'ingesting' && existing.ingestionLeaseUntil > now)) {
    return { video: existing, claimed: false };
  }
  const newAttempt = !existing || Boolean(existing.muxAssetId);
  if (existing && !newAttempt) {
    throw new Error('Uncertain Mux ingestion requires manual reconciliation before another attempt; automatic duplicate creation is blocked.');
  }
  const attempt = (existing?.ingestionAttempt || 0) + (newAttempt ? 1 : 0);
  return {
    claimed: true,
    video: {
      ...existing, ...data, id: `creator_episode_${data.creatorEpisodeId}`,
      releaseStatus: existing?.releaseStatus ?? (existing ? 'published' : 'held'),
      releaseAt: existing?.releaseAt ?? null,
      muxPlaybackPolicy: existing?.muxPlaybackPolicy ?? (existing ? 'public' : 'signed'),
      status: 'ingesting', muxAssetId: null, muxPlaybackId: null, integrationError: '',
      ingestionAttempt: attempt, ingestionToken: token, ingestionLeaseUntil: now + 60_000,
      ingestionStartedAt: newAttempt ? now : existing.ingestionStartedAt,
    },
  };
}

function episodeUpdateMatches(video, expected) {
  return Boolean(video?.creatorEpisodeAuthorization && video.contentType === 'EPISODE'
    && video.status === expected.status && video.ingestionToken === expected.ingestionToken
    && (video.muxAssetId || null) === (expected.muxAssetId || null));
}

class CreatorEpisodeService {
  constructor({ creatorAgentOrigin, dependencies }) {
    this.origin = creatorAgentOrigin;
    this.dependencies = dependencies;
  }

  async result(video) {
    const loadContext = this.dependencies.getSeriesReleaseContext || require('../firebase').getSeriesReleaseContext;
    return publicationResult(video, await loadContext(video));
  }

  async execute(payload) {
    const data = episodeData(payload);
    if (payload.action === 'episode_status') {
      const video = await this.dependencies.getCreatorEpisode(data.creatorEpisodeId);
      if (!video) throw new Error('Episode publishing has not been authorized in PROtv.');
      if (BINDING.some((key) => video[key] !== data[key])) throw new Error('Episode status does not match the authorized revision.');
      if (video.approvalStatus !== 'approved') throw new Error('PROtv approval was withdrawn.');
      return this.result(await this.refresh(video));
    }
    if (!this.origin) throw new Error('Creator Agent media origin is not configured.');
    const url = new URL(payload.episode.media.sourceUrl);
    const expectedPath = `/api/integrations/protv/series-media/${data.creatorProjectId}/${data.creatorSubmissionId}/${data.creatorEpisodeId}/${data.creatorMediaId}`;
    if (url.protocol !== 'https:' || url.origin !== new URL(this.origin).origin
      || url.pathname !== expectedPath || url.username || url.password) {
      throw new Error('Episode media source does not match the protected Creator Agent revision.');
    }
    const existing = await this.dependencies.getCreatorEpisode(data.creatorEpisodeId);
    if (!existing || existing.muxPlaybackPolicy === 'signed') {
      (this.dependencies.requirePlaybackSigning || require('../mux').requirePlaybackSigning)();
    }
    const claim = await this.dependencies.claimCreatorEpisode(data.creatorEpisodeId, data, Date.now(), crypto.randomUUID());
    if (!claim.claimed) return this.result(await this.refresh(claim.video));
    const video = claim.video;
    try {
      const asset = await this.dependencies.createAssetFromUrl(url.toString(), {
        passthrough: `${video.id}:${video.ingestionAttempt}`,
        playbackPolicy: video.muxPlaybackPolicy,
      });
      if (!asset?.id) throw new Error('Mux returned no episode asset ID.');
      const updated = await this.dependencies.updateCreatorEpisode(video.id, video, {
        status: 'processing', muxAssetId: asset.id, ingestionLeaseUntil: 0,
      });
      if (!updated) {
        const current = await this.dependencies.getCreatorEpisode(video.creatorEpisodeId);
        if (current?.muxAssetId === asset.id && ['processing', 'ready'].includes(current.status)) {
          return this.result(current);
        }
        throw new Error('Episode ingestion claim changed; refresh status before retrying.');
      }
      return this.result(await this.refresh({ ...video, status: 'processing', muxAssetId: asset.id }));
    } catch (error) {
      await this.dependencies.updateCreatorEpisode(video.id, video, {
        status: 'failed', ingestionLeaseUntil: 0,
        integrationError: error instanceof Error ? error.message : 'Episode ingestion failed.',
      });
      throw error;
    }
  }

  async refresh(video) {
    if (video.status === 'ingesting' && video.ingestionLeaseUntil <= Date.now() && !video.muxAssetId) {
      const updates = { status: 'failed', integrationError: 'Mux ingestion result is uncertain. Await its matching webhook or reconcile manually; duplicate creation is blocked.' };
      await this.dependencies.updateCreatorEpisode(video.id, video, updates);
      return this.dependencies.getCreatorEpisode(video.creatorEpisodeId);
    }
    if (!['processing', 'failed'].includes(video.status) || !video.muxAssetId) return video;
    const asset = await this.dependencies.getAsset(video.muxAssetId);
    return this.reconcile(video, asset);
  }

  async reconcile(video, asset) {
    if (!video.creatorEpisodeAuthorization || video.approvalStatus !== 'approved'
      || !['processing', 'ingesting', 'failed'].includes(video.status)) return video;
    if (video.muxAssetId && video.muxAssetId !== asset.id) return video;
    if (!video.muxAssetId && asset.passthrough !== `${video.id}:${video.ingestionAttempt}`) return video;
    let updates;
    if (asset.status === 'ready') {
      const playbackId = this.dependencies.getPlaybackId(asset, video.muxPlaybackPolicy || 'public');
      if (!playbackId) throw new Error('Mux episode is ready without the expected playback ID.');
      updates = { status: 'ready', muxAssetId: asset.id, muxPlaybackId: playbackId,
        duration: Math.round(asset.duration || 0), integrationError: '', mediaReadyAt: new Date().toISOString() };
    } else if (asset.status === 'errored') {
      updates = { status: 'failed', muxAssetId: asset.id, muxPlaybackId: null, integrationError: 'Mux could not process this episode.' };
    } else return video;
    await this.dependencies.updateCreatorEpisode(video.id, video, updates);
    return this.dependencies.getCreatorEpisode(video.creatorEpisodeId);
  }
}

module.exports = { CreatorEpisodeService, validateEpisodeRequest, claimEpisode, episodeUpdateMatches };

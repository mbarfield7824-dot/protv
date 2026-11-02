const crypto = require('crypto');

// Episodes are ingested with no Mux playback ID at all. A public ID is created only at release, so before
// that there is nothing a viewer, a device or a leaked response could play. Unpublishing deletes the ID.
const EPISODE_ACTIONS = new Set(['episode_publishing', 'episode_status', 'episode_release', 'episode_unpublish']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BINDING = ['creatorProjectId', 'creatorSubmissionId', 'creatorEpisodeId', 'creatorMediaId', 'creatorMediaSha256', 'creatorContractReference', 'seriesId', 'seasonId', 'episodeNumber', 'seasonNumber'];
const CLOCK_TOLERANCE_MS = 60_000;

function validateEpisodeRequest(payload, now = Date.now()) {
  const { project, episode, submission, authorization } = payload;
  for (const id of [project?.id, episode?.id, episode?.seasonId, episode?.media?.assetId, submission?.id, authorization?.actorId]) {
    if (!UUID.test(String(id || ''))) throw new Error('Valid series, submission, season, episode, media and Administrator IDs are required.');
  }
  if (!EPISODE_ACTIONS.has(payload.action)
    || payload.requestId !== `episode:${project.id}:${submission.id}:${episode.id}`
    || project.contentType !== 'Series') {
    throw new Error('Approved exact revision, valid signed agreement and explicit Administrator authorization are required.');
  }
  // A revoked agreement is exactly when an episode must still be able to come down.
  if (payload.action === 'episode_unpublish') return payload;
  if (submission.status !== 'approved'
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
    || typeof episode.media.mimeType !== 'string' || !episode.media.mimeType.startsWith('video/')
    || !Number.isSafeInteger(episode.media.bytes) || episode.media.bytes <= 0
    || !/^[a-f0-9]{64}$/.test(episode.media.sha256 || '')) {
    throw new Error('Complete episode metadata and an immutable video revision are required.');
  }
  if (payload.action === 'episode_release') {
    const { release } = payload;
    if (!['scheduled', 'manual'].includes(release?.kind) || !Number.isFinite(Date.parse(release.releaseAt))) {
      throw new Error('Episode release requires a release time.');
    }
    if (release.kind === 'scheduled' && Date.parse(release.releaseAt) > now + CLOCK_TOLERANCE_MS) {
      throw new Error('This episode cannot be released before its scheduled time.');
    }
  }
  return payload;
}

function episodeData({ project, episode, submission, authorization }) {
  return {
    contentType: 'EPISODE', title: episode.title, episodeTitle: episode.title, description: episode.synopsis,
    seriesId: project.id, seriesTitle: project.title, seasonId: episode.seasonId, seasonTitle: episode.seasonTitle,
    seasonNumber: episode.seasonNumber, episodeId: episode.id, episodeNumber: episode.number,
    category: project.genre || 'Independent', genre: project.genre || 'Independent',
    views: 0, createdBy: 'creator-agent',
    creatorProjectId: project.id, creatorSubmissionId: submission.id, creatorSubmissionRevision: submission.revision,
    creatorEpisodeId: episode.id, creatorMediaId: episode.media.assetId, creatorMediaSha256: episode.media.sha256,
    creatorContractReference: project.contract.reference, creatorContractSignedAt: project.contract.signedAt,
    creatorEpisodeAuthorization: authorization,
    ...(project.contract.rokuCleared === true ? { rokuCleared: true } : {}),
    copyrightStatus: 'creator-owned', rightsHolder: project.ownership.copyrightHolderName,
    commercialUseStatus: 'verified-contract',
  };
}

// Pure state transition shared by the Firestore transaction and test stores.
function claimEpisode(existing, data, now, token) {
  const rebinding = existing && BINDING.some((key) => existing[key] !== data[key]);
  if (rebinding && existing.firstReleasedAt) {
    throw new Error('This episode was already released from a different approved revision. Unpublish and review it before replacing its video.');
  }
  if (!rebinding && (['preparing', 'held', 'ready'].includes(existing?.status)
    || (existing?.status === 'ingesting' && existing.ingestionLeaseUntil > now))) {
    return { video: existing, claimed: false };
  }
  return {
    claimed: true,
    video: {
      thumbnailUrl: '', duration: 0, ...existing, ...data, id: `creator_episode_${data.creatorEpisodeId}`,
      approvalStatus: 'draft', releaseStatus: 'held', muxPlaybackId: null, muxAssetId: null,
      status: 'ingesting', integrationError: '', ingestionAttempt: (existing?.ingestionAttempt || 0) + 1,
      ingestionToken: token, ingestionLeaseUntil: now + 60_000,
    },
  };
}

function episodeUpdateMatches(video, expected) {
  return Boolean(video?.creatorEpisodeAuthorization && video.contentType === 'EPISODE'
    && video.status === expected.status && video.ingestionToken === expected.ingestionToken);
}

function isReleased(video) {
  return video.status === 'ready' && video.approvalStatus === 'approved' && video.releaseStatus === 'published'
    && Boolean(video.muxPlaybackId);
}

function publicationResult(video) {
  const released = isReleased(video);
  const failed = video.status === 'failed';
  const mediaReady = released || video.status === 'held';
  return {
    externalId: video.id,
    status: released ? 'published' : failed ? 'failed' : 'processing',
    releaseStatus: released ? 'published' : 'held',
    mediaReady,
    message: released ? 'PROtv confirms the episode is released and playable.'
      : failed ? (video.integrationError || 'PROtv could not process this episode.')
        : mediaReady ? 'The video is ready and private. It has no playback address until it is released.'
          : 'The video is being processed privately. It has no playback address.',
  };
}

class CreatorEpisodeService {
  constructor({ creatorAgentOrigin, dependencies }) {
    this.origin = creatorAgentOrigin;
    this.dependencies = dependencies;
  }

  async execute(payload) {
    const data = episodeData(payload);
    if (payload.action === 'episode_publishing') return this.prepare(payload, data);
    const video = await this.dependencies.getCreatorEpisode(data.creatorEpisodeId);
    if (!video) throw new Error('This episode has not been prepared in PROtv.');
    if (BINDING.some((key) => video[key] !== data[key])) throw new Error('This request does not match the prepared episode revision.');
    if (payload.action === 'episode_status') return publicationResult(await this.refresh(video));
    return payload.action === 'episode_release' ? this.release(payload, video) : this.unpublish(video);
  }

  async prepare(payload, data) {
    if (!this.origin) throw new Error('Creator Agent media origin is not configured.');
    const url = new URL(payload.episode.media.sourceUrl);
    const expectedPath = `/api/integrations/protv/series-media/${data.creatorProjectId}/${data.creatorSubmissionId}/${data.creatorEpisodeId}/${data.creatorMediaId}`;
    if (url.protocol !== 'https:' || url.origin !== new URL(this.origin).origin
      || url.pathname !== expectedPath || url.username || url.password) {
      throw new Error('Episode media source does not match the protected Creator Agent revision.');
    }
    const claim = await this.dependencies.claimCreatorEpisode(data.creatorEpisodeId, data, Date.now(), crypto.randomUUID());
    if (!claim.claimed) return publicationResult(await this.refresh(claim.video));
    const video = claim.video;
    try {
      const asset = await this.dependencies.createPrivateAssetFromUrl(url.toString(), { passthrough: `${video.id}:${video.ingestionAttempt}` });
      if (!asset?.id) throw new Error('Mux returned no episode asset ID.');
      const updates = { status: 'preparing', muxAssetId: asset.id, ingestionLeaseUntil: 0 };
      if (!await this.dependencies.updateCreatorEpisode(video.id, video, updates)) {
        throw new Error('The episode changed while it was being prepared. Its status will be checked again.');
      }
      await this.audit('episode_prepare', video, 'Started private processing. No playback address exists.');
      return publicationResult(await this.refresh({ ...video, ...updates }));
    } catch (error) {
      await this.dependencies.updateCreatorEpisode(video.id, video, {
        status: 'failed', ingestionLeaseUntil: 0,
        integrationError: error instanceof Error ? error.message : 'Episode ingestion failed.',
      });
      throw error;
    }
  }

  async refresh(video) {
    if (video.status === 'ingesting' && video.ingestionLeaseUntil <= Date.now()) {
      const updates = { status: 'failed', integrationError: 'Processing did not start. It will be tried again.' };
      await this.dependencies.updateCreatorEpisode(video.id, video, updates);
      return { ...video, ...updates };
    }
    if (video.status !== 'preparing' || !video.muxAssetId) return video;
    const asset = await this.dependencies.getAsset(video.muxAssetId);
    if (asset.status === 'errored') {
      const updates = { status: 'failed', integrationError: 'Mux could not process this video.' };
      await this.dependencies.updateCreatorEpisode(video.id, video, updates);
      return { ...video, ...updates };
    }
    if (asset.status !== 'ready') return video;
    const updates = { status: 'held', duration: Math.round(asset.duration || 0), mediaReadyAt: new Date().toISOString() };
    await this.dependencies.updateCreatorEpisode(video.id, video, updates);
    return { ...video, ...updates };
  }

  async release({ release }, stored) {
    if (isReleased(stored)) return publicationResult(stored);
    const video = await this.refresh(stored);
    if (video.status !== 'held') return publicationResult(video);
    const asset = await this.dependencies.getAsset(video.muxAssetId);
    // Reuses an ID left by an interrupted attempt, so a retry never creates a second one.
    const playbackId = this.dependencies.getPlaybackId(asset) || (await this.dependencies.addPublicPlaybackId(asset.id)).id;
    if (!playbackId) throw new Error('Mux did not create a playback ID.');
    const releasedAt = new Date().toISOString();
    const frame = `https://image.mux.com/${playbackId}/thumbnail.jpg?width=1280&time=${Math.round((asset.duration || 0) * 0.1)}`;
    const updates = {
      status: 'ready', approvalStatus: 'approved', releaseStatus: 'published', muxPlaybackId: playbackId,
      duration: Math.round(asset.duration || video.duration || 0), thumbnailUrl: frame, heroImageUrl: frame,
      releaseAt: release.releaseAt, releaseTimeZone: release.timeZone || null, releasedAt,
      firstReleasedAt: video.firstReleasedAt || releasedAt, firetvCleared: release.firetvCleared === true,
      approvedBy: video.creatorEpisodeAuthorization.actorId, approvedAt: releasedAt,
    };
    if (!await this.dependencies.updateCreatorEpisode(video.id, video, updates)) {
      const current = await this.dependencies.getCreatorEpisode(video.creatorEpisodeId);
      if (current && isReleased(current)) return publicationResult(current);
      throw new Error('The episode changed during release. It will be tried again.');
    }
    await this.audit('episode_release', video, `Released episode (${release.kind}).`);
    return publicationResult({ ...video, ...updates });
  }

  async unpublish(stored) {
    let video = stored;
    if (isReleased(video)) {
      const updates = { status: 'held', approvalStatus: 'draft', releaseStatus: 'held', muxPlaybackId: null, thumbnailUrl: '', heroImageUrl: '', unpublishedAt: new Date().toISOString() };
      if (!await this.dependencies.updateCreatorEpisode(video.id, video, updates)) throw new Error('The episode changed during unpublishing. Try again.');
      video = { ...video, ...updates };
    }
    // Runs on a retry too, so a playback ID left by an interrupted attempt is still removed.
    if (video.muxAssetId) {
      const asset = await this.dependencies.getAsset(video.muxAssetId);
      for (const item of asset.playback_ids || []) await this.dependencies.deletePlaybackId(asset.id, item.id);
    }
    await this.audit('episode_unpublish', video, 'Unpublished episode and removed its playback address.');
    return publicationResult(video);
  }

  async audit(action, video, message) {
    await this.dependencies.logAdminEvent({
      type: `creator-agent.${action}`, message, actorId: 'creator-agent',
      details: { projectId: video.creatorProjectId, externalId: video.id },
    });
  }
}

module.exports = { EPISODE_ACTIONS, CreatorEpisodeService, validateEpisodeRequest, claimEpisode, episodeUpdateMatches, isReleased };

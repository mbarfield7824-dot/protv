const {
  addVideo,
  getAllVideos,
  getVideoById,
  updateVideo,
  updateVideoApproval,
} = require('../firebase');
const {
  createAssetFromUrl,
  getAsset,
  getPlaybackId,
  waitForAssetReady,
} = require('../mux');
const { checkDuplicate } = require('../acquisition/duplicateDetector');

class WebCatalogService {
  constructor({ transcodeTimeoutMs, deferUntilWebhook = Boolean(process.env.VERCEL) }) {
    this.transcodeTimeoutMs = transcodeTimeoutMs;
    this.deferUntilWebhook = deferUntilWebhook;
  }

  async createDraft({ item, metadata, poster, previous, actorId, confirmedAt }) {
    if (previous?.catalogId) {
      try {
        return await getVideoById(previous.catalogId);
      } catch (error) {
        if (!error.message.includes('Video not found')) throw error;
      }
    }
    const allVideos = await getAllVideos();
    const existing = allVideos.find((video) => (
      video.publicDomainCandidateId === item.candidateId
      || (
        video.publicDomainSourceId === item.identifier
        && video.publicDomainSource === item.source
      )
    ));
    if (existing) return existing;
    const evidence = item.licenseEvidence || {};
    const duplicate = checkDuplicate({
      id: item.candidateId,
      title: metadata.title,
      year: metadata.year,
      source: item.source,
      externalId: item.identifier,
      sourceUrl: item.sourceUrl,
    }, allVideos);
    if (duplicate.status === 'already-in-catalog') {
      throw new Error(`Already in catalog: ${duplicate.reasons[0]}`);
    }
    if (duplicate.status === 'possible-duplicate' && !item.rightsReview?.duplicateOverride) {
      throw new Error(`Possible duplicate: ${duplicate.reasons[0]}`);
    }
    const classification = item.rightsReview?.classification || evidence.classification || 'needs-review';
    const videoId = await addVideo({
      title: metadata.title,
      year: metadata.year,
      description: metadata.description,
      runtime: metadata.runtime,
      duration: metadata.runtime,
      genre: metadata.categories[0],
      category: metadata.categories[0],
      categories: metadata.categories,
      tags: metadata.tags,
      creator: item.creator,
      thumbnailUrl: poster.posterUrl,
      posterUrl: poster.posterUrl,
      posterSource: poster.source,
      posterSourcePage: item.sourceUrl,
      contentType: item.contentKind === 'show' ? 'EPISODE' : 'MOVIE',
      videoUrl: '',
      publicDomainSource: item.source,
      publicDomainSourceId: item.identifier,
      publicDomainCandidateId: item.candidateId,
      publicDomainSourceUrl: item.sourceUrl,
      publicDomainLicenseEvidence: item.licenseEvidence.label,
      publicDomainLicenseUrl: item.licenseEvidence.url,
      publicDomainConfirmedBy: actorId,
      publicDomainConfirmedAt: confirmedAt,
      publicDomainRightsClassification: classification,
      publicDomainRightsBasis: item.rightsReview?.basis || evidence.basis || '',
      publicDomainRightsConcerns: evidence.concerns || [],
      publicDomainRightsReviewNote: item.rightsReview?.note || '',
      publicDomainEvidenceUrls: evidence.evidenceUrls || (evidence.url ? [evidence.url] : []),
      copyrightStatus: 'public-domain',
      licenseType: item.licenseEvidence.label,
      rightsHolder: 'Public Domain',
      commercialUseStatus: 'admin-confirmed',
      rightsVerificationNotes: item.rightsReview?.note
        ? `Administrator reviewed rights evidence: ${item.rightsReview.note}`
        : 'Administrator confirmed the source evidence before ingestion.',
      approvalStatus: 'draft',
      status: 'processing',
      views: 0,
      createdBy: actorId,
    });
    return getVideoById(videoId);
  }

  async ensureTranscoded(video, mediaUrl) {
    if (video.status === 'ready' && video.muxPlaybackId) return video;
    let assetId = video.status === 'errored' ? null : video.muxAssetId || null;
    if (!assetId) {
      const asset = await createAssetFromUrl(mediaUrl);
      assetId = asset.id;
      await updateVideo(video.id, {
        muxAssetId: assetId,
        muxPlaybackId: null,
        status: 'processing',
      });
    }
    if (this.deferUntilWebhook) {
      return getVideoById(video.id);
    }
    const asset = await waitForAssetReady({
      assetId,
      timeoutMs: this.transcodeTimeoutMs,
    });
    const playbackId = getPlaybackId(asset);
    if (!playbackId) throw new Error('Mux finished processing but did not provide a public playback ID.');
    await updateVideo(video.id, {
      muxAssetId: asset.id,
      muxPlaybackId: playbackId,
      duration: asset.duration ? Math.round(asset.duration) : video.duration,
      status: 'ready',
    });
    return getVideoById(video.id);
  }

  async refreshTranscode(catalogId) {
    const video = await getVideoById(catalogId);
    if (video.status === 'ready' || video.status === 'errored') return video;
    if (!video.muxAssetId) {
      throw new Error('The Mux asset reference is missing. Retry this title to create a new upload.');
    }
    const asset = await getAsset(video.muxAssetId);
    if (asset.status === 'errored') {
      await updateVideo(video.id, { status: 'errored' });
      return { ...video, status: 'errored' };
    }
    if (asset.status !== 'ready') return video;
    const playbackId = getPlaybackId(asset);
    if (!playbackId) throw new Error('Mux finished processing but did not provide a public playback ID.');
    const updates = {
      muxAssetId: asset.id,
      muxPlaybackId: playbackId,
      duration: asset.duration ? Math.round(asset.duration) : video.duration,
      status: 'ready',
    };
    await updateVideo(video.id, updates);
    return { ...video, ...updates };
  }

  async publish(video, actorId) {
    if (video.status !== 'ready' || !video.muxPlaybackId) {
      throw new Error('The movie cannot be published until Mux playback is ready.');
    }
    await updateVideoApproval(video.id, {
      approvalStatus: 'approved',
      approvalNotes: 'Published after Administrator confirmation of source evidence.',
      approvedBy: actorId,
    });
    return getVideoById(video.id);
  }
}

module.exports = { WebCatalogService };

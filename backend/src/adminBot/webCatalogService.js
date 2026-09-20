const {
  addVideo,
  getVideoById,
  updateVideo,
  updateVideoApproval,
} = require('../firebase');
const {
  createAssetFromUrl,
  getPlaybackId,
  waitForAssetReady,
} = require('../mux');

class WebCatalogService {
  constructor({ transcodeTimeoutMs }) {
    this.transcodeTimeoutMs = transcodeTimeoutMs;
  }

  async createDraft({ item, metadata, poster, previous, actorId, confirmedAt }) {
    if (previous?.catalogId) {
      try {
        return await getVideoById(previous.catalogId);
      } catch (error) {
        if (!error.message.includes('Video not found')) throw error;
      }
    }
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
      publicDomainSourceUrl: item.sourceUrl,
      publicDomainLicenseEvidence: item.licenseEvidence.label,
      publicDomainLicenseUrl: item.licenseEvidence.url,
      publicDomainConfirmedBy: actorId,
      publicDomainConfirmedAt: confirmedAt,
      copyrightStatus: 'public-domain',
      licenseType: item.licenseEvidence.label,
      rightsHolder: 'Public Domain',
      commercialUseStatus: 'admin-confirmed',
      rightsVerificationNotes: 'Administrator confirmed the source evidence before ingestion.',
      approvalStatus: 'draft',
      status: 'processing',
      views: 0,
      createdBy: actorId,
    });
    return getVideoById(videoId);
  }

  async ensureTranscoded(video, mediaUrl) {
    if (video.status === 'ready' && video.muxPlaybackId) return video;
    let assetId = video.muxAssetId || null;
    if (!assetId) {
      const asset = await createAssetFromUrl(mediaUrl);
      assetId = asset.id;
      await updateVideo(video.id, { muxAssetId: assetId, status: 'processing' });
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

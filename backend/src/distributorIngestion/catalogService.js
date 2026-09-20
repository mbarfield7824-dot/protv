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

class DistributorCatalogService {
  constructor({ transcodeTimeoutMs }) {
    this.transcodeTimeoutMs = transcodeTimeoutMs;
  }

  async createDraft({ item, distributor, poster, state, actorId }) {
    if (state?.catalogId) {
      try {
        return await getVideoById(state.catalogId);
      } catch (error) {
        if (!error.message.includes('Video not found')) throw error;
      }
    }
    const videoId = await addVideo({
      title: item.title,
      year: item.year,
      description: item.description,
      runtime: item.runtime,
      duration: item.runtime,
      genre: item.categories[0],
      category: item.categories[0],
      categories: item.categories,
      tags: item.tags,
      thumbnailUrl: poster.posterUrl,
      posterUrl: poster.posterUrl,
      posterSource: poster.source,
      contentType: 'MOVIE',
      videoUrl: '',
      distributorId: distributor.id,
      distributorName: distributor.name,
      distributorExternalId: item.externalId,
      rightsStartAt: item.rights.startAt,
      rightsEndAt: item.rights.endAt,
      rightsTerritories: item.rights.territories,
      rightsExclusive: item.rights.exclusive,
      copyrightStatus: 'licensed',
      licenseType: item.rights.licenseType,
      rightsHolder: item.rights.holder,
      commercialUseStatus: 'distributor-confirmed',
      rightsVerificationNotes: item.rights.notes,
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
      approvalNotes: 'Published by the Distributor Ingestion Adapter after rights and playback validation.',
      approvedBy: actorId,
    });
    return getVideoById(video.id);
  }

  async unpublish(catalogId, actorId, reason) {
    await updateVideoApproval(catalogId, {
      approvalStatus: 'rejected',
      approvalNotes: `Removed by the Distributor Ingestion Adapter: ${reason}`,
      approvedBy: actorId,
    });
    return getVideoById(catalogId);
  }
}

module.exports = { DistributorCatalogService };

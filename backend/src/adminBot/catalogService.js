const {
  addVideo,
  getVideoById,
  updateVideo,
  updateVideoApproval,
} = require('../firebase');
const {
  getPlaybackId,
  uploadLocalFile,
  waitForAssetReady,
} = require('../mux');

class CatalogService {
  constructor({ frontendUrl, transcodeTimeoutMs }) {
    this.frontendUrl = frontendUrl;
    this.transcodeTimeoutMs = transcodeTimeoutMs;
  }

  async createDraft({ item, metadata, poster, actorId }) {
    if (item.previous?.catalogId) {
      try {
        return await getVideoById(item.previous.catalogId);
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
      thumbnailUrl: poster.posterUrl,
      posterUrl: poster.posterUrl,
      posterSource: poster.source,
      posterSourcePage: poster.sourcePage,
      contentType: 'MOVIE',
      videoUrl: '',
      adminSourceFilePath: item.filePath,
      publicDomainFileHash: item.hash,
      copyrightStatus: 'public-domain',
      licenseType: 'Public Domain',
      rightsHolder: 'Public Domain',
      commercialUseStatus: 'verified-public-domain',
      rightsVerificationNotes: 'Ingested from the Administrator-configured Public Domain content directory.',
      approvalStatus: 'draft',
      status: 'processing',
      views: 0,
      createdBy: actorId,
    });
    return getVideoById(videoId);
  }

  async ensureTranscoded(video, filePath) {
    if (video.status === 'ready' && video.muxPlaybackId) return video;
    let uploadId = video.muxUploadId || null;
    let assetId = video.muxAssetId || null;
    if (!uploadId && !assetId) {
      const upload = await uploadLocalFile(filePath, this.frontendUrl);
      uploadId = upload.id;
      await updateVideo(video.id, { muxUploadId: uploadId, status: 'processing' });
    }
    const asset = await waitForAssetReady({
      uploadId,
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
      throw new Error('The movie cannot be published until transcoding is complete.');
    }
    await updateVideoApproval(video.id, {
      approvalStatus: 'approved',
      approvalNotes: 'Published by the Public Domain Admin Bot after successful validation and transcoding.',
      approvedBy: actorId,
    });
    return getVideoById(video.id);
  }
}

module.exports = { CatalogService };

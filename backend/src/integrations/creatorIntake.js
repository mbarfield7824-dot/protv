// Creator Portal media intake: full movies and series episodes go from the creator's browser straight to Mux.
// Mux credentials stay here; the Creator Portal authorizes each request (ownership, agreement locks, review state,
// quotas) and calls these actions over the signed creator-actions channel. Intake assets are created with no playback
// ID at all, and every action re-checks that the Mux object belongs to the exact project, slot and upload session.
const INTAKE_ACTIONS = new Set(['intake_upload_create', 'intake_upload_status', 'intake_upload_cancel', 'intake_review_playback', 'intake_asset_delete']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT = /^(movie|episode:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MUX_ID = /^[A-Za-z0-9]{1,255}$/;

const intakePassthrough = ({ projectId, slot, sessionId }) => `intake:${projectId}:${slot}:${sessionId}`;

function validateIntakeRequest(payload) {
  const intake = payload.intake;
  if (!intake || typeof intake !== 'object' || Array.isArray(intake)
    || !UUID.test(String(intake.projectId || '')) || !UUID.test(String(intake.sessionId || ''))
    || !SLOT.test(String(intake.slot || ''))) {
    throw new Error('A valid intake project, slot and upload session are required.');
  }
  if (payload.requestId !== `intake:${intake.sessionId}:${payload.action}`) {
    throw new Error('requestId must identify the intake upload session and action.');
  }
  if (payload.action !== 'intake_upload_create' && !MUX_ID.test(String(intake.uploadId || ''))) {
    throw new Error('A Mux upload ID is required.');
  }
  if (['intake_review_playback', 'intake_asset_delete'].includes(payload.action) && !MUX_ID.test(String(intake.assetId || ''))) {
    throw new Error('A Mux asset ID is required.');
  }
  return payload;
}

function videoTrack(asset) {
  return (asset.tracks || []).find((track) => track.type === 'video') || null;
}

function assetSummary(asset) {
  const video = videoTrack(asset);
  return {
    assetId: asset.id,
    assetStatus: asset.status,
    durationSeconds: Number.isFinite(asset.duration) ? asset.duration : null,
    resolutionTier: asset.resolution_tier || null,
    maxWidth: video?.max_width || null,
    maxHeight: video?.max_height || null,
    frameRate: video?.max_frame_rate || null,
    aspectRatio: asset.aspect_ratio || null,
    hasAudio: (asset.tracks || []).some((track) => track.type === 'audio'),
    test: asset.test === true,
    errors: asset.status === 'errored' ? (asset.errors?.messages || []).slice(0, 5).map(String) : [],
    playbackPolicies: (asset.playback_ids || []).map((item) => item.policy),
  };
}

class CreatorIntakeService {
  constructor({ creatorAgentOrigin, dependencies }) {
    this.origin = creatorAgentOrigin;
    this.dependencies = dependencies;
  }

  async execute(payload) {
    const { intake } = payload;
    const passthrough = intakePassthrough(intake);
    if (payload.action === 'intake_upload_create') return this.create(intake, passthrough);
    const upload = await this.dependencies.getUpload(intake.uploadId);
    if (upload?.new_asset_settings?.passthrough !== passthrough) {
      throw new Error('This Mux upload does not belong to the requested intake session.');
    }
    if (payload.action === 'intake_upload_status') return this.status(upload, passthrough);
    if (payload.action === 'intake_upload_cancel') {
      if (upload.status === 'waiting') await this.dependencies.cancelUpload(upload.id);
      return { uploadId: upload.id, uploadStatus: upload.status === 'waiting' ? 'cancelled' : upload.status, assetId: upload.asset_id || null };
    }
    if (upload.asset_id !== intake.assetId) throw new Error('This Mux asset does not belong to the requested intake session.');
    const asset = await this.dependencies.getAsset(intake.assetId);
    if (asset?.passthrough !== passthrough) throw new Error('This Mux asset does not belong to the requested intake session.');
    if (payload.action === 'intake_review_playback') return this.reviewPlayback(asset);
    return this.deleteIntakeAsset(asset);
  }

  async create(intake, passthrough) {
    if (!this.origin) throw new Error('Creator Agent media origin is not configured.');
    const upload = await this.dependencies.createIntakeUpload(new URL(this.origin).origin, {
      passthrough, timeoutSeconds: intake.timeoutSeconds, test: intake.test === true,
    });
    if (!upload?.id || typeof upload.url !== 'string' || !upload.url.startsWith('https://')) {
      throw new Error('Mux did not return an upload address.');
    }
    return { uploadId: upload.id, url: upload.url, timeoutSeconds: upload.timeout || null, uploadStatus: upload.status };
  }

  async status(upload, passthrough) {
    const result = { uploadId: upload.id, uploadStatus: upload.status, assetId: upload.asset_id || null,
      uploadError: upload.error?.message ? String(upload.error.message).slice(0, 300) : '' };
    if (!upload.asset_id) return result;
    const asset = await this.dependencies.getAsset(upload.asset_id);
    if (asset?.passthrough !== passthrough) throw new Error('This Mux asset does not belong to the requested intake session.');
    return { ...result, ...assetSummary(asset) };
  }

  // Admin review only: a signed playback ID (never public) and a token that expires.
  async reviewPlayback(asset) {
    if (asset.status !== 'ready') throw new Error('Mux is still processing this video.');
    const existing = (asset.playback_ids || []).find((item) => item.policy === 'signed')?.id;
    const playbackId = existing || (await this.dependencies.addSignedPlaybackId(asset.id))?.id;
    if (!playbackId) throw new Error('Mux did not create a review playback ID.');
    const token = await this.dependencies.signPlayback(playbackId, asset.duration);
    return { playbackId, token, durationSeconds: asset.duration || null };
  }

  async deleteIntakeAsset(asset) {
    const linked = await this.dependencies.getVideoByAssetId(asset.id);
    if (linked) throw new Error('This video is linked to a PROtv catalog title and cannot be deleted from intake.');
    if ((asset.playback_ids || []).some((item) => item.policy === 'public')) {
      throw new Error('This video has a public playback address and cannot be deleted from intake.');
    }
    await this.dependencies.deleteAsset(asset.id);
    await this.dependencies.logAdminEvent({
      type: 'creator-agent.intake_asset_delete', message: 'Deleted an unreleased Creator Portal intake video.',
      actorId: 'creator-agent', details: { assetId: asset.id, passthrough: asset.passthrough },
    });
    return { assetId: asset.id, deleted: true };
  }
}

// Release-time check that a Creator Portal Mux asset is the exact intake asset for this project and slot.
async function verifyIntakeAsset(dependencies, { assetId, projectId, slot, sessionId }) {
  if (!MUX_ID.test(String(assetId || '')) || !UUID.test(String(sessionId || ''))) {
    throw new Error('A valid Mux intake asset and upload session are required.');
  }
  const asset = await dependencies.getAsset(assetId);
  if (asset?.passthrough !== intakePassthrough({ projectId, slot, sessionId })) {
    throw new Error('The Mux intake asset does not match this creator project.');
  }
  if (asset.status === 'errored') throw new Error('Mux could not process this video.');
  if (asset.test === true && process.env.MUX_INTAKE_ALLOW_TEST_RELEASE !== '1') {
    throw new Error('A Mux test-mode video cannot be released.');
  }
  return asset;
}

module.exports = { INTAKE_ACTIONS, CreatorIntakeService, validateIntakeRequest, verifyIntakeAsset, intakePassthrough, assetSummary };

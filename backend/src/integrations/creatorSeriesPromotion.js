const crypto = require('crypto');
const { validatePromotional, posterSource } = require('./creatorPromotional');
const { seriesKey } = require('../catalog/readModel');

// Owner-published Coming Soon listings for existing Creator Portal projects. A series becomes a public SERIES
// record (Coming Soon until its first episode is released); a film becomes a MOVIE record with no media at all.
// Title, poster and synopsis come from the project. The trailer is fetched once into a signed-playback Mux asset and
// reused on every later sync; a public token is only issued while the listing is published. This is separate from
// final release: records are linked by comingSoonProjectId (never creatorProjectId, which the release flow uses),
// episodes and full media are never touched, and no TV platform flag is set.
const SERIES_PROMOTION_ACTIONS = new Set(['series_promotion', 'series_promotion_status', 'series_promotion_withdraw']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const WEEKDAYS = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const INGEST_LEASE_MS = 120_000;

function text(value, label, max, { required = true } = {}) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`${label} is required and must be no more than ${max} characters.`);
  }
  return value.trim();
}

function validateSeriesPromotionRequest(payload) {
  const { project, approval, trailer, schedule } = payload;
  if (!SERIES_PROMOTION_ACTIONS.has(payload.action) || !UUID.test(String(project?.id || ''))
    || payload.requestId !== `${payload.action}:${project.id}` || !['Series', 'Film'].includes(project.contentType)) {
    throw new Error('A Coming Soon request must identify one Creator Portal series or film.');
  }
  // Taking a listing down must always work.
  if (payload.action === 'series_promotion_withdraw') return payload;
  // The Owner/Administrator's explicit confirmation that promotional rights permit the listing is the gate.
  if (approval?.promotionalRightsConfirmed !== true) {
    throw new Error("Confirmation that the project's promotional rights permit this Coming Soon listing is required.");
  }
  if (!UUID.test(String(approval?.actorId || '')) || approval.role !== 'admin' || !Number.isFinite(Date.parse(approval.approvedAt))
    || !UUID.test(String(trailer?.assetId || '')) || approval.trailerAssetId !== trailer.assetId) {
    throw new Error('Explicit Administrator approval of this exact trailer is required.');
  }
  text(approval.rightsConfirmation, 'Promotional rights evidence', 2000);
  text(project.title, 'Title', 300);
  text(project.synopsis, 'Synopsis', 5000, { required: false });
  text(project.genre, 'Genre', 100, { required: false });
  text(project.rightsHolder, 'Rights holder', 300);
  if (!VIDEO_TYPES.has(trailer.mimeType) || !Number.isSafeInteger(trailer.bytes) || trailer.bytes <= 0) {
    throw new Error('The trailer must be an MP4, QuickTime or WebM video.');
  }
  if (payload.poster) validatePromotional({ poster: payload.poster });
  if (!schedule || typeof schedule !== 'object'
    || (schedule.premiereAt !== null && !Number.isFinite(Date.parse(schedule.premiereAt)))
    || (schedule.weekday !== null && !WEEKDAYS.has(schedule.weekday))
    || (schedule.localTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(schedule.localTime)))
    || schedule.timeZone !== 'America/New_York') {
    throw new Error('The premiere schedule is invalid.');
  }
  return payload;
}

// The trailer link must point at this project's exact approved asset on the Creator Portal and carry its signature.
function trailerSource(projectId, trailer, origin, secret, now = Date.now()) {
  if (!origin || !secret) throw new Error('Creator Agent media origin and publishing secret must be configured.');
  let url;
  let allowed;
  try { url = new URL(trailer.sourceUrl); allowed = new URL(origin); } catch {
    throw new Error('Invalid Creator Agent trailer URL.');
  }
  if (allowed.protocol !== 'https:' || url.protocol !== 'https:' || url.origin !== allowed.origin
    || url.username || url.password || url.hash
    || url.pathname !== `/api/integrations/protv/promotional-video/${projectId}/${trailer.assetId}`
    || [...url.searchParams.keys()].some((key) => !['expires', 'signature'].includes(key))
    || url.searchParams.getAll('expires').length !== 1 || url.searchParams.getAll('signature').length !== 1) {
    throw new Error('Trailer URL must match the protected Creator Agent project and asset.');
  }
  const expires = url.searchParams.get('expires');
  const signature = url.searchParams.get('signature') || '';
  if (!/^\d{13}$/.test(expires || '') || Number(expires) <= now) throw new Error('Trailer URL has expired.');
  const expected = crypto.createHmac('sha256', secret).update(`${projectId}:${trailer.assetId}:trailer:${expires}`).digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(signature)
    || !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('Trailer URL signature is invalid.');
  }
  return url.toString();
}

function seriesRecord(payload, now) {
  const { project, approval, schedule } = payload;
  const title = project.title.trim();
  const genre = (project.genre || '').trim() || 'Independent';
  return {
    contentType: project.contentType === 'Series' ? 'SERIES' : 'MOVIE', title,
    ...(project.contentType === 'Series' ? { seriesTitle: title } : {}),
    description: (project.synopsis || '').trim(), category: genre, genre,
    comingSoonProjectId: project.id,
    comingSoonApproval: { actorId: approval.actorId, approvedAt: approval.approvedAt, trailerAssetId: approval.trailerAssetId },
    rightsHolder: project.rightsHolder.trim(), rightsVerificationNotes: approval.rightsConfirmation.trim(),
    // A promotional listing only: no full media, no release status, no platform flags.
    // Only a premiere the Owner/Administrator entered or confirmed in the Creator Portal. Null means "to be announced".
    premiereAt: schedule.premiereAt, airingWeekday: schedule.weekday, airingTime: schedule.localTime, airingTimeZone: schedule.timeZone,
    status: 'ready', approvalStatus: 'approved', visibility: 'public',
    approvedBy: 'creator-agent', approvedAt: new Date(now).toISOString(), withdrawnAt: null,
  };
}

// Pure decision for the claim transaction. A trailer is ingested only when this record has no copy of the approved
// asset yet (or the previous attempt failed); otherwise the existing Mux asset is reused.
function planSeriesClaim(existing, data, trailerAssetId, now, token) {
  // Checked again inside the transaction: only a listing already linked to this exact project may be updated.
  if (existing && (existing.contentType !== data.contentType || existing.comingSoonProjectId !== data.comingSoonProjectId)) {
    throw new Error("This record is not this project's Coming Soon listing and was not changed.");
  }
  if (existing?.trailerUploadId) throw new Error('An Administrator trailer upload is in progress on this show record. Try again when it finishes.');
  const needsTrailer = existing?.creatorTrailerAssetId !== trailerAssetId
    || !existing?.trailerAssetId || existing.trailerStatus === 'errored';
  if (needsTrailer && existing?.trailerIngestToken && existing.trailerIngestLeaseUntil > now) {
    return { video: existing, claimed: false, busy: true };
  }
  const replacing = needsTrailer && existing?.trailerAssetId && existing.creatorTrailerAssetId !== trailerAssetId;
  const video = {
    ...(existing || {}), ...data,
    ...(needsTrailer ? {
      trailerIngestToken: token, trailerIngestLeaseUntil: now + INGEST_LEASE_MS, trailerError: '',
      // A replaced trailer stops being playable at once; the new one appears when Mux finishes.
      ...(replacing ? { trailerStatus: 'processing', trailerPlaybackId: null, trailerRetiredAssetId: existing.trailerAssetId } : {}),
    } : {}),
  };
  return { video, claimed: needsTrailer, busy: false };
}

function trailerReady(video) {
  return video.trailerStatus === 'ready' && Boolean(video.trailerPlaybackId);
}

function promotionResult(video, note = '') {
  const withdrawn = video.approvalStatus !== 'approved';
  const ready = trailerReady(video);
  const failed = video.trailerStatus === 'errored';
  return {
    externalId: video.id,
    status: withdrawn ? 'withdrawn' : ready ? 'published' : failed ? 'failed' : 'processing',
    trailerReady: !withdrawn && ready,
    message: [withdrawn ? 'The Coming Soon listing is not public.'
      : ready ? 'The Coming Soon page is public with Watch Trailer.'
        : failed ? `The Coming Soon listing is public; the trailer failed to process: ${video.trailerError || 'Mux could not process it.'}`
          : 'The Coming Soon listing is public. The trailer is processing privately and Watch Trailer appears when it is ready.', note]
      .filter(Boolean).join(' '),
  };
}

class CreatorSeriesPromotionService {
  constructor({ creatorAgentOrigin, publishingSecret, dependencies }) {
    this.origin = creatorAgentOrigin;
    this.secret = publishingSecret;
    this.dependencies = dependencies;
  }

  async execute(payload) {
    if (payload.action === 'series_promotion_withdraw') return this.withdraw(payload);
    const target = await this.resolve(payload.project);
    if (payload.action === 'series_promotion_status') {
      if (!target.existing) throw new Error('This project has no Coming Soon listing on PROtv.');
      return promotionResult(await this.refresh(target.existing));
    }
    return this.promote(payload, target);
  }

  // One listing per project, found only by its stable link: coming_soon_<projectId> carrying comingSoonProjectId.
  // A title match never claims a record. For a series, any other show or episode using the same title (manual, legacy
  // or another creator's) would merge into its page, so the request is refused and nothing is written. The project's
  // own released episodes (creatorProjectId) belong on the page and are allowed.
  async resolve(project) {
    const id = `coming_soon_${project.id}`;
    const records = await this.dependencies.getAllVideos();
    const linked = records.filter((record) => record.comingSoonProjectId === project.id);
    if (linked.length > 1 || linked.some((record) => record.id !== id)) {
      throw new Error("More than one PROtv record claims this project's Coming Soon listing. An Administrator must resolve it first.");
    }
    const occupant = records.find((record) => record.id === id);
    if (occupant && occupant.comingSoonProjectId !== project.id) {
      throw new Error('The PROtv record reserved for this listing belongs to something else. An Administrator must resolve it first.');
    }
    if (project.contentType === 'Series') {
      const key = seriesKey(project.title);
      const conflict = records.some((record) => record.id !== id && ['SERIES', 'EPISODE'].includes(record.contentType)
        && seriesKey(record.seriesTitle || (record.contentType === 'SERIES' ? record.title : '')) === key
        && record.creatorProjectId !== project.id);
      if (conflict) {
        throw new Error('Another PROtv show or episode already uses this title without a link to this project. It was not claimed; an Administrator must resolve the title first.');
      }
    }
    return { id, existing: linked[0] || null };
  }

  async promote(payload, target) {
    const { project } = payload;
    const sourceUrl = trailerSource(project.id, payload.trailer, this.origin, this.secret);
    if (payload.poster) posterSource(project.id, payload.poster, this.origin, this.secret);
    const now = Date.now();
    const token = crypto.randomUUID();
    const data = seriesRecord(payload, now);
    const claim = await this.dependencies.transactSeries(target.id, (existing) => {
      const plan = planSeriesClaim(existing, data, payload.trailer.assetId, now, token);
      return { write: plan.busy ? null : { ...plan.video, creatorTrailerPending: plan.claimed ? payload.trailer.assetId : null }, result: plan };
    });
    let video = { ...claim.video, id: target.id };
    const notes = [];
    if (claim.busy) notes.push('The trailer is already being sent to Mux.');
    if (!target.existing) await this.audit('series_promotion_create', project.id, target.id, 'Created the Coming Soon listing for an existing Creator Portal project.');
    if (claim.claimed) video = await this.ingestTrailer(video, sourceUrl, payload.trailer.assetId, token);
    if (payload.poster && video.creatorPosterAssetId !== payload.poster.assetId) {
      video = await this.transferPoster(video, project.id, payload.poster, notes);
    }
    await this.audit('series_promotion', project.id, target.id, 'Approved Creator Portal trailer and show details synced.');
    return promotionResult(await this.refresh(video), notes.join(' '));
  }

  async ingestTrailer(video, sourceUrl, creatorTrailerAssetId, token) {
    let asset;
    try {
      asset = await this.dependencies.createAssetFromUrl(sourceUrl, { playbackPolicy: 'signed' });
      if (!asset?.id) throw new Error('Mux returned no trailer asset ID.');
    } catch (error) {
      await this.update(video.id, (current) => current.trailerIngestToken === token, {
        trailerStatus: 'errored', trailerError: error instanceof Error ? error.message : 'Mux could not start the trailer.',
        trailerIngestToken: null, trailerIngestLeaseUntil: 0, creatorTrailerPending: null,
      });
      throw error;
    }
    const updates = {
      trailerAssetId: asset.id, creatorTrailerAssetId, trailerStatus: 'processing', trailerPlaybackId: null, trailerDuration: null,
      trailerUploadStatus: null, trailerError: '', trailerIngestToken: null, trailerIngestLeaseUntil: 0, creatorTrailerPending: null,
    };
    if (!await this.update(video.id, (current) => current.trailerIngestToken === token, updates)) {
      // Another sync took over; this asset is not referenced anywhere, so remove it rather than leave a duplicate.
      await this.dependencies.deleteAsset(asset.id).catch(() => {});
      throw new Error('The show record changed while the trailer was being sent. Check status again.');
    }
    const retired = video.trailerRetiredAssetId;
    if (retired && retired !== asset.id) {
      await this.dependencies.deleteAsset(retired).catch((error) => this.dependencies.logError?.('Replaced series trailer asset could not be deleted.', error));
      await this.update(video.id, () => true, { trailerRetiredAssetId: null });
    }
    return { ...video, ...updates, trailerRetiredAssetId: null };
  }

  async transferPoster(video, projectId, poster, notes) {
    try {
      const posterUrl = await this.dependencies.transferPoster(projectId, poster, { origin: this.origin, secret: this.secret });
      if (typeof posterUrl !== 'string' || !posterUrl || posterUrl.includes('/api/integrations/protv/')) throw new Error('No durable poster URL.');
      const updates = { posterUrl, thumbnailUrl: posterUrl, creatorPosterAssetId: poster.assetId };
      await this.update(video.id, (current) => current.comingSoonProjectId === projectId, updates);
      return { ...video, ...updates };
    } catch {
      notes.push('The artwork could not be copied this time; the page shows the title until the next sync.');
      return video;
    }
  }

  async refresh(video) {
    if (video.trailerIngestToken && !(video.trailerIngestLeaseUntil > Date.now()) && video.creatorTrailerPending) {
      const updates = { trailerStatus: 'errored', trailerError: 'Sending the trailer to Mux did not finish. Sync again to retry.', trailerIngestToken: null, creatorTrailerPending: null };
      await this.update(video.id, (current) => current.trailerIngestToken === video.trailerIngestToken, updates);
      return { ...video, ...updates };
    }
    if (video.trailerStatus !== 'processing' || !video.trailerAssetId || !video.creatorTrailerAssetId) return video;
    const asset = await this.dependencies.getAsset(video.trailerAssetId);
    if (asset.status === 'errored') {
      const updates = { trailerStatus: 'errored', trailerError: 'Mux could not process the trailer.' };
      await this.update(video.id, (current) => current.trailerAssetId === asset.id, updates);
      return { ...video, ...updates };
    }
    if (asset.status !== 'ready') return video;
    const playbackId = this.dependencies.getPlaybackId(asset, 'signed');
    if (!playbackId) throw new Error('Mux trailer asset is ready without signed playback.');
    const updates = { trailerStatus: 'ready', trailerPlaybackId: playbackId, trailerDuration: Math.round(asset.duration || 0), trailerError: '' };
    await this.update(video.id, (current) => current.trailerAssetId === asset.id, updates);
    return { ...video, ...updates };
  }

  async withdraw({ project }) {
    const linked = (await this.dependencies.getAllVideos())
      .find((record) => record.id === `coming_soon_${project.id}` && record.comingSoonProjectId === project.id);
    if (!linked) return { externalId: `coming_soon_${project.id}`, status: 'withdrawn', trailerReady: false, message: 'Nothing was public on PROtv.' };
    // Hidden, not deleted: the Mux asset is kept so a later approval does not process the trailer again.
    const updates = { approvalStatus: 'draft', withdrawnAt: new Date().toISOString() };
    await this.update(linked.id, (current) => current.comingSoonProjectId === project.id, updates);
    await this.audit('series_promotion_withdraw', project.id, linked.id, 'Unpublished the Coming Soon listing and trailer from public view.');
    return promotionResult({ ...linked, ...updates });
  }

  update(id, matches, updates) {
    return this.dependencies.transactSeries(id, (current) => (current && matches(current)
      ? { write: { ...current, ...updates }, result: true } : { write: null, result: false }));
  }

  async audit(action, projectId, externalId, message) {
    await this.dependencies.logAdminEvent({ type: `creator-agent.${action}`, message, actorId: 'creator-agent', details: { projectId, externalId } });
  }
}

module.exports = {
  SERIES_PROMOTION_ACTIONS, CreatorSeriesPromotionService, validateSeriesPromotionRequest, trailerSource, planSeriesClaim, promotionResult,
};

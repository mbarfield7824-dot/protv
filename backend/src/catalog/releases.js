const SERIES_RELEASE = 'SERIES_RELEASE';

function seriesReleaseId(seriesId) {
  return `series_release_${seriesId}`;
}

function releaseAllowed(record, now = Date.now()) {
  if (record?.releaseStatus === undefined) return true;
  if (record.releaseStatus === 'published') return true;
  return record.releaseStatus === 'scheduled'
    && typeof record.releaseAt === 'string'
    && Number.isFinite(Date.parse(record.releaseAt))
    && Date.parse(record.releaseAt) <= now;
}

function releaseEligible(video, context = [], now = Date.now()) {
  if (!video || video.contentType === SERIES_RELEASE || !releaseAllowed(video, now)) return false;
  const parent = video.seriesId
    ? context.find((item) => item.id === seriesReleaseId(video.seriesId))
    : null;
  return !parent || releaseAllowed(parent, now);
}

function releaseUpdate(input, actorId, now = Date.now()) {
  if (!input || !['held', 'published', 'scheduled'].includes(input.releaseStatus)) {
    throw new Error('Release status must be held, published, or scheduled.');
  }
  let releaseAt = null;
  let releaseTimeZone = null;
  if (input.releaseStatus === 'scheduled') {
    if (typeof input.releaseAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.releaseAt)
      || !Number.isFinite(Date.parse(input.releaseAt)) || Date.parse(input.releaseAt) <= now) {
      throw new Error('A future release date with an explicit UTC offset is required.');
    }
    const calendar = input.releaseAt.slice(0, 19);
    if (new Date(`${calendar}Z`).toISOString().slice(0, 19) !== calendar) {
      throw new Error('The release date is invalid.');
    }
    if (typeof input.releaseTimeZone !== 'string' || !input.releaseTimeZone) {
      throw new Error('A release time zone is required.');
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: input.releaseTimeZone });
    } catch {
      throw new Error('The release time zone is invalid.');
    }
    releaseAt = new Date(input.releaseAt).toISOString();
    releaseTimeZone = input.releaseTimeZone;
  }
  return {
    releaseStatus: input.releaseStatus, releaseAt, releaseTimeZone,
    releaseUpdatedBy: actorId, releaseUpdatedAt: new Date(now).toISOString(),
  };
}

function publicationResult(video, context = []) {
  const ready = video.status === 'ready' && Boolean(video.muxPlaybackId);
  const failed = ['failed', 'ingestion_failed', 'errored', 'poster_transfer_failed'].includes(video.status);
  const released = ready && video.approvalStatus === 'approved' && releaseEligible(video, context);
  const parent = context.find((item) => item.id === seriesReleaseId(video.seriesId));
  const blocker = !releaseAllowed(video) ? video : parent && !releaseAllowed(parent) ? parent : null;
  const releaseStatus = !blocker ? 'published' : blocker.releaseStatus === 'scheduled' ? 'scheduled' : 'held';
  return {
    externalId: video.id,
    // Keep the existing Creator Agent protocol: processing means publication is not confirmed.
    status: released ? 'published' : failed ? 'failed' : 'processing',
    releaseStatus,
    message: failed ? `PROtv ingestion failed (${video.status}). Resolve the integration error before retrying.`
      : !ready ? 'PROtv is processing the approved media. Processing does not authorize release.'
        : released ? 'PROtv confirms approved, playback-ready publication.'
          : releaseStatus === 'scheduled' ? `Media is ready. Release is scheduled for ${blocker.releaseAt}; both the title and series gate must allow release.`
            : 'Media is ready and held privately. A PROtv administrator must release the title and open its series gate.',
  };
}

module.exports = { SERIES_RELEASE, seriesReleaseId, releaseAllowed, releaseEligible, releaseUpdate, publicationResult };

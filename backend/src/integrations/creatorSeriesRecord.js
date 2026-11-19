const { posterSource, validatePromotional } = require('./creatorPromotional');
const { seriesKey } = require('../catalog/readModel');

// The public show (SERIES) record for a Creator Portal series, created or updated when the Administrator releases one
// of its episodes. It carries the official show description and poster the Administrator set in the Creator Portal;
// no trailer or Coming Soon listing is needed. Before the first release nothing is written, so nothing is public.
//
// One record per series: an existing Coming Soon listing for the same project (coming_soon_<projectId>) is reused;
// otherwise the record is creator_series_<projectId>, linked by creatorSeriesProjectId. A show or episode with the
// same title that belongs to anything else is never claimed: the show record is skipped and the episode release is
// unaffected. When the series' last released episode is unpublished, a creator_series_ record is hidden again.

function validateSeriesProfile(profile) {
  if (profile === undefined) return;
  if (!profile || typeof profile !== 'object' || typeof profile.description !== 'string'
    || profile.description.trim().length < 10 || profile.description.length > 5000) {
    throw new Error('The series description must be 10 to 5000 characters.');
  }
  if (profile.poster !== null && profile.poster !== undefined) validatePromotional({ poster: profile.poster });
}

function showTitleOf(record) {
  const value = record.contentType === 'SERIES' ? record.seriesTitle || record.title : record.seriesTitle;
  return typeof value === 'string' ? value : '';
}

function belongsTo(record, projectId) {
  return record.creatorProjectId === projectId || record.comingSoonProjectId === projectId || record.creatorSeriesProjectId === projectId;
}

function isReleasedEpisode(video) {
  return video.contentType === 'EPISODE' && video.status === 'ready' && video.approvalStatus === 'approved'
    && video.releaseStatus === 'published' && Boolean(video.muxPlaybackId);
}

// Pure: the record to write, or an error when the target is not this series' own show record.
function planSeriesRecord(existing, { id, project, profile, posterUrl, frame, firetvCleared, actorId, now }) {
  if (existing && existing.contentType !== 'SERIES') throw new Error('The reserved show record is not a show and was not changed.');
  if (existing && !belongsTo(existing, project.id)) throw new Error('The show record belongs to something else and was not changed.');
  const comingSoon = Boolean(existing?.comingSoonProjectId);
  const artwork = posterUrl || existing?.posterUrl || frame || '';
  const shared = {
    description: profile.description.trim(),
    creatorSeriesProjectId: project.id,
    ...(artwork ? { posterUrl: artwork, thumbnailUrl: posterUrl || existing?.thumbnailUrl || artwork } : {}),
    ...(project.contract.rokuCleared === true ? { rokuCleared: true } : {}),
    ...(firetvCleared || existing?.firetvCleared === true ? { firetvCleared: true } : {}),
    creatorSeriesSyncedAt: new Date(now).toISOString(),
  };
  // A Coming Soon listing keeps its own trailer, schedule and approval; only the official details are added.
  if (comingSoon) return { ...existing, ...shared };
  const title = project.title.trim();
  const genre = (project.genre || '').trim() || existing?.genre || 'Independent';
  return {
    views: 0, ...existing, ...shared,
    contentType: 'SERIES', title, seriesTitle: title, category: existing?.category || genre, genre,
    rightsHolder: project.ownership.copyrightHolderName, creatorContractReference: project.contract.reference,
    copyrightStatus: 'creator-owned', commercialUseStatus: 'verified-contract',
    status: 'ready', approvalStatus: 'approved', visibility: 'public', releaseStatus: 'published', hiddenAt: null,
    approvedBy: actorId, approvedAt: existing?.approvedAt || new Date(now).toISOString(), createdBy: 'creator-agent',
  };
}

class CreatorSeriesRecordService {
  constructor({ creatorAgentOrigin, publishingSecret, dependencies }) {
    this.origin = creatorAgentOrigin;
    this.secret = publishingSecret;
    this.dependencies = dependencies;
  }

  // Which record is this series' show record, or why none may be written.
  async target(project) {
    const records = await this.dependencies.getAllVideos();
    const comingSoon = records.find((record) => record.id === `coming_soon_${project.id}` && record.comingSoonProjectId === project.id
      && record.contentType === 'SERIES');
    const id = comingSoon ? comingSoon.id : `creator_series_${project.id}`;
    const claimed = records.filter((record) => record.contentType === 'SERIES' && record.creatorSeriesProjectId === project.id);
    if (claimed.some((record) => record.id !== id)) return { skip: 'More than one PROtv show record claims this series; an Administrator must resolve it first.' };
    const key = seriesKey(project.title);
    const conflict = records.some((record) => record.id !== id && ['SERIES', 'EPISODE'].includes(record.contentType)
      && seriesKey(showTitleOf(record)) === key && !belongsTo(record, project.id));
    if (conflict) return { skip: 'Another PROtv show or episode already uses this title; the show record was not created. An Administrator must resolve the title.' };
    return { id, records };
  }

  // Called after an episode is released. Never throws: the episode release stands, and the outcome is reported.
  async sync(payload, released) {
    const profile = payload.seriesProfile;
    if (!profile) return null;
    try {
      const target = await this.target(payload.project);
      if (target.skip) return target.skip;
      const existing = target.records.find((record) => record.id === target.id) || null;
      let posterUrl = null;
      let note = '';
      if (profile.poster && existing?.creatorSeriesPosterAssetId !== profile.poster.assetId) {
        try {
          posterSource(payload.project.id, profile.poster, this.origin, this.secret);
          posterUrl = await this.dependencies.transferPoster(payload.project.id, profile.poster, { origin: this.origin, secret: this.secret });
          if (typeof posterUrl !== 'string' || !posterUrl || posterUrl.includes('/api/integrations/protv/')) throw new Error('No durable poster URL.');
        } catch {
          posterUrl = null;
          note = ' The series poster could not be copied this time; the next release or status check retries it.';
        }
      }
      await this.dependencies.transactSeries(target.id, (current) => {
        const write = planSeriesRecord(current, {
          id: target.id, project: payload.project, profile, posterUrl, frame: released.thumbnailUrl,
          firetvCleared: released.firetvCleared === true, actorId: payload.authorization.actorId, now: Date.now(),
        });
        return { write: { ...write, ...(posterUrl ? { creatorSeriesPosterAssetId: profile.poster.assetId } : {}) }, result: null };
      });
      try {
        await this.dependencies.logAdminEvent({
          type: `creator-agent.${existing ? 'creator_series_record_update' : 'creator_series_record_create'}`, actorId: 'creator-agent',
          message: 'Official show details synced with an Administrator-authorized episode release.',
          details: { projectId: payload.project.id, externalId: target.id },
        });
      } catch { /* the audit log never blocks a release */ }
      return `The show page details are ${existing ? 'updated' : 'published with the first episode'}.${note}`;
    } catch (error) {
      this.dependencies.logError?.('Creator series show record could not be synced.', error);
      return `The show record could not be updated: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  }

  // After an unpublish: hide this series' own show record once none of its episodes is released. Coming Soon
  // listings are managed by their own workflow and are left alone.
  async hideIfUnreleased(projectId) {
    try {
      const records = await this.dependencies.getAllVideos();
      if (records.some((record) => record.creatorProjectId === projectId && isReleasedEpisode(record))) return null;
      const id = `creator_series_${projectId}`;
      const show = records.find((record) => record.id === id && record.creatorSeriesProjectId === projectId);
      if (!show || show.approvalStatus !== 'approved') return null;
      await this.dependencies.transactSeries(id, (current) => ({
        write: current && current.creatorSeriesProjectId === projectId
          ? { ...current, approvalStatus: 'draft', hiddenAt: new Date().toISOString() } : null,
        result: null,
      }));
      return 'The show page is hidden until an episode is released again.';
    } catch (error) {
      this.dependencies.logError?.('Creator series show record could not be hidden.', error);
      return 'The show page could not be hidden automatically; an Administrator should check it.';
    }
  }
}

module.exports = { CreatorSeriesRecordService, planSeriesRecord, validateSeriesProfile };

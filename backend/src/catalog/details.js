const { isViewerEligible, publicTitle, seriesKey } = require('./readModel');
const { releaseAllowed } = require('./releases');

function metadataAllowed(record, now = Date.now()) {
  return record?.approvalStatus === 'approved'
    && !record.private && !record.restricted && !record.rightsHold
    && (!record.releaseStatus || ['published', 'scheduled'].includes(record.releaseStatus))
    && (!record.visibility || record.visibility === 'public')
    && (!record.rightsStartAt || Date.parse(record.rightsStartAt) <= now)
    && (!record.rightsEndAt || Date.parse(record.rightsEndAt) > now);
}

// A Coming Soon film listing: promotional metadata and trailer only, never full media.
function comingSoonFilm(record) {
  return record?.contentType === 'MOVIE' && typeof record.comingSoonProjectId === 'string' && Boolean(record.comingSoonProjectId);
}

function detailEligible(record, records) {
  if (!metadataAllowed(record)) return false;
  if (record.contentType === 'SERIES') return record.status === 'ready' && releaseAllowed(record);
  if (comingSoonFilm(record)) return record.status === 'ready' && releaseAllowed(record);
  const context = records.filter(parent => metadataAllowed(parent) && releaseAllowed(parent));
  return isViewerEligible(record, context)
    || (['MOVIE', 'EPISODE'].includes(record.contentType)
      && record.releaseStatus === 'scheduled'
      && Number.isFinite(Date.parse(record.releaseAt))
      && Date.parse(record.releaseAt) > Date.now());
}

function titleDetails(record, records) {
  if (!detailEligible(record, records)) return null;
  const detail = publicTitle({ ...record, muxPlaybackId: '' });
  delete detail.muxPlaybackId;
  delete detail.muxPlaybackPolicy;
  return {
    ...detail,
    ...Object.fromEntries(['cast', 'creator', 'director', 'language', 'subtitles']
      .filter(field => typeof record[field] === 'string').map(field => [field, record[field]])),
    ...(typeof record.rating === 'number' ? { rating: record.rating } : {}),
    watchAvailable: record.contentType !== 'SERIES' && !comingSoonFilm(record) && isViewerEligible(record, records),
    ...(record.releaseStatus === 'scheduled' ? { releaseAt: record.releaseAt } : {}),
    ...(comingSoonFilm(record) ? {
      comingSoon: true,
      ...(Number.isFinite(Date.parse(record.premiereAt)) && Date.parse(record.premiereAt) > Date.now()
        ? { releaseAt: new Date(Date.parse(record.premiereAt)).toISOString() } : {}),
    } : {}),
  };
}

const WEEKDAYS = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

// Premiere facts come only from the show record, which carries what an Administrator confirmed in the Creator
// Portal. Nothing here guesses a date from the planned weekday.
function showSchedule(show, episodes, now = Date.now()) {
  const premiere = Date.parse(show.premiereAt);
  const airing = WEEKDAYS.has(show.airingWeekday) && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(show.airingTime))
    && show.airingTimeZone === 'America/New_York';
  return {
    comingSoon: !episodes.some(episode => episode.watchAvailable),
    ...(Number.isFinite(premiere) && premiere > now ? { premiereAt: new Date(premiere).toISOString() } : {}),
    ...(airing ? { airingSchedule: { weekday: show.airingWeekday, time: show.airingTime, timeZone: show.airingTimeZone } } : {}),
  };
}

function seriesDetails(records) {
  const groups = new Map();
  for (const record of records) {
    if (!detailEligible(record, records)) continue;
    if (!['EPISODE', 'SERIES'].includes(record.contentType)
      || typeof record.seriesTitle !== 'string' || !record.seriesTitle.trim()) continue;
    if (record.contentType === 'EPISODE'
      && (!Number.isInteger(record.seasonNumber) || record.seasonNumber < 1
        || !Number.isInteger(record.episodeNumber) || record.episodeNumber < 1)) continue;
    const key = seriesKey(record.seriesTitle);
    if (!groups.has(key)) groups.set(key, { key, title: record.seriesTitle.trim(), episodes: [], show: null });
    const group = groups.get(key);
    if (record.contentType === 'SERIES') {
      if (!group.show || record.id.localeCompare(group.show.id) < 0) group.show = record;
    } else group.episodes.push(titleDetails(record, records));
  }
  return [...groups.values()].map(({ show, ...group }) => {
    const episodes = group.episodes.sort((a, b) => a.seasonNumber - b.seasonNumber
      || a.episodeNumber - b.episodeNumber || a.id.localeCompare(b.id));
    const seasons = [...new Set(episodes.map(episode => episode.seasonNumber))];
    const artwork = show || episodes.find(episode => episode.thumbnailUrl || episode.posterUrl);
    return {
      ...group, episodes, seasons, seasonCount: seasons.length, episodeCount: episodes.length,
      ...(show ? showSchedule(show, episodes) : {}),
      description: show?.description || '',
      category: show?.category || episodes[0]?.category || '',
      artwork: artwork?.thumbnailUrl || artwork?.posterUrl || '',
      ...(show?.trailerStatus === 'ready' && show.trailerPlaybackId
        ? { trailerAvailable: true, trailerTitleId: show.id } : {}),
    };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

module.exports = { metadataAllowed, detailEligible, titleDetails, seriesDetails };

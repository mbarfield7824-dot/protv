const { isViewerEligible, publicTitle, seriesKey } = require('./readModel');
const { releaseAllowed } = require('./releases');
const { originalProjectIds, isProtvOriginal } = require('./originals');

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

// Once the film itself is released (its creator_<projectId> title is playable), its Coming Soon listing leaves
// discovery. The listing record and its trailer are kept; nothing is deleted.
function releasedFilm(record, records) {
  return records.some(other => other.id !== record.id && other.contentType === 'MOVIE'
    && other.creatorProjectId === record.comingSoonProjectId && isViewerEligible(other, records));
}

// A title's categories, primary genre first, without duplicates. Older records only have category/genre.
function categoriesOf(record) {
  const seen = new Set();
  return [record?.category || record?.genre, ...(Array.isArray(record?.categories) ? record.categories : [])]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim())
    .filter(value => !seen.has(value.toLowerCase()) && seen.add(value.toLowerCase()));
}

// A show record's own title is its series title when seriesTitle was left empty.
function showTitle(record) {
  const value = record.contentType === 'SERIES' ? record.seriesTitle || record.title : record.seriesTitle;
  return typeof value === 'string' ? value.trim() : '';
}

function detailEligible(record, records) {
  if (!metadataAllowed(record)) return false;
  if (record.contentType === 'SERIES') return record.status === 'ready' && releaseAllowed(record);
  if (comingSoonFilm(record)) return record.status === 'ready' && releaseAllowed(record) && !releasedFilm(record, records);
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
    categories: categoriesOf(record),
    protvOriginal: isProtvOriginal(record, originalProjectIds(records)),
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
    if (!['EPISODE', 'SERIES'].includes(record.contentType) || !showTitle(record)) continue;
    if (record.contentType === 'EPISODE'
      && (!Number.isInteger(record.seasonNumber) || record.seasonNumber < 1
        || !Number.isInteger(record.episodeNumber) || record.episodeNumber < 1)) continue;
    const key = seriesKey(showTitle(record));
    if (!groups.has(key)) groups.set(key, { key, title: showTitle(record), episodes: [], show: null });
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
      categories: show ? categoriesOf(show) : episodes[0]?.categories || [],
      protvOriginal: show?.protvOriginal === true,
      artwork: artwork?.thumbnailUrl || artwork?.posterUrl || '',
      ...(show?.trailerStatus === 'ready' && show.trailerPlaybackId
        ? { trailerAvailable: true, trailerTitleId: show.id } : {}),
    };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

// Public Coming Soon discovery: published shows with no released episode yet, and Coming Soon films whose real
// title is not released. Promotional metadata only; nothing here is playable. Soonest confirmed premiere first.
function comingSoonCatalog(records) {
  const shows = seriesDetails(records).filter(series => series.comingSoon).map(series => ({
    ...seriesCard(series),
  }));
  const films = records.filter(comingSoonFilm).map(record => titleDetails(record, records)).filter(Boolean).map(filmCard);
  const time = item => (item.premiereAt ? Date.parse(item.premiereAt) : Infinity);
  return [...shows, ...films].sort((a, b) => time(a) - time(b) || a.title.localeCompare(b.title));
}

// Discovery card for a show (shared by Coming Soon and PROtv Originals).
function seriesCard(series) {
  return {
    id: `series-${series.key}`, kind: 'series', href: `/series/${encodeURIComponent(series.key)}`,
    title: series.title, description: series.description, artwork: series.artwork, categories: series.categories,
    comingSoon: Boolean(series.comingSoon), episodeCount: series.episodeCount, protvOriginal: Boolean(series.protvOriginal),
    ...(series.premiereAt ? { premiereAt: series.premiereAt } : {}),
    ...(series.airingSchedule ? { airingSchedule: series.airingSchedule } : {}),
    trailerAvailable: Boolean(series.trailerAvailable),
  };
}

// Discovery card for a film (shared by Coming Soon and PROtv Originals). watchAvailable follows existing playback rules.
function filmCard(detail) {
  return {
    id: detail.id, kind: 'title', href: `/title/${encodeURIComponent(detail.id)}`,
    title: detail.title, description: detail.description, artwork: detail.posterUrl || detail.thumbnailUrl, categories: detail.categories,
    comingSoon: Boolean(detail.comingSoon), watchAvailable: Boolean(detail.watchAvailable), protvOriginal: Boolean(detail.protvOriginal),
    ...(detail.releaseAt && !detail.watchAvailable ? { premiereAt: detail.releaseAt } : {}),
    trailerAvailable: Boolean(detail.trailerAvailable),
  };
}

// PROtv Originals discovery: designated shows (Coming Soon or released) and designated films, using the same public
// eligibility as every other page. A film's Coming Soon listing and its released title never both appear.
function originalsCatalog(records) {
  const shows = seriesDetails(records).filter(series => series.protvOriginal).map(seriesCard);
  const ids = originalProjectIds(records);
  const films = records.filter(record => record.contentType === 'MOVIE' && isProtvOriginal(record, ids))
    .map(record => titleDetails(record, records)).filter(Boolean).map(filmCard);
  return [...shows, ...films].sort((a, b) => Number(a.comingSoon) - Number(b.comingSoon) || a.title.localeCompare(b.title));
}

module.exports = { metadataAllowed, detailEligible, titleDetails, seriesDetails, comingSoonCatalog, originalsCatalog, categoriesOf };

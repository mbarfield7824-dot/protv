const {
  CHANNEL_ID, LinearValidationError, PROGRAM_LABELS,
  airState, approvalIssues, entryFields, knownDuration, linearRightsFor, normalizeSeriesTitle, overlaps,
  pendingRelease, pendingVideo, PENDING_EPISODE_ID, playableAt, publicItem, rightsKeysFor, validateLineup, validateRightsInput,
} = require('./model');
const { channelLabel, channelLocalToUtc, channelWeekDates, ChannelTimeError, zonedParts } = require('./time');
const { seriesKey } = require('../catalog/readModel');
const { agreementFinding } = require('./agreementReview');
const {
  COUNTDOWN_CLOCK_SECONDS, COUNTDOWN_MINUTES, CREATIVE_LABELS, CreativeValidationError,
  approvalProblems, autofillPod, creativeAirable, creativeFields, podSeconds, publicSpot, spotAt, spotSeconds, validatePod,
} = require('./creatives');

const GUIDE_HOURS = 24;
// A 24/7 schedule reads ~150 documents per refresh; 30 s keeps that to a few dollars a month per busy server instance.
// Rights withdrawals and unpublishing take effect within this time; admin edits clear it immediately on that instance.
const CACHE_MS = 30_000;
const LAUNCH_CONFIRMATION = 'LAUNCH PROtv LIVE';
const text = (value, max = 2000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

class LinearNotFoundError extends Error {}

function createLinearService({
  store,
  now = () => Date.now(),
  signPlaybackToken = (playbackId, duration) => require('../mux').signPlayback(playbackId, duration),
  cacheMs = CACHE_MS,
  mux = null,
} = {}) {
  const muxApi = () => mux || require('../mux');
  let cache = null;

  // Viewer requests share one short-lived read of the schedule, titles and rights. Air-time eligibility is still
  // evaluated against the current clock on every request; held titles have no playback ID to leak from a cache.
  // The window reaches five minutes back so analytics can still attribute events from a program that just ended.
  async function loadWindow(at, { fresh = false } = {}) {
    if (!fresh && cache && at - cache.loadedAt < cacheMs && cache.loadedAt <= at) return cache;
    const fromIso = new Date(at - 5 * 60_000).toISOString();
    const toIso = new Date(at + (GUIDE_HOURS + 2) * 3_600_000).toISOString();
    const [settings, entries] = await Promise.all([store.getSettings(), store.listEntries(fromIso, toIso)]);
    const approved = entries.filter((entry) => entry.status === 'approved');
    const videos = await store.getVideos(approved.map((entry) => entry.videoId).filter(Boolean));
    const rights = await store.getRights([...videos.values(), ...approved.map(pendingVideo).filter(Boolean)].flatMap(rightsKeysFor));
    const creatives = await store.getCreatives(approved.flatMap((entry) => (entry.pod || []).map((spot) => spot.creativeId)));
    const loaded = { loadedAt: at, settings, entries: approved, videos, rights, creatives };
    if (!fresh) cache = loaded;
    return loaded;
  }

  function invalidate() { cache = null; }

  // A countdown airs only while its program is approved, still starts exactly when the countdown ends, and will
  // actually play (released, or an approved premiere awaiting release). Otherwise viewers get a holding screen.
  function slotState(entry, byId, videos, rights, at) {
    if (entry.kind === 'countdown') {
      const program = byId.get(entry.forEntryId);
      const video = program?.videoId ? videos.get(program.videoId) : null;
      const aligned = Boolean(program) && program.startAt === entry.endAt;
      const programState = aligned ? airState(program, video, rights, at) : 'unavailable';
      return { video, program, state: ['playing', 'awaiting-release'].includes(programState) ? 'countdown' : 'unavailable', programState };
    }
    const video = entry.videoId ? videos.get(entry.videoId) : null;
    return { video, state: airState(entry, video, rights, at) };
  }

  // The spot of a break or countdown pod on air now, with playback details only if the spot may air. A spot that
  // cannot air keeps its time (viewers see the branded card), so everyone stays on the same schedule.
  function podNow(entry, creatives, at, { clockSeconds = 0 } = {}) {
    const elapsed = (at - Date.parse(entry.startAt)) / 1000;
    const usable = entry.durationSeconds - clockSeconds;
    const located = elapsed < usable ? spotAt(entry.pod, elapsed) : { index: -1, spot: null };
    if (!located.spot) {
      const podEnd = Date.parse(entry.startAt) + Math.min(podSeconds(entry.pod), usable) * 1000;
      return { refreshAt: at < podEnd ? podEnd : Date.parse(entry.endAt) };
    }
    const spotEnd = Date.parse(entry.startAt) + located.endSeconds * 1000;
    const creative = creatives.get(located.spot.creativeId);
    if (!creativeAirable(creative, at)) return { refreshAt: spotEnd };
    return {
      refreshAt: spotEnd,
      signed: creative.playbackPolicy === 'signed',
      spot: publicSpot(creative, { index: located.index, count: entry.pod.length }),
      playback: {
        muxPlaybackId: creative.muxPlaybackId.trim(),
        offsetSeconds: Math.round(located.offsetSeconds * 1000) / 1000,
        sourceStartSeconds: 0,
        sourceEndSeconds: located.spot.durationSeconds,
      },
    };
  }

  // What viewers see during a premiere countdown. Before release only the series (or film) name, the episode name
  // when the Administrator enabled it, and Administrator-chosen promotional artwork are shown: never the video,
  // its synopsis or its own artwork.
  function countdownItem(entry, slot) {
    const { program, video, programState } = slot;
    const episode = video?.contentType === 'EPISODE';
    const released = programState === 'playing';
    const settings = entry.countdown || {};
    const episodeName = settings.showEpisodeTitle !== false ? text(video?.episodeTitle || video?.title, 200) : '';
    return {
      entryId: entry.id, kind: 'countdown', state: 'countdown',
      label: program.programType === 'premiere' ? 'Premiere' : 'Coming up',
      title: episode ? text(video.seriesTitle, 200) || 'PROtv Premiere' : text(video?.title, 200) || 'PROtv Premiere',
      subtitle: episode ? [
        Number.isInteger(video.seasonNumber) ? `S${video.seasonNumber}` : '',
        Number.isInteger(video.episodeNumber) ? `E${video.episodeNumber}` : '',
        episodeName,
      ].filter(Boolean).join(' · ') : '',
      startAt: entry.startAt, endAt: entry.endAt, startLabel: channelLabel(entry.startAt), durationSeconds: entry.durationSeconds,
      countdown: {
        minutes: settings.minutes || Math.round(entry.durationSeconds / 60),
        premiereAt: program.startAt,
        premiereLabel: channelLabel(program.startAt),
        clockSeconds: COUNTDOWN_CLOCK_SECONDS,
        artworkUrl: settings.artworkUrl || (released ? video.posterUrl || video.heroImageUrl || video.thumbnailUrl || '' : ''),
      },
    };
  }

  async function channelState({ preview = false } = {}) {
    const at = now();
    const { settings, entries, videos, rights, creatives } = await loadWindow(at);
    if (settings.status !== 'public' && !preview) throw new LinearNotFoundError('PROtv LIVE is not available.');
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const all = entries
      .filter((entry) => Date.parse(entry.endAt) > at)
      .map((entry) => ({ entry, ...slotState(entry, byId, videos, rights, at) }));
    const slots = all.filter((slot) => slot.state !== 'unavailable');
    // An approved slot that cannot play right now (rights withdrawn, title pulled, countdown without its program)
    // shows a holding screen with no title details, instead of silently skipping to the next program.
    const onAirSlot = all.find(({ entry }) => Date.parse(entry.startAt) <= at);
    const current = onAirSlot && onAirSlot.state !== 'unavailable' ? onAirSlot : null;
    const upcoming = slots.filter(({ entry }) => Date.parse(entry.startAt) > at);
    const next = upcoming.find(({ entry }) => entry.kind !== 'countdown') || null;
    // A future slot shows full details only when its title is already public; it is not "playing" yet.
    const listed = (slot) => {
      const { entry, video, state } = slot;
      if (entry.kind === 'countdown') {
        const item = countdownItem(entry, slot);
        const live = entry === current?.entry;
        return { ...item, state: live ? 'countdown' : 'scheduled', label: 'Countdown', title: `Countdown: ${item.title}` };
      }
      return { ...publicItem(entry, video, state), state: entry === current?.entry ? state : state === 'playing' ? 'scheduled' : state };
    };

    let nowItem;
    let refreshAt = upcoming[0] ? Date.parse(upcoming[0].entry.startAt) : at + 60_000;
    if (onAirSlot && !current) {
      nowItem = {
        entryId: onAirSlot.entry.id, kind: 'holding', state: 'holding', title: 'PROtv LIVE',
        subtitle: 'We\'ll be right back. Programming will continue shortly.',
      };
      refreshAt = Math.min(Date.parse(onAirSlot.entry.endAt), at + 15_000);
    } else if (!current) {
      nowItem = {
        kind: 'off-air', state: 'off-air', title: 'PROtv LIVE',
        subtitle: next ? `Up next: ${channelLabel(next.entry.startAt)}` : 'Programming will resume soon.',
      };
    } else if (current.entry.kind === 'countdown' || current.entry.kind === 'break') {
      const { entry } = current;
      const countdown = entry.kind === 'countdown';
      nowItem = countdown ? countdownItem(entry, current) : listed(current);
      const pod = podNow(entry, creatives, at, { clockSeconds: countdown ? COUNTDOWN_CLOCK_SECONDS : 0 });
      refreshAt = Math.min(pod.refreshAt, Date.parse(entry.endAt));
      if (pod.playback) Object.assign(nowItem, { spot: pod.spot, playback: pod.playback });
      if (pod.playback && pod.signed) {
        nowItem.playback.playbackToken = await signPlaybackToken(pod.playback.muxPlaybackId, pod.playback.sourceEndSeconds);
      }
    } else {
      const { entry, video, state } = current;
      refreshAt = Date.parse(entry.endAt);
      nowItem = listed(current);
      if (state === 'playing') {
        const offsetSeconds = (entry.sourceStartSeconds || 0) + (at - Date.parse(entry.startAt)) / 1000;
        const playbackId = video.muxPlaybackId.trim();
        nowItem.playback = {
          muxPlaybackId: playbackId,
          offsetSeconds: Math.round(offsetSeconds * 1000) / 1000,
          sourceStartSeconds: entry.sourceStartSeconds || 0,
          sourceEndSeconds: (entry.sourceStartSeconds || 0) + entry.durationSeconds,
          ...(video.muxPlaybackPolicy === 'signed'
            ? { playbackToken: await signPlaybackToken(playbackId, knownDuration(video) || entry.durationSeconds) }
            : {}),
        };
      }
      if (state === 'awaiting-release') refreshAt = Math.min(refreshAt, at + 15_000);
    }
    const horizon = at + GUIDE_HOURS * 3_600_000;
    return {
      channel: { id: CHANNEL_ID, name: settings.name, timeZone: settings.timeZone, status: settings.status, ...(preview ? { preview: true } : {}) },
      serverTime: new Date(at).toISOString(),
      serverTimeMs: at,
      now: nowItem,
      next: next ? listed(next) : null,
      guide: slots.filter(({ entry }) => Date.parse(entry.startAt) < horizon)
        .map((slot) => ({ ...listed(slot), onNow: slot.entry === current?.entry })),
      // Everyone re-checks shortly after a boundary; the jitter is applied by the client.
      refreshAfterMs: Math.max(1_000, Math.min(60_000, refreshAt - at)),
    };
  }

  async function status() {
    const settings = await store.getSettings();
    return { channelId: CHANNEL_ID, name: settings.name, public: settings.status === 'public' };
  }

  // The approved entry on air at a moment (two minutes' grace either side), used to attribute analytics.
  async function entryOnAir(entryId, at = now()) {
    const { entries, videos } = await loadWindow(at);
    const entry = entries.find((candidate) => (entryId
      ? candidate.id === entryId && Date.parse(candidate.startAt) - 120_000 <= at && at < Date.parse(candidate.endAt) + 120_000
      : Date.parse(candidate.startAt) <= at && at < Date.parse(candidate.endAt))) || null;
    if (!entry) return null;
    const video = entry.videoId ? videos.get(entry.videoId) : null;
    const title = entry.kind === 'countdown' ? 'Countdown' : entry.kind === 'break' ? 'Commercial break'
      : [video?.contentType === 'EPISODE' ? video.seriesTitle : '', video?.episodeTitle || video?.title].filter(Boolean).join(' — ');
    return { entry, title };
  }

  // --- Administration ------------------------------------------------------

  async function describeEntries(entries) {
    // Countdowns describe the program they lead into, which may be outside the requested list.
    const programIds = entries.filter((entry) => entry.kind === 'countdown').map((entry) => entry.forEntryId).filter(Boolean);
    const programs = new Map((await Promise.all(programIds.map((id) => store.getEntry(id)))).filter(Boolean).map((entry) => [entry.id, entry]));
    const videos = await store.getVideos([...entries, ...programs.values()].map((entry) => entry.videoId).filter(Boolean));
    const pending = entries.map(pendingVideo).filter(Boolean);
    const rights = await store.getRights([...videos.values(), ...pending].flatMap(rightsKeysFor));
    const creatives = await store.getCreatives(entries.flatMap((entry) => (entry.pod || []).map((spot) => spot.creativeId)));
    const settings = await store.getSettings();
    const at = now();
    const breakSecondsByHour = new Map();
    for (const entry of entries) {
      if (entry.kind !== 'break') continue;
      const hour = entry.startAt.slice(0, 13);
      breakSecondsByHour.set(hour, (breakSecondsByHour.get(hour) || 0) + entry.durationSeconds);
    }
    return entries.map((entry) => {
      if (entry.kind === 'countdown') {
        const program = programs.get(entry.forEntryId) || null;
        const video = program?.videoId ? videos.get(program.videoId) : null;
        const blocking = [];
        const warnings = [];
        if (Date.parse(entry.endAt) <= at) blocking.push('This countdown has already ended.');
        if (!program) blocking.push('The program this countdown leads into no longer exists. Remove the countdown.');
        else if (program.startAt !== entry.endAt) blocking.push('The program moved. Remove this countdown and add it again from the program.');
        else if (program.status !== 'approved') blocking.push('Approve the program first; the countdown airs only before an approved program.');
        if (entry.countdown?.showEpisodeTitle !== false && video?.contentType === 'EPISODE' && program?.programType === 'premiere') {
          warnings.push('Viewers will see the episode name during the countdown, before the episode is released.');
        }
        return {
          ...entry, startLabel: channelLabel(entry.startAt), endLabel: channelLabel(entry.endAt),
          typeLabel: `Countdown (${entry.countdown?.minutes || Math.round(entry.durationSeconds / 60)} min)`,
          title: video ? `Countdown: ${[video.contentType === 'EPISODE' ? video.seriesTitle : '', video.episodeTitle || video.title].filter(Boolean).join(' — ')}` : 'Countdown',
          pod: describePod(entry.pod, creatives, at), released: false, linearRights: null,
          airState: entry.status === 'approved' ? (blocking.length ? 'unavailable' : 'countdown') : null,
          issues: { blocking, warnings },
        };
      }
      const video = entry.videoId ? videos.get(entry.videoId) : null;
      const issues = approvalIssues(entry, video, rights, at);
      if (entry.kind === 'break') {
        if (!(entry.pod || []).length) issues.warnings.push('No spots in this break: viewers see the PROtv "We\'ll be right back" card for its whole length.');
        else if (podSeconds(entry.pod) < entry.durationSeconds) issues.warnings.push(`The spots fill ${podSeconds(entry.pod)} of ${entry.durationSeconds} s; the PROtv card fills the rest.`);
        const unavailable = (entry.pod || []).filter((spot) => !creativeAirable(creatives.get(spot.creativeId), Date.parse(entry.startAt)));
        if (unavailable.length) issues.warnings.push(`${unavailable.length} spot(s) are not approved or are outside their flight dates at this time; the PROtv card shows instead.`);
        const limit = (settings.adPolicy?.maxBreakMinutesPerHour ?? 8) * 60;
        const hourTotal = breakSecondsByHour.get(entry.startAt.slice(0, 13)) || entry.durationSeconds;
        if (limit && hourTotal > limit) issues.warnings.push(`Commercial time in this clock hour (${Math.round(hourTotal / 60)} min) is above the channel limit of ${limit / 60} min.`);
      }
      return {
        ...entry,
        ...(entry.kind === 'break' ? { pod: describePod(entry.pod, creatives, at) } : {}),
        startLabel: channelLabel(entry.startAt),
        endLabel: channelLabel(entry.endAt),
        typeLabel: entry.kind === 'break' ? 'Commercial break' : PROGRAM_LABELS[entry.programType],
        title: entry.kind === 'break' ? (entry.label || 'Commercial break') : video
          ? [video.contentType === 'EPISODE' ? video.seriesTitle : '', video.episodeTitle || video.title].filter(Boolean).join(' — ')
          : pendingVideo(entry) ? `${entry.pendingSeriesTitle} — new episode (not delivered to PROtv yet)` : 'Missing title',
        released: video ? playableAt(video, at) : false,
        linearRights: video ? linearRightsFor(video, rights, Date.parse(entry.startAt)).status
          : pendingVideo(entry) ? linearRightsFor(pendingVideo(entry), rights, Date.parse(entry.startAt)).status : null,
        ...(pendingVideo(entry) && !video ? { pending: true } : {}),
        airState: entry.status === 'approved' ? airState(entry, video, rights, Math.max(at, Date.parse(entry.startAt))) : null,
        issues,
      };
    });
  }

  function describePod(pod, creatives, at) {
    return (pod || []).map((spot) => {
      const creative = creatives.get(spot.creativeId);
      return {
        ...spot,
        title: creative ? creative.title : 'Removed spot',
        type: creative?.type || null,
        advertiser: creative?.advertiser || '',
        airable: creativeAirable(creative, at),
      };
    });
  }

  async function listSchedule({ from, to }) {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || toMs - fromMs > 35 * 86_400_000) {
      throw new LinearValidationError('Choose a schedule range of up to 35 days.');
    }
    return describeEntries(await store.listEntries(new Date(fromMs).toISOString(), new Date(toMs).toISOString()));
  }

  async function resolveStart(input) {
    if (!input.afterEntryId) return null;
    const previous = await store.getEntry(String(input.afterEntryId));
    if (!previous) throw new LinearValidationError('The entry to follow no longer exists.');
    return previous.endAt;
  }

  // A premiere for a Creator Portal episode that has not reached PROtv yet. Its series must be named.
  function pendingFields(input) {
    const seriesTitle = text(input?.pendingSeriesTitle, 200);
    if (input?.programType !== 'premiere' || !PENDING_EPISODE_ID.test(String(input?.videoId || '')) || seriesTitle.length < 2) {
      throw new LinearValidationError('That title is not in the PROtv catalog.');
    }
    if (!(Number(input.durationSeconds) > 0)) throw new LinearValidationError('Enter the episode length for a premiere that has not been delivered yet.');
    return { pendingSeriesTitle: seriesTitle };
  }

  // A program that fills a primetime lineup slot while its series is not ready. Repeating a week copies stand-ins
  // (other lineup slots stay open for new episodes); remove the stand-in once the series' episode is scheduled.
  function standInFields(input) {
    if (input?.kind === 'break' || input?.standInFor === undefined || input?.standInFor === null || input?.standInFor === '') return {};
    const series = text(input.standInFor, 200);
    if (series.length < 2) throw new LinearValidationError('Name the series this program stands in for.');
    return { standInFor: series };
  }

  async function createEntry(input, actorId) {
    const video = input?.kind === 'break' ? null : (await store.getVideos([String(input?.videoId || '')])).get(input?.videoId) || null;
    const pendingExtra = input?.kind !== 'break' && !video ? pendingFields(input) : {};
    const fields = { ...entryFields(input, { video, previousEndAt: await resolveStart(input) }), ...pendingExtra, ...standInFields(input) };
    if (Date.parse(fields.endAt) <= now()) throw new LinearValidationError('This slot would already have ended.');
    const timestamp = new Date(now()).toISOString();
    const created = await store.writeEntry(null, async () => ({
      ...fields, channelId: CHANNEL_ID, status: 'draft', origin: input.origin === 'primetime' ? 'primetime' : 'manual',
      createdBy: actorId, createdAt: timestamp, updatedAt: timestamp, approvedBy: null, approvedAt: null,
    }));
    invalidate();
    return (await describeEntries([created]))[0];
  }

  async function updateEntry(id, input, actorId) {
    const existing = await store.getEntry(id);
    if (!existing) throw new LinearNotFoundError('Schedule entry not found.');
    if (Date.parse(existing.startAt) <= now() && existing.status === 'approved') {
      throw new LinearValidationError('This entry is on air or has aired. Remove it instead of editing it.');
    }
    if (existing.kind === 'countdown') throw new LinearValidationError('Remove this countdown and add it again from its program.');
    const merged = {
      kind: existing.kind, videoId: existing.videoId, programType: existing.programType,
      durationSeconds: existing.durationSeconds, sourceStartSeconds: existing.sourceStartSeconds,
      label: existing.label, notes: existing.notes, ...input,
    };
    const video = merged.kind === 'break' ? null : (await store.getVideos([merged.videoId])).get(merged.videoId) || null;
    const pendingExtra = merged.kind !== 'break' && !video
      ? pendingFields({ ...merged, pendingSeriesTitle: merged.pendingSeriesTitle ?? existing.pendingSeriesTitle }) : {};
    const previousEndAt = (await resolveStart(merged)) || (merged.startAtLocal ? null : existing.startAt);
    const fields = { ...entryFields(merged, { video, previousEndAt }), ...pendingExtra };
    if (Date.parse(fields.endAt) <= now()) throw new LinearValidationError('This slot would already have ended.');
    if (existing.pod && podSeconds(existing.pod) > fields.durationSeconds) {
      throw new LinearValidationError(`The spots in this break run ${podSeconds(existing.pod)} s. Shorten them first, or keep the break at least that long.`);
    }
    const updated = await store.writeEntry(id, async (current) => ({
      ...current, ...fields, status: 'draft', approvedBy: null, approvedAt: null,
      updatedAt: new Date(now()).toISOString(), updatedBy: actorId,
    }));
    invalidate();
    return (await describeEntries([updated]))[0];
  }

  async function approveEntry(id, { acknowledgeWarnings = false } = {}, actorId) {
    const entry = await store.getEntry(id);
    if (!entry) throw new LinearNotFoundError('Schedule entry not found.');
    const [described] = await describeEntries([entry]);
    if (described.issues.blocking.length) throw new LinearValidationError(described.issues.blocking.join(' '));
    if (described.issues.warnings.length && acknowledgeWarnings !== true) {
      throw new LinearValidationError(`Confirm before approving: ${described.issues.warnings.join(' ')}`);
    }
    const timestamp = new Date(now()).toISOString();
    const approved = await store.writeEntry(id, async (current) => {
      if (current.updatedAt !== entry.updatedAt) throw new LinearValidationError('This entry changed while you were reviewing it. Review it again.');
      return { ...current, status: 'approved', approvedBy: actorId, approvedAt: timestamp, updatedAt: timestamp };
    });
    invalidate();
    return (await describeEntries([approved]))[0];
  }

  async function withdrawEntry(id, actorId) {
    const entry = await store.getEntry(id);
    if (!entry) throw new LinearNotFoundError('Schedule entry not found.');
    const updated = await store.writeEntry(id, async (current) => ({
      ...current, status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date(now()).toISOString(), updatedBy: actorId,
    }));
    invalidate();
    return (await describeEntries([updated]))[0];
  }

  async function deleteEntry(id) {
    const removed = await store.deleteEntry(id);
    if (!removed) throw new LinearNotFoundError('Schedule entry not found.');
    invalidate();
    return removed;
  }

  // Titles an Administrator can pick from, with what stands between each and air.
  async function programs() {
    const [catalog, rights] = await Promise.all([store.listCatalog(), store.listRights()]);
    const at = now();
    return catalog
      .filter((video) => ['MOVIE', 'EPISODE'].includes(video.contentType)
        && (playableAt(video, at) || pendingRelease(video, at)))
      .map((video) => ({
        id: video.id,
        contentType: video.contentType,
        title: video.title || '',
        seriesTitle: video.seriesTitle || '',
        seasonNumber: video.seasonNumber ?? null,
        episodeNumber: video.episodeNumber ?? null,
        episodeTitle: video.episodeTitle || '',
        durationSeconds: knownDuration(video),
        released: playableAt(video, at),
        releaseAt: video.releaseAt || null,
        linearRights: linearRightsFor(video, rights, at).status,
      }))
      .sort((left, right) => (left.seriesTitle || left.title).localeCompare(right.seriesTitle || right.title)
        || (left.seasonNumber || 0) - (right.seasonNumber || 0) || (left.episodeNumber || 0) - (right.episodeNumber || 0));
  }

  // The linear-rights review queue: every movie, episode and series with its recorded on-demand evidence beside it.
  async function rightsReview() {
    const [catalog, rights, evidence] = await Promise.all([store.listCatalog(), store.listRights(), store.listRightsEvidence()]);
    const at = now();
    const titles = catalog.filter((video) => ['MOVIE', 'EPISODE'].includes(video.contentType)
      && !['rejected'].includes(video.approvalStatus))
      .map((video) => {
        const record = rights.get(`title_${video.id}`) || null;
        const review = evidence.get(video.id);
        return {
          scope: 'title', key: `title_${video.id}`, videoId: video.id, contentType: video.contentType,
          title: video.title || '', seriesTitle: video.seriesTitle || '',
          effective: linearRightsFor(video, rights, at).status,
          record,
          agreement: agreementFinding(video),
          onDemandEvidence: {
            approvalStatus: video.approvalStatus || '',
            copyrightStatus: video.copyrightStatus || '',
            rightsHolder: video.rightsHolder || '',
            contractReference: video.creatorContractReference ? 'Creator agreement on file' : '',
            evidenceTier: review?.tier || '',
            territory: review?.territory?.recommended || '',
            openItems: Array.isArray(review?.openItems) ? review.openItems.slice(0, 3) : [],
          },
        };
      })
      .sort((left, right) => (left.seriesTitle || left.title).localeCompare(right.seriesTitle || right.title));
    const seriesNames = new Map();
    for (const video of catalog) {
      if ((video.contentType === 'EPISODE' || video.contentType === 'SERIES') && normalizeSeriesTitle(video.seriesTitle || video.title)) {
        const name = (video.seriesTitle || video.title).trim();
        seriesNames.set(seriesKey(name), name);
      }
    }
    const series = [...seriesNames.entries()].map(([key, name]) => ({
      scope: 'series', key: `series_${key}`, title: name, record: rights.get(`series_${key}`) || null,
    })).sort((left, right) => left.title.localeCompare(right.title));
    return { titles, series };
  }

  async function setRights(key, input, actorId) {
    if (typeof key !== 'string' || !/^(title|series)_[A-Za-z0-9_-]{1,300}$/.test(key)) {
      throw new LinearValidationError('Unknown rights record.');
    }
    // A new decision never erases the old one: earlier decisions are kept (newest first) for the audit history.
    const previous = (await store.getRights([key])).get(key) || null;
    const { history: earlier = [], ...previousDecision } = previous || {};
    const history = previous ? [previousDecision, ...(Array.isArray(earlier) ? earlier : [])].slice(0, 25) : [];
    const record = {
      ...validateRightsInput(input), recordedBy: actorId, recordedAt: new Date(now()).toISOString(),
      ...(history.length ? { history } : {}),
    };
    await store.setRights(key, record);
    invalidate();
    return { key, ...record };
  }

  async function settings() { return store.getSettings(); }

  async function updateSettings(input, actorId) {
    const patch = { updatedAt: new Date(now()).toISOString(), updatedBy: actorId };
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60) throw new LinearValidationError('The channel name is invalid.');
      patch.name = input.name.trim();
    }
    if (input.primetime !== undefined) patch.primetime = validateLineup(input.primetime);
    if (input.adPolicy !== undefined) {
      const policy = {};
      for (const field of ['maxBreakMinutesPerHour', 'maxBreaksPerProgramHour', 'viewerFrequencyCapPerHour']) {
        const value = Number(input.adPolicy[field]);
        if (!Number.isInteger(value) || value < 0 || value > 30) throw new LinearValidationError('Commercial limits must be whole numbers from 0 to 30.');
        policy[field] = value;
      }
      patch.adPolicy = policy;
    }
    if (input.status !== undefined) {
      if (!['off', 'public'].includes(input.status)) throw new LinearValidationError('The channel is either off or public.');
      if (input.status === 'public' && input.confirmation !== LAUNCH_CONFIRMATION) {
        throw new LinearValidationError(`Type "${LAUNCH_CONFIRMATION}" to make the channel public.`);
      }
      patch.status = input.status;
      if (input.status === 'public') Object.assign(patch, { launchedAt: patch.updatedAt, launchedBy: actorId });
    }
    const saved = await store.saveSettings(patch);
    invalidate();
    return saved;
  }

  // Drafts one week of the primetime lineup. It never approves anything and never changes a release time:
  // each slot gets the series' next unscheduled episode, or a reason it could not be filled.
  async function draftPrimetimeWeek(weekOf, actorId) {
    let dates;
    try { dates = channelWeekDates(weekOf); } catch (error) {
      if (error instanceof ChannelTimeError) throw new LinearValidationError(error.message);
      throw error;
    }
    const [currentSettings, catalog, rights] = await Promise.all([store.getSettings(), store.listCatalog(), store.listRights()]);
    const at = now();
    const results = [];
    for (const slot of currentSettings.primetime) {
      const date = dates[(slot.weekday + 6) % 7];
      const local = `${date}T${slot.time}`;
      const result = { seriesTitle: slot.seriesTitle, slot: local, created: null, reason: '' };
      results.push(result);
      const startAt = channelLocalToUtc(local);
      if (Date.parse(startAt) <= at) { result.reason = 'This slot is in the past.'; continue; }
      const target = normalizeSeriesTitle(slot.seriesTitle);
      const episodes = catalog.filter((video) => video.contentType === 'EPISODE' && normalizeSeriesTitle(video.seriesTitle) === target
        && !['rejected'].includes(video.approvalStatus))
        .sort((left, right) => (left.seasonNumber || 0) - (right.seasonNumber || 0) || (left.episodeNumber || 0) - (right.episodeNumber || 0));
      if (!episodes.length) {
        const placeholder = catalog.find((video) => normalizeSeriesTitle(video.seriesTitle || video.title).replace(/[^a-z0-9]/g, '').slice(0, 6)
          === target.replace(/[^a-z0-9]/g, '').slice(0, 6));
        result.reason = `No episodes of "${slot.seriesTitle}" are in the PROtv catalog.${placeholder
          ? ` A similarly named record exists ("${placeholder.title}", ${placeholder.contentType}, no playable episode).` : ''}`;
        continue;
      }
      const scheduled = await store.findEntriesByVideoIds(episodes.map((video) => video.id));
      if (scheduled.some((entry) => entry.startAt === startAt)) { result.reason = 'Already scheduled in this slot.'; continue; }
      const usedIds = new Set(scheduled.filter((entry) => entry.programType !== 'rerun').map((entry) => entry.videoId));
      const episode = episodes.find((video) => !usedIds.has(video.id));
      if (!episode) { result.reason = 'Every catalog episode is already scheduled. Add a rerun manually if wanted.'; continue; }
      const label = `S${episode.seasonNumber ?? '?'} E${episode.episodeNumber ?? '?'}`;
      if (linearRightsFor(episode, rights, Date.parse(startAt)).status !== 'confirmed') {
        result.reason = `${label}: linear rights are not confirmed.`; continue;
      }
      const released = playableAt(episode, at);
      if (!released && !pendingRelease(episode, at)) { result.reason = `${label} is not ready (it must be processed and approved).`; continue; }
      if (!knownDuration(episode)) { result.reason = `${label} has no recorded duration yet.`; continue; }
      try {
        result.created = await createEntry({
          kind: 'program', videoId: episode.id, programType: released ? 'episode' : 'premiere',
          startAtLocal: local, origin: 'primetime', notes: `Drafted from the primetime lineup for ${slot.seriesTitle}.`,
        }, actorId);
      } catch (error) {
        if (!(error instanceof LinearValidationError)) throw error;
        result.reason = error.message;
      }
    }
    return results;
  }

  function weekBounds(weekOf) {
    let dates;
    try { dates = channelWeekDates(weekOf); } catch (error) {
      if (error instanceof ChannelTimeError) throw new LinearValidationError(error.message);
      throw error;
    }
    const nextMonday = new Date(Date.parse(`${dates[6]}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const days = [...dates, nextMonday].map((date) => channelLocalToUtc(`${date}T00:00`));
    return { dates, from: days[0], to: days[7], dayStarts: days };
  }

  // On-air time and gaps per Eastern day. A slot counts as on air only when it is approved and will actually play
  // (rights confirmed, title released or an awaiting premiere); everything else is a gap where viewers see "Up next".
  async function weekCoverage(weekOf) {
    const { dates, from, to, dayStarts } = weekBounds(weekOf);
    const described = await describeEntries(await store.listEntries(from, to));
    const onAir = described.filter((entry) => entry.status === 'approved' && entry.airState !== 'unavailable')
      .map((entry) => [Date.parse(entry.startAt), Date.parse(entry.endAt)]).sort((left, right) => left[0] - right[0]);
    const days = dates.map((date, index) => {
      const dayStart = Date.parse(dayStarts[index]);
      const dayEnd = Date.parse(dayStarts[index + 1]);
      const gaps = [];
      let cursor = dayStart;
      let covered = 0;
      for (const [start, end] of onAir) {
        if (end <= cursor || start >= dayEnd) continue;
        const clippedStart = Math.max(start, cursor);
        if (clippedStart > cursor) gaps.push([cursor, clippedStart]);
        const clippedEnd = Math.min(end, dayEnd);
        covered += clippedEnd - clippedStart;
        cursor = clippedEnd;
      }
      if (cursor < dayEnd) gaps.push([cursor, dayEnd]);
      return {
        date,
        onAirSeconds: Math.round(covered / 1000),
        gapSeconds: Math.round((dayEnd - dayStart - covered) / 1000),
        gaps: gaps.map(([start, end]) => ({ startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() })),
      };
    });
    return { weekOf, days };
  }

  // The same Eastern wall-clock time on another day, to the second: back-to-back entries rarely start on a whole minute.
  function localStart(iso, targetDate) {
    const local = `${targetDate}T${zonedParts(Date.parse(iso)).time}`;
    const withinMinute = ((Date.parse(iso) % 60_000) + 60_000) % 60_000;
    const shift = (utc) => (utc ? new Date(Date.parse(utc) + withinMinute).toISOString() : utc);
    try {
      return shift(channelLocalToUtc(local));
    } catch (error) {
      if (!(error instanceof ChannelTimeError)) throw error;
      if (/occurs twice/.test(error.message)) return shift(channelLocalToUtc(local, { fold: 'first' }));
      return null;
    }
  }

  // Copies a week's approved programming onto later weeks at the same Eastern wall-clock times. Each copy is checked
  // against the rules at its new time (rights, release, overlaps) and created approved only if it passes; drafts are
  // not copied, premieres repeat as reruns, and primetime lineup slots stay open for new episodes.
  async function repeatWeek({ sourceWeekOf, targetWeekOf, weeks = 1, apply = false, keepPrimetimeOpen = true } = {}, actorId) {
    const count = Number(weeks);
    if (!Number.isInteger(count) || count < 1 || count > 4) throw new LinearValidationError('Repeat for 1 to 4 weeks.');
    const source = weekBounds(sourceWeekOf);
    const firstTarget = weekBounds(targetWeekOf);
    if (Date.parse(firstTarget.from) <= Date.parse(source.from)) throw new LinearValidationError('Choose a target week after the source week.');
    const at = now();
    const [currentSettings, sourceEntries] = await Promise.all([store.getSettings(), store.listEntries(source.from, source.to)]);
    const originals = sourceEntries.filter((entry) => entry.status === 'approved' && entry.startAt >= source.from && entry.startAt < source.to);
    if (originals.length > 500) throw new LinearValidationError('That week has too many entries to repeat at once.');
    const videos = await store.getVideos(originals.map((entry) => entry.videoId).filter(Boolean));
    const rights = await store.getRights([...videos.values()].flatMap(rightsKeysFor));
    const results = [];
    let created = 0;
    for (let week = 0; week < count; week += 1) {
      const targetMonday = new Date(Date.parse(`${targetWeekOf}T12:00:00Z`) + week * 7 * 86_400_000).toISOString().slice(0, 10);
      const target = weekBounds(targetMonday);
      const occupied = (await store.listEntries(target.from, target.to)).map((entry) => ({ ...entry }));
      const lineupStarts = keepPrimetimeOpen ? currentSettings.primetime.map((slot) => {
        try { return Date.parse(channelLocalToUtc(`${target.dates[(slot.weekday + 6) % 7]}T${slot.time}`)); } catch { return null; }
      }).filter(Number.isFinite) : [];
      for (const entry of originals) {
        const video = entry.videoId ? videos.get(entry.videoId) : null;
        const dayIndex = source.dates.indexOf(zonedParts(Date.parse(entry.startAt)).date);
        const startAt = dayIndex >= 0 ? localStart(entry.startAt, target.dates[dayIndex]) : null;
        const item = { sourceEntryId: entry.id, targetWeekOf: targetMonday, title: '', startAt, startLabel: startAt ? channelLabel(startAt) : '', action: 'skip', reason: '' };
        item.title = entry.kind === 'break' ? 'Commercial break'
          : [video?.contentType === 'EPISODE' ? video.seriesTitle : '', video?.episodeTitle || video?.title].filter(Boolean).join(' — ') || 'Missing title';
        results.push(item);
        if (entry.kind === 'countdown') { item.title = 'Countdown'; item.reason = 'Countdowns are not repeated; add one to each new premiere.'; continue; }
        if (!startAt) { item.reason = 'That clock time does not exist on the target day (daylight saving).'; continue; }
        const candidate = {
          id: `repeat:${entry.id}:${targetMonday}`, kind: entry.kind, videoId: entry.videoId || null,
          programType: entry.kind === 'break' ? null : entry.programType === 'premiere' ? 'rerun' : entry.programType,
          startAt, endAt: new Date(Date.parse(startAt) + entry.durationSeconds * 1000).toISOString(),
          durationSeconds: entry.durationSeconds, sourceStartSeconds: entry.sourceStartSeconds || 0,
          label: entry.programType === 'premiere' ? '' : entry.label || '', notes: `Repeated from ${channelLabel(entry.startAt)}.`,
          ...(entry.kind === 'break' && entry.pod ? { pod: entry.pod } : {}),
        };
        if (Date.parse(candidate.startAt) <= at) { item.reason = 'This time has already passed.'; continue; }
        if (entry.standInFor) candidate.standInFor = entry.standInFor;
        if (!entry.standInFor && (entry.origin === 'primetime' || lineupStarts.some((slotStart) => Date.parse(candidate.startAt) <= slotStart && slotStart < Date.parse(candidate.endAt)))) {
          item.reason = 'Primetime lineup slot left open for new episodes (use Draft this week).'; continue;
        }
        const issues = approvalIssues(candidate, video, rights, at);
        if (issues.blocking.length) { item.reason = issues.blocking.join(' '); continue; }
        const conflict = occupied.find((other) => overlaps(candidate, other));
        if (conflict) { item.reason = `Conflicts with an entry already at ${channelLabel(conflict.startAt)}.`; continue; }
        if (entry.programType === 'premiere') item.note = 'Repeats as a rerun.';
        item.action = 'create';
        if (apply) {
          const timestamp = new Date(now()).toISOString();
          try {
            const { id: ignored, ...fields } = candidate;
            const stored = await store.writeEntry(null, async () => ({
              ...fields, channelId: CHANNEL_ID, status: 'approved', origin: 'repeat', repeatedFrom: entry.id,
              createdBy: actorId, createdAt: timestamp, updatedAt: timestamp, approvedBy: actorId, approvedAt: timestamp,
            }));
            item.entryId = stored.id;
            created += 1;
          } catch (error) {
            if (!(error instanceof LinearValidationError)) throw error;
            item.action = 'skip';
            item.reason = error.message;
            continue;
          }
        }
        occupied.push(candidate);
      }
    }
    if (apply) invalidate();
    return {
      applied: Boolean(apply),
      sourceWeekOf,
      created,
      planned: results.filter((item) => item.action === 'create').length,
      skipped: results.filter((item) => item.action === 'skip').length,
      items: results,
    };
  }

  // --- Commercials (spots) ---------------------------------------------------
  // Spots are the channel's own commercials: PROtv promotions, upcoming-show trailers, sponsor advertisements and
  // PROtv interstitials. An upload goes straight to Mux (never through this server); a catalog trailer is reused as is.
  const ARTWORK_HOSTS = new Set(['watchprotv.com', 'www.watchprotv.com', 'storage.googleapis.com', 'firebasestorage.googleapis.com', 'image.mux.com']);

  function describeCreative(creative, at = now()) {
    return {
      ...creative,
      typeLabel: CREATIVE_LABELS[creative.type] || creative.type,
      airableNow: creativeAirable(creative, at),
      problems: approvalProblems(creative),
    };
  }

  // Catalog titles (films, episodes, shows) with a ready public trailer that can be reused as a spot without re-encoding.
  async function trailerSources() {
    const catalog = await store.listCatalog();
    return catalog
      .filter((video) => video.approvalStatus === 'approved' && video.trailerStatus === 'ready' && video.trailerPlaybackId)
      .map((video) => ({ id: video.id, contentType: video.contentType, title: video.seriesTitle && video.contentType !== 'SERIES' ? `${video.seriesTitle} — ${video.title}` : video.title || '', durationSeconds: Number(video.trailerDuration) || 0 }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async function listCreatives() {
    const at = now();
    const creatives = await store.listCreatives();
    return [...creatives.values()]
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
      .map((creative) => describeCreative(creative, at));
  }

  async function requireCreative(id) {
    const creative = await store.getCreative(String(id || ''));
    if (!creative) throw new LinearNotFoundError('Spot not found.');
    return creative;
  }

  async function createCreative(input, actorId, { corsOrigin = '*' } = {}) {
    const fields = creativeFields(input);
    const timestamp = new Date(now()).toISOString();
    const base = {
      ...fields, status: 'draft', rightsConfirmation: '', createdBy: actorId, createdAt: timestamp, updatedAt: timestamp,
      approvedBy: null, approvedAt: null,
    };
    if (input.source === 'catalog-trailer') {
      const videoId = String(input.videoId || '');
      const video = (await store.getVideos([videoId])).get(videoId);
      if (!video || video.approvalStatus !== 'approved' || video.trailerStatus !== 'ready' || !video.trailerPlaybackId) {
        throw new CreativeValidationError('That title has no ready, public trailer to reuse.');
      }
      const saved = await store.saveCreative(null, {
        ...base, source: 'catalog-trailer', sourceVideoId: video.id, muxStatus: 'ready', muxAssetId: null,
        muxPlaybackId: video.trailerPlaybackId, playbackPolicy: 'signed', durationSeconds: Number(video.trailerDuration) || 0,
      });
      return { creative: describeCreative(saved) };
    }
    const upload = await muxApi().createDirectUpload(corsOrigin, { playbackPolicy: 'public' });
    const saved = await store.saveCreative(null, {
      ...base, source: 'upload', uploadId: upload.id, muxStatus: 'waiting-for-upload', muxAssetId: null,
      muxPlaybackId: null, playbackPolicy: 'public', durationSeconds: 0,
    });
    return { creative: describeCreative(saved), uploadUrl: upload.url };
  }

  // Follows an upload through Mux processing. Safe to call repeatedly.
  async function refreshCreative(id) {
    const creative = await requireCreative(id);
    if (creative.source !== 'upload') return describeCreative(creative);
    const patch = {};
    let assetId = creative.muxAssetId;
    if (!assetId && creative.uploadId) {
      const upload = await muxApi().getUpload(creative.uploadId);
      if (upload?.asset_id) assetId = upload.asset_id;
      else patch.muxStatus = upload?.status === 'waiting' ? 'waiting-for-upload' : String(upload?.status || 'unknown');
    }
    if (assetId) {
      const asset = await muxApi().getAsset(assetId);
      patch.muxAssetId = assetId;
      patch.muxStatus = String(asset?.status || 'unknown');
      if (asset?.status === 'ready') {
        patch.muxPlaybackId = muxApi().getPlaybackId(asset, 'public');
        patch.durationSeconds = Number(asset.duration) || 0;
      }
    }
    const saved = await store.saveCreative(creative.id, { ...creative, ...patch, updatedAt: new Date(now()).toISOString() });
    invalidate();
    return describeCreative(saved);
  }

  async function updateCreative(id, input, actorId) {
    const creative = await requireCreative(id);
    const fields = creativeFields(input, { existing: creative });
    const saved = await store.saveCreative(creative.id, {
      ...creative, ...fields, status: creative.status === 'retired' ? 'retired' : 'draft', rightsConfirmation: '',
      approvedBy: null, approvedAt: null, updatedAt: new Date(now()).toISOString(), updatedBy: actorId,
    });
    invalidate();
    return describeCreative(saved);
  }

  async function approveCreative(id, { rightsConfirmation } = {}, actorId) {
    const creative = await requireCreative(id);
    const statement = text(rightsConfirmation, 1000);
    if (statement.length < 20) {
      throw new CreativeValidationError('Say who made or owns this spot and why PROtv may air it (at least 20 characters), for example "Produced by PROtv" or "Supplied by the sponsor under the November 2026 order".');
    }
    const problems = approvalProblems(creative);
    if (problems.length) throw new CreativeValidationError(problems.join(' '));
    const timestamp = new Date(now()).toISOString();
    const saved = await store.saveCreative(creative.id, {
      ...creative, status: 'approved', rightsConfirmation: statement, approvedBy: actorId, approvedAt: timestamp, updatedAt: timestamp,
    });
    invalidate();
    return describeCreative(saved);
  }

  // A retired spot stops airing at once (its time shows the PROtv card) and cannot be added to new breaks.
  async function retireCreative(id, actorId) {
    const creative = await requireCreative(id);
    const saved = await store.saveCreative(creative.id, {
      ...creative, status: 'retired', updatedAt: new Date(now()).toISOString(), updatedBy: actorId,
    });
    invalidate();
    return describeCreative(saved);
  }

  function assertEditable(entry) {
    if (Date.parse(entry.startAt) <= now() && entry.status === 'approved') {
      throw new LinearValidationError('This entry is on air or has aired. Remove it instead of editing it.');
    }
  }

  // Chooses the spots for a break: an explicit list, or a deterministic fill from approved, in-flight spots.
  // Changing a break returns it to draft for approval, like any other edit.
  async function setBreakPod(entryId, { creativeIds = [], autofill = false } = {}, actorId) {
    const entry = await store.getEntry(String(entryId || ''));
    if (!entry) throw new LinearNotFoundError('Schedule entry not found.');
    if (entry.kind !== 'break') throw new LinearValidationError('Spots go into commercial breaks.');
    assertEditable(entry);
    const creatives = await store.listCreatives();
    const pod = autofill
      ? autofillPod(creatives, entry.durationSeconds, { seed: entry.id, at: Date.parse(entry.startAt) })
      : validatePod(creativeIds, creatives, entry.durationSeconds);
    const updated = await store.writeEntry(entry.id, async (current) => ({
      ...current, pod, status: 'draft', approvedBy: null, approvedAt: null,
      updatedAt: new Date(now()).toISOString(), updatedBy: actorId,
    }));
    invalidate();
    return (await describeEntries([updated]))[0];
  }

  // A premiere countdown is an ordinary schedule entry in the minutes just before its program, so it shares the
  // program's single authoritative timeline (overlap checks, guide, approval, refreshes). It never releases anything.
  async function addCountdown(programEntryId, input = {}, actorId) {
    const program = await store.getEntry(String(programEntryId || ''));
    if (!program) throw new LinearNotFoundError('Schedule entry not found.');
    if (program.kind !== 'program') throw new LinearValidationError('Countdowns lead into a program.');
    const minutes = Number(input.minutes);
    if (!COUNTDOWN_MINUTES.includes(minutes)) throw new LinearValidationError(`A countdown lasts ${COUNTDOWN_MINUTES.join(', ')} minutes.`);
    const artworkUrl = text(input.artworkUrl, 1000);
    if (artworkUrl) {
      let url;
      try { url = new URL(artworkUrl); } catch { throw new LinearValidationError('The countdown artwork link is invalid.'); }
      if (url.protocol !== 'https:' || !ARTWORK_HOSTS.has(url.hostname)) {
        throw new LinearValidationError('Use PROtv artwork (watchprotv.com, PROtv storage or Mux images) for the countdown.');
      }
    }
    const durationSeconds = minutes * 60;
    const startAt = new Date(Date.parse(program.startAt) - durationSeconds * 1000).toISOString();
    if (Date.parse(startAt) <= now()) throw new LinearValidationError('It is too late to add a countdown of that length before this program.');
    const siblings = await store.listEntries(new Date(Date.parse(startAt) - 3_600_000).toISOString(), program.startAt);
    if (siblings.some((entry) => entry.kind === 'countdown' && entry.forEntryId === program.id)) {
      throw new LinearValidationError('This program already has a countdown. Remove it first to change it.');
    }
    const creatives = await store.listCreatives();
    const capacity = durationSeconds - COUNTDOWN_CLOCK_SECONDS;
    const pod = input.autofill
      ? autofillPod(creatives, capacity, { seed: `countdown:${program.id}`, at: Date.parse(startAt) })
      : validatePod(Array.isArray(input.creativeIds) ? input.creativeIds : [], creatives, capacity);
    const timestamp = new Date(now()).toISOString();
    const created = await store.writeEntry(null, async () => ({
      kind: 'countdown', programType: null, videoId: null, forEntryId: program.id,
      startAt, endAt: program.startAt, durationSeconds, sourceStartSeconds: 0, label: 'Countdown', notes: '',
      countdown: { minutes, showEpisodeTitle: input.showEpisodeTitle !== false, artworkUrl },
      pod, channelId: CHANNEL_ID, status: 'draft', origin: 'countdown',
      createdBy: actorId, createdAt: timestamp, updatedAt: timestamp, approvedBy: null, approvedAt: null,
    }));
    invalidate();
    return (await describeEntries([created]))[0];
  }

  // Programming block: titles played back to back from a start time, with an optional commercial break between
  // programs (never inside one). Everything is created as drafts; if any part fails, nothing is kept.
  async function buildBlock({ startAtLocal, fold, items, breakSeconds = 0, fillBreaks = true } = {}, actorId) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 24) throw new LinearValidationError('A block holds 1 to 24 programs.');
    const gap = Number(breakSeconds) || 0;
    if (gap && (!Number.isInteger(gap) || gap < 15 || gap > 600)) throw new LinearValidationError('Breaks between programs last 15 seconds to 10 minutes.');
    const created = [];
    try {
      let previous = null;
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index] || {};
        const entry = await createEntry({
          kind: 'program', videoId: item.videoId, programType: item.programType || 'movie',
          durationSeconds: item.durationSeconds, label: item.label,
          ...(previous ? { afterEntryId: previous.id } : { startAtLocal, fold }),
        }, actorId);
        created.push(entry);
        previous = entry;
        if (gap && index < items.length - 1) {
          let pause = await createEntry({ kind: 'break', durationSeconds: gap, label: 'Commercial break', afterEntryId: previous.id }, actorId);
          created.push(pause);
          if (fillBreaks) pause = await setBreakPod(pause.id, { autofill: true }, actorId);
          created[created.length - 1] = pause;
          previous = pause;
        }
      }
    } catch (error) {
      for (const entry of created) await store.deleteEntry(entry.id);
      invalidate();
      throw error;
    }
    return { created };
  }

  return {
    addCountdown, approveCreative, approveEntry, buildBlock, channelState, createCreative, createEntry, deleteEntry,
    draftPrimetimeWeek, entryOnAir, invalidate, listCreatives, listSchedule, programs, refreshCreative, repeatWeek,
    retireCreative, rightsReview, setBreakPod, trailerSources, setRights, settings, status, updateCreative, updateEntry, updateSettings,
    weekCoverage, withdrawEntry,
  };

}

module.exports = { LAUNCH_CONFIRMATION, LinearNotFoundError, createLinearService };

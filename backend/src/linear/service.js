const {
  CHANNEL_ID, LinearValidationError, PROGRAM_LABELS,
  airState, approvalIssues, entryFields, knownDuration, linearRightsFor, normalizeSeriesTitle, overlaps,
  pendingRelease, playableAt, publicItem, rightsKeysFor, validateLineup, validateRightsInput,
} = require('./model');
const { channelLabel, channelLocalToUtc, channelWeekDates, ChannelTimeError, zonedParts } = require('./time');
const { seriesKey } = require('../catalog/readModel');
const { agreementFinding } = require('./agreementReview');

const GUIDE_HOURS = 24;
// A 24/7 schedule reads ~150 documents per refresh; 30 s keeps that to a few dollars a month per busy server instance.
// Rights withdrawals and unpublishing take effect within this time; admin edits clear it immediately on that instance.
const CACHE_MS = 30_000;
const LAUNCH_CONFIRMATION = 'LAUNCH PROtv LIVE';

class LinearNotFoundError extends Error {}

function createLinearService({
  store,
  now = () => Date.now(),
  signPlaybackToken = (playbackId, duration) => require('../mux').signPlayback(playbackId, duration),
  cacheMs = CACHE_MS,
} = {}) {
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
    const rights = await store.getRights([...videos.values()].flatMap(rightsKeysFor));
    const loaded = { loadedAt: at, settings, entries: approved, videos, rights };
    if (!fresh) cache = loaded;
    return loaded;
  }

  function invalidate() { cache = null; }

  async function channelState({ preview = false } = {}) {
    const at = now();
    const { settings, entries, videos, rights } = await loadWindow(at);
    if (settings.status !== 'public' && !preview) throw new LinearNotFoundError('PROtv LIVE is not available.');
    const slots = entries
      .filter((entry) => Date.parse(entry.endAt) > at)
      .map((entry) => {
        const video = entry.videoId ? videos.get(entry.videoId) : null;
        return { entry, video, state: airState(entry, video, rights, at) };
      })
      .filter((slot) => slot.state !== 'unavailable');
    const current = slots.find(({ entry }) => Date.parse(entry.startAt) <= at);
    const upcoming = slots.filter(({ entry }) => Date.parse(entry.startAt) > at);
    const next = upcoming[0] || null;
    // A future slot shows full details only when its title is already public; it is not "playing" yet.
    const listed = ({ entry, video, state }) => ({
      ...publicItem(entry, video, state),
      state: entry === current?.entry ? state : state === 'playing' ? 'scheduled' : state,
    });

    let nowItem;
    let refreshAt = next ? Date.parse(next.entry.startAt) : at + 60_000;
    if (!current) {
      nowItem = {
        kind: 'off-air', state: 'off-air', title: 'PROtv LIVE',
      subtitle: next ? `Up next: ${channelLabel(next.entry.startAt)}` : 'Programming will resume soon.',
      };
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
    const title = entry.kind === 'break' ? 'Commercial break'
      : [video?.contentType === 'EPISODE' ? video.seriesTitle : '', video?.episodeTitle || video?.title].filter(Boolean).join(' — ');
    return { entry, title };
  }

  // --- Administration ------------------------------------------------------

  async function describeEntries(entries) {
    const videos = await store.getVideos(entries.map((entry) => entry.videoId).filter(Boolean));
    const rights = await store.getRights([...videos.values()].flatMap(rightsKeysFor));
    const at = now();
    return entries.map((entry) => {
      const video = entry.videoId ? videos.get(entry.videoId) : null;
      const issues = approvalIssues(entry, video, rights, at);
      return {
        ...entry,
        startLabel: channelLabel(entry.startAt),
        endLabel: channelLabel(entry.endAt),
        typeLabel: entry.kind === 'break' ? 'Commercial break' : PROGRAM_LABELS[entry.programType],
        title: entry.kind === 'break' ? (entry.label || 'Commercial break') : video
          ? [video.contentType === 'EPISODE' ? video.seriesTitle : '', video.episodeTitle || video.title].filter(Boolean).join(' — ')
          : 'Missing title',
        released: video ? playableAt(video, at) : false,
        linearRights: video ? linearRightsFor(video, rights, Date.parse(entry.startAt)).status : null,
        airState: entry.status === 'approved' ? airState(entry, video, rights, Math.max(at, Date.parse(entry.startAt))) : null,
        issues,
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

  async function createEntry(input, actorId) {
    const video = input?.kind === 'break' ? null : (await store.getVideos([String(input?.videoId || '')])).get(input?.videoId) || null;
    if (input?.kind !== 'break' && !video) throw new LinearValidationError('That title is not in the PROtv catalog.');
    const fields = entryFields(input, { video, previousEndAt: await resolveStart(input) });
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
    const merged = {
      kind: existing.kind, videoId: existing.videoId, programType: existing.programType,
      durationSeconds: existing.durationSeconds, sourceStartSeconds: existing.sourceStartSeconds,
      label: existing.label, notes: existing.notes, ...input,
    };
    const video = merged.kind === 'break' ? null : (await store.getVideos([merged.videoId])).get(merged.videoId) || null;
    if (merged.kind !== 'break' && !video) throw new LinearValidationError('That title is not in the PROtv catalog.');
    const previousEndAt = (await resolveStart(merged)) || (merged.startAtLocal ? null : existing.startAt);
    const fields = entryFields(merged, { video, previousEndAt });
    if (Date.parse(fields.endAt) <= now()) throw new LinearValidationError('This slot would already have ended.');
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
    const record = { ...validateRightsInput(input), recordedBy: actorId, recordedAt: new Date(now()).toISOString() };
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

  function localStart(iso, targetDate) {
    const local = `${targetDate}T${zonedParts(Date.parse(iso)).time}`;
    try {
      return channelLocalToUtc(local);
    } catch (error) {
      if (!(error instanceof ChannelTimeError)) throw error;
      if (/occurs twice/.test(error.message)) return channelLocalToUtc(local, { fold: 'first' });
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
        if (!startAt) { item.reason = 'That clock time does not exist on the target day (daylight saving).'; continue; }
        const candidate = {
          id: `repeat:${entry.id}:${targetMonday}`, kind: entry.kind, videoId: entry.videoId || null,
          programType: entry.kind === 'break' ? null : entry.programType === 'premiere' ? 'rerun' : entry.programType,
          startAt, endAt: new Date(Date.parse(startAt) + entry.durationSeconds * 1000).toISOString(),
          durationSeconds: entry.durationSeconds, sourceStartSeconds: entry.sourceStartSeconds || 0,
          label: entry.programType === 'premiere' ? '' : entry.label || '', notes: `Repeated from ${channelLabel(entry.startAt)}.`,
        };
        if (Date.parse(candidate.startAt) <= at) { item.reason = 'This time has already passed.'; continue; }
        if (entry.origin === 'primetime' || lineupStarts.some((slotStart) => Date.parse(candidate.startAt) <= slotStart && slotStart < Date.parse(candidate.endAt))) {
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

  return {
    approveEntry, channelState, createEntry, deleteEntry, draftPrimetimeWeek, entryOnAir, invalidate, listSchedule,
    programs, repeatWeek, rightsReview, setRights, settings, status, updateEntry, updateSettings, weekCoverage, withdrawEntry,
  };
}

module.exports = { LAUNCH_CONFIRMATION, LinearNotFoundError, createLinearService };

// PROtv LIVE viewer logic, kept free of React so it can be tested directly.
export const CHANNEL_TIME_ZONE = 'America/New_York';
export const DRIFT_TOLERANCE_SECONDS = 8;
export const HEARTBEAT_SECONDS = 60;

// Anchors the server clock using the midpoint of the request, so a slow network or a wrong device clock
// does not shift where the viewer joins.
export function createServerClock({ serverTimeMs, requestStartedAt, responseReceivedAt }) {
  const localMidpoint = requestStartedAt + Math.max(0, responseReceivedAt - requestStartedAt) / 2;
  return { serverMs: serverTimeMs, localMs: localMidpoint };
}

export function serverNow(clock, localNow = Date.now()) {
  return clock.serverMs + (localNow - clock.localMs);
}

// Where in the video the channel is right now. Never past the end of the scheduled segment.
export function livePosition(playback, clock, localNow = Date.now()) {
  if (!playback) return 0;
  const elapsed = (serverNow(clock, localNow) - clock.serverMs) / 1000;
  return Math.min(playback.sourceEndSeconds, Math.max(playback.sourceStartSeconds, playback.offsetSeconds + elapsed));
}

export function segmentFinished(playback, clock, localNow = Date.now()) {
  return Boolean(playback) && livePosition(playback, clock, localNow) >= playback.sourceEndSeconds - 0.5;
}

export function needsResync(currentTime, expected, tolerance = DRIFT_TOLERANCE_SECONDS) {
  return Number.isFinite(currentTime) && Math.abs(currentTime - expected) > tolerance;
}

// A viewer seek (scrubbing, keyboard or a remote) is undone unless it lands within a few seconds of live.
export function seekAllowed(target, expected) {
  return Math.abs(target - expected) <= 3;
}

// Everyone re-asks shortly after a programme boundary; a little spread keeps them from arriving in the same instant.
export function refreshDelay(refreshAfterMs, random = Math.random) {
  return Math.max(1_000, Number(refreshAfterMs) || 60_000) + 250 + Math.floor(random() * 2_250);
}

export function retryDelay(attempt) {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt));
}

export function formatChannelTime(iso) {
  return `${new Intl.DateTimeFormat('en-US', { timeZone: CHANNEL_TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))} ET`;
}

export function channelDate(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHANNEL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function channelDayLabel(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: CHANNEL_TIME_ZONE, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(iso));
}

// Minutes after Eastern midnight, for laying entries out on a day timeline.
export function channelMinutes(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: CHANNEL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

// Gaps of a minute or more between guide slots are shown as off air, never filled with anything unscheduled.
export function withGaps(guide = []) {
  const items = [];
  guide.forEach((item, index) => {
    const previous = guide[index - 1];
    if (previous && Date.parse(item.startAt) - Date.parse(previous.endAt) >= 60_000) {
      items.push({ entryId: `gap-${previous.endAt}`, kind: 'gap', startAt: previous.endAt, endAt: item.startAt, label: 'Off air', title: 'Programming resumes soon' });
    }
    items.push(item);
  });
  return items;
}

// After this long with no interaction the player stops and asks; nothing streams (or is billed) to an empty room.
export const STILL_WATCHING_AFTER_MS = 3 * 60 * 60 * 1000;

export function stillWatchingDue({ lastInteractionAt, now, playing, limitMs = STILL_WATCHING_AFTER_MS }) {
  return Boolean(playing) && now - lastInteractionAt >= limitMs;
}

export function guideByDay(guide = []) {
  const days = [];
  for (const item of withGaps(guide)) {
    const date = channelDate(item.startAt);
    let day = days.find((candidate) => candidate.date === date);
    if (!day) {
      day = { date, label: channelDayLabel(item.startAt), items: [] };
      days.push(day);
    }
    day.items.push(item);
  }
  return days;
}

// Counts seconds of real, unpaused, in-order playback for once-a-minute watch-time heartbeats.
export function createWatchMeter({ player, now = () => performance.now() }) {
  let seconds = 0;
  let previousMedia = player.currentTime;
  let previousWall = now();
  const tick = () => {
    const media = player.currentTime;
    const wall = now();
    const mediaDelta = media - previousMedia;
    const wallDelta = (wall - previousWall) / 1000;
    if (!player.paused && !player.seeking && mediaDelta > 0 && mediaDelta <= wallDelta + 0.5) {
      seconds += Math.min(mediaDelta, wallDelta);
    }
    previousMedia = media;
    previousWall = wall;
  };
  const reset = () => { previousMedia = player.currentTime; previousWall = now(); };
  player.addEventListener('timeupdate', tick);
  player.addEventListener('seeked', reset);
  player.addEventListener('playing', reset);
  return {
    // Whole seconds watched since the last take, at most one heartbeat's worth.
    take() {
      tick();
      const whole = Math.min(HEARTBEAT_SECONDS, Math.floor(seconds));
      seconds = Math.max(0, seconds - whole);
      return whole;
    },
    cleanup() {
      player.removeEventListener('timeupdate', tick);
      player.removeEventListener('seeked', reset);
      player.removeEventListener('playing', reset);
    },
  };
}

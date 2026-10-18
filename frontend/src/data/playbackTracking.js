export const QUALIFIED_VIEW_SECONDS = 30;
const GUEST_ID_KEY = 'protv.playbackGuestId';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrCreatePlaybackGuestId(storage, randomUUID = () => crypto.randomUUID()) {
  try {
    const persistentStorage = storage || window.localStorage;
    const existing = persistentStorage.getItem(GUEST_ID_KEY);
    if (UUID_PATTERN.test(existing || '')) return existing;
    const guestId = randomUUID();
    persistentStorage.setItem(GUEST_ID_KEY, guestId);
    return guestId;
  } catch (error) {
    console.warn('Persistent guest playback deduplication is unavailable:', error.message);
    return randomUUID();
  }
}

export function createPlaybackTracker({
  player,
  videoId,
  guestId,
  onEvent,
  now = () => performance.now(),
  createSessionId = () => crypto.randomUUID(),
  thresholdSeconds = QUALIFIED_VIEW_SECONDS,
}) {
  let session = null;
  let adsActive = false;
  let buffering = true;
  let seeking = false;
  let active = false;
  let previousTime = player.currentTime;
  let previousWallTime = now();
  let playedSeconds = 0;
  let disposed = false;

  const checkpoint = (wasActive = active) => {
    const wallTime = now();
    const mediaTime = player.currentTime;
    if (wasActive) {
      const wallDelta = Math.max(0, (wallTime - previousWallTime) / 1000);
      const mediaDelta = mediaTime - previousTime;
      const playbackRate = Number(player.playbackRate);
      if (mediaDelta > 0 && playbackRate > 0
        && mediaDelta <= wallDelta * playbackRate + 0.5) {
        playedSeconds += wallDelta;
        if (session && !session.qualified && playedSeconds + 0.001 >= thresholdSeconds) {
          session.qualified = true;
          onEvent({
            eventType: 'qualified_view',
            videoId,
            sessionId: session.id,
            guestId,
            playedSeconds: thresholdSeconds,
          });
        }
      }
    }
    previousTime = mediaTime;
    previousWallTime = wallTime;
  };

  const canPlay = () => !disposed && !player.paused && !player.seeking && !seeking
    && !buffering && !adsActive && Number(player.playbackRate) > 0;

  const startIfNeeded = () => {
    if (!session) {
      session = { id: createSessionId(), started: false, qualified: false };
      playedSeconds = 0;
    }
    if (!session.started) {
      session.started = true;
      onEvent({
        eventType: 'play_start',
        videoId,
        sessionId: session.id,
        guestId,
      });
    }
  };

  const onPlaying = () => {
    checkpoint();
    buffering = false;
    if (canPlay()) startIfNeeded();
    active = canPlay();
    previousTime = player.currentTime;
    previousWallTime = now();
  };
  const onTimeUpdate = () => checkpoint();
  const onWaiting = () => {
    checkpoint();
    buffering = true;
    active = false;
  };
  const onPause = () => {
    checkpoint();
    active = false;
  };
  const onSeeking = () => {
    checkpoint(false);
    seeking = true;
    active = false;
  };
  const onSeeked = () => {
    seeking = false;
    buffering = player.readyState < 3;
    active = canPlay();
    previousTime = player.currentTime;
    previousWallTime = now();
  };
  const onRateChange = () => {
    checkpoint(false);
    active = canPlay();
    previousTime = player.currentTime;
    previousWallTime = now();
  };
  const onEnded = () => {
    checkpoint();
    active = false;
    session = null;
    playedSeconds = 0;
  };
  const onEmptied = () => {
    active = false;
    buffering = true;
    session = null;
    playedSeconds = 0;
    previousTime = player.currentTime;
    previousWallTime = now();
  };

  player.addEventListener('playing', onPlaying);
  player.addEventListener('timeupdate', onTimeUpdate);
  player.addEventListener('waiting', onWaiting);
  player.addEventListener('stalled', onWaiting);
  player.addEventListener('pause', onPause);
  player.addEventListener('seeking', onSeeking);
  player.addEventListener('seeked', onSeeked);
  player.addEventListener('ratechange', onRateChange);
  player.addEventListener('ended', onEnded);
  player.addEventListener('emptied', onEmptied);

  return {
    setAdsActive(value) {
      checkpoint();
      adsActive = Boolean(value);
      active = canPlay();
      previousTime = player.currentTime;
      previousWallTime = now();
    },
    cleanup() {
      disposed = true;
      active = false;
      player.removeEventListener('playing', onPlaying);
      player.removeEventListener('timeupdate', onTimeUpdate);
      player.removeEventListener('waiting', onWaiting);
      player.removeEventListener('stalled', onWaiting);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('seeking', onSeeking);
      player.removeEventListener('seeked', onSeeked);
      player.removeEventListener('ratechange', onRateChange);
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('emptied', onEmptied);
    },
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MuxPlayer from '@mux/mux-player-react';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import ProTVFooter from '../components/ProTVFooter';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { getOrCreatePlaybackGuestId } from '../data/playbackTracking';
import {
  HEARTBEAT_SECONDS,
  createServerClock,
  createWatchMeter,
  formatChannelTime,
  guideByDay,
  livePosition,
  needsResync,
  refreshDelay,
  retryDelay,
  seekAllowed,
  segmentFinished,
  stillWatchingDue,
} from '../data/linearChannel';
import '../styles/Live.css';

// Seeking, skipping and speed controls are hidden: PROtv LIVE plays what is on now, like television.
const LIVE_PLAYER_STYLE = {
  width: '100%',
  height: '100%',
  '--seek-backward-button': 'none',
  '--seek-forward-button': 'none',
  '--time-range': 'none',
  '--time-display': 'none',
  '--duration-display': 'none',
  '--playback-rate-button': 'none',
};

const doNotTrack = () => window.navigator.doNotTrack === '1' || window.doNotTrack === '1' || window.navigator.msDoNotTrack === '1';

function LiveProgram({ item, clock, track, onMediaError, onPlaying: onProgramPlaying }) {
  const playerRef = useRef(null);
  const [source] = useState(() => ({
    playbackId: item.playback.muxPlaybackId,
    token: item.playback.playbackToken,
    startTime: livePosition(item.playback, clock),
  }));
  const liveRef = useRef({ playback: item.playback, clock });
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const entryId = item.entryId;

  useEffect(() => {
    liveRef.current = { playback: item.playback, clock };
  }, [item.playback, clock]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    let programmatic = false;
    let started = false;
    const expected = () => livePosition(liveRef.current.playback, liveRef.current.clock);
    const goLive = () => {
      programmatic = true;
      player.currentTime = expected();
    };
    const onLoaded = () => { if (needsResync(player.currentTime, expected(), 2)) goLive(); };
    const onSeeking = () => {
      if (programmatic) {
        programmatic = false;
        return;
      }
      if (!seekAllowed(player.currentTime, expected())) goLive();
    };
    const onPause = () => setPaused(true);
    const onPlay = () => {
      setPaused(false);
      if (needsResync(player.currentTime, expected(), 3)) goLive();
    };
    const onPlaying = () => {
      onProgramPlaying();
      if (started) return;
      started = true;
      track({ eventType: 'video_start', entryId });
    };
    const onEnded = () => setFinished(true);
    const onError = () => {
      const code = player.error?.code === 2 ? 'network' : 'media';
      track({ eventType: 'error', entryId, code });
      onMediaError();
    };
    const meter = createWatchMeter({ player });
    const heartbeat = window.setInterval(() => {
      const seconds = meter.take();
      if (seconds >= 1) track({ eventType: 'heartbeat', entryId, seconds });
    }, HEARTBEAT_SECONDS * 1000);
    // Keeps every viewer on the schedule through buffering, sleep, slow devices and clock changes.
    const drift = window.setInterval(() => {
      const { playback, clock: current } = liveRef.current;
      if (segmentFinished(playback, current)) {
        player.pause();
        setFinished(true);
        return;
      }
      if (!player.paused && player.readyState >= 3 && needsResync(player.currentTime, expected())) goLive();
    }, 5_000);
    player.addEventListener('loadedmetadata', onLoaded);
    player.addEventListener('seeking', onSeeking);
    player.addEventListener('pause', onPause);
    player.addEventListener('play', onPlay);
    player.addEventListener('playing', onPlaying);
    player.addEventListener('ended', onEnded);
    player.addEventListener('error', onError);
    return () => {
      const remainder = meter.take();
      if (remainder >= 1) track({ eventType: 'heartbeat', entryId, seconds: remainder });
      meter.cleanup();
      window.clearInterval(heartbeat);
      window.clearInterval(drift);
      player.removeEventListener('loadedmetadata', onLoaded);
      player.removeEventListener('seeking', onSeeking);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('playing', onPlaying);
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('error', onError);
    };
  }, [entryId, onMediaError, onProgramPlaying, track]);

  const returnToLive = () => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = livePosition(liveRef.current.playback, liveRef.current.clock);
    void player.play?.().catch(() => {});
  };

  return (
    <div className="live-stage__player">
      <MuxPlayer
        ref={playerRef}
        streamType="on-demand"
        playbackId={source.playbackId}
        {...(source.token ? { tokens: { playback: source.token } } : {})}
        startTime={source.startTime}
        autoPlay="any"
        nohotkeys
        metadata={{ video_id: item.videoId, video_title: item.title, player_name: 'PROtv LIVE web', custom_1: 'protv-live', custom_2: entryId }}
        accentColor="#4169E1"
        style={LIVE_PLAYER_STYLE}
      />
      {paused && !finished && (
        <button type="button" className="live-return" onClick={returnToLive}>
          <span className="live-dot" aria-hidden="true" /> Return to LIVE
        </button>
      )}
      {finished && (
        <div className="live-slate live-slate--overlay" role="status">
          <p>Up next on PROtv LIVE</p>
          <span>The next program starts in a moment.</span>
        </div>
      )}
    </div>
  );
}

function Slate({ item, next }) {
  const copy = {
    'awaiting-release': { eyebrow: item.label || 'Premiere', title: item.title, body: 'The premiere is starting shortly. Stay tuned.' },
    break: { eyebrow: 'PROtv LIVE', title: 'We\'ll be right back', body: next ? `Up next: ${next.title} at ${formatChannelTime(next.startAt)}` : '' },
    'off-air': { eyebrow: 'PROtv LIVE', title: next ? `Up next: ${next.title}` : 'Programming will resume soon', body: next ? `${next.label} · ${formatChannelTime(next.startAt)}` : 'Check the guide for upcoming programs.' },
  }[item.state] || { eyebrow: 'PROtv LIVE', title: 'Programming will resume soon', body: '' };
  return (
    <div className="live-slate" role="status">
      <p>{copy.eyebrow}</p>
      <h2>{copy.title}</h2>
      {copy.body && <span>{copy.body}</span>}
    </div>
  );
}

export default function Live() {
  const [searchParams] = useSearchParams();
  const preview = searchParams.get('preview') === '1';
  const { user, loading: authLoading } = useAuth();
  const [view, setView] = useState({ phase: 'loading' });
  const [reconnecting, setReconnecting] = useState(false);
  const [generation, setGeneration] = useState(0);
  const loadRef = useRef(() => {});
  const [sessionId] = useState(() => crypto.randomUUID());
  const queueRef = useRef(Promise.resolve());
  const tunedInRef = useRef(false);

  const track = useCallback((event) => {
    if (doNotTrack()) return;
    const guestId = getOrCreatePlaybackGuestId();
    // Sequential, so the server always sees the tune-in before a start or heartbeat from the same visit.
    queueRef.current = queueRef.current
      .then(() => api.recordLinearEvent({ ...event, sessionId, guestId }))
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    document.title = 'PROtv LIVE';
  }, []);

  useEffect(() => {
    if (authLoading) return undefined;
    let disposed = false;
    let timer;
    let attempt = 0;
    let controller;
    const load = async () => {
      window.clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      const requestStartedAt = Date.now();
      try {
        const data = await api.getLinearChannel({ preview, signal: controller.signal });
        if (disposed) return;
        const clock = createServerClock({ serverTimeMs: data.serverTimeMs, requestStartedAt, responseReceivedAt: Date.now() });
        attempt = 0;
        setView({ phase: 'ready', data, clock });
        setReconnecting(false);
        if (!tunedInRef.current) {
          tunedInRef.current = true;
          track({ eventType: 'tune_in' });
        }
        timer = window.setTimeout(load, refreshDelay(data.refreshAfterMs));
      } catch (error) {
        if (disposed || error.name === 'AbortError') return;
        if (error.status === 404) {
          setView({ phase: 'unavailable' });
          return;
        }
        setReconnecting(true);
        if (tunedInRef.current) track({ eventType: 'error', code: 'schedule' });
        setView((current) => (current.phase === 'ready' ? current : { phase: 'error', message: error.message }));
        timer = window.setTimeout(load, retryDelay(attempt));
        attempt += 1;
      }
    };
    loadRef.current = load;
    void Promise.resolve().then(() => { if (!disposed) void load(); });
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const onOnline = () => { void load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [authLoading, preview, track, user]);

  const recoveryRef = useRef({ attempts: 0, timer: null });
  const [failedEntryId, setFailedEntryId] = useState(null);
  const currentEntryId = view.phase === 'ready' ? view.data.now?.entryId : null;

  // A failing stream is retried with growing pauses (2, 4, 8, 16 s); after that the viewer is told and can retry.
  const handleMediaError = useCallback(() => {
    const recovery = recoveryRef.current;
    if (recovery.timer) return;
    if (recovery.attempts >= 4) {
      setFailedEntryId(currentEntryId);
      return;
    }
    recovery.timer = window.setTimeout(() => {
      recovery.timer = null;
      recovery.attempts += 1;
      setGeneration((value) => value + 1);
      void loadRef.current();
    }, retryDelay(recovery.attempts));
  }, [currentEntryId]);

  const handlePlaying = useCallback(() => { recoveryRef.current.attempts = 0; }, []);

  const retryPlayback = () => {
    recoveryRef.current.attempts = 0;
    setFailedEntryId(null);
    setGeneration((value) => value + 1);
    void loadRef.current();
  };

  useEffect(() => {
    const recovery = recoveryRef.current;
    recovery.attempts = 0;
    return () => {
      window.clearTimeout(recovery.timer);
      recovery.timer = null;
    };
  }, [currentEntryId]);

  // Unattended playback is stopped after a few hours, so Mux delivery is only spent on someone actually watching.
  const [askStillWatching, setAskStillWatching] = useState(false);
  const lastInteractionRef = useRef(0);
  const isPlayingProgram = view.phase === 'ready' && view.data.now?.state === 'playing';
  useEffect(() => {
    lastInteractionRef.current = Date.now();
    const touch = () => { lastInteractionRef.current = Date.now(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, touch));
  }, []);
  useEffect(() => {
    const check = window.setInterval(() => {
      if (stillWatchingDue({ lastInteractionAt: lastInteractionRef.current, now: Date.now(), playing: isPlayingProgram })) {
        setAskStillWatching(true);
      }
    }, 60_000);
    return () => window.clearInterval(check);
  }, [isPlayingProgram]);
  const keepWatching = () => {
    lastInteractionRef.current = Date.now();
    setAskStillWatching(false);
    setGeneration((value) => value + 1);
    void loadRef.current();
  };

  if (view.phase === 'unavailable') {
    return (
      <ProTVShell>
        <ProTVHeader />
        <main className="live-page live-page--state">
          <h1>PROtv LIVE is coming soon</h1>
          <p>Our scheduled channel is not on the air yet. Everything on PROtv is still available to watch on demand.</p>
          <Link className="live-cta" to="/">Browse PROtv</Link>
        </main>
        <ProTVFooter />
      </ProTVShell>
    );
  }

  const data = view.phase === 'ready' ? view.data : null;
  const nowItem = data?.now;
  const days = guideByDay(data?.guide);

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="live-page">
        {data?.channel?.preview && (
          <p className="live-preview" role="note">Administrator preview. PROtv LIVE is {data.channel.status === 'public' ? 'public' : 'not public yet'}.</p>
        )}
        <section className="live-stage" aria-label="PROtv LIVE">
          <div className="live-stage__screen">
            <span className="live-badge" aria-label="Live channel"><span className="live-dot" aria-hidden="true" />LIVE</span>
            {view.phase === 'loading' && <div className="live-slate" role="status"><p>PROtv LIVE</p><h2>Tuning in…</h2></div>}
            {view.phase === 'error' && (
              <div className="live-slate" role="alert"><p>PROtv LIVE</p><h2>Reconnecting…</h2><span>{view.message}</span></div>
            )}
            {nowItem?.state === 'playing' && nowItem.playback && askStillWatching && (
              <div className="live-slate" role="alertdialog" aria-label="Are you still watching?">
                <p>PROtv LIVE</p>
                <h2>Are you still watching?</h2>
                <span>The channel paused because nobody has interacted for a while.</span>
                <button type="button" className="live-cta" onClick={keepWatching}>Continue watching LIVE</button>
              </div>
            )}
            {nowItem?.state === 'playing' && nowItem.playback && failedEntryId === nowItem.entryId && !askStillWatching && (
              <div className="live-slate" role="alert">
                <p>PROtv LIVE</p>
                <h2>This program can&rsquo;t play right now</h2>
                <span>Your browser or connection could not play the stream.</span>
                <button type="button" className="live-cta" onClick={retryPlayback}>Try again</button>
              </div>
            )}
            {nowItem?.state === 'playing' && nowItem.playback && failedEntryId !== nowItem.entryId && !askStillWatching
              ? <LiveProgram key={`${nowItem.entryId}:${generation}`} item={nowItem} clock={view.clock} track={track} onMediaError={handleMediaError} onPlaying={handlePlaying} />
              : nowItem && !(nowItem.state === 'playing' && nowItem.playback) && <Slate item={nowItem} next={data.next} />}
            {reconnecting && view.phase === 'ready' && <p className="live-reconnecting" role="status">Reconnecting to the schedule…</p>}
          </div>
          <div className="live-now">
            <p className="live-now__eyebrow">{nowItem?.state === 'playing' ? `On now · ${nowItem.label}` : 'PROtv LIVE'}</p>
            <h1>{nowItem?.title || 'PROtv LIVE'}</h1>
            {nowItem?.subtitle && <p className="live-now__subtitle">{nowItem.subtitle}</p>}
            {nowItem?.startAt && <p className="live-now__time">{formatChannelTime(nowItem.startAt)} – {formatChannelTime(nowItem.endAt)}</p>}
            {nowItem?.description && <p className="live-now__description">{nowItem.description}</p>}
            {data?.next && (
              <div className="live-next">
                <p>Up next · {formatChannelTime(data.next.startAt)}</p>
                <strong>{data.next.title}</strong>
                {data.next.subtitle && <span>{data.next.subtitle}</span>}
              </div>
            )}
          </div>
        </section>

        <section className="live-guide" aria-labelledby="live-guide-title">
          <h2 id="live-guide-title">Channel guide <span>All times Eastern</span></h2>
          {data && days.length === 0 && <p className="live-guide__empty">No programs are scheduled in the next 24 hours.</p>}
          {days.map((day) => (
            <div key={day.date} className="live-guide__day">
              <h3>{day.label}</h3>
              <ol>
                {day.items.map((item) => (
                  <li key={item.entryId} className={item.onNow ? 'is-now' : item.kind === 'gap' ? 'is-gap' : ''}>
                    <time dateTime={item.startAt}>{formatChannelTime(item.startAt)}</time>
                    <div>
                      <span className="live-guide__label">{item.onNow ? 'On now' : item.label}</span>
                      <strong>{item.title}</strong>
                      {item.subtitle && <span className="live-guide__subtitle">{item.subtitle}</span>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      </main>
      <ProTVFooter />
    </ProTVShell>
  );
}

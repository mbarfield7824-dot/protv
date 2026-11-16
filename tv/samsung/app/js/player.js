/*
 * PROtv Samsung - playback.
 *
 * AVPlayAdapter   Samsung's native player (webapis.avplay), the supported HLS path on Tizen TVs.
 * Html5Adapter    <video> fallback used only when AVPlay is absent (desktop browser preview).
 * createSession   adapter-independent controller: authorization, resume, seek accumulation,
 *                 progress checkpoints, stall/expiry recovery and app suspend/resume.
 *
 * Every play is re-authorized through GET /v1/catalog/titles/:id/playback, which applies the
 * Samsung rights policy, so a title withdrawn on the server cannot keep playing from a stale catalog.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PROtv = root.PROtv || {}; root.PROtv.player = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PLAYBACK_ID = /^[A-Za-z0-9]{10,128}$/;
  var TOKEN = /^[A-Za-z0-9_.-]{20,4096}$/;
  var MAX_RECOVERIES = 3;
  var SEEK_COMMIT_MS = 650;

  function streamUrl(payload, policy) {
    if (!payload || typeof payload !== 'object') return { error: 'invalid' };
    if (policy && payload.platformPolicy !== policy) return { error: 'policy' };
    var id = payload.muxPlaybackId;
    if (!PLAYBACK_ID.test(id || '')) return { error: 'invalid' };
    var url = 'https://stream.mux.com/' + id + '.m3u8';
    if (payload.playbackToken !== undefined) {
      if (!TOKEN.test(payload.playbackToken || '')) return { error: 'invalid' };
      url += '?token=' + encodeURIComponent(payload.playbackToken);
    }
    return { url: url, playbackId: id, signed: payload.playbackToken !== undefined };
  }

  function clampSeek(target, duration) {
    var max = duration > 10 ? duration - 5 : duration;
    return Math.max(0, Math.min(Math.floor(target), Math.max(0, Math.floor(max))));
  }

  function clock(seconds) {
    var total = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var mm = (h && m < 10 ? '0' : '') + m;
    return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------------- Samsung AVPlay ---------------- */
  function AVPlayAdapter(avplay, events) {
    this.avplay = avplay;
    this.events = events;
    this.url = '';
  }

  AVPlayAdapter.prototype.open = function (url, startSeconds) {
    var self = this;
    var av = this.avplay;
    var events = this.events;
    this.url = url;
    try { av.stop(); } catch (error) { /* idle */ }
    try { av.close(); } catch (error) { /* idle */ }
    try {
      av.open(url);
      av.setDisplayRect(0, 0, 1920, 1080);
      try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (error) { /* older firmware */ }
      av.setListener({
        onbufferingstart: function () { events.buffering(true); },
        onbufferingprogress: function () {},
        onbufferingcomplete: function () { events.buffering(false); },
        oncurrentplaytime: function (ms) { events.time(ms / 1000); },
        onstreamcompleted: function () { events.ended(); },
        onevent: function () {},
        onerror: function (type) { events.error(String(type || 'PLAYER_ERROR')); },
        ondrmevent: function () {},
        onsubtitlechange: function () {},
      });
    } catch (error) {
      events.error('OPEN_FAILED');
      return;
    }
    av.prepareAsync(function () {
      var begin = function () {
        try { av.play(); events.playing(true); events.duration(av.getDuration() / 1000); } catch (error) { events.error('PLAY_FAILED'); }
      };
      if (startSeconds > 0) {
        av.seekTo(startSeconds * 1000, begin, begin);
      } else begin();
    }, function (error) {
      events.error(String((error && error.name) || 'PREPARE_FAILED'));
    });
    return self;
  };

  AVPlayAdapter.prototype.play = function () {
    try { this.avplay.play(); this.events.playing(true); } catch (error) { this.events.error('PLAY_FAILED'); }
  };
  AVPlayAdapter.prototype.pause = function () {
    try { this.avplay.pause(); this.events.playing(false); } catch (error) { /* not playing */ }
  };
  AVPlayAdapter.prototype.seek = function (seconds) {
    var events = this.events;
    events.buffering(true);
    try {
      this.avplay.seekTo(Math.floor(seconds * 1000), function () { events.buffering(false); events.time(seconds); }, function () { events.buffering(false); });
    } catch (error) { events.buffering(false); }
  };
  AVPlayAdapter.prototype.time = function () {
    try { return this.avplay.getCurrentTime() / 1000; } catch (error) { return 0; }
  };
  AVPlayAdapter.prototype.duration = function () {
    try { return this.avplay.getDuration() / 1000; } catch (error) { return 0; }
  };
  AVPlayAdapter.prototype.suspend = function () {
    try { this.avplay.suspend(); } catch (error) { /* not open */ }
  };
  AVPlayAdapter.prototype.restore = function () {
    try { this.avplay.restore(); } catch (error) { this.events.error('RESTORE_FAILED'); }
  };
  AVPlayAdapter.prototype.close = function () {
    try { this.avplay.stop(); } catch (error) { /* idle */ }
    try { this.avplay.close(); } catch (error) { /* idle */ }
  };

  /* ---------------- HTML5 fallback (browser preview) ---------------- */
  function Html5Adapter(video, events) {
    var self = this;
    this.video = video;
    this.events = events;
    this.handlers = {
      waiting: function () { events.buffering(true); },
      playing: function () { events.buffering(false); events.playing(true); },
      pause: function () { events.playing(false); },
      timeupdate: function () { events.time(video.currentTime); },
      durationchange: function () { if (isFinite(video.duration)) events.duration(video.duration); },
      ended: function () { events.ended(); },
      error: function () { events.error('MEDIA_ERR_' + ((video.error && video.error.code) || 0)); },
      seeked: function () { events.buffering(false); },
    };
    Object.keys(this.handlers).forEach(function (name) { video.addEventListener(name, self.handlers[name]); });
  }

  Html5Adapter.prototype.open = function (url, startSeconds) {
    var video = this.video;
    var events = this.events;
    if (!video.canPlayType('application/vnd.apple.mpegurl') && !video.canPlayType('application/x-mpegURL')) {
      events.error('HLS_UNSUPPORTED');
      return;
    }
    video.src = url;
    var started = false;
    var onMeta = function () {
      video.removeEventListener('loadedmetadata', onMeta);
      if (startSeconds > 0) video.currentTime = startSeconds;
      started = true;
      var attempt = video.play();
      if (attempt && attempt.catch) attempt.catch(function () { events.playing(false); });
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.load();
    return started;
  };
  Html5Adapter.prototype.play = function () { var p = this.video.play(); if (p && p.catch) p.catch(function () {}); };
  Html5Adapter.prototype.pause = function () { this.video.pause(); };
  Html5Adapter.prototype.seek = function (seconds) { this.events.buffering(true); this.video.currentTime = seconds; };
  Html5Adapter.prototype.time = function () { return this.video.currentTime || 0; };
  Html5Adapter.prototype.duration = function () { return isFinite(this.video.duration) ? this.video.duration : 0; };
  Html5Adapter.prototype.suspend = function () { this.video.pause(); };
  Html5Adapter.prototype.restore = function () { this.play(); };
  Html5Adapter.prototype.close = function () {
    var self = this;
    this.video.pause();
    Object.keys(this.handlers).forEach(function (name) { self.video.removeEventListener(name, self.handlers[name]); });
    this.video.removeAttribute('src');
    try { this.video.load(); } catch (error) { /* detached */ }
  };

  /*
   * Session controller.
   * deps: {createAdapter(events), authorize(item) -> Promise<{url}|{error}>, saveProgress(item, pos, dur, force),
   *        onState(state), setTimer, clearTimer, isOnline()}
   * state: {phase: loading|playing|paused|buffering|ended|error|recovering, position, duration, error}
   */
  function createSession(deps) {
    var adapter = null;
    var item = null;
    var state = { phase: 'idle', position: 0, duration: 0, error: '', buffering: false, seekTarget: null };
    var lastSaved = 0;
    var recoveries = 0;
    var seekTimer = null;
    var recoveryTimer = null;
    var closed = true;
    var suspended = false;
    var playingBeforeSuspend = false;

    function publish(patch) {
      Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
      if (deps.onState) deps.onState(state);
    }

    function checkpoint(force) {
      if (!item || !(state.duration > 0)) return;
      var position = Math.floor(state.position);
      var due = force ? position !== lastSaved && position > 0 : Math.abs(position - lastSaved) >= 20;
      if (!due) return;
      lastSaved = position;
      deps.saveProgress(item, position, Math.floor(state.duration), Boolean(force));
    }

    var events = {
      buffering: function (on) {
        if (closed) return;
        // A seek (or AVPlay rebuffer) while paused/ended/errored must not flip the UI to "playing":
        // AVPlay stays paused after seekTo, so only the buffering flag changes.
        if (state.phase === 'paused' || state.phase === 'ended' || state.phase === 'error') { publish({ buffering: on }); return; }
        publish({ buffering: on, phase: on ? 'buffering' : (state.phase === 'buffering' ? 'playing' : state.phase) });
      },
      time: function (seconds) {
        if (closed || !isFinite(seconds)) return;
        if (seconds > 0) recoveries = 0;
        publish({ position: seconds });
        checkpoint(false);
      },
      duration: function (seconds) { if (!closed && seconds > 0) publish({ duration: seconds }); },
      playing: function (on) { if (!closed) publish({ phase: on ? 'playing' : 'paused', buffering: false }); },
      ended: function () {
        if (closed) return;
        state.position = state.duration || state.position;
        checkpoint(true);
        publish({ phase: 'ended' });
      },
      error: function (code) { if (!closed) recover(code); },
    };

    function open(startSeconds) {
      publish({ phase: 'loading', error: '' });
      return deps.authorize(item).then(function (result) {
        if (closed) return;
        if (!result || result.error) {
          publish({ phase: 'error', error: (result && result.error) || 'authorize' });
          return;
        }
        if (adapter) adapter.close();
        adapter = deps.createAdapter(events);
        adapter.open(result.url, startSeconds);
      });
    }

    // Stalls, network loss and an expired signed URL all end the same way: reauthorize and reopen
    // at the last known position. Unsupported media and policy/authorization failures are final.
    function recover(code) {
      var fatal = code === 'HLS_UNSUPPORTED' || code === 'MEDIA_ERR_4' || code === 'PLAYER_ERROR_NOT_SUPPORTED_FILE' || code === 'PLAYER_ERROR_INVALID_URI';
      if (fatal || recoveries >= MAX_RECOVERIES) {
        checkpoint(true);
        publish({ phase: 'error', error: code });
        return;
      }
      recoveries += 1;
      checkpoint(true);
      publish({ phase: 'recovering', error: code });
      var resumeAt = Math.floor(state.position);
      var attempt = function () {
        recoveryTimer = null;
        if (closed) return;
        if (deps.isOnline && !deps.isOnline()) { recoveryTimer = deps.setTimer(attempt, 3000); return; }
        open(resumeAt);
      };
      recoveryTimer = deps.setTimer(attempt, 1000 * Math.pow(2, recoveries));
    }

    function start(nextItem, resumeSeconds) {
      stop();
      closed = false;
      item = nextItem;
      recoveries = 0;
      lastSaved = Math.floor(resumeSeconds || 0);
      state = { phase: 'loading', position: resumeSeconds || 0, duration: Number(nextItem.duration) || 0, error: '', buffering: false, seekTarget: null };
      return open(resumeSeconds || 0);
    }

    function toggle() {
      if (!adapter) return;
      if (state.phase === 'playing' || state.phase === 'buffering') { adapter.pause(); checkpoint(true); }
      else if (state.phase === 'paused') adapter.play();
      else if (state.phase === 'ended') { seekTo(0); adapter.play(); }
    }

    function play() { if (adapter && state.phase === 'paused') adapter.play(); }
    function pause() { if (adapter && (state.phase === 'playing' || state.phase === 'buffering')) { adapter.pause(); checkpoint(true); } }

    function seekTo(seconds) {
      if (!adapter) return;
      var target = clampSeek(seconds, state.duration || adapter.duration());
      publish({ position: target, seekTarget: null });
      adapter.seek(target);
    }

    // Repeated Left/Right presses accumulate into one seek, committed after a short pause.
    function seekBy(deltaSeconds) {
      if (!adapter || !(state.duration > 0)) return;
      var base = state.seekTarget !== null ? state.seekTarget : state.position;
      var target = clampSeek(base + deltaSeconds, state.duration);
      publish({ seekTarget: target });
      if (seekTimer !== null) deps.clearTimer(seekTimer);
      seekTimer = deps.setTimer(function () {
        seekTimer = null;
        var commit = state.seekTarget;
        if (commit !== null) seekTo(commit);
      }, SEEK_COMMIT_MS);
    }

    function suspend() {
      if (!adapter || closed || suspended) return;
      suspended = true;
      playingBeforeSuspend = state.phase === 'playing' || state.phase === 'buffering';
      checkpoint(true);
      adapter.suspend();
      publish({ phase: 'paused' });
    }

    // AVPlay.restore() returns to the pre-suspend state, so the UI phase must follow it.
    function resume() {
      if (!adapter || closed || !suspended) return;
      suspended = false;
      adapter.restore();
      if (playingBeforeSuspend && state.phase === 'paused') publish({ phase: 'playing' });
    }

    function stop() {
      if (closed) return;
      checkpoint(true);
      closed = true;
      if (seekTimer !== null) deps.clearTimer(seekTimer);
      if (recoveryTimer !== null) deps.clearTimer(recoveryTimer);
      seekTimer = null;
      recoveryTimer = null;
      if (adapter) adapter.close();
      adapter = null;
      publish({ phase: 'idle' });
    }

    function retry() {
      if (!item) return Promise.resolve();
      closed = false;
      recoveries = 0;
      return open(Math.floor(state.position));
    }

    return {
      start: start,
      toggle: toggle,
      play: play,
      pause: pause,
      seekBy: seekBy,
      seekTo: seekTo,
      suspend: suspend,
      resume: resume,
      stop: stop,
      retry: retry,
      state: function () { return state; },
      item: function () { return item; },
    };
  }

  return {
    streamUrl: streamUrl,
    clampSeek: clampSeek,
    clock: clock,
    AVPlayAdapter: AVPlayAdapter,
    Html5Adapter: Html5Adapter,
    createSession: createSession,
    MAX_RECOVERIES: MAX_RECOVERIES,
  };
});

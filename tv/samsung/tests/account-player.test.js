const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../app/js/account.js');
const PL = require('../app/js/player.js');

const SID = 'S'.repeat(43);
const SECRET = 'K'.repeat(43);
const API = 'https://watchprotv.com/api';
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;

function harness(routes) {
  const timers = [];
  let now = 1_000_000;
  const calls = [];
  const store = {};
  const deps = {
    apiBase: API,
    firebaseApiKey: 'public-web-client-key-for-tests',
    now: () => now,
    setTimer: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; },
    clearTimer: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    storage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    http: async (method, url, init) => {
      calls.push({ method, url, init });
      for (const [pattern, handler] of routes) if (pattern.test(`${method} ${url}`)) return handler(init, calls);
      return { status: 404, body: null };
    },
  };
  return {
    deps, calls, store,
    advance: async (ms) => {
      now += ms;
      for (;;) {
        const due = timers.find((t) => t.fn && t.at <= now);
        if (!due) break;
        const fn = due.fn; due.fn = null; fn();
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setImmediate(r));
      }
    },
    flush: () => new Promise((r) => setImmediate(r)),
  };
}

const created = () => ({ status: 201, body: { sessionId: SID, deviceSecret: SECRET, userCode: 'ABCD-EF23', verificationUrl: 'https://watchprotv.com/activate', expiresAt: new Date(1_000_000 + 600_000).toISOString(), interval: 5 } });

test('device-session responses are validated strictly', () => {
  assert.throws(() => A.parseDeviceSession({ ...created().body, verificationUrl: 'http://evil.example/activate' }, 1_000_000));
  assert.throws(() => A.parseDeviceSession({ ...created().body, userCode: 'abcd-efgh' }, 1_000_000));
  assert.throws(() => A.parseDeviceSession({ ...created().body, interval: 0 }, 1_000_000));
  assert.equal(A.parseDeviceSession(created().body, 1_000_000).intervalMs, 5000);
});

test('phone/computer activation: code, pending polls, approval, exchange, Firebase session saved', async () => {
  let polls = 0;
  const idToken = jwt({ user_id: 'viewer-1', email: 'viewer@example.com' });
  const h = harness([
    [/^POST .*\/auth\/device-sessions$/, created],
    [/^GET .*\/auth\/device-sessions\/S+$/, (init) => {
      assert.equal(init.headers['X-Device-Secret'], SECRET);
      polls += 1;
      return { status: 200, body: { status: polls < 3 ? 'pending' : 'approved' } };
    }],
    [/^POST .*\/exchange$/, () => ({ status: 200, body: { customToken: 'custom-token' } })],
    [/^POST https:\/\/identitytoolkit/, (init) => {
      assert.deepEqual(init.json, { token: 'custom-token', returnSecureToken: true });
      return { status: 200, body: { idToken, refreshToken: 'refresh-1', expiresIn: '3600' } };
    }],
  ]);
  const service = A.createAccountService(h.deps);
  const events = [];
  service.startActivation({
    onCode: (p) => events.push(['code', p.userCode, p.verificationUrl]),
    onSignedIn: (s) => events.push(['signed-in', s.uid, s.email]),
    onError: (e) => events.push(['error', e]),
    onExpired: () => events.push(['expired']),
  });
  await h.flush();
  assert.deepEqual(events[0], ['code', 'ABCD-EF23', 'https://watchprotv.com/activate']);
  await h.advance(5000); await h.advance(5000); await h.advance(5000);
  await h.flush(); await h.flush();
  assert.deepEqual(events[1], ['signed-in', 'viewer-1', 'viewer@example.com']);
  const saved = JSON.parse(h.store[A.STORAGE_KEY]);
  assert.equal(saved.uid, 'viewer-1');
  assert.equal(saved.deviceSecret, undefined, 'device secret is never stored');
  assert.ok(!JSON.stringify(h.store).includes(SECRET));
});

test('activation reports expiry and retries transient failures with backoff', async () => {
  let polls = 0;
  const h = harness([
    [/^POST .*\/auth\/device-sessions$/, created],
    [/^GET .*\/auth\/device-sessions\//, () => { polls += 1; return polls === 1 ? { status: 503, body: null } : { status: 200, body: { status: 'expired' } }; }],
  ]);
  const service = A.createAccountService(h.deps);
  const events = [];
  service.startActivation({ onCode: () => events.push('code'), onExpired: () => events.push('expired'), onError: (e) => events.push(e) });
  await h.flush();
  await h.advance(5000);
  await h.advance(10000);
  assert.deepEqual(events, ['code', 'expired']);
  assert.equal(polls, 2);
});

test('cancel stops polling', async () => {
  const h = harness([[/^POST .*\/auth\/device-sessions$/, created], [/^GET /, () => ({ status: 200, body: { status: 'pending' } })]]);
  const service = A.createAccountService(h.deps);
  const handle = service.startActivation({});
  await h.flush();
  handle.cancel();
  await h.advance(60000);
  assert.equal(h.calls.filter((c) => c.method === 'GET').length, 0);
});

test('authorized requests refresh once on 401; a Firebase 4xx refresh signs out', async () => {
  const fresh = jwt({ user_id: 'viewer-1' });
  let refreshes = 0;
  const h = harness([
    [/^GET .*\/users\/me\/favorites$/, (init) => (init.headers.Authorization === `Bearer ${fresh}` ? { status: 200, body: ['a'] } : { status: 401, body: null })],
    [/^POST https:\/\/securetoken/, () => { refreshes += 1; return refreshes === 1 ? { status: 200, body: { id_token: fresh, refresh_token: 'r2', expires_in: '3600' } } : { status: 400, body: {} }; }],
  ]);
  h.store[A.STORAGE_KEY] = JSON.stringify({ uid: 'viewer-1', idToken: jwt({ user_id: 'viewer-1', stale: true }), refreshToken: 'r1', expiresAtMs: 9e15 });
  const service = A.createAccountService(h.deps);
  service.restore();
  const response = await service.authorized('GET', '/users/me/favorites');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, ['a']);
  await service.refresh();
  assert.equal(service.current(), null, 'rejected refresh token signs the TV out');
  assert.equal(h.store[A.STORAGE_KEY], undefined);
});

test('refresh never switches to a different viewer', () => {
  const previous = { uid: 'viewer-1' };
  assert.equal(A.sessionFromFirebase({ id_token: jwt({ user_id: 'viewer-2' }), refresh_token: 'r', expires_in: '3600' }, 0, previous), null);
});

// ---------------- player ----------------
test('stream URLs come only from a policy-marked authorization', () => {
  assert.equal(PL.streamUrl({ muxPlaybackId: 'abcdefghijKLMNOP' }, 'samsung-rights-v1').error, 'policy');
  const ok = PL.streamUrl({ platformPolicy: 'samsung-rights-v1', muxPlaybackId: 'abcdefghijKLMNOP' }, 'samsung-rights-v1');
  assert.equal(ok.url, 'https://stream.mux.com/abcdefghijKLMNOP.m3u8');
  const signed = PL.streamUrl({ platformPolicy: 'samsung-rights-v1', muxPlaybackId: 'abcdefghijKLMNOP', playbackToken: 'eyJhbGciOi.eyJzdWIiOi.sig' }, 'samsung-rights-v1');
  assert.match(signed.url, /\?token=eyJhbGciOi\.eyJzdWIiOi\.sig$/);
  assert.equal(PL.streamUrl({ platformPolicy: 'samsung-rights-v1', muxPlaybackId: '../../x' }, 'samsung-rights-v1').error, 'invalid');
});

test('clock and seek clamping', () => {
  assert.equal(PL.clock(65), '1:05');
  assert.equal(PL.clock(3725), '1:02:05');
  assert.equal(PL.clampSeek(-5, 100), 0);
  assert.equal(PL.clampSeek(500, 100), 95);
});

function fakeAvplay() {
  const log = [];
  let listener = null;
  let time = 0;
  return {
    log,
    fire: (name, arg) => listener[name](arg),
    setTime: (ms) => { time = ms; },
    api: {
      open: (url) => log.push(['open', url]),
      setDisplayRect: () => {},
      setDisplayMethod: () => {},
      setListener: (l) => { listener = l; },
      prepareAsync: (ok) => { log.push(['prepare']); ok(); },
      seekTo: (ms, ok) => { log.push(['seekTo', ms]); time = ms; ok && ok(); },
      play: () => log.push(['play']),
      pause: () => log.push(['pause']),
      stop: () => log.push(['stop']),
      close: () => log.push(['close']),
      suspend: () => log.push(['suspend']),
      restore: () => log.push(['restore']),
      getDuration: () => 600000,
      getCurrentTime: () => time,
    },
  };
}

function playerHarness(authorize) {
  const timers = [];
  const av = fakeAvplay();
  const saves = [];
  const states = [];
  let online = true;
  const session = PL.createSession({
    createAdapter: (events) => new PL.AVPlayAdapter(av.api, events),
    authorize: authorize || (async () => ({ url: 'https://stream.mux.com/abcdefghijKLMNOP.m3u8' })),
    saveProgress: (item, pos, dur, force) => saves.push([pos, dur, force]),
    onState: (s) => states.push(s.phase),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    isOnline: () => online,
  });
  return {
    session, av, saves, states, timers,
    runTimers: async () => { for (const t of timers.splice(0)) if (t.fn) { t.fn(); await new Promise((r) => setImmediate(r)); } },
    setOnline: (v) => { online = v; },
  };
}

test('AVPlay: resume seeks before play, checkpoints every 20 s, pause flushes', async () => {
  const h = playerHarness();
  await h.session.start({ id: 'a', duration: 600 }, 120);
  assert.deepEqual(h.av.log.slice(-3), [['prepare'], ['seekTo', 120000], ['play']]);
  h.av.fire('oncurrentplaytime', 130000);
  assert.equal(h.saves.length, 0);
  h.av.fire('oncurrentplaytime', 141000);
  assert.deepEqual(h.saves.pop(), [141, 600, false]);
  h.session.toggle();
  assert.deepEqual(h.av.log.slice(-1), [['pause']]);
  h.av.fire('oncurrentplaytime', 150000);
  h.session.pause();
  h.session.stop();
  assert.equal(h.saves.pop()[0], 150, 'stop flushes the latest position');
});

test('repeated seeks accumulate into one AVPlay seek', async () => {
  const h = playerHarness();
  await h.session.start({ id: 'a', duration: 600 }, 0);
  h.av.fire('oncurrentplaytime', 100000);
  h.session.seekBy(10); h.session.seekBy(10); h.session.seekBy(10);
  assert.equal(h.session.state().seekTarget, 130);
  const before = h.av.log.filter((e) => e[0] === 'seekTo').length;
  await h.runTimers();
  const seeks = h.av.log.filter((e) => e[0] === 'seekTo');
  assert.equal(seeks.length - before, 1);
  assert.deepEqual(seeks.pop(), ['seekTo', 130000]);
});

test('a stream error (e.g. expired signed URL) re-authorizes and resumes at the last position', async () => {
  let authorizations = 0;
  const h = playerHarness(async () => { authorizations += 1; return { url: `https://stream.mux.com/abcdefghijKLMNOP.m3u8?token=t${authorizations}xxxxxxxxxxxxxxxxxxxx` }; });
  await h.session.start({ id: 'a', duration: 600 }, 0);
  h.av.fire('oncurrentplaytime', 200000);
  h.av.fire('onerror', 'PLAYER_ERROR_CONNECTION_FAILED');
  assert.equal(h.session.state().phase, 'recovering');
  await h.runTimers();
  assert.equal(authorizations, 2);
  assert.deepEqual(h.av.log.filter((e) => e[0] === 'seekTo').pop(), ['seekTo', 200000]);
});

test('recovery waits while offline and gives up after three failures', async () => {
  const h = playerHarness();
  await h.session.start({ id: 'a', duration: 600 }, 0);
  h.setOnline(false);
  h.av.fire('onerror', 'PLAYER_ERROR_CONNECTION_FAILED');
  await h.runTimers();
  assert.equal(h.av.log.filter((e) => e[0] === 'open').length, 1, 'no reopen while offline');
  h.setOnline(true);
  await h.runTimers();
  assert.equal(h.av.log.filter((e) => e[0] === 'open').length, 2);
  h.av.fire('onerror', 'X'); await h.runTimers();
  h.av.fire('onerror', 'X'); await h.runTimers();
  h.av.fire('onerror', 'X');
  assert.equal(h.session.state().phase, 'error');
});

test('a title withdrawn on the server cannot play', async () => {
  const h = playerHarness(async () => ({ error: 'unavailable' }));
  await h.session.start({ id: 'a', duration: 600 }, 0);
  assert.equal(h.session.state().phase, 'error');
  assert.equal(h.session.state().error, 'unavailable');
  assert.equal(h.av.log.filter((e) => e[0] === 'open').length, 0);
});

test('app suspension suspends AVPlay and saves; resume restores', async () => {
  const h = playerHarness();
  await h.session.start({ id: 'a', duration: 600 }, 0);
  h.av.fire('oncurrentplaytime', 61000);
  h.session.suspend();
  assert.deepEqual(h.av.log.slice(-1), [['suspend']]);
  assert.equal(h.saves.pop()[0], 61);
  h.session.resume();
  assert.deepEqual(h.av.log.slice(-1), [['restore']]);
});

test('end of stream records the full duration', async () => {
  const h = playerHarness();
  await h.session.start({ id: 'a', duration: 600 }, 0);
  h.av.fire('oncurrentplaytime', 590000);
  h.av.fire('onstreamcompleted');
  assert.equal(h.session.state().phase, 'ended');
  assert.deepEqual(h.saves.pop(), [600, 600, true]);
});

test('seeking while paused keeps the session paused (AVPlay stays paused after seekTo)', async () => {
  const h = playerHarness();
  await h.session.start({ id: 'a', duration: 600 }, 0);
  h.av.fire('oncurrentplaytime', 78000);
  h.session.toggle();
  assert.equal(h.session.state().phase, 'paused');
  h.session.seekBy(30);
  await h.runTimers();
  assert.deepEqual(h.av.log.filter((e) => e[0] === 'seekTo').pop(), ['seekTo', 108000]);
  assert.equal(h.session.state().phase, 'paused', 'UI must not claim playback after a paused seek');
  h.av.fire('onbufferingstart'); h.av.fire('onbufferingcomplete');
  assert.equal(h.session.state().phase, 'paused', 'rebuffering while paused stays paused');
  h.session.toggle();
  assert.deepEqual(h.av.log.slice(-1), [['play']], 'one press resumes');
  assert.equal(h.session.state().phase, 'playing');
});

test('resume after suspend restores the playing phase only if it was playing', async () => {
  const h = playerHarness();
  await h.session.start({ id: 'a', duration: 600 }, 0);
  h.session.suspend();
  assert.equal(h.session.state().phase, 'paused');
  h.session.resume();
  assert.equal(h.session.state().phase, 'playing');
  h.session.toggle();
  h.session.suspend();
  h.session.resume();
  assert.equal(h.session.state().phase, 'paused');
});

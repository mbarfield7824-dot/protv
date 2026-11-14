/*
 * PROtv Samsung - viewer account (no DOM).
 * Activation reuses the existing TV device-session service that Fire TV uses:
 *   POST /auth/device-sessions -> {sessionId, deviceSecret, userCode, verificationUrl, expiresAt, interval}
 *   GET  /auth/device-sessions/:id (X-Device-Secret) -> {status}
 *   POST /auth/device-sessions/:id/exchange (X-Device-Secret) -> {customToken}
 * The viewer approves the code at watchprotv.com on a phone or computer; no password is typed on the TV.
 * The custom token becomes a Firebase session through the public Firebase Auth REST API (same as Roku).
 * Only the viewer session is stored; the device secret lives in memory and is never logged.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PROtv = root.PROtv || {}; root.PROtv.account = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SESSION_ID = /^[A-Za-z0-9_-]{43}$/;
  var USER_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}$/;
  var REFRESH_MARGIN_MS = 5 * 60 * 1000;
  var MAX_BACKOFF_MS = 30000;
  var STORAGE_KEY = 'protv.samsung.account.v1';

  function validVerificationUrl(value) {
    if (typeof value !== 'string') return false;
    var match = /^https:\/\/([A-Za-z0-9.-]+)(\/[^?#\s]*)?$/.exec(value);
    return Boolean(match) && value.indexOf('@') < 0;
  }

  function parseDeviceSession(body, nowMs) {
    if (!body || typeof body !== 'object') throw new Error('invalid-session');
    if (!SESSION_ID.test(body.sessionId || '') || !SESSION_ID.test(body.deviceSecret || '')) throw new Error('invalid-session');
    if (!USER_CODE.test(body.userCode || '')) throw new Error('invalid-session');
    var interval = Number(body.interval);
    if (!(interval >= 1 && interval <= 60)) throw new Error('invalid-session');
    var expiresAtMs = Date.parse(body.expiresAt);
    if (!isFinite(expiresAtMs) || expiresAtMs <= nowMs) throw new Error('invalid-session');
    if (!validVerificationUrl(body.verificationUrl)) throw new Error('invalid-session');
    return {
      sessionId: body.sessionId,
      deviceSecret: body.deviceSecret,
      userCode: body.userCode,
      verificationUrl: body.verificationUrl,
      expiresAtMs: expiresAtMs,
      intervalMs: interval * 1000,
    };
  }

  function base64UrlDecode(value) {
    var input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (input.length % 4) input += '=';
    if (typeof atob === 'function') {
      var binary = atob(input);
      try {
        return decodeURIComponent(binary.split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
      } catch (error) { return binary; }
    }
    return Buffer.from(input, 'base64').toString('utf8');
  }

  function tokenClaims(idToken) {
    try {
      var parts = String(idToken || '').split('.');
      if (parts.length !== 3) return null;
      var claims = JSON.parse(base64UrlDecode(parts[1]));
      return claims && typeof claims === 'object' ? claims : null;
    } catch (error) {
      return null;
    }
  }

  function sessionFromFirebase(body, nowMs, previous) {
    if (!body || typeof body !== 'object') return null;
    var idToken = body.idToken || body.id_token;
    var refreshToken = body.refreshToken || body.refresh_token;
    var expiresIn = Number(body.expiresIn || body.expires_in);
    var claims = tokenClaims(idToken);
    if (!idToken || !refreshToken || !(expiresIn > 0) || !claims) return null;
    var uid = claims.user_id || claims.sub;
    if (!uid) return null;
    if (previous && previous.uid && previous.uid !== uid) return null;
    return {
      uid: uid,
      email: typeof claims.email === 'string' ? claims.email : (previous && previous.email) || '',
      name: typeof claims.name === 'string' ? claims.name : (previous && previous.name) || '',
      idToken: idToken,
      refreshToken: refreshToken,
      expiresAtMs: nowMs + expiresIn * 1000,
    };
  }

  function validStoredSession(value) {
    return Boolean(value) && typeof value === 'object' && typeof value.uid === 'string' && value.uid
      && typeof value.idToken === 'string' && typeof value.refreshToken === 'string'
      && typeof value.expiresAtMs === 'number';
  }

  function needsRefresh(session, nowMs) {
    return !session || nowMs >= session.expiresAtMs - REFRESH_MARGIN_MS;
  }

  function transient(status) {
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }

  function backoff(attempt, baseMs) {
    return Math.min(MAX_BACKOFF_MS, baseMs * Math.pow(2, Math.max(0, attempt)));
  }

  /*
   * Account service. deps: {http, storage, now, setTimer, clearTimer, apiBase, firebaseApiKey}
   * http(method, url, {headers, json, form}) -> Promise<{status, body}>; status 0 = network failure.
   */
  function createAccountService(deps) {
    var session = null;
    var refreshing = null;
    var listeners = [];

    function emit() { listeners.forEach(function (listener) { listener(session); }); }

    function save() {
      try {
        if (session) deps.storage.setItem(STORAGE_KEY, JSON.stringify(session));
        else deps.storage.removeItem(STORAGE_KEY);
      } catch (error) { /* storage unavailable: session lasts for this launch */ }
    }

    function restore() {
      try {
        var stored = JSON.parse(deps.storage.getItem(STORAGE_KEY) || 'null');
        session = validStoredSession(stored) ? stored : null;
      } catch (error) {
        session = null;
      }
      return session;
    }

    function configured() {
      return typeof deps.firebaseApiKey === 'string' && deps.firebaseApiKey.length > 10;
    }

    function signOut() {
      session = null;
      save();
      emit();
    }

    function refresh() {
      if (!session) return Promise.resolve(null);
      if (refreshing) return refreshing;
      var current = session;
      refreshing = deps.http('POST', 'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(deps.firebaseApiKey), {
        form: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(current.refreshToken),
      }).then(function (response) {
        refreshing = null;
        if (response.status === 200) {
          var next = sessionFromFirebase(response.body, deps.now(), current);
          if (!next) { signOut(); return null; }
          session = next; save(); emit();
          return session;
        }
        // Firebase rejected the refresh token (revoked, disabled, expired): sign out locally.
        if (response.status >= 400 && response.status < 500) { signOut(); return null; }
        var error = new Error('refresh-unavailable');
        error.transient = true;
        throw error;
      }, function (error) {
        refreshing = null;
        throw error;
      });
      return refreshing;
    }

    function ensureFresh() {
      if (!session) return Promise.resolve(null);
      if (!needsRefresh(session, deps.now())) return Promise.resolve(session);
      return refresh();
    }

    // A user-scoped request with the Firebase ID token; one refresh-and-retry on 401.
    function authorized(method, path, json) {
      return ensureFresh().then(function (current) {
        if (!current) return { status: 401, body: null };
        var send = function (token) {
          return deps.http(method, deps.apiBase + path, { headers: { Authorization: 'Bearer ' + token }, json: json });
        };
        return send(current.idToken).then(function (response) {
          if (response.status !== 401) return response;
          return refresh().then(function (next) { return next ? send(next.idToken) : response; });
        });
      });
    }

    function completeSignIn(customToken) {
      return deps.http('POST', 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + encodeURIComponent(deps.firebaseApiKey), {
        json: { token: customToken, returnSecureToken: true },
      }).then(function (response) {
        if (response.status !== 200) throw new Error('firebase-' + response.status);
        var next = sessionFromFirebase(response.body, deps.now(), null);
        if (!next) throw new Error('firebase-invalid');
        session = next; save(); emit();
        return session;
      });
    }

    /*
     * Phone/computer activation. handlers: {onCode(pending), onExpired(), onError(code), onSignedIn(session)}
     * Returns {cancel()}. Transient failures retry with capped backoff, bounded by the code's expiry.
     */
    function startActivation(handlers) {
      var cancelled = false;
      var timer = null;
      var pending = null;
      var failures = 0;

      function schedule(fn, ms) { if (!cancelled) timer = deps.setTimer(fn, ms); }
      function fail(code) { if (!cancelled && handlers.onError) handlers.onError(code); }

      function expired() {
        return pending && deps.now() >= pending.expiresAtMs;
      }

      function exchange() {
        deps.http('POST', deps.apiBase + '/auth/device-sessions/' + pending.sessionId + '/exchange', {
          headers: { 'X-Device-Secret': pending.deviceSecret },
        }).then(function (response) {
          if (cancelled) return null;
          if (response.status === 200 && response.body && typeof response.body.customToken === 'string' && response.body.customToken) {
            return completeSignIn(response.body.customToken).then(function (next) {
              pending = null;
              if (!cancelled && handlers.onSignedIn) handlers.onSignedIn(next);
            });
          }
          if (response.status === 410) { if (handlers.onExpired) handlers.onExpired(); return null; }
          if (response.status === 409 && response.body && response.body.status === 'consumed') { fail('consumed'); return null; }
          if (transient(response.status) || response.status === 409) { failures += 1; schedule(exchange, backoff(failures, 2000)); return null; }
          fail('exchange');
          return null;
        }).catch(function (error) {
          if (cancelled) return;
          fail(String(error && error.message || '').indexOf('firebase') === 0 ? 'firebase' : 'exchange');
        });
      }

      function poll() {
        if (cancelled) return;
        if (expired()) { if (handlers.onExpired) handlers.onExpired(); return; }
        deps.http('GET', deps.apiBase + '/auth/device-sessions/' + pending.sessionId, {
          headers: { 'X-Device-Secret': pending.deviceSecret },
        }).then(function (response) {
          if (cancelled) return;
          var status = response.body && response.body.status;
          if (response.status === 200 && status === 'pending') { failures = 0; schedule(poll, pending.intervalMs); return; }
          if (response.status === 200 && status === 'approved') { failures = 0; exchange(); return; }
          if (response.status === 200 && status === 'expired') { if (handlers.onExpired) handlers.onExpired(); return; }
          if (response.status === 200 && status === 'consumed') { fail('consumed'); return; }
          if (response.status === 404) { if (handlers.onExpired) handlers.onExpired(); return; }
          if (transient(response.status)) { failures += 1; schedule(poll, Math.max(pending.intervalMs, backoff(failures, pending.intervalMs))); return; }
          fail('poll');
        });
      }

      function begin() {
        if (!configured()) { fail('not-configured'); return; }
        deps.http('POST', deps.apiBase + '/auth/device-sessions', { json: {} }).then(function (response) {
          if (cancelled) return;
          if (response.status === 429) { fail('rate-limited'); return; }
          if (response.status !== 201 && response.status !== 200) { fail(response.status === 0 ? 'network' : 'create'); return; }
          try {
            pending = parseDeviceSession(response.body, deps.now());
          } catch (error) { fail('create'); return; }
          if (handlers.onCode) handlers.onCode({ userCode: pending.userCode, verificationUrl: pending.verificationUrl, expiresAtMs: pending.expiresAtMs });
          schedule(poll, pending.intervalMs);
        });
      }

      begin();
      return {
        cancel: function () {
          cancelled = true;
          pending = null;
          if (timer !== null) deps.clearTimer(timer);
        },
      };
    }

    return {
      restore: restore,
      current: function () { return session; },
      configured: configured,
      onChange: function (listener) { listeners.push(listener); },
      ensureFresh: ensureFresh,
      refresh: refresh,
      authorized: authorized,
      startActivation: startActivation,
      signOut: signOut,
    };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    parseDeviceSession: parseDeviceSession,
    tokenClaims: tokenClaims,
    sessionFromFirebase: sessionFromFirebase,
    needsRefresh: needsRefresh,
    validVerificationUrl: validVerificationUrl,
    createAccountService: createAccountService,
  };
});

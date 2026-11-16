/*
 * PROtv Samsung - HTTPS transport. XMLHttpRequest works on every supported Tizen version
 * (Chromium 56 has no AbortController). Never rejects: network failure resolves {status: 0}.
 * Every PROtv API request declares the Samsung platform so the backend applies Samsung rights.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PROtv = root.PROtv || {}; root.PROtv.http = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIMEOUT_MS = 15000;

  function create(options) {
    var opts = options || {};
    var apiBase = opts.apiBase || '';
    var platformHeaders = { 'X-PROtv-Platform': 'samsung', 'X-PROtv-App-Version': opts.version || '' };

    return function request(method, url, init) {
      var config = init || {};
      return new Promise(function (resolve) {
        var xhr = new XMLHttpRequest();
        var done = false;
        function finish(result) { if (!done) { done = true; resolve(result); } }
        try {
          xhr.open(method, url, true);
        } catch (error) {
          finish({ status: 0, body: null });
          return;
        }
        xhr.timeout = config.timeout || TIMEOUT_MS;
        var headers = config.headers || {};
        if (apiBase && url.indexOf(apiBase) === 0) {
          Object.keys(platformHeaders).forEach(function (name) {
            if (platformHeaders[name]) xhr.setRequestHeader(name, platformHeaders[name]);
          });
        }
        Object.keys(headers).forEach(function (name) { xhr.setRequestHeader(name, headers[name]); });
        var payload = null;
        if (config.json !== undefined) {
          xhr.setRequestHeader('Content-Type', 'application/json');
          payload = JSON.stringify(config.json);
        } else if (config.form !== undefined) {
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          payload = config.form;
        }
        xhr.onload = function () {
          var body = null;
          if (xhr.responseText) {
            try { body = JSON.parse(xhr.responseText); } catch (error) { body = null; }
          }
          finish({ status: xhr.status, body: body });
        };
        xhr.onerror = function () { finish({ status: 0, body: null }); };
        xhr.ontimeout = function () { finish({ status: 0, body: null, timeout: true }); };
        xhr.onabort = function () { finish({ status: 0, body: null }); };
        xhr.send(payload);
      });
    };
  }

  return { create: create, TIMEOUT_MS: TIMEOUT_MS };
});

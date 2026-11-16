/*
 * PROtv Samsung - remote control keys.
 * Arrow/Enter/Back are delivered by default on Samsung TVs; media keys must be registered
 * through tizen.tvinputdevice (privilege http://tizen.org/privilege/tv.inputdevice).
 * Desktop keyboard equivalents keep the app testable in a browser.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PROtv = root.PROtv || {}; root.PROtv.keys = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CODES = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    13: 'enter', 29443: 'enter',
    10009: 'back', 8: 'back', 27: 'back', 461: 'back',
    10252: 'playpause', 32: 'playpause_soft',
    415: 'play', 19: 'pause', 413: 'stop',
    417: 'fastforward', 412: 'rewind',
    10232: 'previous', 10233: 'next',
    10182: 'exit',
    427: 'channelup', 428: 'channeldown',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
  };

  var MEDIA_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
    'MediaTrackPrevious', 'MediaTrackNext'];

  function name(event) {
    var code = event.keyCode || event.which || 0;
    if (CODES[code]) return CODES[code];
    if (code >= 48 && code <= 57) return 'digit';
    if (event.key === 'MediaPlayPause') return 'playpause';
    if (event.key === 'GoBack' || event.key === 'BrowserBack') return 'back';
    return '';
  }

  function register(tizenApi) {
    var registered = [];
    if (!tizenApi || !tizenApi.tvinputdevice) return registered;
    MEDIA_KEYS.forEach(function (key) {
      try {
        tizenApi.tvinputdevice.registerKey(key);
        registered.push(key);
      } catch (error) { /* key not present on this remote */ }
    });
    return registered;
  }

  return { CODES: CODES, MEDIA_KEYS: MEDIA_KEYS, name: name, register: register };
});

/*
 * PROtv Samsung - watch progress rules (pure).
 * Same contract as Roku and Fire TV: GET /users/me/progress returns a map keyed by exact
 * catalog ID; PUT /users/me/progress/:id takes {positionSeconds, durationSeconds}.
 * Titles at or above 95% are treated as finished; checkpoints need 20 s of advancement.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PROtv = root.PROtv || {}; root.PROtv.progress = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COMPLETE_PERCENT = 95;
  var CHECKPOINT_SECONDS = 20;
  var GUEST_LIMIT = 50;

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function validEntry(entry) {
    return Boolean(entry) && typeof entry === 'object'
      && isNumber(entry.positionSeconds) && entry.positionSeconds >= 0
      && isNumber(entry.durationSeconds) && entry.durationSeconds > 0;
  }

  function percent(entry) {
    if (isNumber(entry.progressPercent)) return entry.progressPercent;
    return Math.round((entry.positionSeconds / entry.durationSeconds) * 100);
  }

  function inProgress(entry) {
    return validEntry(entry) && entry.positionSeconds > 0 && percent(entry) < COMPLETE_PERCENT;
  }

  function continueWatching(items, progress) {
    if (!progress || typeof progress !== 'object') return [];
    var rows = [];
    items.forEach(function (item) {
      if (!Object.prototype.hasOwnProperty.call(progress, item.id)) return;
      var entry = progress[item.id];
      if (!inProgress(entry)) return;
      rows.push({ item: item, updatedAt: isNumber(entry.updatedAt) ? entry.updatedAt : 0 });
    });
    rows.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    return rows.map(function (row) { return row.item; });
  }

  function resumePosition(progress, id) {
    if (!progress || !Object.prototype.hasOwnProperty.call(progress, id)) return 0;
    var entry = progress[id];
    if (!inProgress(entry)) return 0;
    if (entry.positionSeconds >= entry.durationSeconds) return 0;
    return Math.floor(entry.positionSeconds);
  }

  function fraction(progress, id) {
    var entry = progress && progress[id];
    if (!validEntry(entry)) return 0;
    return Math.max(0, Math.min(1, entry.positionSeconds / entry.durationSeconds));
  }

  function timeLeft(progress, id) {
    var entry = progress && progress[id];
    if (!validEntry(entry)) return '';
    var minutes = Math.max(1, Math.round((entry.durationSeconds - entry.positionSeconds) / 60));
    if (minutes >= 60) {
      var hours = Math.floor(minutes / 60);
      var rest = minutes % 60;
      return (rest ? hours + 'h ' + rest + 'm' : hours + 'h') + ' left';
    }
    return minutes + 'm left';
  }

  function saveDue(positionSeconds, lastSavedSeconds, force) {
    if (!isNumber(positionSeconds) || positionSeconds <= 0) return false;
    if (force) return positionSeconds !== lastSavedSeconds;
    return Math.abs(positionSeconds - lastSavedSeconds) >= CHECKPOINT_SECONDS;
  }

  function entry(positionSeconds, durationSeconds, nowMs) {
    var position = Math.max(0, Math.floor(positionSeconds));
    var duration = Math.max(1, Math.floor(durationSeconds));
    return {
      positionSeconds: position,
      durationSeconds: duration,
      progressPercent: Math.min(100, Math.max(0, Math.round((position / duration) * 100))),
      updatedAt: nowMs,
    };
  }

  // Guest progress stays on this TV, in the same shape as the account map, capped to recent titles.
  function record(progress, id, value, limit) {
    var next = {};
    Object.keys(progress || {}).forEach(function (key) { next[key] = progress[key]; });
    next[id] = value;
    var max = limit || GUEST_LIMIT;
    var keys = Object.keys(next);
    if (keys.length > max) {
      keys.sort(function (a, b) { return (next[b].updatedAt || 0) - (next[a].updatedAt || 0); });
      keys.slice(max).forEach(function (key) { delete next[key]; });
    }
    return next;
  }

  function parse(json) {
    try {
      var value = JSON.parse(json || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      var clean = {};
      Object.keys(value).forEach(function (key) { if (validEntry(value[key])) clean[key] = value[key]; });
      return clean;
    } catch (error) {
      return {};
    }
  }

  return {
    COMPLETE_PERCENT: COMPLETE_PERCENT,
    CHECKPOINT_SECONDS: CHECKPOINT_SECONDS,
    GUEST_LIMIT: GUEST_LIMIT,
    validEntry: validEntry,
    inProgress: inProgress,
    continueWatching: continueWatching,
    resumePosition: resumePosition,
    fraction: fraction,
    timeLeft: timeLeft,
    saveDue: saveDue,
    entry: entry,
    record: record,
    parse: parse,
  };
});

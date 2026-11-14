/*
 * PROtv Samsung - spatial focus engine (pure geometry, testable without a DOM).
 * nextIndex() picks the nearest candidate in the pressed direction, preferring candidates
 * that overlap the current element on the cross axis (so Down from a hero button lands on the
 * row below it, not on a far corner). Rows remember their last focused card in the UI layer.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PROtv = root.PROtv || {}; root.PROtv.focus = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function center(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function overlap(a1, a2, b1, b2) {
    return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  }

  function inDirection(from, to, direction) {
    var tolerance = 1;
    if (direction === 'left') return to.left + to.width <= from.left + tolerance || center(to).x < from.left;
    if (direction === 'right') return to.left >= from.left + from.width - tolerance || center(to).x > from.left + from.width;
    if (direction === 'up') return to.top + to.height <= from.top + tolerance || center(to).y < from.top;
    if (direction === 'down') return to.top >= from.top + from.height - tolerance || center(to).y > from.top + from.height;
    return false;
  }

  function score(from, to, direction) {
    var horizontal = direction === 'left' || direction === 'right';
    var primary;
    var crossOverlap;
    var crossDistance;
    var fc = center(from);
    var tc = center(to);
    if (horizontal) {
      primary = direction === 'right' ? to.left - (from.left + from.width) : from.left - (to.left + to.width);
      crossOverlap = overlap(from.top, from.top + from.height, to.top, to.top + to.height);
      crossDistance = Math.abs(fc.y - tc.y);
    } else {
      primary = direction === 'down' ? to.top - (from.top + from.height) : from.top - (to.top + to.height);
      crossOverlap = overlap(from.left, from.left + from.width, to.left, to.left + to.width);
      crossDistance = Math.abs(fc.x - tc.x);
    }
    primary = Math.max(0, primary);
    // Aligned candidates win; among them the nearest. Unaligned ones pay for cross-axis distance.
    return (crossOverlap > 0 ? 0 : 100000) + primary * 10 + crossDistance;
  }

  // candidates: [{rect, group}] ; returns index or -1.
  function nextIndex(current, candidates, direction) {
    var best = -1;
    var bestScore = Infinity;
    for (var i = 0; i < candidates.length; i += 1) {
      var rect = candidates[i].rect;
      if (!rect || rect === current || (rect.width === 0 && rect.height === 0)) continue;
      if (!inDirection(current, rect, direction)) continue;
      var value = score(current, rect, direction);
      if (value < bestScore) { bestScore = value; best = i; }
    }
    return best;
  }

  // Keeps the focused card visible inside a horizontally scrolling track.
  function scrollOffset(currentOffset, itemStart, itemSize, viewportSize, padding) {
    var pad = padding || 0;
    if (itemStart - pad < currentOffset) return Math.max(0, itemStart - pad);
    if (itemStart + itemSize + pad > currentOffset + viewportSize) return itemStart + itemSize + pad - viewportSize;
    return currentOffset;
  }

  return { nextIndex: nextIndex, scrollOffset: scrollOffset, inDirection: inDirection };
});

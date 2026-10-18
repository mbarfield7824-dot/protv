import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlaybackTracker,
  getOrCreatePlaybackGuestId,
} from '../src/data/playbackTracking.js';

const GUEST = 'e2ac6747-b9d8-42f0-9679-8111a8fcc020';
const SESSION_IDS = [
  'b30be475-2982-4f71-9f76-9f1c4a993d3f',
  '2d4a2346-0578-4b73-8a1c-c0f88ed6be9e',
];

class FakePlayer extends EventTarget {
  currentTime = 0;
  paused = true;
  seeking = false;
  readyState = 4;
  playbackRate = 1;
  listeners = new Map();

  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    this.listeners.set(type, (this.listeners.get(type) || 0) + 1);
  }

  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    this.listeners.set(type, (this.listeners.get(type) || 0) - 1);
  }

  emit(type) {
    this.dispatchEvent(new Event(type));
  }

  advance(seconds, clock) {
    this.currentTime += seconds;
    clock.advance(seconds);
    this.emit('timeupdate');
  }

  advancePlayback(realSeconds, clock) {
    this.currentTime += realSeconds * this.playbackRate;
    clock.advance(realSeconds);
    this.emit('timeupdate');
  }
}

function clockHarness() {
  let value = 0;
  return {
    now: () => value,
    advance(seconds) { value += seconds * 1000; },
  };
}

function trackerHarness({ videoId = 'title-one', thresholdSeconds = 30 } = {}) {
  const player = new FakePlayer();
  const clock = clockHarness();
  const events = [];
  let sessionIndex = 0;
  const tracker = createPlaybackTracker({
    player,
    videoId,
    guestId: GUEST,
    onEvent: (event) => events.push(event),
    now: clock.now,
    createSessionId: () => SESSION_IDS[sessionIndex++],
    thresholdSeconds,
  });
  const begin = () => {
    player.paused = false;
    player.emit('playing');
  };
  return { player, clock, events, tracker, begin };
}

function count(events, type) {
  return events.filter((event) => event.eventType === type).length;
}

test('does not count an open or an early playback, qualifies once at 30 seconds', () => {
  const h = trackerHarness();
  assert.equal(h.events.length, 0);
  h.begin();
  assert.equal(count(h.events, 'play_start'), 1);
  h.player.advance(29.9, h.clock);
  assert.equal(count(h.events, 'qualified_view'), 0);
  h.player.advance(0.1, h.clock);
  assert.equal(count(h.events, 'qualified_view'), 1);
  h.player.advance(15, h.clock);
  assert.equal(count(h.events, 'qualified_view'), 1);
  assert.equal(h.events.at(-1).playedSeconds, 30);
  h.tracker.cleanup();
});

test('pauses and buffering do not count, while played time accumulates across resume', () => {
  const h = trackerHarness();
  h.begin();
  h.player.advance(15, h.clock);

  h.player.paused = true;
  h.player.emit('pause');
  h.clock.advance(60);
  h.player.emit('timeupdate');
  h.player.paused = false;
  h.player.emit('playing');
  h.player.advance(10, h.clock);

  h.player.emit('waiting');
  h.clock.advance(60);
  h.player.currentTime += 25;
  h.player.emit('timeupdate');
  h.player.emit('playing');
  h.player.advance(5, h.clock);
  assert.equal(count(h.events, 'qualified_view'), 1);
  h.tracker.cleanup();
});

test('seeking/skipped content and VAST ad time are excluded', () => {
  const h = trackerHarness();
  h.begin();
  h.player.advance(29.9, h.clock);

  h.player.seeking = true;
  h.player.currentTime = 600;
  h.player.emit('seeking');
  h.player.seeking = false;
  h.clock.advance(5);
  h.player.emit('seeked');
  h.player.advance(0.09, h.clock);
  assert.equal(count(h.events, 'qualified_view'), 0);

  h.tracker.setAdsActive(true);
  h.player.currentTime += 40;
  h.clock.advance(40);
  h.player.emit('timeupdate');
  h.tracker.setAdsActive(false);
  h.player.advance(0.01, h.clock);
  assert.equal(count(h.events, 'qualified_view'), 1);
  h.tracker.cleanup();
});

test('qualification measures active real time at faster playback rates', () => {
  const h = trackerHarness();
  h.begin();
  h.player.playbackRate = 2;
  h.player.emit('ratechange');
  h.player.currentTime += 30;
  h.clock.advance(15);
  h.player.emit('timeupdate');
  assert.equal(count(h.events, 'qualified_view'), 0);

  h.player.currentTime += 30;
  h.clock.advance(15);
  h.player.emit('timeupdate');
  assert.equal(count(h.events, 'qualified_view'), 1);
  h.tracker.cleanup();
});

test('slower playback also qualifies by active real time, not media-time duration', () => {
  const h = trackerHarness();
  h.begin();
  h.player.playbackRate = 0.5;
  h.player.emit('ratechange');
  h.player.advancePlayback(15, h.clock);
  assert.equal(count(h.events, 'qualified_view'), 0);
  h.player.advancePlayback(15, h.clock);
  assert.equal(count(h.events, 'qualified_view'), 1);
  h.tracker.cleanup();
});

test('replay creates a fresh session and separate play start', () => {
  const h = trackerHarness();
  h.begin();
  h.player.advance(30, h.clock);
  const firstSessionId = h.events[0].sessionId;
  h.player.paused = true;
  h.player.emit('ended');
  h.player.currentTime = 0;
  h.player.paused = false;
  h.player.emit('playing');
  h.player.advance(30, h.clock);
  assert.equal(count(h.events, 'play_start'), 2);
  assert.equal(count(h.events, 'qualified_view'), 2);
  assert.notEqual(h.events[2].sessionId, firstSessionId);
  h.tracker.cleanup();
});

test('cleanup removes all event listeners and stops events after title changes', () => {
  const first = trackerHarness({ videoId: 'title-one' });
  first.begin();
  first.tracker.cleanup();
  const initialCount = first.events.length;
  first.player.advance(40, first.clock);
  assert.equal(first.events.length, initialCount);
  assert.ok([...first.player.listeners.values()].every((count) => count === 0));

  const second = trackerHarness({ videoId: 'title-two' });
  second.begin();
  second.player.advance(30, second.clock);
  assert.ok(second.events.every((event) => event.videoId === 'title-two'));
  second.tracker.cleanup();
});

test('guest dedup identifier persists in first-party storage and is regenerated if malformed', () => {
  let stored = '';
  const storage = {
    getItem(key) { assert.equal(key, 'protv.playbackGuestId'); return stored; },
    setItem(key, value) { assert.equal(key, 'protv.playbackGuestId'); stored = value; },
  };
  let generated = 0;
  const generate = () => {
    generated += 1;
    return GUEST;
  };
  assert.equal(getOrCreatePlaybackGuestId(storage, generate), GUEST);
  assert.equal(getOrCreatePlaybackGuestId(storage, generate), GUEST);
  assert.equal(generated, 1);
  stored = 'not-a-uuid';
  assert.equal(getOrCreatePlaybackGuestId(storage, generate), GUEST);
  assert.equal(generated, 2);
});

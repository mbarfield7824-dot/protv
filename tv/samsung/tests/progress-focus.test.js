const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/js/progress.js');
const F = require('../app/js/focus.js');

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

test('continue watching keeps in-progress titles in recent order and drops finished or unknown ones', () => {
  const progress = {
    a: { positionSeconds: 100, durationSeconds: 1000, updatedAt: 1 },
    b: { positionSeconds: 960, durationSeconds: 1000, updatedAt: 3 }, // 96%: finished
    c: { positionSeconds: 50, durationSeconds: 1000, updatedAt: 5 },
    zzz: { positionSeconds: 50, durationSeconds: 1000, updatedAt: 9 }, // not in catalog
    d: { positionSeconds: 'bad', durationSeconds: 1000 },
  };
  assert.deepEqual(P.continueWatching(items, progress).map((i) => i.id), ['c', 'a']);
});

test('resume position only for valid in-progress entries', () => {
  assert.equal(P.resumePosition({ a: { positionSeconds: 100.7, durationSeconds: 1000 } }, 'a'), 100);
  assert.equal(P.resumePosition({ a: { positionSeconds: 980, durationSeconds: 1000 } }, 'a'), 0);
  assert.equal(P.resumePosition({}, 'a'), 0);
});

test('checkpoints need 20 seconds of movement; forced saves skip unchanged positions', () => {
  assert.equal(P.saveDue(119, 100, false), false);
  assert.equal(P.saveDue(120, 100, false), true);
  assert.equal(P.saveDue(101, 100, true), true);
  assert.equal(P.saveDue(100, 100, true), false);
  assert.equal(P.saveDue(0, 0, true), false);
});

test('guest history is capped to the most recent titles', () => {
  let progress = {};
  for (let i = 0; i < 55; i += 1) progress = P.record(progress, `t${i}`, P.entry(10, 100, i), 50);
  assert.equal(Object.keys(progress).length, 50);
  assert.ok(!('t0' in progress));
  assert.ok('t54' in progress);
});

test('stored progress parsing ignores junk', () => {
  assert.deepEqual(P.parse('not json'), {});
  assert.deepEqual(P.parse('[1,2]'), {});
  assert.deepEqual(Object.keys(P.parse(JSON.stringify({ ok: { positionSeconds: 1, durationSeconds: 2 }, bad: { x: 1 } }))), ['ok']);
});

test('time left labels', () => {
  assert.equal(P.timeLeft({ a: { positionSeconds: 0, durationSeconds: 5400 } }, 'a'), '1h 30m left');
  assert.equal(P.timeLeft({ a: { positionSeconds: 590, durationSeconds: 600 } }, 'a'), '1m left');
});

// ---------- spatial focus ----------
const rect = (left, top, width, height) => ({ left, top, width, height });

test('down from a hero button lands on the aligned card in the row below', () => {
  const current = rect(200, 500, 200, 72);
  const cards = [rect(160, 700, 210, 315), rect(400, 700, 210, 315), rect(640, 700, 210, 315)].map((r) => ({ rect: r }));
  assert.equal(F.nextIndex(current, cards, 'down'), 0);
});

test('left from the first card goes to the navigation rail; nothing beyond an edge', () => {
  const current = rect(160, 700, 210, 315);
  const nav = [{ rect: rect(24, 200, 64, 64) }, { rect: rect(24, 720, 64, 64) }];
  assert.equal(F.nextIndex(current, nav, 'left'), 1, 'prefers the vertically aligned rail item');
  assert.equal(F.nextIndex(current, nav, 'right'), -1);
  assert.equal(F.nextIndex(current, [], 'up'), -1);
});

test('nearest aligned candidate wins over a closer unaligned one', () => {
  const current = rect(500, 500, 100, 100);
  const options = [{ rect: rect(700, 520, 100, 100) }, { rect: rect(620, 900, 100, 100) }];
  assert.equal(F.nextIndex(current, options, 'right'), 0);
});

test('row scrolling keeps the focused card fully visible', () => {
  assert.equal(F.scrollOffset(0, 100, 200, 1000, 20), 0);
  assert.equal(F.scrollOffset(0, 1000, 200, 1000, 20), 220);
  assert.equal(F.scrollOffset(500, 300, 200, 1000, 20), 280);
});

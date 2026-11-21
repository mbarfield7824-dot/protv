import assert from 'node:assert/strict';
import test from 'node:test';
import { premiereLabel } from '../src/utils/premiere.js';

test('Coming Soon labels show the entered Eastern time, the date alone when no time was set, or TBD', () => {
  assert.equal(premiereLabel({ premiereAt: '2026-12-04T01:00:00.000Z', premiereDate: '2026-12-03', premiereTime: '20:00' }), 'Premieres Dec 3, 2026 · 8 PM ET');
  assert.equal(premiereLabel({ premiereAt: '2026-12-06T02:30:00.000Z', premiereDate: '2026-12-05', premiereTime: '21:30' }), 'Premieres Dec 5, 2026 · 9:30 PM ET');
  assert.equal(premiereLabel({ premiereAt: '2026-12-04T17:00:00.000Z', premiereDate: '2026-12-04' }), 'Premieres Dec 4, 2026');
  // Show cards from the catalog carry premiereAt only: the Eastern date is shown, as before.
  assert.equal(premiereLabel({ premiereAt: '2026-12-02T01:00:00.000Z' }), 'Premieres Dec 1, 2026');
  assert.equal(premiereLabel({}), 'Premiere date TBD');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { countdownRemaining, createServerClock, formatCountdown, formatPremiereTime } from '../src/data/linearChannel.js';

test('the countdown follows the server clock, not a wrong device clock or a slow network', () => {
  // Server says 7:50:00 PM ET; the device clock is 3 minutes fast and the request took 400 ms.
  const serverTimeMs = Date.parse('2026-12-04T00:50:00Z');
  const deviceNow = serverTimeMs + 180_000;
  const clock = createServerClock({ serverTimeMs, requestStartedAt: deviceNow - 400, responseReceivedAt: deviceNow });
  assert.equal(countdownRemaining('2026-12-04T01:00:00Z', clock, deviceNow), 600);
  assert.equal(countdownRemaining('2026-12-04T01:00:00Z', clock, deviceNow + 599_200), 1);
  assert.equal(countdownRemaining('2026-12-04T01:00:00Z', clock, deviceNow + 700_000), 0, 'never negative');
});

test('countdown and premiere times are formatted for viewers in Eastern Time across daylight saving', () => {
  assert.equal(formatCountdown(600), '10:00');
  assert.equal(formatCountdown(59), '0:59');
  assert.equal(formatCountdown(1800), '30:00');
  assert.equal(formatCountdown(3725), '1:02:05');
  assert.equal(formatPremiereTime('2026-12-04T01:00:00Z'), '8:00 PM ET', 'EST in December');
  assert.equal(formatPremiereTime('2027-06-04T00:00:00Z'), '8:00 PM ET', 'EDT in June');
});

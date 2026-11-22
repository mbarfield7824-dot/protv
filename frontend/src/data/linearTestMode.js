// PROtv LIVE Administrator test mode: where each test button jumps to, worked out from the approved schedule.
// The server evaluates the channel at the chosen moment; nothing here changes the schedule or the real broadcast.
import { CHANNEL_TIME_ZONE } from './linearChannel.js';

export const TEST_PAST_MS = 86_400_000;
export const TEST_AHEAD_MS = 35 * 86_400_000;
const HANDOFF_LEAD_MS = 5_000;
const ENDING_LEAD_MS = 10_000;
const COUNTDOWN_FINAL_MS = 20_000;

const startMs = (entry) => Date.parse(entry.startAt);
const endMs = (entry) => Date.parse(entry.endAt);
const approvedOnly = (items) => (items || [])
  .filter((entry) => entry && entry.status === 'approved' && Number.isFinite(startMs(entry)) && Number.isFinite(endMs(entry)))
  .sort((a, b) => startMs(a) - startMs(b));

// Keeps a test time inside the range the server accepts.
export function clampTestTime(ms, realNow = Date.now()) {
  return Math.round(Math.min(realNow + TEST_AHEAD_MS - 60_000, Math.max(realNow - TEST_PAST_MS + 60_000, ms)));
}

export function testDayTime(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: CHANNEL_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function testClockLabel(ms) {
  return `${new Intl.DateTimeFormat('en-US', { timeZone: CHANNEL_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(ms))} ET`;
}

// The dropdown: approved programs (not breaks or countdowns), in air order.
export function testPrograms(items) {
  return approvedOnly(items)
    .filter((entry) => entry.kind !== 'break' && entry.kind !== 'countdown')
    .map((entry) => ({ id: entry.id, startAt: entry.startAt, endAt: entry.endAt, label: `${testDayTime(entry.startAt)} ET · ${entry.title || 'Program'}` }));
}

// Every jump the test panel offers from a simulated moment. A missing target means there is none in the loaded range.
export function testTargets(items, simulatedNow, selectedId = null) {
  const entries = approvedOnly(items);
  const onAir = entries.find((entry) => startMs(entry) <= simulatedNow && endMs(entry) > simulatedNow) || null;
  const after = (predicate) => entries.find((entry) => startMs(entry) > simulatedNow && predicate(entry)) || null;
  const nextBreak = after((entry) => entry.kind === 'break');
  const nextCountdown = after((entry) => entry.kind === 'countdown')
    || (onAir?.kind === 'countdown' ? onAir : null);
  const nextEntry = after(() => true);
  const selected = selectedId ? entries.find((entry) => entry.id === selectedId) || null : null;
  const handoffAt = onAir ? endMs(onAir) - HANDOFF_LEAD_MS : nextEntry ? startMs(nextEntry) - HANDOFF_LEAD_MS : null;
  return {
    programStart: selected ? startMs(selected) : null,
    programEnding: selected ? Math.max(startMs(selected), endMs(selected) - ENDING_LEAD_MS) : null,
    nextBreak: nextBreak ? startMs(nextBreak) : null,
    beforeNextBreak: nextBreak ? startMs(nextBreak) - HANDOFF_LEAD_MS : null,
    handoff: handoffAt !== null && handoffAt > simulatedNow ? handoffAt : null,
    countdownStart: nextCountdown ? startMs(nextCountdown) : null,
    countdownFinal: nextCountdown ? Math.max(startMs(nextCountdown), endMs(nextCountdown) - COUNTDOWN_FINAL_MS) : null,
  };
}

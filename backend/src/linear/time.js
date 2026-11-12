// Channel time. The schedule is stored in UTC; administrators and viewers read it in America/New_York.
const CHANNEL_TIME_ZONE = 'America/New_York';
const LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const formatters = new Map();
function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
    }));
  }
  return formatters.get(timeZone);
}

function zonedParts(epochMs, timeZone = CHANNEL_TIME_ZONE) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(epochMs))
    .filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    local: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
  };
}

class ChannelTimeError extends Error {}

// Converts a wall-clock time in the channel's zone to UTC. During the autumn repeated hour both instants exist;
// `fold` picks the first (daylight time) or second (standard time). A spring-forward gap time does not exist.
function channelLocalToUtc(localTime, { timeZone = CHANNEL_TIME_ZONE, fold } = {}) {
  if (typeof localTime !== 'string' || !LOCAL_PATTERN.test(localTime)) {
    throw new ChannelTimeError('Enter the start time as YYYY-MM-DDTHH:mm in Eastern Time.');
  }
  const naive = Date.parse(`${localTime}:00Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 16) !== localTime) {
    throw new ChannelTimeError('The start date and time are invalid.');
  }
  const matches = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = naive - offsetMinutes * 60_000;
    if (zonedParts(candidate, timeZone).local === localTime) matches.push(candidate);
  }
  if (matches.length === 0) {
    throw new ChannelTimeError('That time does not exist in Eastern Time (clocks spring forward). Choose another time.');
  }
  matches.sort((left, right) => left - right);
  if (matches.length > 1 && fold !== 'first' && fold !== 'second') {
    throw new ChannelTimeError('That time occurs twice when clocks fall back. Choose the first (EDT) or second (EST) occurrence.');
  }
  return new Date(fold === 'second' ? matches[matches.length - 1] : matches[0]).toISOString();
}

function channelLabel(iso, timeZone = CHANNEL_TIME_ZONE) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
  return `${day}, ${time}`;
}

// The Monday-to-Sunday channel week starting on a local Monday, as YYYY-MM-DD local dates.
function channelWeekDates(mondayDate) {
  if (typeof mondayDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(mondayDate)) {
    throw new ChannelTimeError('Choose the week by its Monday date (YYYY-MM-DD).');
  }
  const base = Date.parse(`${mondayDate}T12:00:00Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 10) !== mondayDate || new Date(base).getUTCDay() !== 1) {
    throw new ChannelTimeError('The week must start on a Monday.');
  }
  return Array.from({ length: 7 }, (_, index) => new Date(base + index * 86_400_000).toISOString().slice(0, 10));
}

module.exports = { CHANNEL_TIME_ZONE, ChannelTimeError, channelLabel, channelLocalToUtc, channelWeekDates, zonedParts };

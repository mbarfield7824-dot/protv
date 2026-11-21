const { localTimeToUtc } = require('./releases');

// Coming Soon promotion premieres, in PROtv's broadcast time zone (Eastern, with daylight saving).
// A promotion has a premiere DATE, and optionally a TIME on that date:
//   - date and time (for example 8:00 PM ET): the premiere is that exact moment;
//   - date only: the premiere is that calendar day, so it lasts until the day ends in Eastern time.
// Nothing here assigns a time that an Administrator did not enter.
const EASTERN = 'America/New_York';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// The earlier Admin form saved a date-only premiere as 17:00 UTC on that date. Those records stay date-only.
const LEGACY_DATE_ONLY = /^\d{4}-\d{2}-\d{2}T17:00:00(\.000)?Z$/;

class PremiereInputError extends Error {}

function wallClock(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function nextDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function validDate(date) {
  if (typeof date !== 'string' || !DATE.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === date;
}

function eastern(local) {
  try { return localTimeToUtc(local, EASTERN); } catch (error) { throw new PremiereInputError(error.message); }
}

// Facts from a premiere date and optional time: the instant, and when the premiere has passed.
function premiereFromParts(date, time) {
  if (!validDate(date)) throw new PremiereInputError('Enter a valid premiere date or choose TBD.');
  if (time !== null && (typeof time !== 'string' || !TIME.test(time))) throw new PremiereInputError('Enter the premiere time as HH:MM, or leave it blank.');
  // Date only: noon Eastern stands for the day (it never falls on another calendar day in the US); the premiere
  // lasts until midnight Eastern at the end of that day.
  const at = eastern(`${date}T${time || '12:00'}`);
  return { premiereDate: date, premiereTime: time, premiereAt: at, endsAt: time ? at : eastern(`${nextDate(date)}T00:00`) };
}

// The premiere a stored promotion describes, or null for TBD. Records saved before dates and times were stored
// separately carry only premiereAt: the old form's 17:00 UTC value is date-only, anything else is an exact time.
function promotionPremiere(promotion) {
  if (!promotion) return null;
  if (typeof promotion.premiereDate === 'string' && promotion.premiereDate) {
    return premiereFromParts(promotion.premiereDate, promotion.premiereTime || null);
  }
  const value = promotion.premiereAt;
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return null;
  if (DATE.test(value)) return premiereFromParts(value, null);
  if (LEGACY_DATE_ONLY.test(value)) return premiereFromParts(value.slice(0, 10), null);
  const at = new Date(Date.parse(value)).toISOString();
  const local = wallClock(at);
  return { premiereDate: local.date, premiereTime: local.time, premiereAt: at, endsAt: at };
}

// Administrator input: { premiereDate, premiereTime } (Eastern), or the earlier { premiereAt } form. Blank means TBD.
function premiereInput(body = {}) {
  const blank = (value) => value === undefined || value === null || value === '';
  if (!blank(body.premiereDate)) {
    if (typeof body.premiereDate !== 'string') throw new PremiereInputError('Enter a valid premiere date or choose TBD.');
    return premiereFromParts(body.premiereDate, blank(body.premiereTime) ? null : body.premiereTime);
  }
  if (!blank(body.premiereTime)) throw new PremiereInputError('Choose a premiere date for this time, or choose TBD.');
  if (blank(body.premiereAt)) return null;
  if (typeof body.premiereAt !== 'string' || !Number.isFinite(Date.parse(body.premiereAt))) {
    throw new PremiereInputError('Enter a valid premiere date or choose TBD.');
  }
  return promotionPremiere({ premiereAt: body.premiereAt });
}

module.exports = { EASTERN, PremiereInputError, premiereInput, promotionPremiere, premiereFromParts };

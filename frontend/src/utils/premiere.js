const EASTERN = 'America/New_York';

// Show-level premiere wording. Both values come from a schedule an Administrator confirmed; nothing is guessed.
export function premiereText(premiereAt) {
  return `Premieres ${new Date(premiereAt).toLocaleString('en-US', {
    timeZone: EASTERN, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })} ET`;
}

export function airingText({ weekday, time }) {
  const [hour, minute] = time.split(':').map(Number);
  const clock = `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
  return `New episodes ${weekday}s at ${clock} ET`;
}

// A Coming Soon card or Admin promotion: "Premieres Dec 3, 2026 · 8 PM ET" when a time was set, the date alone when it
// was not, and TBD without a date. Dates are Eastern calendar days. Older cards carry premiereAt only (date shown).
export function premiereLabel(item) {
  const date = item?.premiereDate
    || (item?.premiereAt ? new Date(item.premiereAt).toLocaleDateString('en-CA', { timeZone: EASTERN }) : '');
  if (!date) return 'Premiere date TBD';
  const [year, month, day] = date.split('-').map(Number);
  const shown = new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  });
  if (!item.premiereTime) return `Premieres ${shown}`;
  const [hour, minute] = item.premiereTime.split(':').map(Number);
  const clock = `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
  return `Premieres ${shown} · ${clock} ET`;
}

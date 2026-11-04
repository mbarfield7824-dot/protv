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

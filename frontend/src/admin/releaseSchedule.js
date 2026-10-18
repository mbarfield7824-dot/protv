function zoneParts(time, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(time));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function scheduleToUtc(value, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('Choose a release date and time.');
  }
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== value) {
    throw new Error('The release date is invalid.');
  }
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = nominal + hours * 3600_000;
    offsets.add(Date.parse(`${zoneParts(sample, timeZone)}:00Z`) - sample);
  }
  const matches = [...offsets].map((offset) => nominal - offset)
    .filter((candidate) => zoneParts(candidate, timeZone) === value);
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? 'This time occurs twice because of daylight saving. Select UTC and enter the intended UTC time.'
      : 'This time does not exist because of daylight saving. Choose another time.');
  }
  return new Date(matches[0]).toISOString();
}

export function scheduleInZone(value, timeZone) {
  return value ? zoneParts(Date.parse(value), timeZone) : '';
}

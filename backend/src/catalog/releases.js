// Release gate for catalog records. Records without release fields keep their existing visibility.
function releaseAllowed(record, now = Date.now()) {
  if (record?.releaseStatus === undefined || record.releaseStatus === null) return true;
  if (record.releaseStatus === 'published') return true;
  return record.releaseStatus === 'scheduled'
    && typeof record.releaseAt === 'string'
    && Number.isFinite(Date.parse(record.releaseAt))
    && Date.parse(record.releaseAt) <= now;
}

function localTimeToUtc(localTime, timeZone) {
  if (typeof localTime !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime)
    || typeof timeZone !== 'string' || !timeZone) {
    throw new Error('A valid local premiere time and IANA time zone are required.');
  }
  const naive = Date.parse(`${localTime}:00Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 16) !== localTime) {
    throw new Error('The premiere date and time are invalid.');
  }
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw new Error('The premiere time zone is invalid.');
  }
  const matches = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = naive - offsetMinutes * 60_000;
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const formatted = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    if (formatted === localTime) matches.push(candidate);
  }
  if (matches.length === 0) throw new Error('The premiere time does not exist in this time zone.');
  if (matches.length > 1) throw new Error('The premiere time is ambiguous in this time zone.');
  return new Date(matches[0]).toISOString();
}

function scheduledRelease(input, now = Date.now()) {
  if (!input || input.releaseAtLocal === undefined || input.releaseAtLocal === '') return null;
  if (!['MOVIE', 'EPISODE'].includes(input.contentType)) {
    throw new Error('Premiere scheduling is supported for movies and TV episodes only.');
  }
  if (typeof input.rightsHolder !== 'string' || !input.rightsHolder.trim()
    || typeof input.rightsVerificationNotes !== 'string' || !input.rightsVerificationNotes.trim()) {
    throw new Error('Scheduled releases require a rights holder and documented rights notes.');
  }
  const releaseAt = localTimeToUtc(input.releaseAtLocal, input.releaseTimeZone);
  if (Date.parse(releaseAt) <= now) throw new Error('The premiere time must be in the future.');
  return {
    releaseStatus: 'scheduled',
    releaseAt,
    releaseTimeZone: input.releaseTimeZone,
  };
}

module.exports = { releaseAllowed, localTimeToUtc, scheduledRelease };

const STATUSES = new Set(['draft', 'scheduled', 'live', 'ended', 'cancelled']);
const ACCESS_POLICIES = new Set(['free', 'paid']);

function isDiscoverable(event) {
  return event?.published === true
    && event.status === 'scheduled'
    && event.accessPolicy === 'free';
}

function publicDate(value) {
  const date = value instanceof Date ? value : value?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('Live event has an invalid schedule.');
  }
  return date.toISOString();
}

function publicEvent(event) {
  if (!STATUSES.has(event.status) || !ACCESS_POLICIES.has(event.accessPolicy)
    || typeof event.id !== 'string' || !event.id.trim()
    || typeof event.title !== 'string' || !event.title.trim()
    || typeof event.description !== 'string'
    || typeof event.artworkUrl !== 'string') {
    throw new Error('Live event has invalid public metadata.');
  }
  const scheduledStartAt = publicDate(event.scheduledStartAt);
  const scheduledEndAt = publicDate(event.scheduledEndAt);
  if (scheduledEndAt <= scheduledStartAt) throw new Error('Live event has an invalid schedule.');

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    artworkUrl: event.artworkUrl,
    scheduledStartAt,
    scheduledEndAt,
    status: event.status,
    accessPolicy: event.accessPolicy,
  };
}

function discoverableEvents(events) {
  return events.filter(isDiscoverable).map(publicEvent)
    .sort((left, right) => left.scheduledStartAt.localeCompare(right.scheduledStartAt)
      || left.id.localeCompare(right.id));
}

module.exports = { isDiscoverable, publicDate, publicEvent, discoverableEvents };

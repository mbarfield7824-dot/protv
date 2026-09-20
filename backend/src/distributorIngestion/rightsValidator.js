const WORLDWIDE_TERRITORIES = new Set(['ALL', 'WORLDWIDE', 'WW']);

function validateRightsWindow(rights, requiredTerritory, now = new Date()) {
  if (!rights.confirmedForStreaming) {
    return { eligible: false, reason: 'Streaming rights have not been confirmed by the distributor.' };
  }
  const startsAt = new Date(rights.startAt);
  const endsAt = new Date(rights.endAt);
  if (now < startsAt) {
    return { eligible: false, reason: `Rights begin on ${startsAt.toLocaleDateString()}.` };
  }
  if (now >= endsAt) {
    return { eligible: false, reason: `Rights expired on ${endsAt.toLocaleDateString()}.` };
  }
  const territory = String(requiredTerritory || 'US').trim().toUpperCase();
  const territories = new Set(rights.territories.map((value) => value.toUpperCase()));
  const worldwide = [...WORLDWIDE_TERRITORIES].some((value) => territories.has(value));
  if (!worldwide && !territories.has(territory)) {
    return { eligible: false, reason: `Rights do not include the required ${territory} territory.` };
  }
  return { eligible: true, reason: '' };
}

module.exports = { validateRightsWindow };

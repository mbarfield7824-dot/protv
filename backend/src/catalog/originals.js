// PROtv Original is a deliberate Administrator branding designation stored on a title's own catalog record
// (protvOriginal: true). It is independent of genres and never affects approval, rights or platform eligibility.
// A released Creator Portal film inherits the designation from its Coming Soon listing (same project), so it stays an
// Original after its premiere without a second record or a second flag.
const ORIGINAL_TYPES = new Set(['MOVIE', 'SERIES']);

function originalProjectIds(records) {
  return new Set(records
    .filter(record => record?.protvOriginal === true && typeof record.comingSoonProjectId === 'string' && record.comingSoonProjectId)
    .map(record => record.comingSoonProjectId));
}

function isProtvOriginal(record, projectIds) {
  if (!record || !ORIGINAL_TYPES.has(record.contentType)) return false;
  return record.protvOriginal === true
    || (record.contentType === 'MOVIE' && typeof record.creatorProjectId === 'string' && projectIds.has(record.creatorProjectId));
}

module.exports = { ORIGINAL_TYPES, originalProjectIds, isProtvOriginal };

// Release gate for catalog records. Records without release fields keep their existing visibility.
function releaseAllowed(record, now = Date.now()) {
  if (record?.releaseStatus === undefined || record.releaseStatus === null) return true;
  if (record.releaseStatus === 'published') return true;
  return record.releaseStatus === 'scheduled'
    && typeof record.releaseAt === 'string'
    && Number.isFinite(Date.parse(record.releaseAt))
    && Date.parse(record.releaseAt) <= now;
}

module.exports = { releaseAllowed };

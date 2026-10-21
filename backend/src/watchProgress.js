// Older set() writes created literal dotted fields; retain those sessions on the next read.
function restoredWatchProgress(profile = {}) {
  const progress = { ...(profile.watchProgress || {}) };
  const timestamp = (value) => Number.isFinite(value?.updatedAt) ? value.updatedAt : 0;
  for (const [key, entry] of Object.entries(profile)) {
    if (!key.startsWith('watchProgress.')) continue;
    const id = key.slice('watchProgress.'.length);
    if (id && entry && (!progress[id] || timestamp(entry) > timestamp(progress[id]))) {
      progress[id] = entry;
    }
  }
  return progress;
}

module.exports = { restoredWatchProgress };

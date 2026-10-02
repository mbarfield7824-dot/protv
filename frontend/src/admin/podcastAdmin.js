export const EMPTY_SHOW = {
  title: '', description: '', artworkUrl: '', host: '', creator: '', category: '', genres: '',
};
export const EMPTY_EPISODE = {
  title: '', description: '', thumbnailUrl: '', posterUrl: '', category: '', genres: '',
  podcastShowId: '', episodeNumber: '', rightsHolder: '', rightsVerificationNotes: '',
};

function genres(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

export function showForm(show) {
  if (!show) return { ...EMPTY_SHOW };
  return Object.fromEntries(Object.keys(EMPTY_SHOW).map((key) => [
    key, key === 'genres' ? genres(show.genres) : show[key] || '',
  ]));
}

export function episodeForm(episode, showId = '') {
  if (!episode) return { ...EMPTY_EPISODE, podcastShowId: showId };
  return Object.fromEntries(Object.keys(EMPTY_EPISODE).map((key) => [
    key, key === 'genres' ? genres(episode.genres)
      : key === 'episodeNumber' ? String(episode.episodeNumber ?? '')
        : episode[key] || '',
  ]));
}

function fields(form, names) {
  return Object.fromEntries(names.map((name) => [name, form[name].trim()]));
}

function parsedGenres(value) {
  return [...new Set(value.split(',').map((genre) => genre.trim()).filter(Boolean))];
}

export function showPayload(form) {
  return {
    ...fields(form, ['title', 'description', 'artworkUrl', 'host', 'creator', 'category']),
    genres: parsedGenres(form.genres),
  };
}

export function episodePayload(form, shows) {
  if (!shows.some((show) => show.id === form.podcastShowId)) {
    throw new Error('Select an existing Podcast Show.');
  }
  const number = Number(form.episodeNumber);
  if (!/^[1-9]\d*$/.test(String(form.episodeNumber).trim()) || !Number.isSafeInteger(number)) {
    throw new Error('Episode number must be a positive whole number.');
  }
  return {
    ...fields(form, [
      'title', 'description', 'thumbnailUrl', 'posterUrl', 'category',
      'rightsHolder', 'rightsVerificationNotes',
    ]),
    genres: parsedGenres(form.genres),
    podcastShowId: form.podcastShowId,
    episodeNumber: number,
  };
}

export function mergeEpisodeStatus(episode, status) {
  if (status.id !== episode.id || status.contentType !== 'PODCAST_EPISODE') {
    throw new Error('Unexpected Podcast status response.');
  }
  const allowed = ['status', 'muxPlaybackId', 'muxAssetId', 'duration'];
  return {
    ...episode,
    ...Object.fromEntries(allowed.filter((key) => Object.hasOwn(status, key)).map((key) => [key, status[key]])),
  };
}

export function isPodcast(video) {
  return video.contentType === 'PODCAST_SHOW' || video.contentType === 'PODCAST_EPISODE';
}

export function episodeAfterShowSave(draft, showId) {
  return draft.podcastShowId ? draft : { ...draft, podcastShowId: showId };
}

export function episodeActions(episode) {
  return {
    canIngest: episode?.approvalStatus === 'draft'
      && episode.status !== 'processing'
      && (!episode.muxAssetId || episode.status === 'errored')
      && (!episode.muxUploadId || episode.status !== 'processing'),
    canApprove: episode?.status === 'ready' && Boolean(episode.muxPlaybackId),
  };
}

export function createPodcastReconciler() {
  const accepted = new Map();
  return {
    idFor(type, selectedId) {
      return accepted.get(type) || selectedId;
    },
    accept(type, record) {
      if (typeof record?.id !== 'string' || !record.id) {
        throw new Error(`The accepted ${type} response has no ID; refresh before making further changes.`);
      }
      accepted.set(type, record.id);
    },
    reconcile(records) {
      const matches = {};
      for (const [type, id] of accepted) {
        const record = records.find((item) => item.id === id && item.contentType === type);
        if (!record) throw new Error(`Accepted ${type} ${id} is not in the Admin catalog yet. Refresh before making further changes.`);
        matches[type] = record;
      }
      accepted.clear();
      return matches;
    },
  };
}

export async function recoverPodcastConflict(error, refresh) {
  try {
    await refresh();
    return { stale: false, message: `${error.message} Catalog refreshed; review the current state before trying again.` };
  } catch (refreshError) {
    return { stale: true, message: `${error.message} Catalog refresh failed: ${refreshError.message}. Refresh before making further changes.` };
  }
}

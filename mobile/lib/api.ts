import { API_BASE_URL, CREATOR_PORTAL_ORIGIN, DEMO_HLS_URL, DEMO_MODE } from './config';
import type { CatalogTitle, OriginalsIndex } from '../data/catalog';

type CatalogResponse = { items?: unknown };
type PlaybackResponse = {
  id?: unknown;
  streamType?: unknown;
  muxPlaybackId?: unknown;
  playbackToken?: unknown;
};

export type WatchProgress = {
  positionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  updatedAt: number;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function addedAtField(item: Record<string, unknown>): { addedAt?: number } {
  for (const key of ['addedAt', 'publishedAt', 'createdAt']) {
    const value = item[key];
    const time = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
    if (Number.isFinite(time) && time > 0) return { addedAt: time };
  }
  return {};
}

function normalizeCatalogTitle(value: unknown): CatalogTitle | null {
  const item = objectValue(value);
  if (typeof item.id !== 'string' || typeof item.title !== 'string') return null;
  const genres = Array.isArray(item.genres)
    ? item.genres.filter((genre): genre is string => typeof genre === 'string')
    : [];
  return {
    id: item.id,
    title: item.title,
    description: typeof item.description === 'string' ? item.description : '',
    category: typeof item.category === 'string' ? item.category : '',
    contentType: typeof item.contentType === 'string' ? item.contentType : 'MOVIE',
    year: typeof item.year === 'number' ? item.year : 0,
    duration: typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0
      ? Math.ceil(item.duration / 60) : 0,
    maturityRating: typeof item.maturityRating === 'string' ? item.maturityRating : '',
    genres,
    ...Object.fromEntries(['posterUrl', 'thumbnailUrl', 'heroImageUrl'].flatMap((key) => (
      typeof item[key] === 'string' && /^(https:\/\/|data:image\/)/i.test(item[key])
        ? [[key, item[key]]] : []
    ))),
    ...(typeof item.subgenre === 'string' && item.subgenre ? { subgenre: item.subgenre } : {}),
    ...(typeof item.credits === 'string' && item.credits ? { credits: item.credits } : {}),
    ...(typeof item.creatorProjectId === 'string' && item.creatorProjectId ? { creatorProjectId: item.creatorProjectId } : {}),
    ...addedAtField(item),
    ...(typeof item.seriesId === 'string' ? { seriesId: item.seriesId } : {}),
    ...(typeof item.seriesTitle === 'string' ? { seriesTitle: item.seriesTitle } : {}),
    ...(typeof item.seasonNumber === 'number' ? { seasonNumber: item.seasonNumber } : {}),
    ...(typeof item.episodeNumber === 'number' ? { episodeNumber: item.episodeNumber } : {}),
  };
}

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) throw new Error('The PROtv API is not configured.');
  if (!API_BASE_URL.startsWith('https://')) throw new Error('The PROtv API must use HTTPS.');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const bodyText = await response.text();
  let payload: unknown;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    throw new Error(`PROtv returned an invalid response (${response.status}). Please try again.`);
  }
  if (!response.ok) {
    const body = objectValue(payload);
    throw new Error(typeof body.error === 'string' ? body.error : `PROtv API request failed (${response.status}).`);
  }
  return payload as T;
}

export async function fetchCatalog(): Promise<CatalogTitle[]> {
  const payload = await request<CatalogResponse>('/v1/catalog?view=all');
  if (!Array.isArray(payload.items)) throw new Error('The catalog response did not contain an items list.');
  const titles = payload.items.map(normalizeCatalogTitle);
  if (titles.some((title) => title === null)) throw new Error('The catalog contains an invalid title.');
  return titles.filter((title): title is CatalogTitle => title !== null);
}

// PROtv Originals the Administrator has designated and released. Coming Soon entries are left out, so an Original is
// never featured before it can be watched. Matching against the playable catalog happens in data/catalog.ts.
export async function fetchOriginals(): Promise<OriginalsIndex> {
  const payload = await request<{ items?: unknown }>('/v1/catalog/originals');
  if (!Array.isArray(payload.items)) throw new Error('The PROtv Originals response did not contain an items list.');
  const titleIds: string[] = [];
  const seriesTitles: string[] = [];
  for (const value of payload.items) {
    const item = objectValue(value);
    if (item.comingSoon === true || typeof item.id !== 'string') continue;
    if (item.kind === 'title' && item.watchAvailable === true) titleIds.push(item.id);
    if (item.kind === 'series' && typeof item.title === 'string' && item.title.trim()) seriesTitles.push(item.title);
  }
  return { titleIds, seriesTitles };
}

export async function fetchViewerAccount(token: string): Promise<{
  favorites: string[];
  progress: Record<string, WatchProgress>;
}> {
  const [favorites, progress] = await Promise.all([
    request<unknown>('/users/me/favorites', token),
    request<unknown>('/users/me/progress', token),
  ]);
  if (!Array.isArray(favorites) || !favorites.every((id) => typeof id === 'string')) {
    throw new Error('The My List response is invalid.');
  }
  const progressEntries = objectValue(progress);
  const normalizedProgress: Record<string, WatchProgress> = {};
  for (const [titleId, value] of Object.entries(progressEntries)) {
    const entry = objectValue(value);
    if (
      !titleId
      || typeof entry.positionSeconds !== 'number'
      || !Number.isFinite(entry.positionSeconds)
      || entry.positionSeconds < 0
      || typeof entry.durationSeconds !== 'number'
      || !Number.isFinite(entry.durationSeconds)
      || entry.durationSeconds <= 0
      || typeof entry.progressPercent !== 'number'
      || !Number.isInteger(entry.progressPercent)
      || entry.progressPercent < 0
      || entry.progressPercent > 100
      || typeof entry.updatedAt !== 'number'
      || !Number.isFinite(entry.updatedAt)
    ) {
      throw new Error('The Continue Watching response is invalid.');
    }
    normalizedProgress[titleId] = {
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
      progressPercent: entry.progressPercent,
      updatedAt: entry.updatedAt,
    };
  }
  return { favorites, progress: normalizedProgress };
}

export async function setFavorite(token: string, videoId: string, favorite: boolean): Promise<void> {
  await request(`/users/me/favorites/${encodeURIComponent(videoId)}`, token, {
    method: 'PUT',
    body: JSON.stringify({ favorite }),
  });
}

export async function saveProgress(
  token: string,
  videoId: string,
  positionSeconds: number,
  durationSeconds: number,
): Promise<WatchProgress> {
  return request(`/users/me/progress/${encodeURIComponent(videoId)}`, token, {
    method: 'PUT',
    body: JSON.stringify({ positionSeconds, durationSeconds }),
  });
}

export async function fetchPlaybackUrl(titleId: string): Promise<string> {
  if (DEMO_MODE) return DEMO_HLS_URL;
  const payload = await request<PlaybackResponse>(
    `/v1/catalog/titles/${encodeURIComponent(titleId)}/playback`,
  );
  if (payload.id !== titleId || payload.streamType !== 'on-demand'
    || typeof payload.muxPlaybackId !== 'string'
    || !/^[A-Za-z0-9]+$/.test(payload.muxPlaybackId)) {
    throw new Error('The playback response is invalid.');
  }
  const url = `https://stream.mux.com/${payload.muxPlaybackId}.m3u8`;
  if (payload.playbackToken === undefined) return url;
  if (typeof payload.playbackToken !== 'string'
    || !/^[A-Za-z0-9_.-]+$/.test(payload.playbackToken)) {
    throw new Error('The signed playback token is invalid.');
  }
  return `${url}?token=${encodeURIComponent(payload.playbackToken)}`;
}

export async function fetchCreatorPortalUrl(token: string): Promise<string> {
  const payload = await request<{ url?: unknown }>('/auth/creator-sso', token, { method: 'POST' });
  if (typeof payload.url !== 'string') throw new Error('Creator Portal did not return a URL.');
  const url = new URL(payload.url);
  if (url.protocol !== 'https:' || url.origin !== CREATOR_PORTAL_ORIGIN
    || url.username || url.password) {
    throw new Error('Creator Portal returned an unapproved destination.');
  }
  return url.toString();
}

export const isApiConfigured = Boolean(API_BASE_URL);

export type DeletionRequest = {
  status: string;
  requestedAt: string | null;
  updatedAt: string | null;
  adminMessage: string;
};

function normalizeDeletionRequest(payload: unknown): DeletionRequest | null {
  const value = objectValue(payload).request;
  if (value === null) return null;
  const item = objectValue(value);
  if (typeof item.status !== 'string') throw new Error('The account deletion response is invalid.');
  return {
    status: item.status,
    requestedAt: typeof item.requestedAt === 'string' ? item.requestedAt : null,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : null,
    adminMessage: typeof item.adminMessage === 'string' ? item.adminMessage : '',
  };
}

export async function fetchDeletionRequest(token: string): Promise<DeletionRequest | null> {
  return normalizeDeletionRequest(await request<unknown>('/users/me/deletion-request', token));
}

// Submitting is idempotent per account. The token must come from a sign-in within the last five minutes.
export async function submitDeletionRequest(token: string): Promise<DeletionRequest> {
  const result = normalizeDeletionRequest(await request<unknown>('/users/me/deletion-request', token, { method: 'POST' }));
  if (!result) throw new Error('The account deletion response is invalid.');
  return result;
}

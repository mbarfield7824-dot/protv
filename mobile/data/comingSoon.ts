import type { CatalogTitle } from './catalog';

// Promotional Coming Soon entries from GET /v1/catalog/coming-soon. They carry no playback identifiers: a title only
// becomes playable when the backend releases it into the normal catalog at its scheduled time.
export type ComingSoonItem = {
  id: string;
  kind: 'title' | 'series';
  title: string;
  description: string;
  artwork?: string;
  categories: string[];
  protvOriginal: boolean;
  premiereAt?: string;
  airingSchedule?: { weekday: string; time: string };
  trailerAvailable: boolean;
};

export const EASTERN = 'America/New_York';

function premiereTime(item: ComingSoonItem): number {
  const time = item.premiereAt ? Date.parse(item.premiereAt) : NaN;
  return Number.isFinite(time) ? time : Infinity;
}

function sameName(left: string | undefined, right: string | undefined) {
  const normalize = (value: string | undefined) => (value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}

// The playable catalog title (film) or first episode (show) once an upcoming entry has been released.
export function releasedTitleFor(item: ComingSoonItem, titles: CatalogTitle[]): CatalogTitle | undefined {
  if (item.kind === 'title') return titles.find((title) => title.id === item.id);
  return titles
    .filter((title) => title.contentType === 'EPISODE' && sameName(title.seriesTitle, item.title))
    .sort((left, right) => (left.seasonNumber ?? 1) - (right.seasonNumber ?? 1) || (left.episodeNumber ?? 1) - (right.episodeNumber ?? 1))[0];
}

// What the Coming Soon row shows: entries that are still upcoming. An entry leaves the row as soon as its premiere
// time passes or its title reaches the playable catalog, even before the next refresh. Soonest premiere first;
// entries without a confirmed date follow, by name.
export function upcomingItems(items: ComingSoonItem[], titles: CatalogTitle[], now = Date.now()): ComingSoonItem[] {
  return items
    .filter((item) => premiereTime(item) > now && !releasedTitleFor(item, titles))
    .sort((left, right) => premiereTime(left) - premiereTime(right) || left.title.localeCompare(right.title));
}

// The next premiere still ahead, so the app can reload the catalog right when it happens.
export function nextPremiere(items: ComingSoonItem[], now = Date.now()): number | undefined {
  const times = items.map(premiereTime).filter((time) => Number.isFinite(time) && time > now);
  return times.length ? Math.min(...times) : undefined;
}

function easternParts(premiereAt: string, options: Intl.DateTimeFormatOptions) {
  return new Date(premiereAt).toLocaleString('en-US', { timeZone: EASTERN, ...options });
}

// Same wording as the website (frontend/src/utils/premiere.js and ComingSoonCard.jsx), always in Eastern time.
export function premiereShort(premiereAt: string | undefined): string {
  if (!premiereAt || !Number.isFinite(Date.parse(premiereAt))) return 'Premiere date to be announced';
  return `Premieres ${easternParts(premiereAt, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function premiereLong(premiereAt: string | undefined): string {
  if (!premiereAt || !Number.isFinite(Date.parse(premiereAt))) return 'Premiere date to be announced';
  return `Premieres ${easternParts(premiereAt, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })} ET`;
}

export function airingText(schedule: { weekday: string; time: string } | undefined): string {
  if (!schedule || !/^\d{1,2}:\d{2}$/.test(schedule.time)) return '';
  const [hour, minute] = schedule.time.split(':').map(Number);
  const clock = `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
  return `New episodes ${schedule.weekday}s at ${clock} ET`;
}

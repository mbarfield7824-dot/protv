export type CatalogTitle = {
  id: string;
  title: string;
  description: string;
  category: string;
  contentType: string;
  year: number;
  duration: number;
  maturityRating: string;
  genres: string[];
  posterUrl?: string;
  thumbnailUrl?: string;
  heroImageUrl?: string;
  seriesId?: string;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  subgenre?: string;
  credits?: string;
  creatorProjectId?: string;
  addedAt?: number;
};

export type HomeRail = { key: string; title: string; items: CatalogTitle[] };

type ProgressEntry = { progressPercent: number; updatedAt: number };

const COMPLETED_PERCENT = 95;
const CLASSIC_CUTOFF_YEAR = 1970;

function text(value: string | undefined) {
  return (value || '').toLocaleLowerCase();
}

function inCategory(title: CatalogTitle, ...names: string[]) {
  const labels = [title.category, title.subgenre, ...title.genres].map(text);
  return names.some((name) => labels.some((label) => label.includes(name)));
}

function isSeries(title: CatalogTitle) {
  return title.contentType === 'EPISODE' || title.contentType === 'SERIES';
}

function byRecent(progress: Record<string, ProgressEntry>) {
  return (left: CatalogTitle, right: CatalogTitle) => progress[right.id].updatedAt - progress[left.id].updatedAt;
}

export function continueWatching(titles: CatalogTitle[], progress: Record<string, ProgressEntry>): CatalogTitle[] {
  return titles.filter((title) => progress[title.id] && progress[title.id].progressPercent < COMPLETED_PERCENT)
    .sort(byRecent(progress));
}

export function watchHistory(titles: CatalogTitle[], progress: Record<string, ProgressEntry>): CatalogTitle[] {
  return titles.filter((title) => progress[title.id]).sort(byRecent(progress));
}

// One card per show: its first episode, labelled with the show's name.
export function seriesCards(titles: CatalogTitle[]): CatalogTitle[] {
  const shows = new Map<string, CatalogTitle[]>();
  for (const title of titles) {
    if (!isSeries(title)) continue;
    const key = title.seriesId || title.seriesTitle || title.id;
    shows.set(key, [...(shows.get(key) ?? []), title]);
  }
  return [...shows.values()].map((episodes) => {
    const [first] = seriesEpisodes(episodes[0], titles).concat(episodes);
    return { ...first, title: first.seriesTitle || first.title };
  });
}

export function relatedTitles(title: CatalogTitle, titles: CatalogTitle[], limit = 12): CatalogTitle[] {
  const episodes = new Set(seriesEpisodes(title, titles).map(({ id }) => id));
  return titles.filter((item) => item.id !== title.id && !episodes.has(item.id) && (
    item.category === title.category || item.genres.some((genre) => title.genres.includes(genre))
  )).slice(0, limit);
}

// PROtv Originals, as designated by the Administrator on the backend (GET /v1/catalog/originals). Released films are
// listed by title ID and released shows by name; Coming Soon entries are never included.
export type OriginalsIndex = { titleIds: string[]; seriesTitles: string[] };
export const NO_ORIGINALS: OriginalsIndex = { titleIds: [], seriesTitles: [] };

function sameName(left: string | undefined, right: string | undefined) {
  const normalize = (value: string | undefined) => (value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}

// The backend publishes signed Creator Portal titles with creator_ IDs (creator_<project> films and
// creator_episode_<id> episodes); Roku uses the same rule.
export function isCreatorTitle(title: CatalogTitle): boolean {
  return title.id.startsWith('creator_') || Boolean(title.creatorProjectId);
}

export function isOriginalTitle(title: CatalogTitle, originals: OriginalsIndex): boolean {
  return originals.titleIds.includes(title.id)
    || (title.contentType === 'EPISODE' && originals.seriesTitles.some((name) => sameName(name, title.seriesTitle)));
}

// Creators lead every list they appear in; catalog order is kept otherwise (as on Roku).
export function creatorsFirst(items: CatalogTitle[]): CatalogTitle[] {
  return [...items.filter(isCreatorTitle), ...items.filter((item) => !isCreatorTitle(item))];
}

function hasArtwork(title: CatalogTitle) {
  return Boolean(title.heroImageUrl || title.posterUrl || title.thumbnailUrl);
}

export const MAX_FEATURED = 8;

// Home hero order: released PROtv Originals, then signed creators' titles. Everything here is already published
// and playable, because the device catalog only returns released, playable titles. Other catalog titles are used
// only when no Original or creator title exists, and then just one.
export function featuredTitles(titles: CatalogTitle[], originals: OriginalsIndex = NO_ORIGINALS): CatalogTitle[] {
  const original = titles.filter((title) => isOriginalTitle(title, originals) && hasArtwork(title));
  const creator = titles.filter((title) => isCreatorTitle(title) && !isOriginalTitle(title, originals) && hasArtwork(title));
  const ranked = [
    ...original.filter((title) => !isSeries(title)), ...seriesCards(original),
    ...creator.filter((title) => !isSeries(title)), ...seriesCards(creator),
  ];
  if (ranked.length) return ranked.slice(0, MAX_FEATURED);
  const fallback = titles.find((title) => title.heroImageUrl)
    ?? titles.find((title) => title.contentType === 'MOVIE' && title.posterUrl)
    ?? titles[0];
  return fallback ? [fallback] : [];
}

export function featuredTitle(titles: CatalogTitle[], originals: OriginalsIndex = NO_ORIGINALS): CatalogTitle | undefined {
  return featuredTitles(titles, originals)[0];
}

function inExactCategory(title: CatalogTitle, name: string) {
  return [title.category, title.subgenre, ...title.genres].some((label) => sameName(label, name));
}

// Collections that have their own name and place on Home, the side navigation and Browse.
export const NAMED_COLLECTIONS: Record<string, string> = {
  continue: 'Continue Watching',
  'my-list': 'My List',
  creators: 'From PROtv Creators',
  originals: 'PROtv Originals',
  new: 'New Releases',
  'black-cinema': 'Black Cinema',
  independent: 'Independent Films',
  movies: 'Movies',
  series: 'Series',
  documentaries: 'Documentaries',
  classic: 'Classic Cinema',
  ai: 'AI Cinema',
  music: 'Music and Podcasts',
};

const CATEGORY_PREFIX = 'category-';

// Every rail comes from fields the catalog actually returned; a rail with no matches is omitted.
export function buildHomeRails(
  titles: CatalogTitle[],
  favorites: string[],
  progress: Record<string, ProgressEntry>,
  originals: OriginalsIndex = NO_ORIGINALS,
): HomeRail[] {
  const rail = (key: string, items: CatalogTitle[]): HomeRail => ({ key, title: NAMED_COLLECTIONS[key], items });
  const rails: HomeRail[] = [
    rail('continue', continueWatching(titles, progress)),
    rail('my-list', titles.filter((title) => favorites.includes(title.id))),
    rail('creators', [
      ...titles.filter((title) => isCreatorTitle(title) && !isSeries(title)),
      ...seriesCards(titles.filter(isCreatorTitle)),
    ]),
    rail('originals', [
      ...titles.filter((title) => isOriginalTitle(title, originals) && !isSeries(title)),
      ...seriesCards(titles.filter((title) => isOriginalTitle(title, originals))),
    ]),
    rail('new', titles.filter((title) => title.addedAt).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 20)),
    rail('black-cinema', creatorsFirst(titles.filter((title) => inExactCategory(title, 'Black Cinema')))),
    rail('independent', creatorsFirst(titles.filter((title) => inCategory(title, 'independent')))),
    rail('movies', creatorsFirst(titles.filter((title) => title.contentType === 'MOVIE'))),
    rail('series', seriesCards(creatorsFirst(titles))),
    rail('documentaries', creatorsFirst(titles.filter((title) => inCategory(title, 'documentar')))),
    rail('classic', titles.filter((title) => inCategory(title, 'classic cinema')
      || (title.contentType === 'MOVIE' && title.year > 0 && title.year < CLASSIC_CUTOFF_YEAR))),
    rail('ai', creatorsFirst(titles.filter((title) => inCategory(title, 'ai cinema')))),
    rail('music', creatorsFirst(titles.filter((title) => title.contentType === 'MUSIC' || title.contentType.startsWith('PODCAST')
      || inCategory(title, 'music', 'podcast', 'hip-hop')))),
  ];
  const named = new Set(['independent', 'documentary', 'ai cinema', 'music', 'podcast', 'podcasts', 'originals', 'black cinema']);
  const categories = [...new Set(titles.map((title) => title.category).filter(Boolean))]
    .filter((category) => !named.has(text(category)));
  for (const category of categories) {
    const items = titles.filter((title) => title.category === category);
    if (items.length > 1) rails.push({ key: `${CATEGORY_PREFIX}${category}`, title: category, items: creatorsFirst(items) });
  }
  return rails.filter((item) => item.items.length > 0);
}

// One Home rail, Browse collection or navigation destination, by its key. An empty collection keeps its name so the
// screen can say so instead of showing a dead page.
export function collectionByKey(
  key: string,
  titles: CatalogTitle[],
  favorites: string[],
  progress: Record<string, ProgressEntry>,
  originals: OriginalsIndex = NO_ORIGINALS,
): HomeRail {
  const found = buildHomeRails(titles, favorites, progress, originals).find((rail) => rail.key === key);
  if (found) return found;
  if (key.startsWith(CATEGORY_PREFIX)) {
    const category = key.slice(CATEGORY_PREFIX.length);
    return { key, title: category || 'Collection', items: creatorsFirst(titles.filter((title) => title.category === category)) };
  }
  return { key, title: NAMED_COLLECTIONS[key] ?? 'Collection', items: [] };
}

export function seriesEpisodes(title: CatalogTitle | undefined, titles: CatalogTitle[]): CatalogTitle[] {
  if (!title || title.contentType !== 'EPISODE') return [];
  return titles.filter((item) => item.contentType === 'EPISODE' && (
    title.seriesId ? item.seriesId === title.seriesId
      : Boolean(title.seriesTitle) && item.seriesTitle === title.seriesTitle
  )).sort((left, right) => (left.seasonNumber ?? 1) - (right.seasonNumber ?? 1)
    || (left.episodeNumber ?? 1) - (right.episodeNumber ?? 1)
    || left.id.localeCompare(right.id));
}

export const DEMO_TITLES: CatalogTitle[] = [
  {
    id: 'demo-signal-after-dark',
    title: 'Signal After Dark',
    description: 'A late-night radio host follows a voice that should not be on the air.',
    category: 'Thriller',
    contentType: 'MOVIE',
    year: 2025,
    duration: 96,
    maturityRating: 'PG-13',
    genres: ['Thriller', 'Independent'],
  },
  {
    id: 'demo-blue-hour',
    title: 'The Blue Hour',
    description: 'Two siblings return home to rebuild a neighborhood theater and repair an old bond.',
    category: 'Drama',
    contentType: 'MOVIE',
    year: 2024,
    duration: 108,
    maturityRating: 'PG-13',
    genres: ['Drama', 'Black Cinema'],
  },
  {
    id: 'demo-open-frame',
    title: 'Open Frame',
    description: 'Artists make room for a new generation of independent storytellers.',
    category: 'Documentary',
    contentType: 'MOVIE',
    year: 2025,
    duration: 78,
    maturityRating: 'PG',
    genres: ['Documentary', 'Independent'],
  },
  {
    id: 'demo-river-house-s1e1',
    title: 'A Place to Begin',
    description: 'A family discovers that the old river house has one more story to tell.',
    category: 'Series',
    contentType: 'EPISODE',
    year: 2025,
    duration: 42,
    maturityRating: 'TV-14',
    genres: ['Drama', 'Series'],
    seriesId: 'demo-river-house',
    seriesTitle: 'River House',
    seasonNumber: 1,
    episodeNumber: 1,
  },
  {
    id: 'demo-river-house-s1e2',
    title: 'The Long Way Home',
    description: "A forgotten photograph changes the family's plans for the weekend.",
    category: 'Series',
    contentType: 'EPISODE',
    year: 2025,
    duration: 44,
    maturityRating: 'TV-14',
    genres: ['Drama', 'Series'],
    seriesId: 'demo-river-house',
    seriesTitle: 'River House',
    seasonNumber: 1,
    episodeNumber: 2,
  },
  {
    id: 'demo-sunday-session',
    title: 'Sunday Session',
    description: 'A live-room performance celebrating the sound of independent music.',
    category: 'Music',
    contentType: 'MUSIC',
    year: 2025,
    duration: 26,
    maturityRating: 'PG',
    genres: ['Music', 'Performance'],
  },
  {
    id: 'demo-night-shift',
    title: 'Night Shift Stories',
    description: 'People who keep the city moving share the moments that stay with them.',
    category: 'Documentary',
    contentType: 'MOVIE',
    year: 2024,
    duration: 64,
    maturityRating: 'PG',
    genres: ['Documentary', 'Black Cinema'],
  },
  {
    id: 'demo-first-light',
    title: 'First Light',
    description: 'A small-town photographer finds a fresh start behind the lens.',
    category: 'Drama',
    contentType: 'MOVIE',
    year: 2023,
    duration: 91,
    maturityRating: 'PG',
    genres: ['Drama', 'Independent'],
  },
];

export const DEMO_PROGRESS: Record<string, number> = {
  'demo-blue-hour': 0.62,
  'demo-river-house-s1e1': 0.31,
};

export const DEMO_FAVORITES = ['demo-open-frame', 'demo-sunday-session'];

export const CATEGORIES = [
  'All',
  'Black Cinema',
  'Documentary',
  'Drama',
  'Independent',
  'Music',
  'Series',
  'Thriller',
];

export function titleMatchesQuery(title: CatalogTitle, query: string): boolean {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return true;
  return [
    title.title,
    title.description,
    title.category,
    title.seriesTitle,
    title.subgenre,
    title.credits,
    ...title.genres,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes(search);
}

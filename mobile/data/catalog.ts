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

export function featuredTitle(titles: CatalogTitle[]): CatalogTitle | undefined {
  return titles.find((title) => title.heroImageUrl)
    ?? titles.find((title) => title.contentType === 'MOVIE' && title.posterUrl)
    ?? titles[0];
}

// Every rail comes from fields the catalog actually returned; a rail with no matches is omitted.
export function buildHomeRails(
  titles: CatalogTitle[],
  favorites: string[],
  progress: Record<string, ProgressEntry>,
): HomeRail[] {
  const rails: HomeRail[] = [
    { key: 'continue', title: 'Continue Watching', items: continueWatching(titles, progress) },
    { key: 'my-list', title: 'My List', items: titles.filter((title) => favorites.includes(title.id)) },
    {
      key: 'new',
      title: 'New Releases',
      items: titles.filter((title) => title.addedAt).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 20),
    },
    {
      key: 'originals',
      title: 'PROtv Originals',
      items: titles.filter((title) => text(title.category) === 'originals' || text(title.contentType) === 'original'),
    },
    { key: 'creators', title: 'From PROtv Creators', items: titles.filter((title) => title.creatorProjectId) },
    { key: 'independent', title: 'Independent Films', items: titles.filter((title) => inCategory(title, 'independent')) },
    { key: 'movies', title: 'Movies', items: titles.filter((title) => title.contentType === 'MOVIE') },
    { key: 'series', title: 'Series', items: seriesCards(titles) },
    { key: 'documentaries', title: 'Documentaries', items: titles.filter((title) => inCategory(title, 'documentar')) },
    {
      key: 'classic',
      title: 'Classic Cinema',
      items: titles.filter((title) => inCategory(title, 'classic cinema')
        || (title.contentType === 'MOVIE' && title.year > 0 && title.year < CLASSIC_CUTOFF_YEAR)),
    },
    { key: 'ai', title: 'AI Cinema', items: titles.filter((title) => inCategory(title, 'ai cinema')) },
    {
      key: 'music',
      title: 'Music and Podcasts',
      items: titles.filter((title) => ['MUSIC', 'PODCAST'].includes(title.contentType) || inCategory(title, 'music', 'podcast', 'hip-hop')),
    },
  ];
  const named = new Set(['independent', 'documentary', 'ai cinema', 'music', 'podcast', 'originals']);
  const categories = [...new Set(titles.map((title) => title.category).filter(Boolean))]
    .filter((category) => !named.has(text(category)));
  for (const category of categories) {
    const items = titles.filter((title) => title.category === category);
    if (items.length > 1) rails.push({ key: `category-${category}`, title: category, items });
  }
  return rails.filter((rail) => rail.items.length > 0);
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

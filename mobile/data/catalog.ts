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
  seriesId?: string;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
};

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
    ...title.genres,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes(search);
}

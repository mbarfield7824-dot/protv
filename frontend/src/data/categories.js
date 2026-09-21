export const UPLOAD_CATEGORY_OPTIONS = [
  'Comedy',
  'Action',
  'Documentary',
  'Horror',
  'Drama',
  'Sci-Fi',
  'Espanol',
  'International',
  'AI Cinema',
  'Food',
  'Sports',
  'Podcast',
  'Black Cinema',
  'Anime',
  'Music',
  'Cartoons',
];

export const CATEGORY_SUBGENRES = {
  Music: [
    'Hip-Hop',
    'R&B',
    'Gospel',
    'Jazz',
    'Classical',
    'Pop',
    'Rock',
    'Country',
    'Reggae',
    'Electronic',
  ],
  Cartoons: [
    'Classic Cartoons',
    'Kids & Family',
    'Educational',
    'Comedy',
    'Action & Adventure',
    'Anime',
    'Shorts',
  ],
};

export const COLLECTION_CONFIG = {
  Music: {
    path: '/music',
    eyebrow: 'PROtv Music',
    title: 'Music',
    description: 'Performances, videos, documentaries, and sounds for every mood.',
    subcategories: CATEGORY_SUBGENRES.Music,
  },
  Cartoons: {
    path: '/cartoons',
    eyebrow: 'PROtv Animation',
    title: 'Cartoons',
    description: 'Classic animation, family favorites, educational stories, and animated adventures.',
    subcategories: CATEGORY_SUBGENRES.Cartoons,
  },
};

export const BROWSE_CATEGORIES = [
  { id: 'black-cinema', name: 'Black Cinema', matches: ['Black Cinema'] },
  { id: 'independent', name: 'Independent', matches: ['Independent'] },
  { id: 'anime', name: 'Anime & Animation', matches: ['Anime', 'Animation'] },
  { id: 'horror', name: 'Horror', matches: ['Horror'] },
  { id: 'action', name: 'Action', matches: ['Action'] },
  { id: 'comedy', name: 'Comedy', matches: ['Comedy'] },
  { id: 'documentary', name: 'Documentaries', matches: ['Documentary'] },
  { id: 'music', name: 'Music & Hip-Hop', matches: ['Music', 'Hip-Hop'] },
];

// Real catalog genres that also get a showcase tile, appended after the
// primary PROtv categories when they have content.
export const EXTRA_BROWSE_CATEGORIES = [
  { id: 'drama', name: 'Drama', matches: ['Drama'] },
  { id: 'sci-fi', name: 'Sci-Fi', matches: ['Sci-Fi'] },
  { id: 'cartoons', name: 'Cartoons', matches: ['Cartoons'] },
];

export function matchesCategory(video, category) {
  const values = [video.category, video.subgenre, ...(video.genres || [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return category.matches.some((match) => values.includes(match.toLowerCase()));
}

// Replaceable PROtv 2.0 artwork slots.
//
// Every slot accepts an `imageUrl`. When a slot has no imageUrl, the homepage
// derives artwork from a real catalog title (its Mux still), so no component
// needs to change once custom PROtv brand key art is available.
import categorySpriteUrl from '../assets/protv-category-art.png';

// PROtv category key art: one 2×4 sprite sheet with the category names baked
// into each cell. Cells are [column, row]; categories listed here render the
// sprite instead of a catalog still and visible label.
export const CATEGORY_SPRITE = {
  url: categorySpriteUrl,
  cells: {
    'black-cinema': [0, 0],
    independent: [1, 0],
    anime: [2, 0],
    horror: [3, 0],
    action: [0, 1],
    comedy: [1, 1],
    documentary: [2, 1],
    music: [3, 1],
  },
};

export const BRAND_ART = {
  hero: {
    imageUrl: null,
    // The Bundy Chronicles — PROtv exclusive. Vertical (9:16) source, so the
    // hero shows the full frame on the right instead of a landscape crop.
    catalogId: 'sqKR6c5Cq7MD9lg1GDxG',
    stillTime: 300,
    portrait: true,
  },
  spotlight: {
    imageUrl: null,
    // Tears of Steel (2012).
    catalogId: 'gbcxmtl6mAHQeBxx8Dgs',
    stillTime: 294,
  },
  creatorBanner: {
    imageUrl: null,
    // Elephants Dream (2006) — abstract machinery, graded purple.
    catalogId: '6wWGoL2qWRqtCmCTSRQY',
    stillTime: 327,
  },
  // Per-category artwork. `imageUrl` wins; otherwise the still of the listed
  // catalog title is used when that title belongs to the category.
  // `mood: true` marks categories PROtv is building toward: until real titles
  // or custom key art exist, the tile uses a graded mood still from a
  // rights-held PROtv title. It is artwork only and never implies content.
  categories: {
    'black-cinema': { imageUrl: null, catalogId: 'biitnhJJnBvHGFx8TJZC', stillTime: 2861 },
    // The Bundy Chronicles — PROtv exclusive.
    independent: { imageUrl: null, catalogId: 'sqKR6c5Cq7MD9lg1GDxG', stillTime: 200, mood: true },
    // Looney Tunes Classics — vetted character frame.
    anime: { imageUrl: null, catalogId: 'lussNXvK08RN9xtfq4wN', stillTime: 250 },
    horror: { imageUrl: null, catalogId: 'WIVB9NPQQzvtvjTBsiKw', stillTime: 1174 },
    action: { imageUrl: null, catalogId: 'sCWQqVE5WIoNNN5wAGQ2', stillTime: 178 },
    comedy: { imageUrl: null, catalogId: 'hKPU3JNJ4faWLgWE6ZSq', stillTime: 298 },
    documentary: { imageUrl: null, catalogId: 'vmsxoXY005wf3SwsfF7F', stillTime: 960 },
    // The Bundy Chronicles — PROtv exclusive.
    music: { imageUrl: null, catalogId: 'sqKR6c5Cq7MD9lg1GDxG', stillTime: 120, mood: true },
  },
};

// Hand-picked frame times for catalog stills that would otherwise land on a
// title card or black frame. Keyed by catalog id; values are seconds.
export const STILL_TIMES = {
  sqKR6c5Cq7MD9lg1GDxG: 300,
  biitnhJJnBvHGFx8TJZC: 2861,
  WIVB9NPQQzvtvjTBsiKw: 1174,
  gbcxmtl6mAHQeBxx8Dgs: 294,
};

export const FALLBACK_POSTER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'>
      <defs>
        <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#0a0e1a'/>
          <stop offset='55%' stop-color='#0d1330'/>
          <stop offset='100%' stop-color='#000000'/>
        </linearGradient>
        <radialGradient id='glow' cx='50%' cy='35%' r='60%'>
          <stop offset='0%' stop-color='#4169E1' stop-opacity='0.45'/>
          <stop offset='100%' stop-color='#4169E1' stop-opacity='0'/>
        </radialGradient>
      </defs>
      <rect width='400' height='600' fill='url(#bg)'/>
      <circle cx='200' cy='210' r='220' fill='url(#glow)'/>
      <polygon points='185,230 185,290 235,260' fill='#60A5FA' opacity='0.9'/>
      <circle cx='200' cy='260' r='55' fill='none' stroke='#4169E1' stroke-width='3' opacity='0.8'/>
      <text x='200' y='400' font-family='Arial, sans-serif' font-size='30' font-weight='900'
        fill='#ffffff' text-anchor='middle' letter-spacing='2'>PROtv</text>
      <text x='200' y='430' font-family='Arial, sans-serif' font-size='13' font-weight='600'
        fill='#4169E1' text-anchor='middle' letter-spacing='3'>ARTWORK COMING SOON</text>
    </svg>
  `);

export const FALLBACK_HERO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900' viewBox='0 0 1600 900'>
      <defs>
        <linearGradient id='bgh' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#05070d'/>
          <stop offset='60%' stop-color='#0d1330'/>
          <stop offset='100%' stop-color='#000000'/>
        </linearGradient>
        <radialGradient id='glowh' cx='75%' cy='40%' r='55%'>
          <stop offset='0%' stop-color='#4169E1' stop-opacity='0.35'/>
          <stop offset='100%' stop-color='#4169E1' stop-opacity='0'/>
        </radialGradient>
      </defs>
      <rect width='1600' height='900' fill='url(#bgh)'/>
      <circle cx='1200' cy='360' r='420' fill='url(#glowh)'/>
      <text x='800' y='470' font-family='Arial, sans-serif' font-size='64' font-weight='900'
        fill='#ffffff' text-anchor='middle' letter-spacing='4' opacity='0.15'>PROtv</text>
    </svg>
  `);

// Discover moods for mood-based recommendations
export const discoverMoods = [
  { id: 'exciting', icon: '🔥', label: 'Something Exciting', genres: ['Action', 'Adventure'] },
  { id: 'funny', icon: '😂', label: 'Make Me Laugh', genres: ['Comedy'] },
  { id: 'scary', icon: '😱', label: 'Scare Me', genres: ['Horror', 'Thriller'] },
  { id: 'romance', icon: '❤️', label: 'Romance', genres: ['Romance', 'Drama'] },
  { id: 'think', icon: '🧠', label: 'Make Me Think', genres: ['Drama', 'Documentary'] },
  { id: 'drama', icon: '🎭', label: 'Drama', genres: ['Drama'] },
  { id: 'fastpaced', icon: '⚡', label: 'Fast-Paced', genres: ['Action', 'Thriller'] },
  { id: 'escape', icon: '🌌', label: 'Escape Reality', genres: ['Sci-Fi', 'Fantasy'] },
];

// Small emergency catalog of already-approved Mux assets. The homepage uses
// these only when the production catalog cannot be read.
export const mockVideoData = [
  {
    id: 'emergency-carnival-of-souls',
    title: 'Carnival of Souls (1962)',
    description: 'After surviving a car accident, Mary is haunted by a strange apparition.',
    category: 'Horror',
    genres: ['Horror'],
    contentType: 'MOVIE',
    year: 1962,
    duration: 82,
    runtime: 82,
    muxPlaybackId: '9yjmmlxn8MOrLjp74VlBhDprv4oY026UVv00fvdwISO6s',
  },
  {
    id: 'emergency-looney-tunes-public-domain',
    title: 'Public Domain Looney Tunes & Merrie Melodies',
    description: 'A collection of classic animated shorts that have entered the public domain.',
    category: 'Comedy',
    genres: ['Comedy', 'Animation'],
    contentType: 'MOVIE',
    year: 1929,
    duration: 439,
    runtime: 439,
    muxPlaybackId: 'rW001yjQ3t7cQzys016NTXm3Nkp45gMkJ101tHgYd9XrlM',
  },
  ...[
    ['01', 'S02t8T45cJF5EZh8ypSenbn8eBnf83PlJRraPaD6Pc01w', 22],
    ['02', 'R2J6XV7w00Mcl1B00isOMy5mBYf2RLJJk1NwCXprkTRbQ', 22],
    ['03', 'ZerfWoN5qd01FAIQFq8ixGGA502xsSYUkPV2uUpaFcx014', 22],
    ['04', 'ZLgPmOHVvACXUg8PWByr1dIkz7uCw1EWaovTj4FMmmY', 22],
  ].map(([episode, muxPlaybackId, duration]) => ({
    id: `emergency-beverly-hillbillies-s01e${episode}`,
    title: `The Beverly Hillbillies S01 E${episode}`,
    seriesTitle: 'The Beverly Hillbillies',
    description: `Season 1, Episode ${Number(episode)}`,
    category: 'Comedy',
    genres: ['Comedy'],
    contentType: 'EPISODE',
    seasonNumber: 1,
    episodeNumber: Number(episode),
    duration,
    runtime: duration,
    muxPlaybackId,
  })),
];
export const blackCinemaData = [];
export const independentData = [];
export const animeData = [];
export const myListData = [];
export const recentlyAddedData = [];

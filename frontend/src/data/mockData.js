// Enhanced mock data for PROtv

// Polished PROtv fallback poster (inline SVG data URI) — used whenever a
// real image is missing, invalid, or fails to load. Never show a browser
// broken-image icon.
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

export const mockVideoData = [
  {
    id: 'featured-1',
    title: 'Beyond The Stars',
    subtitle: 'A journey beyond imagination',
    description: 'In a future beyond our world, the greatest battle begins within.',
    category: 'Sci-Fi',
    thumbnailUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500&h=750&fit=crop',
    heroImageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=675&fit=crop',
    rating: 8.7,
    ratingCount: 1250,
    year: 2024,
    duration: 148,
    contentType: 'MOVIE',
    genres: ['Sci-Fi', 'Action'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-123',
    views: 0,
  },
  {
    id: 'trending-1',
    title: 'Shadow Protocol',
    description: 'A covert operative must stop a global threat.',
    category: 'Action',
    thumbnailUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&h=450&fit=crop',
    rating: 8.4,
    ratingCount: 945,
    year: 2024,
    duration: 132,
    contentType: 'MOVIE',
    genres: ['Action', 'Thriller'],
    ageRating: 'R',
    muxPlaybackId: 'demo-playback-124',
    views: 0,
  },
  {
    id: 'trending-2',
    title: 'Street Justice',
    description: 'Where the law ends, justice begins.',
    category: 'Action',
    thumbnailUrl: 'https://images.unsplash.com/photo-1494306166773-942121ad7d1d?w=300&h=450&fit=crop',
    rating: 7.8,
    ratingCount: 876,
    year: 2024,
    duration: 125,
    contentType: 'MOVIE',
    genres: ['Action', 'Crime'],
    ageRating: 'R',
    muxPlaybackId: 'demo-playback-125',
    views: 0,
  },
  {
    id: 'trending-3',
    title: 'Echoes of Us',
    description: 'Love transcends time.',
    category: 'Drama',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=300&h=450&fit=crop',
    rating: 8.1,
    ratingCount: 654,
    year: 2024,
    duration: 156,
    contentType: 'MOVIE',
    genres: ['Drama', 'Romance'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-126',
    views: 0,
  },
  {
    id: 'trending-4',
    title: 'Beyond The Stars',
    description: 'In a future beyond our world, the greatest battle begins within.',
    category: 'Sci-Fi',
    thumbnailUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&h=450&fit=crop',
    rating: 8.7,
    ratingCount: 1250,
    year: 2024,
    duration: 148,
    contentType: 'MOVIE',
    genres: ['Sci-Fi', 'Action'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-127',
    views: 0,
  },
  {
    id: 'trending-5',
    title: 'Family Ties',
    description: 'Blood runs deeper than secrets.',
    category: 'Drama',
    thumbnailUrl: 'https://images.unsplash.com/photo-1533193566920-488db3a63292?w=300&h=450&fit=crop',
    rating: 7.4,
    ratingCount: 512,
    year: 2024,
    duration: 142,
    contentType: 'SERIES',
    genres: ['Drama'],
    ageRating: 'TV-14',
    muxPlaybackId: 'demo-playback-128',
    views: 0,
  },
  {
    id: 'trending-6',
    title: 'The Initiative',
    description: 'One mission. One chance. No coming back.',
    category: 'Action',
    thumbnailUrl: 'https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?w=300&h=450&fit=crop',
    rating: 8.2,
    ratingCount: 721,
    year: 2024,
    duration: 138,
    contentType: 'MOVIE',
    genres: ['Action', 'Thriller'],
    ageRating: 'R',
    muxPlaybackId: 'demo-playback-129',
    views: 0,
  },
  {
    id: 'comedy-1',
    title: 'Laugh Track',
    description: 'A washed-up comedian gets one last shot at the big stage.',
    category: 'Comedy',
    thumbnailUrl: 'https://images.unsplash.com/photo-1543584756-8f40a802b14e?w=300&h=450&fit=crop',
    rating: 7.5,
    ratingCount: 612,
    year: 2024,
    duration: 101,
    contentType: 'MOVIE',
    genres: ['Comedy'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-140',
    views: 0,
  },
  {
    id: 'comedy-2',
    title: 'Office Chaos',
    description: 'The most disorganized office in the world fights to survive audit season.',
    category: 'Comedy',
    thumbnailUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=300&h=450&fit=crop',
    rating: 7.2,
    ratingCount: 388,
    year: 2023,
    duration: 96,
    contentType: 'SERIES',
    genres: ['Comedy'],
    ageRating: 'TV-14',
    muxPlaybackId: 'demo-playback-141',
    views: 0,
  },
  {
    id: 'horror-1',
    title: 'The Hollow House',
    description: 'Some doors were never meant to be opened.',
    category: 'Horror',
    thumbnailUrl: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=300&h=450&fit=crop',
    rating: 7.9,
    ratingCount: 733,
    year: 2024,
    duration: 104,
    contentType: 'MOVIE',
    genres: ['Horror'],
    ageRating: 'R',
    muxPlaybackId: 'demo-playback-142',
    views: 0,
  },
  {
    id: 'horror-2',
    title: 'Static',
    description: 'Something is coming through the signal.',
    category: 'Horror',
    thumbnailUrl: 'https://images.unsplash.com/photo-1520271348391-049dd158c30e?w=300&h=450&fit=crop',
    rating: 7.6,
    ratingCount: 540,
    year: 2023,
    duration: 92,
    contentType: 'MOVIE',
    genres: ['Horror', 'Thriller'],
    ageRating: 'R',
    muxPlaybackId: 'demo-playback-143',
    views: 0,
  },
  {
    id: 'doc-1',
    title: 'Deep Current',
    description: 'An unprecedented look at the last untouched reefs on Earth.',
    category: 'Documentary',
    thumbnailUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=300&h=450&fit=crop',
    rating: 8.6,
    ratingCount: 980,
    year: 2024,
    duration: 88,
    contentType: 'DOCUMENTARY',
    genres: ['Documentary'],
    ageRating: 'PG',
    muxPlaybackId: 'demo-playback-144',
    views: 0,
  },
  {
    id: 'doc-2',
    title: 'Built From Nothing',
    description: 'The untold story of three founders who changed an industry.',
    category: 'Documentary',
    thumbnailUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=300&h=450&fit=crop',
    rating: 8.3,
    ratingCount: 701,
    year: 2023,
    duration: 112,
    contentType: 'DOCUMENTARY',
    genres: ['Documentary'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-145',
    views: 0,
  },
];

export const blackCinemaData = [
  {
    id: 'black-1',
    title: "King's Legacy",
    description: 'A powerful story of ambition and legacy.',
    category: 'Black Cinema',
    thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69be16?w=300&h=450&fit=crop',
    rating: 8.9,
    ratingCount: 2100,
    year: 2024,
    duration: 156,
    contentType: 'MOVIE',
    genres: ['Drama'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-130',
    views: 0,
  },
  {
    id: 'black-2',
    title: 'Brotherhood',
    description: 'Loyalty tested. Bonds broken. Redemption earned.',
    category: 'Black Cinema',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69b13d835?w=300&h=450&fit=crop',
    rating: 8.2,
    ratingCount: 945,
    year: 2024,
    duration: 143,
    contentType: 'MOVIE',
    genres: ['Drama', 'Crime'],
    ageRating: 'R',
    muxPlaybackId: 'demo-playback-131',
    views: 0,
  },
  {
    id: 'black-3',
    title: 'A Piece of Us',
    description: 'Stories that shaped a generation.',
    category: 'Black Cinema',
    thumbnailUrl: 'https://images.unsplash.com/photo-1528763659029-a71efbf4f5eb?w=300&h=450&fit=crop',
    rating: 8.4,
    ratingCount: 876,
    year: 2024,
    duration: 128,
    contentType: 'MOVIE',
    genres: ['Drama'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-132',
    views: 0,
  },
];

export const independentData = [
  {
    id: 'indie-1',
    title: 'Paper Planes',
    description: 'An indie gem about dreams and reality.',
    category: 'Independent',
    thumbnailUrl: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=300&h=450&fit=crop',
    rating: 7.7,
    ratingCount: 567,
    year: 2024,
    duration: 95,
    contentType: 'MOVIE',
    genres: ['Drama', 'Independent'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-133',
    views: 0,
  },
  {
    id: 'indie-2',
    title: 'The Origin',
    description: 'Where it all began.',
    category: 'Independent',
    thumbnailUrl: 'https://images.unsplash.com/photo-1533050487297-86b450e76afc?w=300&h=450&fit=crop',
    rating: 7.6,
    ratingCount: 432,
    year: 2024,
    duration: 118,
    contentType: 'MOVIE',
    genres: ['Thriller', 'Independent'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-134',
    views: 0,
  },
];

// Continue Watching — includes in-progress playback data for the
// cinematic progress rail on the homepage.
export const continueWatchingData = [
  {
    id: 'cw-1',
    title: 'The Last Stand',
    thumbnailUrl: 'https://images.unsplash.com/photo-1489599849228-ed4dc9ee2e20?w=500&h=280&fit=crop',
    season: 1,
    episode: 4,
    minutesLeft: 45,
    progressPercent: 62,
  },
  {
    id: 'cw-2',
    title: 'Shadow Protocol',
    thumbnailUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=500&h=280&fit=crop',
    minutesLeft: 58,
    progressPercent: 28,
  },
  {
    id: 'cw-3',
    title: "King's Legacy",
    thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69be16?w=500&h=280&fit=crop',
    season: 2,
    episode: 1,
    minutesLeft: 21,
    progressPercent: 85,
  },
  {
    id: 'cw-4',
    title: 'Ninja Chronicles',
    thumbnailUrl: 'https://images.unsplash.com/photo-1540224652063-9e757a21e367?w=500&h=280&fit=crop',
    season: 1,
    episode: 9,
    minutesLeft: 12,
    progressPercent: 95,
  },
];

export const myListData = [
  {
    id: 'ml-1',
    title: 'Rise of Legends',
    thumbnailUrl: 'https://images.unsplash.com/photo-1533050487297-86b450e76afc?w=300&h=450&fit=crop',
    contentType: 'MOVIE',
    rating: 8.3,
  },
  {
    id: 'ml-2',
    title: 'Echoes of Us',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=300&h=450&fit=crop',
    contentType: 'MOVIE',
    rating: 8.1,
  },
  {
    id: 'ml-3',
    title: 'Soul Hunter',
    thumbnailUrl: 'https://images.unsplash.com/photo-1543269865-cbdf26cecb46?w=300&h=450&fit=crop',
    contentType: 'SERIES',
    rating: 8.5,
  },
];

export const recentlyAddedData = [
  {
    id: 'ra-1',
    title: 'Hidden Truth',
    thumbnailUrl: 'https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?w=300&h=450&fit=crop',
    contentType: 'Drama',
  },
  {
    id: 'ra-2',
    title: 'Static',
    thumbnailUrl: 'https://images.unsplash.com/photo-1520271348391-049dd158c30e?w=300&h=450&fit=crop',
    contentType: 'Horror',
  },
  {
    id: 'ra-3',
    title: 'Deep Current',
    thumbnailUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=300&h=450&fit=crop',
    contentType: 'Documentary',
  },
];

// PROtv Discover — mood-based mapping used to filter/recommend content.
export const discoverMoods = [
  { id: 'exciting', label: 'Something Exciting', icon: '🔥', genres: ['Action', 'Thriller'] },
  { id: 'laugh', label: 'Make Me Laugh', icon: '😂', genres: ['Comedy'] },
  { id: 'scare', label: 'Scare Me', icon: '😱', genres: ['Horror'] },
  { id: 'romance', label: 'Romance', icon: '❤️', genres: ['Romance'] },
  { id: 'think', label: 'Make Me Think', icon: '🧠', genres: ['Documentary', 'Sci-Fi'] },
  { id: 'drama', label: 'Drama', icon: '🎭', genres: ['Drama'] },
  { id: 'fastpaced', label: 'Fast-Paced', icon: '⚡', genres: ['Action', 'Crime'] },
  { id: 'escape', label: 'Escape Reality', icon: '🌌', genres: ['Sci-Fi', 'Anime', 'Independent'] },
];

export const animeData = [
  {
    id: 'anime-1',
    title: 'Ninja Chronicles',
    description: 'Ancient powers. Modern world.',
    category: 'Anime',
    thumbnailUrl: 'https://images.unsplash.com/photo-1540224652063-9e757a21e367?w=300&h=450&fit=crop',
    rating: 8.7,
    ratingCount: 1890,
    year: 2024,
    duration: 24,
    contentType: 'SERIES',
    genres: ['Anime', 'Action'],
    ageRating: 'PG-13',
    muxPlaybackId: 'demo-playback-135',
    views: 0,
  },
  {
    id: 'anime-2',
    title: 'Soul Hunter',
    description: 'Hunt or be hunted.',
    category: 'Anime',
    thumbnailUrl: 'https://images.unsplash.com/photo-1543269865-cbdf26cecb46?w=300&h=450&fit=crop',
    rating: 8.5,
    ratingCount: 1650,
    year: 2024,
    duration: 24,
    contentType: 'SERIES',
    genres: ['Anime', 'Action'],
    ageRating: 'TV-14',
    muxPlaybackId: 'demo-playback-136',
    views: 0,
  },
];

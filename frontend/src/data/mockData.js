// Mock data file - cleaned to show only real backend videos
// All mock movie data has been removed

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

// All mock data arrays removed - using only real backend videos
export const mockVideoData = [];
export const blackCinemaData = [];
export const independentData = [];
export const animeData = [];
export const continueWatchingData = [];
export const myListData = [];
export const recentlyAddedData = [];

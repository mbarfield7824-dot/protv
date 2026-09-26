import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import CinematicHero from '../components/CinematicHero';
import ContinueWatchingRail from '../components/ContinueWatchingRail';
import CategoryShowcase from '../components/CategoryShowcase';
import StreamingRail from '../components/StreamingRail';
import StreamingCard from '../components/StreamingCard';
import SpotlightFeature from '../components/SpotlightFeature';
import CreatorBanner from '../components/CreatorBanner';
import ProTVFooter from '../components/ProTVFooter';
import MoviePreview from '../components/MoviePreview';
import EmptyState from '../components/EmptyState';
import { api } from '../api';
import { mockVideoData, FALLBACK_POSTER, FALLBACK_HERO } from '../data/mockData';
import { BROWSE_CATEGORIES, EXTRA_BROWSE_CATEGORIES, matchesCategory } from '../data/browseCategories';
import { BRAND_ART, STILL_TIMES } from '../data/brandArt';
import { useAuth } from '../hooks/useAuth';
import { isTvEpisode } from '../utils/shows';
import { muxStillUrl } from '../utils/artwork';
import '../styles/Creators.css';

const FEATURED_PROTV_TITLE_IDS = [
  '3NAU6BldsmCNs9wjM08a',
  'WIVB9NPQQzvtvjTBsiKw',
  'B2MDEH2b25NknMQMEhoM',
  'zGpbFWvSaup6ioUaoqsN',
];

const RAILS_AFTER_SPOTLIGHT = [
  { id: 'black-cinema', title: 'Black Cinema', matches: ['Black Cinema'] },
  { id: 'independent', title: 'Independent Films', matches: ['Independent'] },
  { id: 'documentary', title: 'Documentaries', matches: ['Documentary'] },
  { id: 'music', title: 'Music & Hip-Hop', matches: ['Music', 'Hip-Hop'], viewAll: { to: '/music' } },
];

// Normalizes a raw Firestore video record (from the live backend) into the
// same shape the UI components expect from the curated mock catalog, so
// real content can appear in the rails without special-casing everywhere.
function normalizeApiVideo(raw) {
  const category = raw.category || raw.genre || 'General';
  const subgenre = raw.subgenre || '';
  return {
    id: raw.id,
    title: raw.title || 'Untitled',
    description: raw.description || '',
    category,
    subgenre,
    genreLabel: category,
    thumbnailUrl: raw.thumbnailUrl || FALLBACK_POSTER,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || null,
    duration: raw.duration ? Math.round(raw.duration / 60) : 0,
    durationSeconds: raw.duration || 0,
    contentType: raw.contentType || 'MOVIE',
    genres: [...new Set([...(raw.genres || []), category, subgenre].filter(Boolean))],
    ageRating: raw.maturityRating || raw.ageRating || '',
    muxPlaybackId: raw.muxPlaybackId,
    seasonNumber: raw.seasonNumber,
    episodeNumber: raw.episodeNumber,
    views: raw.views || 0,
    approvedAt: raw.approvedAt,
    createdAt: raw.createdAt,
    submittedAt: raw.submittedAt,
  };
}

function catalogTimestamp(video) {
  const value = video.approvedAt || video.createdAt || video.submittedAt;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value === 'number') return value;
  if (value && typeof value._seconds === 'number') {
    return (value._seconds * 1000) + Math.floor((value._nanoseconds || 0) / 1_000_000);
  }
  return 0;
}

function still(video, width, height, time) {
  return muxStillUrl(video, { width, height, time: time ?? STILL_TIMES[video.id] });
}

// Adds landscape artwork used by the hero and Spotlight.
function withBackdrop(video) {
  const poster = video.heroImageUrl || video.thumbnailUrl || FALLBACK_HERO;
  return {
    ...video,
    genreLabel: video.genreLabel || video.category,
    backdrop: still(video, 1920, 1080) || poster,
    backdropFallback: poster,
  };
}

function isOriginal(video) {
  return String(video.category || '').toLowerCase() === 'originals'
    || String(video.contentType || '').toLowerCase() === 'original';
}

function HomeSkeleton() {
  return (
    <ProTVShell>
      <ProTVHeader />
      <div className="ptv-skel ptv-skel--hero" aria-label="Loading PROtv" role="status" />
      {[0, 1].map((row) => (
        <div className="ptv-skel-rail" key={row} aria-hidden="true">
          <span className="ptv-skel ptv-skel--heading" />
          <div className="ptv-skel-rail__track">
            {Array.from({ length: 6 }, (_, index) => <span className="ptv-skel ptv-skel--poster" key={index} />)}
          </div>
        </div>
      ))}
    </ProTVShell>
  );
}

export default function Home() {
  const [apiVideos, setApiVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewVideo, setPreviewVideo] = useState(null);
  const { user, favorites, progress } = useAuth();
  const { hash } = useLocation();

  // Fetch the live catalog. Fails silently (the development fallback
  // catalog still renders) if the backend is offline.
  async function fetchApiVideos() {
    try {
      const data = await api.getVideos();
      if (Array.isArray(data) && data.length > 0) {
        // A public catalog entry is playable only after Mux has produced its
        // public playback ID. Source-only, processing, and failed records
        // must stay out of viewer-facing rails.
        const readyVideos = data.filter(
          (video) => video.status === 'ready' && Boolean(video.muxPlaybackId)
        );
        setApiVideos(
          readyVideos
            .sort((left, right) => catalogTimestamp(right) - catalogTimestamp(left))
            .map(normalizeApiVideo)
        );
      }
    } catch (error) {
      console.error('Failed to load live videos:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void fetchApiVideos(); }, 0);
    const refreshCatalog = () => {
      if (document.visibilityState === 'visible') void fetchApiVideos();
    };
    window.addEventListener('focus', refreshCatalog);
    document.addEventListener('visibilitychange', refreshCatalog);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener('focus', refreshCatalog);
      document.removeEventListener('visibilitychange', refreshCatalog);
    };
  }, []);

  useEffect(() => {
    if (loading || !hash) return undefined;
    const sectionId = decodeURIComponent(hash.slice(1));
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    return () => window.clearTimeout(scrollTimer);
  }, [hash, loading]);

  if (loading) return <HomeSkeleton />;

  const isLive = apiVideos.length > 0;
  const catalog = (isLive ? apiVideos : mockVideoData).map((video) => ({
    ...video,
    genreLabel: video.genreLabel || video.category,
  }));
  const movieCatalog = catalog.filter((video) => !isTvEpisode(video));
  const byId = (id) => catalog.find((video) => video.id === id);
  const selection = hash ? decodeURIComponent(hash.slice(1)) : '';

  // ---- Hero -------------------------------------------------------------
  const featuredTitles = FEATURED_PROTV_TITLE_IDS.map(byId).filter(Boolean);
  const heroTitles = (featuredTitles.length ? featuredTitles : movieCatalog.slice(0, 3)).map(withBackdrop);
  const brandSource = byId(BRAND_ART.hero.catalogId) || heroTitles[0];
  const brandSlide = {
    imageUrl: BRAND_ART.hero.imageUrl
      || (brandSource && (BRAND_ART.hero.portrait
        ? still(brandSource, 1080, null, BRAND_ART.hero.stillTime)
        : still(brandSource, 1920, 1080, BRAND_ART.hero.stillTime)))
      || FALLBACK_HERO,
    portrait: Boolean(BRAND_ART.hero.portrait && !BRAND_ART.hero.imageUrl),
    fallbackUrl: brandSource?.heroImageUrl || FALLBACK_HERO,
    watchId: brandSource?.id,
  };

  // ---- Continue Watching ------------------------------------------------
  // Show a title after five seconds, rather than a percentage threshold that
  // can hide early progress on long movies. Finished titles remain in history.
  const continueWatchingItems = Object.entries(progress || {})
    .filter(([, entry]) => (
      Number.isFinite(entry?.positionSeconds)
      && Number.isFinite(entry?.durationSeconds)
      && entry.positionSeconds >= 5
      && entry.positionSeconds < entry.durationSeconds * 0.95
    ))
    .sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(([videoId, entry]) => {
      const source = byId(videoId);
      if (!source) return null;
      return {
        id: videoId,
        title: source.title,
        genreLabel: source.genreLabel,
        thumbnailUrl: source.thumbnailUrl,
        still: still(source, 640, 360, Math.floor(entry.positionSeconds)),
        season: source.seasonNumber,
        episode: source.episodeNumber,
        minutesLeft: Math.max(1, Math.round((entry.durationSeconds - entry.positionSeconds) / 60)),
        progressPercent: Math.round((entry.positionSeconds / entry.durationSeconds) * 100),
      };
    })
    .filter(Boolean);

  // ---- Browse by Category -----------------------------------------------
  const usedArtwork = new Set();
  const categoryTiles = [...BROWSE_CATEGORIES, ...EXTRA_BROWSE_CATEGORIES]
    .map((category) => {
      const matches = catalog.filter((video) => matchesCategory(video, category));
      if (!matches.length) return null;
      const art = BRAND_ART.categories[category.id];
      const curated = art?.catalogId && matches.find((video) => video.id === art.catalogId);
      const pick = curated
        || matches.find((video) => video.muxPlaybackId && !usedArtwork.has(video.id))
        || matches[0];
      usedArtwork.add(pick.id);
      return {
        category,
        count: matches.length,
        artwork: art?.imageUrl || still(pick, 480, 560, curated ? art.stillTime : undefined) || pick.thumbnailUrl,
        fallback: pick.thumbnailUrl || FALLBACK_POSTER,
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  // ---- New on PROtv / Spotlight -----------------------------------------
  const newOnProtv = isLive
    ? [...movieCatalog].sort((left, right) => catalogTimestamp(right) - catalogTimestamp(left)).slice(0, 12)
    : [];
  const spotlightSource = byId(BRAND_ART.spotlight.catalogId)
    || movieCatalog.find((video) => !FEATURED_PROTV_TITLE_IDS.includes(video.id))
    || movieCatalog[0];
  const spotlight = spotlightSource
    ? {
      ...withBackdrop(spotlightSource),
      ...(BRAND_ART.spotlight.imageUrl ? { backdrop: BRAND_ART.spotlight.imageUrl } : {}),
    }
    : null;

  // ---- Editorial rails --------------------------------------------------
  const originals = movieCatalog.filter(isOriginal);
  const editorialRails = RAILS_AFTER_SPOTLIGHT
    .map((rail) => ({ ...rail, items: movieCatalog.filter((video) => matchesCategory(video, rail)).slice(0, 12) }))
    .filter((rail) => rail.items.length > 0);
  const renderedIds = new Set([
    'continue-watching', 'categories', 'new-on-protv', 'submit',
    ...editorialRails.map((rail) => rail.id),
    ...(originals.length ? ['originals'] : []),
  ]);

  // ---- Hash-driven destination (nav, category tiles, footer links) -------
  const allCategories = [...BROWSE_CATEGORIES, ...EXTRA_BROWSE_CATEGORIES];
  const myListVideos = catalog.filter((video) => favorites.includes(video.id));
  let destination = null;
  if (selection && !renderedIds.has(selection)) {
    const category = allCategories.find((item) => item.id === selection);
    if (selection === 'my-list') {
      destination = user && myListVideos.length
        ? { id: 'my-list', title: 'My List', items: myListVideos, removable: true }
        : { id: 'my-list', empty: { title: 'Your list is waiting.', body: 'Browse PROtv and add movies, documentaries and shows you want to watch later.' } };
    } else if (selection === 'movies') {
      destination = { id: 'movies', title: 'Movies', items: movieCatalog };
    } else if (selection === 'originals') {
      destination = { id: 'originals', empty: { title: 'PROtv Originals are coming soon.', body: 'Distinctive stories made for PROtv will premiere here.' } };
    } else if (category) {
      const items = catalog.filter((video) => matchesCategory(video, category));
      destination = items.length
        ? { id: category.id, title: category.name, items }
        : { id: category.id, empty: { title: `${category.name} is coming soon.`, body: 'Check back soon for the first titles in this collection.' } };
    }
  }

  const stats = isLive
    ? [
      { label: 'Titles', value: catalog.length },
      { label: 'Genres', value: new Set(catalog.map((video) => video.category).filter(Boolean)).size },
    ]
    : [];
  const creatorArtSource = byId(BRAND_ART.creatorBanner.catalogId);
  const creatorArt = BRAND_ART.creatorBanner.imageUrl
    || (creatorArtSource && still(creatorArtSource, 1280, 720, BRAND_ART.creatorBanner.stillTime))
    || '';

  const renderRail = ({ id, title, items, viewAll, removable }) => (
    <StreamingRail key={id} id={id} title={title} viewAll={viewAll}>
      {items.map((video) => (
        <StreamingCard key={video.id} video={video} onInfo={setPreviewVideo} showRemove={removable} />
      ))}
    </StreamingRail>
  );

  return (
    <ProTVShell>
      <ProTVHeader />
      <main>
        <CinematicHero brand={brandSlide} titles={heroTitles} />

        <div className="ptv-stack ptv-stack--lead">
          <ContinueWatchingRail items={continueWatchingItems} />
          <CategoryShowcase tiles={categoryTiles} activeId={selection} />

          {destination && (
            destination.empty ? (
              <section id={destination.id} className="ptv-destination">
                <EmptyState title={destination.empty.title}>
                  {destination.empty.body}
                </EmptyState>
              </section>
            ) : renderRail(destination)
          )}

          {newOnProtv.length > 0 && renderRail({ id: 'new-on-protv', title: 'New on PROtv', items: newOnProtv, viewAll: { to: '/#movies' } })}
        </div>

        <SpotlightFeature video={spotlight} />

        <div className="ptv-stack">
          {editorialRails.map(renderRail)}
          {originals.length > 0 && renderRail({ id: 'originals', title: 'PROtv Originals', items: originals })}
        </div>

        <CreatorBanner imageUrl={creatorArt} stats={stats} />
      </main>
      <ProTVFooter />

      {previewVideo && (
        <MoviePreview video={previewVideo} onClose={() => setPreviewVideo(null)} />
      )}
    </ProTVShell>
  );
}

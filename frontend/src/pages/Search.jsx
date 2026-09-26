import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import StreamingCard from '../components/StreamingCard';
import ProTVFooter from '../components/ProTVFooter';
import MoviePreview from '../components/MoviePreview';
import { api } from '../api';
import '../styles/Movies.css';
import '../styles/SearchPage.css';

function normalizeVideo(raw) {
  const category = raw.category || raw.genre || '';
  return {
    id: raw.id,
    title: raw.title || '',
    description: raw.description || '',
    category,
    subgenre: raw.subgenre || '',
    genreLabel: category,
    thumbnailUrl: raw.thumbnailUrl || raw.posterUrl,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl || raw.posterUrl,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || null,
    duration: raw.runtime ? Math.round(raw.runtime) : raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: raw.contentType,
    genres: raw.genres || [],
    ageRating: raw.maturityRating || raw.ageRating || '',
    muxPlaybackId: raw.muxPlaybackId,
  };
}

function searchableText(video) {
  return [
    video.title,
    video.category,
    video.subgenre,
    ...(Array.isArray(video.genres) ? video.genres : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

function SearchForm({ query, onSearch }) {
  const [draft, setDraft] = useState(query);

  const submitSearch = (event) => {
    event.preventDefault();
    onSearch(draft.trim());
  };

  return (
    <form className="search-page__form" role="search" onSubmit={submitSearch}>
      <label className="search-page__label" htmlFor="catalog-search">Search the PROtv catalog</label>
      <div className="search-page__input-wrap">
        <input
          id="catalog-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search titles, genres, or categories"
          autoComplete="off"
        />
        <button type="submit">Search</button>
      </div>
    </form>
  );
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.getVideos();
      setVideos(Array.isArray(data) ? data.map(normalizeVideo) : []);
    } catch (loadError) {
      console.error('Failed to load videos for search:', loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void loadVideos(); }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadVideos]);

  const results = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return videos.filter((video) => {
      const text = searchableText(video);
      return terms.every((term) => text.includes(term));
    });
  }, [query, videos]);

  const submitSearch = (nextQuery) => {
    setSearchParams(nextQuery ? { q: nextQuery } : {});
  };

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="movies-page search-page">
        <SearchForm key={query} query={query} onSearch={submitSearch} />

        {query.trim() ? (
          <section className="search-page__results" aria-live="polite">
            <header className="movies-page__intro">
              <p className="movies-page__eyebrow">PROtv Catalog</p>
              <h1>SEARCH RESULTS</h1>
              <p className="movies-page__description">Results for “{query}”</p>
            </header>

            {loading ? (
              <div className="movies-grid" aria-label="Loading search results" role="status">
                {Array.from({ length: 12 }, (_, index) => (
                  <div className="movies-skeleton" key={index}>
                    <span className="movies-skeleton__poster" />
                    <span className="movies-skeleton__line" />
                    <span className="movies-skeleton__line movies-skeleton__line--short" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <section className="movies-state" role="alert">
                <h2>Search is unavailable right now.</h2>
                <p>Please try again in a moment.</p>
                <button type="button" className="movies-state__action" onClick={() => void loadVideos()}>
                  Try Again
                </button>
              </section>
            ) : results.length ? (
              <div className="movies-grid">
                {results.map((video) => (
                  <StreamingCard key={video.id} video={video} onInfo={setPreviewVideo} />
                ))}
              </div>
            ) : (
              <section className="movies-state">
                <h2>No results found</h2>
                <p>Try another title, category, subgenre, or genre.</p>
              </section>
            )}
          </section>
        ) : (
          <section className="search-page__invitation">
            <p className="movies-page__eyebrow">Your next story starts here</p>
            <h1>Search the PROtv catalog</h1>
            <p>Find films and stories by title, category, subgenre, or genre.</p>
          </section>
        )}
      </main>
      <ProTVFooter />
      {previewVideo && (
        <MoviePreview video={previewVideo} onClose={() => setPreviewVideo(null)} />
      )}
    </ProTVShell>
  );
}

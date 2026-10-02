import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProTVShell from '../components/ProTVShell';
import ProTVHeader from '../components/ProTVHeader';
import StreamingCard from '../components/StreamingCard';
import ProTVFooter from '../components/ProTVFooter';
import MoviePreview from '../components/MoviePreview';
import { useSearchCatalog } from '../hooks/useSearchCatalog';
import { isPodcastSearchResult, podcastResultUrl } from '../data/podcastCatalog';
import '../styles/Movies.css';
import '../styles/SearchPage.css';
import '../styles/Podcasts.css';

function normalizeVideo(raw) {
  const category = raw.category || raw.genre || '';
  return {
    id: raw.id,
    title: raw.title || '',
    description: raw.description || '',
    category,
    subgenre: raw.subgenre || '',
    genreLabel: category,
    thumbnailUrl: raw.artworkUrl || raw.thumbnailUrl || raw.posterUrl,
    heroImageUrl: raw.heroImageUrl || raw.thumbnailUrl || raw.posterUrl,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    ratingCount: raw.ratingCount || 0,
    year: raw.year || null,
    duration: raw.runtime ? Math.round(raw.runtime) : raw.duration ? Math.round(raw.duration / 60) : 0,
    contentType: raw.contentType,
    podcastShowId: raw.podcastShowId,
    host: raw.host,
    creator: raw.creator,
    genres: raw.genres || [],
    ageRating: raw.maturityRating || raw.ageRating || '',
    muxPlaybackId: raw.muxPlaybackId,
  };
}

function searchableText(video) {
  return [
    video.title,
    video.host,
    video.creator,
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
  const { catalog, retry } = useSearchCatalog(normalizeVideo);
  const { items: videos, failures, status } = catalog;
  const [previewVideo, setPreviewVideo] = useState(null);

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

            {status === 'partial' && (
              <section className="movies-state search-page__warning" role="alert">
                <h2>Search results are incomplete.</h2>
                <p>Showing results from available sources.</p>
                {failures.map((failure) => (
                  <p key={failure.source}>{failure.label}: {failure.message}</p>
                ))}
                <button type="button" className="movies-state__action" onClick={() => void retry()}>
                  Try Again
                </button>
              </section>
            )}
            {status === 'loading' ? (
              <div className="movies-grid" aria-label="Loading search results" role="status">
                {Array.from({ length: 12 }, (_, index) => (
                  <div className="movies-skeleton" key={index}>
                    <span className="movies-skeleton__poster" />
                    <span className="movies-skeleton__line" />
                    <span className="movies-skeleton__line movies-skeleton__line--short" />
                  </div>
                ))}
              </div>
            ) : status === 'unavailable' ? (
              <section className="movies-state" role="alert">
                <h2>Search is unavailable right now.</h2>
                {failures.map((failure) => (
                  <p key={failure.source}>{failure.label}: {failure.message}</p>
                ))}
                <button type="button" className="movies-state__action" onClick={() => void retry()}>
                  Try Again
                </button>
              </section>
            ) : results.length ? (
              <div className="movies-grid">
                {results.map((video) => isPodcastSearchResult(video) ? (
                  <Link key={video.id} className="search-page__podcast" to={podcastResultUrl(video)}>
                    {video.thumbnailUrl && <img src={video.thumbnailUrl} alt="" loading="lazy" />}
                    <h2>{video.title}</h2>
                    <p>{video.contentType === 'PODCAST_SHOW' ? 'Podcast Show' : 'Podcast Episode'} · {video.category}</p>
                  </Link>
                ) : (
                  <StreamingCard key={video.id} video={video} onInfo={setPreviewVideo} />
                ))}
              </div>
            ) : (
              <section className="movies-state">
                <h2>{status === 'partial' ? 'No matches in available results' : 'No results found'}</h2>
                <p>{status === 'partial'
                  ? 'Some sources could not be searched. Retry to check the full catalog.'
                  : 'Try another title, category, subgenre, or genre.'}</p>
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

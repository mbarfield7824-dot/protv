import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPodcastSearchResult, normalizePodcastShow, podcastCatalogItems, podcastCatalogUrl,
  podcastResultUrl, podcastSearchEpisodes, podcastShowDetail,
} from '../src/data/podcastCatalog.js';
import { isMovieSearchResult, isSeriesSearchResult } from '../src/data/musicCatalog.js';

const show = {
  id: 'show_1', contentType: 'PODCAST_SHOW', title: 'Voices', description: 'Independent voices',
  artworkUrl: 'https://example.org/show.jpg', host: 'Host', creator: 'Creator',
  category: 'Culture', genres: ['Culture', 'Music'],
};
const episode = (id, episodeNumber) => ({
  id, contentType: 'PODCAST_EPISODE', podcastShowId: show.id, episodeNumber,
  title: `Episode ${episodeNumber}`, description: 'Episode details', thumbnailUrl: 'https://example.org/episode.jpg',
});

test('public URLs follow configured base and stable Show identity', () => {
  assert.equal(podcastCatalogUrl('https://example.org/api/'), 'https://example.org/api/v1/catalog/podcasts');
  assert.equal(podcastCatalogUrl('http://localhost:5000', 'id /?'), 'http://localhost:5000/v1/catalog/podcasts/id%20%2F%3F');
  assert.throws(() => podcastCatalogUrl(''), /not configured/);
});

test('public Show list and detail normalize artwork and keep typed metadata and relationships', () => {
  const listed = podcastCatalogItems({ items: [show] });
  assert.equal(listed[0].thumbnailUrl, show.artworkUrl);
  assert.equal(listed[0].id, show.id);
  assert.equal(listed[0].contentType, 'PODCAST_SHOW');
  assert.equal(listed[0].host, 'Host');
  assert.deepEqual(listed[0].genres, ['Culture', 'Music']);
  const detail = podcastShowDetail({ ...show, episodes: [episode('episode-2', 2), episode('episode-1', 1)] });
  assert.deepEqual(detail.episodes.map((item) => item.id), ['episode-1', 'episode-2']);
  assert.equal(detail.episodes[0].podcastShowId, show.id);
  assert.equal(detail.episodes[0].thumbnailUrl, 'https://example.org/episode.jpg');
  assert.equal(detail.episodes[0].description, 'Episode details');
  assert.deepEqual(podcastShowDetail({ ...show, episodes: [] }).episodes, []);
  assert.throws(() => podcastShowDetail({ ...show, episodes: [episode('bad', 0)] }), /Episode response is invalid/);
  assert.throws(() => podcastShowDetail({ ...show, episodes: [{ ...episode('bad', 1), podcastShowId: 'other' }] }), /Episode response is invalid/);
  assert.throws(() => podcastCatalogItems([]), /response is invalid/);
  assert.throws(() => podcastShowDetail(show), /response is invalid/);
  assert.throws(() => normalizePodcastShow({ ...show, contentType: 'MOVIE' }), /response is invalid/);
});

test('versioned public search Episodes retain parent ID without retyping legacy records', () => {
  const items = podcastSearchEpisodes({ items: [episode('episode-1', 1), { id: 'legacy', title: 'Film' }] });
  assert.equal(items.length, 1);
  assert.equal(items[0].podcastShowId, show.id);
  assert.throws(() => podcastSearchEpisodes({ items: [episode('', 1)] }), /Episode response is invalid/);
  assert.throws(() => podcastSearchEpisodes({}), /response is invalid/);
});

test('Podcast search routes Shows and Episodes to the Show, never Movies or TV Series', () => {
  for (const item of [show, episode('episode-1', 1)]) {
    assert.equal(isPodcastSearchResult(item), true);
    assert.equal(isMovieSearchResult(item), false);
    assert.equal(isSeriesSearchResult(item), false);
  }
  assert.equal(podcastResultUrl(show), '/podcasts/show_1');
  assert.equal(podcastResultUrl(episode('episode-1', 1)), '/podcasts/show_1#episodes');
  assert.equal(isPodcastSearchResult({ id: 'legacy', title: 'Film' }), false);
  assert.equal(isMovieSearchResult({ id: 'legacy', title: 'Film' }), true);
});

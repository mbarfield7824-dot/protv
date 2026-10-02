import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isMovieSearchResult,
  isSeriesSearchResult,
  matchesMusicClassification,
  matchesMusicFormat,
  musicCatalogItems,
  musicCatalogUrl,
  normalizeMusicTitle,
} from '../src/data/musicCatalog.js';

test('Music catalog URL follows the configured API base path', () => {
  assert.equal(musicCatalogUrl('http://localhost:5000'), 'http://localhost:5000/v1/catalog?view=music');
  assert.equal(musicCatalogUrl('https://protv.example/api/'), 'https://protv.example/api/v1/catalog?view=music');
  assert.throws(() => musicCatalogUrl(''), /base URL is not configured/);
});

test('Music catalog response requires versioned items without a fallback shape', () => {
  const items = [{ id: 'music-1', contentType: 'MUSIC', musicFormat: 'music_video' }];
  assert.equal(musicCatalogItems({ items }), items);
  assert.throws(() => musicCatalogItems([]), /response is invalid/);
  assert.throws(() => musicCatalogItems({}), /response is invalid/);
});

test('normalization preserves identity, typed Music metadata, artwork, and legacy type absence', () => {
  const music = normalizeMusicTitle({
    id: 'music-1',
    title: 'Music title',
    contentType: 'MUSIC',
    musicFormat: 'live_performance',
    category: 'Music',
    year: 2025,
    thumbnailUrl: 'https://art.example/music.jpg',
    muxPlaybackId: 'playback-1',
  }, 'fallback.jpg');
  assert.equal(music.id, 'music-1');
  assert.equal(music.contentType, 'MUSIC');
  assert.equal(music.musicFormat, 'live_performance');
  assert.equal(music.thumbnailUrl, 'https://art.example/music.jpg');
  assert.equal(music.year, 2025);

  const legacy = normalizeMusicTitle({
    id: 'legacy-1',
    title: 'Legacy Music',
    genre: 'Music',
  }, 'fallback.jpg');
  assert.equal(legacy.id, 'legacy-1');
  assert.equal(legacy.contentType, undefined);
  assert.equal(legacy.musicFormat, undefined);
  assert.equal(legacy.thumbnailUrl, 'fallback.jpg');
});

test('Music classification and format filters include legacy records only in All Music', () => {
  const typed = { id: 'typed', contentType: 'MUSIC', musicFormat: 'music_video' };
  const legacy = { id: 'legacy', genre: 'Music' };
  const documentary = { id: 'documentary', category: 'Music', contentType: 'MUSIC', musicFormat: 'music_documentary' };

  assert.equal(matchesMusicClassification(typed), true);
  assert.equal(matchesMusicClassification(legacy), true);
  assert.equal(matchesMusicClassification(documentary), true);
  assert.equal(matchesMusicFormat(legacy, 'all'), true);
  assert.equal(matchesMusicFormat(legacy, 'music_video'), false);
  assert.equal(matchesMusicFormat(typed, 'music_video'), true);
  assert.equal(matchesMusicFormat(documentary, 'music_video'), false);
});

test('typed MUSIC stays out of Movies and Series search classifications', () => {
  const music = { contentType: 'MUSIC' };
  const movie = { contentType: 'MOVIE' };
  const legacyMovie = { category: 'Drama' };
  const episode = { contentType: 'EPISODE' };

  assert.equal(isMovieSearchResult(music), false);
  assert.equal(isMovieSearchResult(movie), true);
  assert.equal(isMovieSearchResult(legacyMovie), true);
  assert.equal(isSeriesSearchResult(music), false);
  assert.equal(isSeriesSearchResult(episode), true);
});

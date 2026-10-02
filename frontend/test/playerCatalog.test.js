import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchPlayerTitle, normalizePlayerTitle, podcastEpisodePlayerUrl, podcastParentUrl,
} from '../src/data/playerCatalog.js';
import { podcastResultUrl } from '../src/data/podcastCatalog.js';

const episode = {
  id: 'episode_1', contentType: 'PODCAST_EPISODE', podcastShowId: 'show_1', episodeNumber: 2,
  title: 'Second voice', description: 'Episode description', thumbnailUrl: 'https://example.org/art.jpg',
  heroImageUrl: 'https://example.org/hero.jpg', muxPlaybackId: 'fixture_mux_id', genres: ['Culture'],
};
const playback = { id: episode.id, streamType: 'on-demand', muxPlaybackId: 'current_mux_id' };
const response = (payload, status = 200) => ({ ok: status === 200, status, json: async () => payload });

test('player normalization retains Podcast identity, parent, metadata, artwork, and Episode number', () => {
  assert.deepEqual(normalizePlayerTitle(episode, episode.id), episode);
  const fallback = normalizePlayerTitle({ ...episode, thumbnailUrl: '', heroImageUrl: '', posterUrl: 'poster' }, episode.id);
  assert.equal(fallback.thumbnailUrl, 'poster');
  assert.equal(fallback.heroImageUrl, 'poster');
  assert.equal(podcastEpisodePlayerUrl(episode), '/player/episode_1');
  assert.equal(podcastEpisodePlayerUrl({ ...episode, id: 'id /?' }), '/player/id%20%2F%3F');
  assert.equal(podcastParentUrl(episode.podcastShowId), '/podcasts/show_1');
  assert.equal(podcastParentUrl('../bad'), '/podcasts');
  assert.equal(podcastResultUrl(episode), '/podcasts/show_1#episodes');
  assert.equal(podcastResultUrl({ id: 'show_1', contentType: 'PODCAST_SHOW' }), '/podcasts/show_1');
});

test('Shows cannot normalize as playback titles and malformed Episode relationships are errors', () => {
  for (const changes of [
    { contentType: 'PODCAST_SHOW' }, { id: 'other' }, { podcastShowId: '' },
    { episodeNumber: 0 }, { muxPlaybackId: '' },
    { muxPlaybackId: 'demo-playback-id' },
  ]) {
    assert.throws(() => normalizePlayerTitle({ ...episode, ...changes }, episode.id), /invalid/);
  }
  assert.throws(() => podcastEpisodePlayerUrl({ id: 'show_1', contentType: 'PODCAST_SHOW' }), /Episode ID/);
});

test('Podcast player requests public video, title, then current playback using stable ID and abort signal', async () => {
  const calls = [];
  const result = await fetchPlayerTitle('https://example.org/api/', episode.id, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(url.endsWith('/playback') ? playback : episode);
    },
  });
  assert.deepEqual(calls.map(({ url }) => url), [
    'https://example.org/api/videos/episode_1',
    'https://example.org/api/v1/catalog/titles/episode_1',
    'https://example.org/api/v1/catalog/titles/episode_1/playback',
  ]);
  assert.ok(calls.every(({ options }) => options.cache === 'no-store' && options.signal instanceof AbortSignal));
  assert.deepEqual(result, { ...episode, muxPlaybackId: playback.muxPlaybackId });
});

test('public 404 at any stage returns unavailable, never a mock or title-only playback', async () => {
  for (const missingStage of ['video', 'title', 'playback']) {
    let count = 0;
    const result = await fetchPlayerTitle('https://example.org', episode.id, {
      fetchImpl: async (url) => {
        count += 1;
        const isMissing = missingStage === 'video'
          || (missingStage === 'title' && url.includes('/titles/'))
          || (missingStage === 'playback' && url.endsWith('/playback'));
        return isMissing
          ? response({ error: 'Not found' }, 404) : response(episode);
      },
    });
    assert.equal(result, null);
    assert.equal(count, { video: 1, title: 2, playback: 3 }[missingStage]);
  }
});

test('server errors, malformed playback, and network failures stay explicit for retry', async () => {
  await assert.rejects(fetchPlayerTitle('https://example.org', episode.id, {
    fetchImpl: async () => response({}, 503),
  }), /unavailable/);
  await assert.rejects(fetchPlayerTitle('https://example.org', episode.id, {
    fetchImpl: async () => { throw new Error('Offline'); },
  }), /Offline/);
  await assert.rejects(fetchPlayerTitle('https://example.org', episode.id, {
    fetchImpl: async (url) => response(url.includes('/titles/')
      ? { ...episode, podcastShowId: 'different_show' } : episode),
  }), /response changed/);
  for (const changes of [
    { id: 'other' }, { streamType: 'live' }, { muxPlaybackId: '' }, { muxPlaybackId: 'demo-playback-id' },
  ]) {
    await assert.rejects(fetchPlayerTitle('https://example.org', episode.id, {
      fetchImpl: async (url) => response(url.endsWith('/playback') ? { ...playback, ...changes } : episode),
    }), /playback response is invalid/);
  }
});

for (const stage of ['video', 'title', 'playback', 'body']) {
  test(`${stage} never settling is bounded and aborted, with retry recovery`, { timeout: 1000 }, async () => {
    let timedOutSignal;
    await assert.rejects(fetchPlayerTitle('https://example.org', episode.id, {
      timeoutMs: 15,
      fetchImpl: async (url, { signal }) => {
        timedOutSignal = signal;
        if (stage === 'body') return { ok: true, status: 200, json: () => new Promise(() => {}) };
        if (stage === 'video' || (stage === 'title' && url.includes('/titles/'))
          || (stage === 'playback' && url.endsWith('/playback'))) return new Promise(() => {});
        return response(episode);
      },
    }), /timed out/);
    assert.equal(timedOutSignal.aborted, true);
    const recovered = await fetchPlayerTitle('https://example.org', episode.id, {
      timeoutMs: 15,
      fetchImpl: async (url) => response(url.endsWith('/playback') ? playback : episode),
    });

    assert.equal(recovered.id, episode.id);
  });
}

test('non-Podcast live player retains existing public-video metadata and makes no new catalog requests', async () => {
  const movie = {
    id: 'movie', contentType: 'MOVIE', muxPlaybackId: 'movie_mux', title: 'Film',
    description: 'Details', creator: 'Director', cast: 'Cast', language: 'English',
    trailerUrl: 'https://example.org/trailer', views: 123, rating: 8,
  };
  let calls = 0;
  const result = await fetchPlayerTitle('https://example.org', movie.id, {
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(url, 'https://example.org/videos/movie');
      return response(movie);
    },
  });
  assert.equal(calls, 1);
  for (const [key, value] of Object.entries(movie)) assert.equal(result[key], value);
});

test('cancelled player request rejects promptly even if fetch ignores abort', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  const pending = fetchPlayerTitle('https://example.org', episode.id, {
    signal: controller.signal, fetchImpl: () => new Promise(() => {}),
  });
  controller.abort(new Error('New route'));
  await assert.rejects(pending, /New route/);
});

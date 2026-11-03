import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEATURED_PODCAST, episodeRuntime, featuredPodcastEpisodes, isFeaturedPodcast, loadFeaturedPodcast,
} from '../src/data/featuredPodcast.js';

const show = { id: 'real-show-id', title: FEATURED_PODCAST.title, contentType: 'PODCAST_SHOW' };
const episode = {
  id: 'real-episode-id', contentType: 'PODCAST_EPISODE', podcastShowId: show.id,
  episodeNumber: 1, title: 'Catalog-provided title', muxPlaybackId: 'published-playback-id',
};

test('featured property matches only the exact official Podcast Show, allowing logo typography', () => {
  assert.equal(isFeaturedPodcast(show), true);
  assert.equal(isFeaturedPodcast({ ...show, title: ' Me & My White Friend ' }), true);
  assert.equal(isFeaturedPodcast({ ...show, title: 'Me and My White Friend Bonus' }), false);
  assert.equal(isFeaturedPodcast({ ...show, contentType: 'EPISODE' }), false);
  assert.equal(isFeaturedPodcast(null), false);
  assert.equal(FEATURED_PODCAST.hosts, 'Reg and Marv');
  assert.equal(FEATURED_PODCAST.description.length, 3);
});

test('load discovers the actual public Show ID then reads its published detail; empty and disappearing Shows stay empty', async () => {
  const calls = [];
  const detail = { ...show, episodes: [episode] };
  const result = await loadFeaturedPodcast({
    getPodcastShows: async () => [show, { ...show, id: 'unrelated', title: 'Other Podcast' }],
    getPodcastShow: async (id, { signal }) => {
      calls.push(id);
      assert.equal(signal.aborted, false);
      return detail;
    },
  });
  assert.equal(result, detail);
  assert.deepEqual(calls, ['real-show-id']);
  assert.equal(await loadFeaturedPodcast({ getPodcastShows: async () => [] }), null);
  assert.equal(await loadFeaturedPodcast({
    getPodcastShows: async () => [show], getPodcastShow: async () => null,
  }), null);
});

test('ambiguous identities, changed parents and API failures are explicit errors, never fake Coming Soon success', async () => {
  await assert.rejects(loadFeaturedPodcast({
    getPodcastShows: async () => [show, { ...show, id: 'duplicate' }],
  }), /multiple catalog matches/);
  await assert.rejects(loadFeaturedPodcast({
    getPodcastShows: async () => [show], getPodcastShow: async () => ({ ...show, id: 'wrong' }),
  }), /identity changed/);
  await assert.rejects(loadFeaturedPodcast({
    getPodcastShows: async () => { throw new Error('Public API unavailable'); },
  }), /Public API unavailable/);
});

test('cancellation reaches public requests and stops late data from becoming playable', async () => {
  const controller = new AbortController();
  let requestSignal;
  const loading = loadFeaturedPodcast({
    getPodcastShows: async ({ signal }) => {
      requestSignal = signal;
      return new Promise(() => {});
    },
  }, { signal: controller.signal });
  await Promise.resolve();
  controller.abort(new Error('Page closed'));
  await assert.rejects(loading, /Page closed/);
  assert.equal(requestSignal.aborted, true);
});

test('only real playable Episodes belonging to this public Show produce watch actions', () => {
  const variants = [
    episode,
    { ...episode, id: 'other-parent', podcastShowId: 'other-show' },
    { ...episode, id: 'series', contentType: 'EPISODE' },
    { ...episode, id: 'missing', muxPlaybackId: '' },
    { ...episode, id: 'demo', muxPlaybackId: 'demo-playback-test' },
    { ...episode, id: 'processing', status: 'processing' },
    { ...episode, id: 'pending', approvalStatus: 'pending' },
    { ...episode, id: 'held', releaseStatus: 'held' },
  ];
  assert.deepEqual(featuredPodcastEpisodes({ ...show, episodes: variants }), [episode]);
  assert.deepEqual(featuredPodcastEpisodes(null), []);
});

test('runtime uses actual seconds only and does not invent missing metadata', () => {
  assert.equal(episodeRuntime({ duration: 1830 }), '31m');
  assert.equal(episodeRuntime({ duration: 3600 }), '1h 0m');
  assert.equal(episodeRuntime({ runtime: 1200 }), '20m');
  for (const duration of [undefined, null, '', 0, -20, 'not a runtime', Infinity]) {
    assert.equal(episodeRuntime({ duration }), '');
  }
});

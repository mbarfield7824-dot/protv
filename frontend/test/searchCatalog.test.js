import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { fetchSearchVideos, loadSearchCatalog, overlaySearchCatalog } from '../src/data/searchCatalog.js';
import { podcastResultUrl } from '../src/data/podcastCatalog.js';
import { isMovieSearchResult, isSeriesSearchResult } from '../src/data/musicCatalog.js';

const movie = { id: 'movie', title: 'Film', contentType: 'MOVIE' };
const music = { id: 'music', title: 'Music', contentType: 'MUSIC', musicFormat: 'music_video' };
const show = { id: 'show_1', title: 'Voices', contentType: 'PODCAST_SHOW' };
const episode = { id: 'ep_1', title: 'Pilot', contentType: 'PODCAST_EPISODE', podcastShowId: show.id };
const legacy = { primary: [{ id: 'mock' }], additional: [{ id: 'extra' }] };

function client(failed = []) {
  const load = (source, items) => async () => {
    if (failed.includes(source)) throw new Error(`${source} offline`);
    return items;
  };
  return {
    getSearchVideos: load('catalog', [movie, music, show, episode]),
    getPodcastShows: load('shows', [show]),
    getPodcastEpisodes: load('episodes', [episode]),
  };
}

test('search-only catalog fetch rejects HTTP, network, JSON, and shape failures instead of returning empty', async () => {
  let request;
  const items = await fetchSearchVideos('https://example.org/api/', async (...args) => {
    request = args;
    return { ok: true, json: async () => [movie] };
  });
  assert.deepEqual(items, [movie]);
  assert.deepEqual(request, ['https://example.org/api/videos', { cache: 'no-store' }]);
  await assert.rejects(fetchSearchVideos(''), /not configured/);
  await assert.rejects(fetchSearchVideos('https://example.org', async () => ({ ok: false })), /unavailable/);
  await assert.rejects(fetchSearchVideos('https://example.org', async () => { throw new Error('Network'); }), /Network/);
  await assert.rejects(fetchSearchVideos('https://example.org', async () => ({
    ok: true, json: async () => { throw new Error('Invalid JSON'); },
  })), /Invalid JSON/);
  await assert.rejects(fetchSearchVideos('https://example.org', async () => ({
    ok: true, json: async () => ({ items: [] }),
  })), /response is invalid/);
});

for (const failed of [['shows'], ['episodes'], ['shows', 'episodes'], ['catalog']]) {
  test(`isolates ${failed.join(' and ')} failure and preserves successful typed results`, async () => {
    const result = await loadSearchCatalog(client(failed), (video) => ({ ...video, normalized: true }));
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.failures.map((failure) => failure.source), failed);
    assert.ok(result.failures.every((failure) => failure.label && failure.message.endsWith('offline')));
    const expected = [
      ...(!failed.includes('catalog') ? [movie, music] : []),
      ...(!failed.includes('shows') ? [show] : []),
      ...(!failed.includes('episodes') ? [episode] : []),
    ];
    assert.deepEqual(result.items, expected.map((video) => ({ ...video, normalized: true })));
    assert.deepEqual(overlaySearchCatalog(result, legacy), result.items);
  });
}

test('all failed sources report unavailable and neither results nor mocks', async () => {
  const result = await loadSearchCatalog(client(['catalog', 'shows', 'episodes']));
  assert.equal(result.status, 'unavailable');
  assert.equal(result.failures.length, 3);
  assert.deepEqual(result.items, []);
  assert.deepEqual(overlaySearchCatalog(result, legacy), []);
  assert.deepEqual(overlaySearchCatalog({ status: 'loading', items: [] }, legacy), []);
});

test('retry recovers from partial and full failure without stale failures or duplicate Podcast records', async () => {
  for (const failed of [['shows'], ['episodes'], ['shows', 'episodes'], ['catalog', 'shows', 'episodes']]) {
    const apiClient = client(failed);
    const first = await loadSearchCatalog(apiClient);
    assert.notEqual(first.status, 'complete');
    failed.length = 0;
    const recovered = await loadSearchCatalog(apiClient);
    assert.equal(recovered.status, 'complete');
    assert.deepEqual(recovered.failures, []);
    assert.deepEqual(recovered.items, [movie, music, show, episode]);
  }
});

test('successful empty responses differ from partial-empty responses and preserve legacy overlay behavior', async () => {
  const apiClient = {
    getSearchVideos: async () => [],
    getPodcastShows: async () => [],
    getPodcastEpisodes: async () => [],
  };
  const empty = await loadSearchCatalog(apiClient);
  assert.deepEqual(empty, { items: [], failures: [], status: 'complete' });
  assert.deepEqual(overlaySearchCatalog(empty, legacy), [...legacy.primary, ...legacy.additional]);
  apiClient.getPodcastShows = async () => { throw new Error('Shows offline'); };
  const partial = await loadSearchCatalog(apiClient);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.items, []);
  assert.deepEqual(overlaySearchCatalog(partial, legacy), []);
});

test('source normalization errors and synchronous loader errors are isolated', async () => {
  const apiClient = client();
  apiClient.getPodcastShows = () => { throw new Error('Synchronous failure'); };
  const result = await loadSearchCatalog(apiClient, (video) => {
    if (video === episode) throw new Error('Invalid Episode');
    return video;
  });
  assert.deepEqual(result.items, [movie, music]);
  assert.deepEqual(result.failures.map((failure) => failure.source), ['shows', 'episodes']);
  apiClient.getSearchVideos = async () => null;
  const invalid = await loadSearchCatalog(apiClient);
  assert.match(invalid.failures[0].message, /response is invalid/);
});

test('successful Podcasts retain stable parent references, Show routes, and Movies/Series exclusions', async () => {
  const result = await loadSearchCatalog(client(), (video) => ({ ...video }));
  const podcasts = result.items.slice(2);
  assert.equal(podcasts[1].podcastShowId, show.id);
  assert.equal(podcastResultUrl(podcasts[0]), '/podcasts/show_1');
  assert.equal(podcastResultUrl(podcasts[1]), '/podcasts/show_1#episodes');
  for (const item of podcasts) {
    assert.equal(isMovieSearchResult(item), false);
    assert.equal(isSeriesSearchResult(item), false);
  }
  assert.equal(result.items[0].contentType, 'MOVIE');
  assert.equal(result.items[1].musicFormat, 'music_video');
});

for (const [method, source, expected] of [
  ['getSearchVideos', 'catalog', [show, episode]],
  ['getPodcastShows', 'shows', [movie, music, episode]],
  ['getPodcastEpisodes', 'episodes', [movie, music, show]],
]) {
  test(`${source} deadline bounds a never-settling source and preserves successful results`, { timeout: 1000 }, async () => {
    const apiClient = client();
    let sourceSignal;
    apiClient[method] = ({ signal }) => {
      sourceSignal = signal;
      return new Promise(() => {});
    };
    const result = await loadSearchCatalog(apiClient, undefined, { timeoutMs: 15 });
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.items, expected);
    assert.equal(sourceSignal.aborted, true);
    assert.deepEqual(result.failures.map((failure) => failure.source), [source]);
    assert.match(result.failures[0].message, /timed out.*try again/);
    assert.deepEqual(overlaySearchCatalog(result, legacy), expected);
  });
}

test('all never-settling sources reach full unavailable state', { timeout: 1000 }, async () => {
  const never = () => new Promise(() => {});
  const result = await loadSearchCatalog({
    getSearchVideos: never, getPodcastShows: never, getPodcastEpisodes: never,
  }, undefined, { timeoutMs: 15 });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.failures.length, 3);
  assert.ok(result.failures.every((failure) => /timed out/.test(failure.message)));
  assert.deepEqual(result.items, []);
});

test('retry after timeout recovers and ignored abort/late results cannot change either result', { timeout: 1000 }, async () => {
  const apiClient = client();
  let finishLate;
  apiClient.getPodcastShows = () => new Promise((resolve) => { finishLate = resolve; });
  const first = await loadSearchCatalog(apiClient, undefined, { timeoutMs: 15 });
  assert.equal(first.status, 'partial');
  apiClient.getPodcastShows = async () => [show];
  const recovered = await loadSearchCatalog(apiClient, undefined, { timeoutMs: 15 });
  finishLate([{ ...show, id: 'late_stale_show' }]);
  await setImmediate();
  assert.deepEqual(recovered, { items: [movie, music, show, episode], failures: [], status: 'complete' });
  assert.deepEqual(first.items, [movie, music, episode]);
  assert.match(first.failures[0].message, /timed out/);
});

test('superseded search cancellation settles and aborts every source even when abort is ignored', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  const signals = [];
  const never = ({ signal }) => {
    signals.push(signal);
    return new Promise(() => {});
  };
  const pending = loadSearchCatalog({
    getSearchVideos: never, getPodcastShows: never, getPodcastEpisodes: never,
  }, undefined, { timeoutMs: 500, signal: controller.signal });
  await Promise.resolve();
  controller.abort(new Error('Superseded search'));
  const result = await pending;
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.equal(result.status, 'unavailable');
  assert.ok(result.failures.every((failure) => failure.message === 'Superseded search'));
});

test('search-only HTTP fetch forwards abort without changing default fetch options', async () => {
  const controller = new AbortController();
  await fetchSearchVideos('https://example.org', async (url, options) => {
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => [] };
  }, { signal: controller.signal });
});

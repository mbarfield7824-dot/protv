import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { createServer } from 'vite';
import reactPlugin from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dom = new JSDOM('<!doctype html><body><div id="root"></div>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let scrollRestored;
window.scrollTo = (...args) => { scrollRestored = args; };
window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
  this.querySelector('button').focus();
};
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

let vite, createRoot, root, Title, SeriesDetail, StreamingCard, MovieCard, SearchOverlay, AuthContext, api;
const auth = { user: null, isFavorite: () => false, toggleFavorite() {}, openAuthModal() {} };
const movie = { id: 'fixture-movie', title: 'Fixture movie', description: 'Authorized fixture synopsis',
  contentType: 'MOVIE', watchAvailable: true, trailerAvailable: true, genres: [] };
let fixture;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({
    configFile: false, envFile: false,
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    plugins: [reactPlugin()],
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
  });
  ({ default: Title } = await vite.ssrLoadModule('/src/pages/Title.jsx'));
  ({ default: SeriesDetail } = await vite.ssrLoadModule('/src/pages/SeriesDetail.jsx'));
  ({ default: StreamingCard } = await vite.ssrLoadModule('/src/components/StreamingCard.jsx'));
  ({ default: MovieCard } = await vite.ssrLoadModule('/src/components/MovieCard.jsx'));
  ({ default: SearchOverlay } = await vite.ssrLoadModule('/src/components/SearchOverlay.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

function Location() {
  return React.createElement('output', { id: 'location' }, useLocation().pathname);
}

async function mount(Component, entry = '/title/fixture-movie', props = {}, record = movie) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  fixture = { ...record };
  api.getVideo = async () => ({ ...fixture });
  api.getTitleTrailerPlayback = async id => ({
    id, muxPlaybackId: 'distinct-trailer-id', playbackToken: 'test-token',
  });
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(
    React.createElement(MemoryRouter, { initialEntries: [entry] },
      React.createElement(AuthContext.Provider, { value: auth },
        React.createElement(Location),
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/title/:id', element: React.createElement(Component, props) }),
          React.createElement(Route, { path: '/series/:seriesKey', element: React.createElement(Component, props) }),
          React.createElement(Route, { path: '/cards', element: React.createElement(Component, props) }),
          React.createElement(Route, { path: '/player/:id', element: React.createElement('p', null, 'Explicit full playback') }))))
  ));
}

const button = name => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === name);

test('movie and episode details offer distinct trailer playback; closing restores focus, scroll, and route', async () => {
  for (const type of ['MOVIE', 'EPISODE']) {
    await mount(Title, '/title/fixture-movie', {}, { ...movie, contentType: type,
      seriesTitle: 'Fixture series', seasonNumber: 1, episodeNumber: 2 });
    if (type === 'EPISODE') assert.match(document.body.textContent, /S1 · E2/);
    assert.ok(button('▶ Watch Now'));
    const trigger = button('Watch Trailer');
    assert.ok(trigger);
    trigger.focus();
    await act(async () => trigger.click());
    assert.ok(document.querySelector('dialog[open]'));
    assert.equal(document.activeElement.textContent, 'Close');
    const media = document.querySelector('dialog mux-player');
    assert.ok(media, document.querySelector('dialog').innerHTML);
    assert.equal(media.playbackId, 'distinct-trailer-id');
    assert.equal(media.hasAttribute('autoplay'), false);
    assert.equal(document.body.style.overflow, 'hidden');
    await act(async () => document.querySelector('dialog').dispatchEvent(type === 'MOVIE'
      ? new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      : new window.Event('cancel', { cancelable: true })));
    assert.equal(document.querySelector('dialog'), null);
    assert.equal(document.activeElement, trigger);
    assert.deepEqual(scrollRestored, [0, 0]);
    assert.equal(document.getElementById('location').textContent, '/title/fixture-movie');
  }
});

test('upcoming detail keeps full playback hidden and rechecks authorization at premiere without navigation', async () => {
  await mount(Title, '/title/fixture-movie', {}, {
    ...movie, watchAvailable: false, releaseAt: new Date(Date.now() + 100).toISOString(),
  });
  assert.equal(button('▶ Watch Now'), undefined);
  assert.ok(button('Watch Trailer'));
  assert.match(document.querySelector('time').textContent, /ET/);
  fixture = { ...fixture, watchAvailable: true };
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1150)); });
  assert.ok(button('▶ Watch Now'));
  assert.ok(button('Watch Trailer'), 'trailer survives premiere');
});

test('titles without trailers hide controls and show trailers do not replace episode navigation', async () => {
  api.getSeriesDetails = async () => [{
    key: 'fixture-show', title: 'Fixture show', description: 'Show synopsis',
    trailerAvailable: true, trailerTitleId: 'show-record',
    seasons: [1, 2], seasonCount: 2, episodeCount: 2,
    episodes: [1, 2].map(n => ({ ...movie, id: `episode-${n}`, seasonNumber: n, episodeNumber: 1 })),
  }];
  await mount(SeriesDetail, '/series/fixture-show');
  assert.ok(button('Watch Trailer'));
  assert.ok(document.querySelector('select'));
  assert.equal(document.querySelector('.series-episode__actions a').getAttribute('href'), '/title/episode-1');
  const season = document.querySelector('select');
  await act(async () => { season.value = '2'; season.dispatchEvent(new window.Event('change', { bubbles: true })); });
  assert.equal(document.querySelector('.series-episode__actions a').getAttribute('href'), '/title/episode-2');
  await act(async () => button('Watch Trailer').click());
  await act(async () => document.querySelector('.trailer-player-close').click());
  assert.equal(season.value, '2');
  await mount(Title, '/title/fixture-movie', {}, { ...movie, trailerAvailable: false });
  assert.equal(button('Watch Trailer'), undefined);
});

test('a show with no released episodes is a Coming Soon page with its trailer and only confirmed dates', async () => {
  const comingSoon = {
    key: 'fixture-upcoming', title: 'Fixture upcoming', description: 'Upcoming synopsis', comingSoon: true,
    trailerAvailable: true, trailerTitleId: 'upcoming-show', seasons: [], seasonCount: 0, episodeCount: 0, episodes: [],
  };
  api.getSeriesDetails = async () => [comingSoon];
  await mount(SeriesDetail, '/series/fixture-upcoming');
  const text = document.querySelector('main').textContent;
  assert.match(text, /Coming Soon to PROtv/);
  assert.match(text, /Premiere date to be announced/);
  assert.doesNotMatch(text, /0 seasons|0 episodes|New episodes/);
  assert.equal(document.querySelector('.series-episode__actions'), null);
  assert.ok(button('Watch Trailer'));
  await act(async () => button('Watch Trailer').click());
  assert.ok(document.querySelector('.trailer-player-dialog'));
  await act(async () => document.querySelector('.trailer-player-close').click());

  api.getSeriesDetails = async () => [{ ...comingSoon, premiereAt: '2099-11-11T01:00:00.000Z',
    airingSchedule: { weekday: 'Tuesday', time: '20:00', timeZone: 'America/New_York' } }];
  await mount(SeriesDetail, '/series/fixture-upcoming');
  const scheduled = document.querySelector('.series-detail-hero__premiere').textContent;
  assert.match(scheduled, /Premieres Tuesday, November 10, 2099 at 8:00 PM ET/);
  assert.match(scheduled, /New episodes Tuesdays at 8 PM ET/);
});

test('both card types open details by default and keep an explicit full-production Play action', async () => {
  for (const Card of [StreamingCard, MovieCard]) {
    await mount(Card, '/cards', { video: movie });
    await act(async () => document.querySelector('[role="button"]').click());
    assert.equal(document.getElementById('location').textContent, '/title/fixture-movie');
    await mount(Card, '/cards', { video: movie });
    const play = document.querySelector('.ptv-card__action--play, .card-play');
    await act(async () => play.click());
    assert.equal(document.getElementById('location').textContent, '/player/fixture-movie');
    await mount(Card, '/cards', { video: { ...movie, watchAvailable: false } });
    assert.equal(document.querySelector('.ptv-card__action--play, .card-play, .preview-play'), null);
  }
});

test('search title selection opens details rather than starting full playback', async () => {
  api.getSearchVideos = async () => [movie];
  api.getPodcastShows = async () => [];
  api.getPodcastEpisodes = async () => [];
  let closed = false;
  await mount(SearchOverlay, '/cards', { onClose: () => { closed = true; } });
  const input = document.querySelector('.search-overlay input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, movie.title);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.ok(document.querySelector('.search-result-card'));
  await act(async () => document.querySelector('.search-result-card').click());
  assert.equal(closed, true);
  assert.equal(document.getElementById('location').textContent, '/title/fixture-movie');
});

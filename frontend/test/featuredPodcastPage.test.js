import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/podcast/me-and-my-white-friend',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.matchMedia = () => ({ matches: true });

let createRoot;
let vite;
let Page;
let Home;
let PodcastShow;
let Hero;
let AuthContext;
let api;
let root;
const auth = {
  user: null, isAdmin: false, favorites: [], progress: {}, loading: false,
  openAuthModal() {}, signOut() {}, isFavorite: () => false, toggleFavorite() {},
};
const show = {
  id: 'catalog-show', contentType: 'PODCAST_SHOW', title: 'Me and My White Friend',
  genres: [], episodes: [],
};
const episode = {
  id: 'published-episode', contentType: 'PODCAST_EPISODE', podcastShowId: show.id,
  episodeNumber: 2, title: 'The actual catalog title', description: 'The actual catalog description',
  duration: 1800, muxPlaybackId: 'actual-public-playback', thumbnailUrl: '/missing-test-image.png',
};

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({
    configFile: false, envFile: false, root: frontendRoot,
    plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
  });
  ({ default: Page } = await vite.ssrLoadModule('/src/pages/FeaturedPodcast.jsx'));
  ({ default: Home } = await vite.ssrLoadModule('/src/pages/Home.jsx'));
  ({ default: Hero } = await vite.ssrLoadModule('/src/components/CinematicHero.jsx'));
  ({ default: PodcastShow } = await vite.ssrLoadModule('/src/pages/PodcastShow.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
}

function Location() {
  const location = useLocation();
  return React.createElement('output', { 'data-location': true }, location.pathname + location.hash);
}

async function mount(Component = Page, props = {}, entry = '/podcast/me-and-my-white-friend') {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(
    React.createElement(MemoryRouter, { initialEntries: [entry] },
      React.createElement(AuthContext.Provider, { value: auth },
        React.createElement(React.Fragment, null,
          React.createElement(Component, props), React.createElement(Location))))
  ));
  await settle();
}

test('actual production route and original/cropped supplied artwork are present', () => {
  const source = readFileSync(path.join(frontendRoot, 'src', 'App.jsx'), 'utf8');
  assert.match(source, /path="\/podcast\/me-and-my-white-friend" element={<FeaturedPodcast/);
  for (const name of ['me-and-my-white-friend.png', 'me-and-my-white-friend-banner.png']) {
    assert.ok(existsSync(path.join(frontendRoot, 'src', 'assets', name)));
  }
});

test('empty public catalog shows official hosts/copy and Coming Soon with no playable placeholders', async () => {
  api.getPodcastShows = async () => [];
  await mount();
  assert.equal(document.querySelector('h1').textContent, 'Me and My White Friend');
  assert.match(document.body.textContent, /Reg and Marv/);
  assert.match(document.body.textContent, /Different backgrounds\. Real conversations\. One unforgettable friendship\./);
  assert.match(document.body.textContent, /It's a refreshing reminder/);
  assert.match(document.body.textContent, /Episodes Coming Soon/);
  assert.equal(document.querySelector('a[href^="/player/"]'), null);
  assert.ok(document.querySelector('img[alt*="official podcast artwork"]'));
  assert.equal(document.querySelector('a[aria-current="page"]').getAttribute('href'), '/podcasts');
});

test('published catalog episodes render actual metadata and real player routes; bad images fall back to supplied artwork', async () => {
  api.getPodcastShows = async () => [show];
  api.getPodcastShow = async (id) => {
    assert.equal(id, show.id);
    return { ...show, episodes: [{ ...episode, seasonNumber: 2 }, { ...episode, id: 'held', releaseStatus: 'held' }] };
  };
  await mount();
  assert.match(document.body.textContent, /The actual catalog title/);
  assert.match(document.body.textContent, /The actual catalog description/);
  assert.match(document.body.textContent, /30m/);
  assert.match(document.querySelector('.mmwf-episode__copy').textContent, /Season 2 \/ Episode 2/);
  assert.equal(document.querySelectorAll('.mmwf-episode').length, 1);
  const links = [...document.querySelectorAll('a[href^="/player/"]')];
  assert.ok(links.length >= 2);
  assert.ok(links.every((link) => link.getAttribute('href') === '/player/published-episode'));
  const image = document.querySelector('.mmwf-episode img');
  await act(async () => image.dispatchEvent(new window.Event('error')));
  assert.match(image.getAttribute('src'), /me-and-my-white-friend-banner\.png/);
  assert.equal(document.querySelector('a[href="/player/held"]'), null);
});

test('API failure is explicit, clears watch links, and retry recovers to the honest empty state', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    api.getPodcastShows = async () => { throw new Error('Catalog maintenance'); };
    await mount();
    assert.match(document.querySelector('[role="alert"]').textContent, /Catalog maintenance/);
    assert.equal(document.querySelector('a[href^="/player/"]'), null);
    api.getPodcastShows = async () => [];
    await act(async () => document.querySelector('[role="alert"] button').click());
    await settle();
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.match(document.querySelector('#episodes').textContent, /Episodes Coming Soon/);
  } finally { console.error = originalError; }
});

test('focus refresh discovers newly published Episodes without changing catalog records', async () => {
  api.getPodcastShows = async () => [];
  await mount();
  api.getPodcastShows = async () => [show];
  api.getPodcastShow = async () => ({ ...show, episodes: [episode] });
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  await settle();
  assert.ok(document.querySelector('a[href="/player/published-episode"]'));
});

test('homepage preserves brand and titles, adds spotlight, and hero next/previous/dots still navigate', async () => {
  const video = {
    id: 'existing-film', title: 'Existing Featured Film', genreLabel: 'Drama',
    description: 'Existing content', backdrop: '/existing.png', duration: 90,
  };
  await mount(Hero, { brand: { imageUrl: '/brand.png' }, titles: [video], featuredPodcast: true }, '/');
  assert.equal(document.querySelectorAll('[role="tab"]').length, 3);
  await act(async () => document.querySelector('[aria-label="Next featured slide"]').click());
  assert.match(document.querySelector('h1').textContent, /Me and My White Friend/);
  const explore = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Explore the Podcast');
  await act(async () => explore.click());
  assert.equal(document.querySelector('output').textContent, '/podcast/me-and-my-white-friend');
  await act(async () => document.querySelector('[aria-label="Next featured slide"]').click());
  assert.match(document.querySelector('h1').textContent, /Existing Featured Film/);
  const watch = [...document.querySelectorAll('button')].find((item) => /Watch Now/.test(item.textContent));
  await act(async () => watch.click());
  assert.equal(document.querySelector('output').textContent, '/player/existing-film');
  await act(async () => document.querySelector('[aria-label="Previous featured slide"]').click());
  assert.equal(document.querySelector('[aria-label="Me and My White Friend"]').getAttribute('aria-selected'), 'true');
  await act(async () => document.querySelector('[aria-label="PROtv brand hero"]').click());
  assert.match(document.querySelector('h1').textContent, /PROtv/);
  api.getVideos = async () => [];
  await mount(Home, {}, '/');
  assert.ok(document.querySelector('.mmwf-spotlight a[href="/podcast/me-and-my-white-friend"]'));
  assert.ok(document.querySelector('[aria-label="Me and My White Friend"]'));
});

test('real generic Podcast Show URL redirects only this property to branded route and preserves episode anchor', async () => {
  api.getPodcastShow = async () => show;
  function RoutedShow() {
    return React.createElement(Routes, null,
      React.createElement(Route, { path: '/podcasts/:showId', element: React.createElement(PodcastShow) }),
      React.createElement(Route, { path: '/podcast/me-and-my-white-friend', element: React.createElement('h1', null, 'Branded page') }));
  }
  await mount(RoutedShow, {}, '/podcasts/catalog-show#episodes');
  assert.equal(document.querySelector('output').textContent, '/podcast/me-and-my-white-friend#episodes');
  api.getPodcastShow = async () => ({ ...show, id: 'other-show', title: 'Another Podcast' });
  await mount(RoutedShow, {}, '/podcasts/other-show');
  assert.equal(document.querySelector('output').textContent, '/podcasts/other-show');
  assert.match(document.querySelector('h1').textContent, /Another Podcast/);
});

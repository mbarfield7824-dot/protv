import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.matchMedia = () => ({ matches: true });

let createRoot, vite, Home, Editor, AuthContext, api, matchesCategory, root;
const auth = {
  user: null, isAdmin: false, favorites: [], progress: {}, loading: false,
  openAuthModal() {}, signOut() {}, isFavorite: () => false, toggleFavorite() {},
};
// Synthetic catalog: one playable film assigned to two categories, released most recently.
const film = {
  id: 'multi-film', title: 'Multi Category Film', description: 'Synthetic', contentType: 'MOVIE', status: 'ready',
  muxPlaybackId: 'public-id', category: 'Black Cinema', genre: 'Black Cinema', categories: ['Black Cinema', 'Independent'],
  approvedAt: '2099-01-01T00:00:00.000Z',
};
const upcoming = {
  id: 'series-abc', kind: 'series', href: '/series/abc', title: 'Synthetic Upcoming Show', artwork: '/poster.jpg',
  trailerAvailable: true, categories: ['Independent'],
};

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: false, envFile: false, root: frontendRoot, plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Home } = await vite.ssrLoadModule('/src/pages/Home.jsx'));
  ({ default: Editor } = await vite.ssrLoadModule('/src/components/AdminCatalogEditor.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
  ({ matchesCategory } = await vite.ssrLoadModule('/src/data/browseCategories.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });

async function mount(Component, entry = '/') {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [entry] },
    React.createElement(AuthContext.Provider, { value: auth }, React.createElement(Component)))));
  await settle();
}

const railTitles = (id) => [...document.querySelectorAll(`#${id} .ptv-card__title`)].map((item) => item.textContent);

const curatedEpisode = '2212 · Episode 3: C-Fluid';

// Note: compare titles/booleans rather than passing mounted DOM elements to assert. When an assertion on a React-mounted
// element fails, Node's assert tries to inspect the element's whole fiber/jsdom graph and dies with
// "RangeError: Array buffer allocation failed" instead of reporting the real failure.
test('the homepage shows a Coming Soon row and Browse tile that open detail pages, with no Play action', async () => {
  api.getVideos = async () => [film];
  api.getComingSoon = async () => [upcoming];
  await mount(Home);
  assert.deepEqual(railTitles('coming-soon'), [curatedEpisode, 'Synthetic Upcoming Show']);
  const card = document.querySelectorAll('#coming-soon .ptv-card')[1];
  assert.equal(card.querySelector('a').getAttribute('href'), '/series/abc');
  assert.match(card.textContent, /Coming Soon/);
  assert.match(card.textContent, /Premiere date TBD/);
  assert.equal(card.querySelector('.ptv-card__action--play') === null, true);
  const tile = document.querySelector('#categories a[href="/#coming-soon"]');
  assert.ok(tile);
  assert.match(tile.getAttribute('aria-label'), /Coming Soon, 2 titles/);
});

test('2212 Episode 3: C-Fluid is a Coming Soon card with its artwork and no playback, and never touches released episodes', async () => {
  const released = { ...film, id: 'creator_episode_ep1', title: 'Concrete', contentType: 'TV_EPISODE', seriesTitle: '2212', episodeNumber: 1 };
  api.getVideos = async () => [film, released];
  api.getComingSoon = async () => [];
  await mount(Home);
  const cards = document.querySelectorAll('#coming-soon .ptv-card');
  assert.equal(cards.length, 1, 'released episodes stay out of Coming Soon');
  const card = cards[0];
  assert.equal(card.querySelector('.ptv-card__title').textContent, curatedEpisode);
  assert.equal(card.querySelector('img').getAttribute('src'), '/coming-soon/2212-episode-3-c-fluid.jpg');
  assert.equal(card.querySelector('.ptv-card__meta').textContent, 'Premiere date TBD');
  assert.deepEqual([...card.querySelectorAll('a')].map((link) => link.getAttribute('href')), ['/series/2212', '/series/2212']);
  assert.equal(card.querySelector('.ptv-card__action--play, a[href^="/player/"]') === null, true, 'no playback entry point');
  assert.equal(released.comingSoon, undefined, 'released episode records are not modified');
});

test('with nothing published the row keeps only the curated card, and a Coming Soon outage never breaks the homepage', async () => {
  api.getVideos = async () => [film];
  api.getComingSoon = async () => [];
  await mount(Home);
  assert.deepEqual(railTitles('coming-soon'), [curatedEpisode]);
  assert.ok(document.querySelector('#categories a[href="/#coming-soon"]'));
  await mount(Home, '/#coming-soon');
  assert.deepEqual(railTitles('coming-soon'), [curatedEpisode], 'the Browse tile destination is the populated row');
  api.getComingSoon = async () => { throw new Error('offline'); };
  await mount(Home);
  assert.ok(railTitles('new-on-protv').includes(film.title), 'a Coming Soon failure never breaks the homepage');
  assert.deepEqual(railTitles('coming-soon'), [curatedEpisode]);
});

test('one title appears in New on PROtv and in every category it is assigned to', async () => {
  api.getVideos = async () => [film];
  api.getComingSoon = async () => [];
  await mount(Home);
  assert.ok(railTitles('new-on-protv').includes(film.title));
  assert.ok(railTitles('black-cinema').includes(film.title));
  assert.ok(railTitles('independent').includes(film.title));
  assert.equal(matchesCategory({ category: 'Drama', categories: ['Drama', 'Black Cinema'] }, { matches: ['Black Cinema'] }), true);
});

test('Admin can set a primary genre and add or remove more categories, and saving sends them all once', async () => {
  const saved = [];
  api.getAdminAllVideos = async () => [{ ...film, category: 'Independent', genre: 'Independent', categories: ['Independent', 'Legacy Tag'], approvalStatus: 'approved' }];
  api.updateVideoMetadata = async (id, body) => { saved.push(body); return { ...film, ...body, id }; };
  await mount(Editor, '/admin');
  const select = [...document.querySelectorAll('.admin-category-chooser select')][0];
  assert.equal(select.value, 'Independent');
  const chip = (name) => [...document.querySelectorAll('.admin-category-chip')].find((item) => item.textContent.includes(name));
  assert.equal(chip('Legacy Tag').getAttribute('aria-pressed'), 'true', 'existing categories are kept and shown');
  await act(async () => { select.value = 'Black Cinema'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await act(async () => chip('Drama').click());
  await act(async () => chip('Legacy Tag').click());
  await act(async () => chip('Independent').click());
  assert.equal(chip('Independent').getAttribute('aria-pressed'), 'true');
  const save = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Save');
  await act(async () => save.click());
  await settle();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].category, 'Black Cinema');
  assert.deepEqual(saved[0].categories, ['Black Cinema', 'Drama', 'Independent']);
  assert.ok(!chip('Black Cinema'), 'the primary genre is not offered twice');
});

test('the homepage has no PROtv Originals section, tile or nav link, but Original branding stays on cards', async () => {
  const original = { ...upcoming, comingSoon: true, protvOriginal: true, categories: ['Black Cinema', 'Drama'] };
  let originalsRequests = 0;
  api.getVideos = async () => [film];
  api.getComingSoon = async () => [original];
  api.getOriginals = async () => { originalsRequests += 1; return [original]; };
  await mount(Home);
  assert.equal(document.querySelector('#originals') === null, true, 'no Originals section');
  assert.equal(document.querySelector('a[href="/#originals"], a[href="/#featured-on-protv"]') === null, true, 'no dead Originals links');
  assert.equal([...document.querySelectorAll('header a')].some((link) => link.textContent.trim() === 'Originals'), false);
  assert.equal(originalsRequests, 0, 'the homepage no longer requests the Originals row');
  assert.equal(typeof api.getOriginals, 'function', 'the Originals catalog endpoint client is kept');
  const card = [...document.querySelectorAll('#coming-soon .ptv-card')].find((item) => item.textContent.includes(original.title));
  assert.equal(card.querySelector('a').getAttribute('href'), '/series/abc');
  assert.deepEqual([...card.querySelectorAll('.ptv-card__badge')].map((item) => item.textContent), ['PROtv Original', 'Coming Soon']);
  assert.equal(card.querySelector('.ptv-card__action--play') === null, true);
  assert.equal(document.querySelectorAll('#categories a')[0].getAttribute('href'), '/#coming-soon');
  await mount(Home, '/#originals');
  assert.ok(railTitles('new-on-protv').includes(film.title), 'an old /#originals link still lands on a working homepage');
});

test('a released Original keeps its badge on regular cards and keeps its normal Play action', async () => {
  api.getVideos = async () => [{ ...film, protvOriginal: true }];
  api.getComingSoon = async () => [];
  await mount(Home);
  const card = document.querySelector('#new-on-protv .ptv-card');
  assert.equal(card.querySelector('.ptv-card__badge--original').textContent, 'PROtv Original');
  assert.ok(card.querySelector('.ptv-card__action--play'));
});

test('the homepage hero shows UNITED NATIONS, The Thirst and A Long Time Coming in that order', async () => {
  const hero = (id, title) => ({ ...film, id, title, description: `${title} description`, categories: [], category: 'Drama', genre: 'Drama' });
  api.getVideos = async () => [
    film,
    hero('creator_5a913abe-bbb5-44a5-9c8f-cc12b7496ba9', 'A Long Time Coming'),
    hero('creator_7451a32b-716f-4f5e-8797-ed84d2bdf1d6', 'UNITED NATIONS'),
    hero('creator_613e215e-709f-48ee-91bb-b225d8da4a33', 'The Thirst'),
  ];
  api.getComingSoon = async () => [];
  await mount(Home);
  const tabs = [...document.querySelectorAll('.ptv-hero [role="tab"]')].map((item) => item.getAttribute('aria-label'));
  const titles = tabs.filter((label) => ['UNITED NATIONS', 'The Thirst', 'A Long Time Coming', film.title].includes(label));
  assert.deepEqual(titles, ['UNITED NATIONS', 'The Thirst', 'A Long Time Coming']);
});

test('Admin can designate and remove a PROtv Original alongside categories', async () => {
  const saved = [];
  api.getAdminAllVideos = async () => [{ ...film, category: 'Independent', categories: ['Independent'], approvalStatus: 'approved' }];
  api.updateVideoMetadata = async (id, body) => { saved.push(body); return { ...film, ...body, id }; };
  await mount(Editor, '/admin');
  const toggle = document.querySelector('.admin-original-toggle input');
  assert.equal(toggle.checked, false);
  await act(async () => toggle.click());
  const chip = [...document.querySelectorAll('.admin-category-chip')].find((item) => item.textContent.includes('Black Cinema'));
  await act(async () => chip.click());
  const save = () => [...document.querySelectorAll('button')].find((item) => item.textContent === 'Save');
  await act(async () => save().click());
  await settle();
  assert.equal(saved[0].protvOriginal, true);
  assert.deepEqual(saved[0].categories, ['Independent', 'Black Cinema']);
  assert.ok(document.querySelector('.admin-original-pill'));
  await act(async () => document.querySelector('.admin-original-toggle input').click());
  await act(async () => save().click());
  await settle();
  assert.equal(saved[1].protvOriginal, false);
});

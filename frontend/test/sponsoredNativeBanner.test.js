import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

const SRC = 'https://bancadeltempoidea.org/21/8dff71e28b526157552eaf451e0a4a21';
const CONTAINER = 'container-8dff71e28b526157552eaf451e0a4a21';
let createRoot, vite, Banner, resetSession, root;
let events = [];
let created = 0;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: false, envFile: false, root: frontendRoot, plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Banner } = await vite.ssrLoadModule('/src/components/SponsoredNativeBanner.jsx'));
  ({ resetSponsoredSessionForTests: resetSession } = await vite.ssrLoadModule('/src/ads/sponsoredSession.js'));
  // Count every ad script element ever created, not just those currently in the page.
  const original = document.createElement.bind(document);
  document.createElement = (name, ...rest) => {
    const element = original(name, ...rest);
    if (String(name).toLowerCase() === 'script') created += 1;
    return element;
  };
});
after(async () => { await act(async () => root?.unmount()); await vite?.close(); dom.window.close(); });
beforeEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  resetSession();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'globalPrivacyControl', { configurable: true, value: undefined });
  events = [];
  created = 0;
});

const settle = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const scripts = () => [...document.querySelectorAll('script')].filter((item) => item.src === SRC);
const settings = (enabled) => async () => ({ nativeBanner: { enabled } });

// Renders one "page" holding the given number of Sponsored sections; switching pages mimics in-app navigation.
async function page(enabled = true, props = {}, sections = 1) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  const banners = Array.from({ length: sections }, (_, index) => React.createElement(Banner,
    { key: index, loadSettings: settings(enabled), report: (state) => events.push(state), ...props }));
  await act(async () => root.render(React.createElement(MemoryRouter, null, ...banners)));
  await settle();
}
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent === text);
const renderAd = async () => {
  await act(async () => { document.getElementById(CONTAINER).appendChild(document.createElement('div')); });
  await settle();
};

test('switched off: nothing renders and no ad code loads, even after consent was given', async () => {
  window.localStorage.setItem('protv-sponsored-consent-v1', 'granted');
  await page(false);
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(created, 0);
});

test('switched on: the viewer is asked first and no ad code loads before consent', async () => {
  await page(true);
  const section = document.querySelector('.ptv-sponsored');
  assert.equal(section.getAttribute('aria-label'), 'Sponsored');
  assert.match(section.textContent, /provided by Adsterra/);
  assert.ok(section.querySelector('a[href="/privacy#advertising"]'));
  assert.equal(created, 0);
  assert.equal(document.getElementById(CONTAINER), null);
  await act(async () => button('No thanks').click());
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(window.localStorage.getItem('protv-sponsored-consent-v1'), 'declined');
  await page(true);
  assert.equal(document.querySelector('.ptv-sponsored'), null, 'the refusal is remembered on every page');
  assert.equal(created, 0);
  assert.deepEqual(events, ['consent_requested', 'consent_declined']);
});

test('Global Privacy Control means no prompt and no ad', async () => {
  Object.defineProperty(window.navigator, 'globalPrivacyControl', { configurable: true, value: true });
  await page(true);
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(created, 0);
});

test('one request per page load: in-app navigation carries the rendered unit without a new script or impression', async () => {
  await page(true);
  await act(async () => button('Allow sponsored content').click());
  await settle();
  assert.equal(scripts().length, 1);
  const [script] = scripts();
  assert.equal(script.async, true);
  assert.equal(script.getAttribute('data-cfasync'), 'false');
  assert.equal(script.previousElementSibling, document.getElementById(CONTAINER), 'the script follows its container');
  assert.equal(document.head.querySelector(`script[src="${SRC}"]`), null, 'not loaded globally');
  await renderAd();
  assert.deepEqual(events, ['consent_requested', 'consent_granted', 'requested', 'rendered']);
  const unit = document.getElementById(CONTAINER);

  for (let visit = 0; visit < 3; visit += 1) await page(true); // movie → series → podcast, in-app
  assert.equal(created, 1, 'the ad script is created once per page load');
  assert.equal(scripts().length, 0, 'no further script is ever added');
  assert.equal(document.querySelectorAll(`#${CONTAINER}`).length, 1);
  assert.equal(document.getElementById(CONTAINER), unit, 'the same rendered unit, not a new one');
  assert.equal(document.querySelector('.ptv-sponsored__status'), null);
  assert.deepEqual(events.filter((state) => state === 'requested' || state === 'rendered'), ['requested', 'rendered']);

  // A page without a Sponsored section (such as the player) shows nothing; the unit returns afterwards.
  await act(async () => root.unmount());
  root = null;
  assert.equal(document.getElementById(CONTAINER), null);
  await page(true);
  assert.equal(document.getElementById(CONTAINER), unit);

  await act(async () => button('Turn off sponsored content').click());
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(document.getElementById(CONTAINER), null);
  await page(true);
  assert.equal(document.querySelector('.ptv-sponsored'), null, 'withdrawal applies everywhere');
  assert.equal(created, 1);
});

test('two Sponsored sections on one screen never duplicate the container', async () => {
  window.localStorage.setItem('protv-sponsored-consent-v1', 'granted');
  await page(true, {}, 2);
  assert.equal(document.querySelectorAll(`#${CONTAINER}`).length, 1);
  assert.equal(document.querySelectorAll('.ptv-sponsored').length, 1);
  assert.equal(created, 1);
});

test('navigating away while the ad loads: it can still render on the next page, from the same request', async () => {
  window.localStorage.setItem('protv-sponsored-consent-v1', 'granted');
  await page(true);
  await page(true);
  assert.equal(created, 1);
  assert.equal(document.querySelectorAll(`#${CONTAINER}`).length, 1);
  await renderAd();
  assert.ok(events.includes('rendered'));
  assert.equal(document.querySelector('.ptv-sponsored__status'), null);
});

test('a script failure, ad blocker or empty response removes the section and is not retried until reload', async () => {
  window.localStorage.setItem('protv-sponsored-consent-v1', 'granted');
  await page(true);
  await act(async () => scripts()[0].dispatchEvent(new window.Event('error')));
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.ok(events.includes('error'));
  await page(true);
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(created, 1, 'no retry on the next page');

  resetSession(); // a new page load
  events = [];
  await page(true, { emptyAfterMs: 30 });
  await settle(80);
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.deepEqual(events, ['requested', 'empty']);
  await page(true, { emptyAfterMs: 30 });
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(created, 2);
});

test('settings that cannot load keep the placement off', async () => {
  await page(true, { loadSettings: async () => { throw new Error('offline'); } });
  assert.equal(document.querySelector('.ptv-sponsored'), null);
});

const SPONSORED_PAGES = [
  'src/pages/CollectionPage.jsx', 'src/pages/Documentaries.jsx', 'src/pages/FeaturedPodcast.jsx', 'src/pages/Home.jsx',
  'src/pages/Movies.jsx', 'src/pages/Music.jsx', 'src/pages/PodcastShow.jsx', 'src/pages/Podcasts.jsx',
  'src/pages/Series.jsx', 'src/pages/SeriesDetail.jsx', 'src/pages/Title.jsx',
];

test('only approved content and browse pages use it; never players, account, sign-in, Admin or global code', () => {
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const full = path.join(dir, name); statSync(full).isDirectory() ? walk(full) : files.push(full); } };
  walk(path.join(frontendRoot, 'src'));
  const users = files.filter((file) => /\.(jsx?|tsx?)$/.test(file) && !file.endsWith('SponsoredNativeBanner.jsx')
    && readFileSync(file, 'utf8').includes('SponsoredNativeBanner'))
    .map((file) => path.relative(frontendRoot, file).replace(/\\/g, '/')).sort();
  assert.deepEqual(users, SPONSORED_PAGES);
  for (const file of SPONSORED_PAGES) {
    const source = readFileSync(path.join(frontendRoot, file), 'utf8');
    assert.equal((source.match(/<SponsoredNativeBanner\b/g) || []).length, 1, `${file} has exactly one placement`);
  }
  const home = readFileSync(path.join(frontendRoot, 'src/pages/Home.jsx'), 'utf8');
  assert.ok(home.indexOf('id="originals"') < home.indexOf('<SponsoredNativeBanner />'));
  assert.ok(home.indexOf('<SponsoredNativeBanner />') < home.indexOf('<SpotlightFeature'));
  // Title pages: movies and Coming Soon only, below the actions, and never while the trailer plays.
  const title = readFileSync(path.join(frontendRoot, 'src/pages/Title.jsx'), 'utf8');
  assert.ok(title.indexOf('className="title-actions"') < title.indexOf('<SponsoredNativeBanner'));
  assert.match(title, /sponsoredEligible && !trailerOpen && <SponsoredNativeBanner/);
  assert.match(title, /const sponsoredEligible = video\.contentType === 'MOVIE' \|\| video\.comingSoon === true/);
  const html = readFileSync(path.join(frontendRoot, 'index.html'), 'utf8');
  assert.equal(html.includes('bancadeltempoidea'), false, 'never in the global page template');
});

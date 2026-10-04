import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { readInitialTitle } from '../src/data/initialTitle.js';

const require = createRequire(import.meta.url);
const { titleHtml } = require('../../backend/src/catalog/titleHtml.js');
const { playableCatalog } = require('../../backend/src/catalog/readModel.js');
const initial = playableCatalog([{
  id: 'public-a', title: 'Real <Title> & "One"', description: 'A real description & synopsis.',
  contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: 'ready',
}])[0];
const template = '<html><head><title>PROtv</title></head><body><div id="root"></div></body></html>';
const dom = new JSDOM(template, { url: 'https://watchprotv.com/title/public-a' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let createRoot;
let vite;
let Title;
let AuthContext;
let api;
let root;
let originalGetVideo;
const authValue = {
  user: null, isAdmin: false, isFavorite: () => false, toggleFavorite() {},
  openAuthModal() {}, signOut() {},
};

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({
    configFile: false,
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  ({ default: Title } = await vite.ssrLoadModule('/src/pages/Title.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
  originalGetVideo = api.getVideo;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  api.getVideo = originalGetVideo;
});
after(async () => {
  await vite?.close();
  dom.window.close();
});

async function mount({ seed = initial, id = initial.id, fetchTitle, strict = true } = {}) {
  document.body.innerHTML = seed
    ? new window.DOMParser().parseFromString(titleHtml(template, seed), 'text/html').body.innerHTML
    : '<div id="root"></div>';
  api.getVideo = fetchTitle || (async () => initial);
  root = createRoot(document.getElementById('root'));
  const routes = React.createElement(AuthContext.Provider, { value: authValue },
    React.createElement(MemoryRouter, { initialEntries: [`/title/${id}`] },
      React.createElement(Link, { to: '/title/public-b' }, 'Next title'),
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/title/:id', element: React.createElement(Title) }),
        React.createElement(Route, { path: '/player/:id', element: React.createElement('h1', null, 'Player route') }))));
  await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, routes) : routes));
}

function heading() {
  return document.querySelector('main h1')?.textContent;
}

async function click(text) {
  const element = [...document.querySelectorAll('a, button')].find((item) => item.textContent.trim().endsWith(text));
  assert.ok(element, text);
  await act(async () => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })));
}

test('matching initial content survives createRoot, StrictMode and a pending refresh without duplicates', async () => {
  let finish;
  await mount({ fetchTitle: () => new Promise((resolve) => { finish = resolve; }) });
  assert.equal(heading(), initial.title);
  assert.equal(document.querySelector('.title-description').textContent, initial.description);
  assert.equal(document.querySelectorAll('main').length, 1);
  assert.equal(document.querySelectorAll('main h1').length, 1);
  assert.equal(document.querySelector('[aria-label="Loading title"]'), null);
  assert.equal(document.getElementById('protv-initial-title'), null);
  await act(async () => finish({ ...initial, title: 'Updated public title' }));
  assert.equal(heading(), 'Updated public title');
  await click('Watch Now');
  assert.equal(document.querySelector('h1').textContent, 'Player route');
});

test('temporary refresh failures retain valid title content and are logged', async (context) => {
  const logged = [];
  context.mock.method(console, 'error', (...args) => logged.push(args));
  await mount({ fetchTitle: async () => { throw new Error('offline'); } });
  assert.equal(heading(), initial.title);
  assert.equal(document.querySelector('.title-description').textContent, initial.description);
  assert.equal(logged.length, 1);
});

test('a confirmed unavailable title clears initial content rather than retaining stale data', async () => {
  await mount({ fetchTitle: async () => null });
  assert.equal(heading(), 'Title not found');
  assert.equal(document.body.textContent.includes(initial.description), false);
});

test('mismatched IDs never initialize another route', async () => {
  await mount({ id: 'public-b', fetchTitle: () => new Promise(() => {}) });
  assert.equal(heading(), undefined);
  assert.ok(document.querySelector('[aria-label="Loading title"]'));
  assert.equal(document.body.textContent.includes(initial.title), false);
});

test('route changes discard old content and late responses cannot overwrite the new title', async () => {
  let finishOld;
  await mount({ fetchTitle: (id) => id === initial.id
    ? new Promise((resolve) => { finishOld = resolve; })
    : Promise.resolve({ ...initial, id, title: 'Second title' }) });
  await click('Next title');
  assert.equal(heading(), 'Second title');
  await act(async () => finishOld({ ...initial, title: 'Late first title' }));
  assert.equal(heading(), 'Second title');
  assert.equal(document.querySelectorAll('main').length, 1);
});

test('a failed refresh on another route cannot retain the previous title', async (context) => {
  context.mock.method(console, 'error', () => {});
  await mount({ fetchTitle: async (id) => {
    if (id === initial.id) return initial;
    throw new Error('offline on second route');
  } });
  await click('Next title');
  assert.equal(heading(), 'Title not found');
  assert.equal(document.body.textContent.includes(initial.description), false);
});

test('consumed initial data is not reused on a later mount', async () => {
  await mount({ fetchTitle: () => new Promise(() => {}) });
  await act(async () => root.unmount());
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/title/public-a'] },
    React.createElement(AuthContext.Provider, { value: authValue },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/title/:id', element: React.createElement(Title) }))))));
  assert.equal(heading(), undefined);
  assert.ok(document.querySelector('[aria-label="Loading title"]'));
});

test('ordinary client navigation with no initial data still loads from the API', async () => {
  await mount({ seed: null });
  assert.equal(heading(), initial.title);
});

test('initial data is inert, escaped, route matched and invalid JSON is logged', (context) => {
  const unsafe = { ...initial, title: '</script><script>alert(1)</script>',
    description: '<img src=x onerror=alert(1)> & \u2028' };
  const page = new JSDOM(titleHtml(template, unsafe), { runScripts: 'dangerously' });
  assert.equal(page.window.document.querySelector('h1').textContent, unsafe.title);
  assert.equal(page.window.document.querySelectorAll('script').length, 1);
  assert.equal(page.window.document.querySelector('img'), null);
  assert.deepEqual(readInitialTitle(initial.id, page.window.document), unsafe);
  assert.equal(readInitialTitle('another-id', page.window.document), null);
  const logged = [];
  context.mock.method(console, 'error', (...args) => logged.push(args));
  const script = page.window.document.getElementById('protv-initial-title');
  for (const value of ['{broken', JSON.stringify({ ...initial, muxPlaybackId: '' }),
    JSON.stringify({ ...initial, genres: [null] })]) {
    script.textContent = value;
    assert.equal(readInitialTitle(initial.id, page.window.document), null);
  }
  assert.equal(logged.length, 3);
  page.window.close();
});

test('title API distinguishes 404, outage, mismatched data and valid updates', async (context) => {
  const request = context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  assert.equal(await originalGetVideo(initial.id), null);
  request.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(originalGetVideo(initial.id), /temporarily unavailable/);
  request.mock.mockImplementation(async () => { throw new Error('offline'); });
  await assert.rejects(originalGetVideo(initial.id), /offline/);
  request.mock.mockImplementation(async () => Response.json({ ...initial, id: 'wrong' }));
  await assert.rejects(originalGetVideo(initial.id), /does not match/);
  request.mock.mockImplementation(async () => Response.json(initial));
  assert.deepEqual(await originalGetVideo(initial.id), initial);
  assert.equal(request.mock.calls.at(-1).arguments[1].cache, 'no-store');
});

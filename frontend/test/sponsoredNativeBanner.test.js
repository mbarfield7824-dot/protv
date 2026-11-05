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
let createRoot, vite, Banner, root;
let events = [];

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: false, envFile: false, root: frontendRoot, plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Banner } = await vite.ssrLoadModule('/src/components/SponsoredNativeBanner.jsx'));
});
after(async () => { await act(async () => root?.unmount()); await vite?.close(); dom.window.close(); });
beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'globalPrivacyControl', { configurable: true, value: undefined });
  events = [];
});

const settle = (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const scripts = () => [...document.querySelectorAll('script')].filter((item) => item.src === SRC);

async function mount(enabled = true, props = {}) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MemoryRouter, null,
    React.createElement(Banner, { loadSettings: async () => ({ nativeBanner: { enabled } }), report: (state) => events.push(state), ...props }))));
  await settle();
}
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent === text);

test('switched off: nothing renders and no ad code loads', async () => {
  await mount(false);
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(scripts().length, 0);
});

test('switched on: the viewer is asked first and no ad code loads before consent', async () => {
  await mount(true);
  const section = document.querySelector('.ptv-sponsored');
  assert.equal(section.getAttribute('aria-label'), 'Sponsored');
  assert.match(section.textContent, /Sponsored/);
  assert.match(section.textContent, /provided by Adsterra/);
  assert.ok(section.querySelector('a[href="/privacy#advertising"]'));
  assert.equal(scripts().length, 0);
  assert.equal(document.getElementById(CONTAINER), null);
  await act(async () => button('No thanks').click());
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(window.localStorage.getItem('protv-sponsored-consent-v1'), 'declined');
  assert.equal(scripts().length, 0);
  await mount(true);
  assert.equal(document.querySelector('.ptv-sponsored'), null, 'the refusal is remembered');
  assert.deepEqual(events, ['consent_requested', 'consent_declined']);
});

test('Global Privacy Control means no prompt and no ad', async () => {
  Object.defineProperty(window.navigator, 'globalPrivacyControl', { configurable: true, value: true });
  await mount(true);
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(scripts().length, 0);
});

test('after consent: exactly the approved script and container, one copy, cleaned up on leaving', async () => {
  await mount(true);
  await act(async () => button('Allow sponsored content').click());
  await settle();
  const container = document.getElementById(CONTAINER);
  assert.ok(container);
  assert.equal(scripts().length, 1);
  const [script] = scripts();
  assert.equal(script.async, true);
  assert.equal(script.getAttribute('data-cfasync'), 'false');
  assert.equal(script.previousElementSibling, container, 'the script follows its container, as in the approved code');
  assert.equal(document.head.querySelector(`script[src="${SRC}"]`), null, 'not loaded globally');
  // The network renders into the container.
  await act(async () => { container.appendChild(document.createElement('div')); });
  await settle();
  assert.ok(events.includes('rendered'));
  assert.ok(button('Turn off sponsored content'));
  // Navigating away and back never duplicates the unit.
  await act(async () => root.unmount());
  assert.equal(scripts().length, 0);
  root = null;
  await mount(true);
  assert.equal(scripts().length, 1);
  assert.equal(document.querySelectorAll(`#${CONTAINER}`).length, 1);
  await act(async () => button('Turn off sponsored content').click());
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.equal(scripts().length, 0);
});

test('a script failure or an empty response removes the section instead of leaving a gap', async () => {
  window.localStorage.setItem('protv-sponsored-consent-v1', 'granted');
  await mount(true);
  await act(async () => scripts()[0].dispatchEvent(new window.Event('error')));
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.ok(events.includes('error'));
  events = [];
  await mount(true, { emptyAfterMs: 30 });
  await settle(80);
  assert.equal(document.querySelector('.ptv-sponsored'), null);
  assert.deepEqual(events, ['requested', 'empty']);
});

test('settings that cannot load keep the placement off', async () => {
  await mount(true, { loadSettings: async () => { throw new Error('offline'); } });
  assert.equal(document.querySelector('.ptv-sponsored'), null);
});

test('the homepage is the only page that uses it, between the discovery rows and Spotlight', () => {
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const full = path.join(dir, name); statSync(full).isDirectory() ? walk(full) : files.push(full); } };
  walk(path.join(frontendRoot, 'src'));
  const users = files.filter((file) => /\.(jsx?|tsx?)$/.test(file) && !file.endsWith('SponsoredNativeBanner.jsx')
    && readFileSync(file, 'utf8').includes('SponsoredNativeBanner'));
  assert.deepEqual(users.map((file) => path.relative(frontendRoot, file).replace(/\\/g, '/')), ['src/pages/Home.jsx']);
  const home = readFileSync(path.join(frontendRoot, 'src/pages/Home.jsx'), 'utf8');
  assert.ok(home.indexOf('id="originals"') < home.indexOf('<SponsoredNativeBanner />'));
  assert.ok(home.indexOf('<SponsoredNativeBanner />') < home.indexOf('<SpotlightFeature'));
  const html = readFileSync(path.join(frontendRoot, 'index.html'), 'utf8');
  assert.equal(html.includes('bancadeltempoidea'), false, 'never in the global page template');
});

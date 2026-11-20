import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/admin', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let createRoot, vite, AdminComingSoon, api, ADMIN_GROUPS, root;
before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: false, envFile: false, root: frontendRoot, plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: AdminComingSoon } = await vite.ssrLoadModule('/src/components/AdminComingSoon.jsx'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
  ({ ADMIN_GROUPS } = await vite.ssrLoadModule('/src/admin/commandCenterNavigation.js'));
});
after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const button = (label) => [...document.querySelectorAll('button')].find((item) => item.textContent === label);
const setValue = async (element, value) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
  setter.call(element, value);
  element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const labelled = (text) => [...document.querySelectorAll('label')].find((label) => label.textContent.startsWith(text))?.querySelector('input, select, textarea');

const migrated = {
  id: '2212-episode-3-c-fluid', version: 1, status: 'published', state: 'live', sortOrder: 0,
  target: { kind: 'series', id: 'MjIxMg', seasonNumber: 1, episodeNumber: 3 },
  title: '2212 · Episode 3: C-Fluid', description: '', artworkUrl: '/coming-soon/2212-episode-3-c-fluid.jpg', premiereAt: null,
  preview: { title: '2212 · Episode 3: C-Fluid', href: '/series/2212' },
};
const targets = {
  titles: [{ kind: 'title', id: 'coming_soon_film', title: 'Upcoming Film', href: '/title/upcoming-film' }],
  series: [{ kind: 'series', id: 'MjIxMg', title: '2212', comingSoon: false, episodes: [{ seasonNumber: 1, episodeNumber: 1, released: true }, { seasonNumber: 1, episodeNumber: 2, released: true }] }],
};

async function mount() {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(AdminComingSoon)));
  await settle();
}

test('Coming Soon Promotions is listed in the Admin Content tools', () => {
  const content = ADMIN_GROUPS.find((group) => group.title === 'Content');
  assert.ok(content.items.some((item) => item.mode === 'coming-soon' && item.label === 'Coming Soon Promotions'));
});

test('the migrated 2212 card is listed as live with TBD, and can be hidden then removed without touching the show', async () => {
  let items = [migrated];
  const saved = [];
  const removed = [];
  api.getComingSoonPromotions = async () => ({ items, targets });
  api.saveComingSoonPromotion = async (id, body) => { saved.push([id, body]); items = [{ ...migrated, ...body, version: body.version + 1, state: body.status === 'hidden' ? 'hidden' : 'live' }]; return items[0]; };
  api.removeComingSoonPromotion = async (id, version) => { removed.push([id, version]); items = []; };
  await mount();
  const entry = document.querySelector('.admin-coming-soon__list li');
  assert.match(entry.textContent, /2212 · Episode 3: C-Fluid/);
  assert.match(entry.textContent, /Live on the homepage/);
  assert.match(entry.textContent, /Premiere date TBD/);
  assert.equal(entry.querySelector('a').getAttribute('href'), '/series/2212');

  await act(async () => button('Hide').click());
  await settle();
  assert.equal(saved[0][0], migrated.id);
  assert.equal(saved[0][1].status, 'hidden');
  assert.equal(saved[0][1].version, 1);
  assert.match(document.querySelector('[role="status"]').textContent, /Hidden from the homepage/);

  await act(async () => button('Remove').click());
  assert.equal(removed.length, 0, 'removal needs a second confirmation click');
  await act(async () => button('Confirm remove').click());
  await settle();
  assert.deepEqual(removed, [[migrated.id, 2]]);
  assert.match(document.querySelector('[role="status"]').textContent, /title, its media and its rights were not changed/);
});

test('an Administrator promotes an upcoming episode of a streaming show with a premiere date, or TBD', async () => {
  const saved = [];
  api.getComingSoonPromotions = async () => ({ items: [], targets });
  api.saveComingSoonPromotion = async (id, body) => { saved.push([id, body]); return { ...body, id: 'promo-new', version: 1 }; };
  await mount();
  await setValue(labelled('What to promote'), 'series:MjIxMg');
  assert.match(document.querySelector('.admin-coming-soon').textContent, /Streaming now: S1 E1, S1 E2/);
  await setValue(labelled('Season'), '1');
  await setValue(labelled('Episode'), '4');
  await setValue(labelled('Promotional description'), 'The next chapter.');
  await act(async () => labelled(' Premiere date TBD').click());
  await setValue(labelled('Premiere date'), '2026-12-05');
  await act(async () => document.querySelector('.admin-coming-soon form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  await settle();
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], undefined, 'a new promotion is created, never an edit of the show');
  assert.deepEqual(saved[0][1].target, { kind: 'series', id: 'MjIxMg', seasonNumber: '1', episodeNumber: '4' });
  assert.equal(saved[0][1].description, 'The next chapter.');
  // Midday UTC keeps December 5 in Eastern time.
  assert.equal(saved[0][1].premiereAt, '2026-12-05T17:00:00.000Z');
  assert.equal(new Date(saved[0][1].premiereAt).toLocaleDateString('en-US', { timeZone: 'America/New_York' }), '12/5/2026');
  assert.equal(saved[0][1].status, 'published');

  await setValue(labelled('What to promote'), 'title:coming_soon_film');
  await act(async () => document.querySelector('.admin-coming-soon form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  await settle();
  assert.equal(saved[1][1].premiereAt, null, 'TBD is the default');
  assert.deepEqual(saved[1][1].target, { kind: 'title', id: 'coming_soon_film' });
});

test('a load failure is shown and the form stays disabled', async () => {
  api.getComingSoonPromotions = async () => { throw new Error('Admin access is required.'); };
  await mount();
  assert.match(document.querySelector('[role="alert"]').textContent, /Admin access is required/);
  assert.equal(document.querySelector('.admin-coming-soon fieldset').disabled, true);
});

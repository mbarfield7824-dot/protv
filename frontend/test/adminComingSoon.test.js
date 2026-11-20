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
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/admin', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
// Trailer polling waits four seconds between checks; tests do not.
const realSetTimeout = window.setTimeout.bind(window);
window.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms >= 4000 ? 0 : ms, ...args);

let createRoot, vite, AdminComingSoon, ComingSoonCard, api, ADMIN_GROUPS, root;
before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: false, envFile: false, root: frontendRoot, plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: AdminComingSoon } = await vite.ssrLoadModule('/src/components/AdminComingSoon.jsx'));
  ({ default: ComingSoonCard } = await vite.ssrLoadModule('/src/components/ComingSoonCard.jsx'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
  ({ ADMIN_GROUPS } = await vite.ssrLoadModule('/src/admin/commandCenterNavigation.js'));
});
after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

const settle = () => act(async () => { await new Promise((resolve) => realSetTimeout(resolve, 20)); });
const button = (label) => [...document.querySelectorAll('button')].find((item) => item.textContent === label);
const setValue = async (element, value) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
  setter.call(element, value);
  element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const labelled = (text) => [...document.querySelectorAll('label')].find((label) => label.textContent.trim().startsWith(text))?.querySelector('input, select, textarea');
const submit = () => act(async () => document.querySelector('.admin-coming-soon form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
const pickFile = async (input, file) => act(async () => {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
});

const migrated = {
  id: '2212-episode-3-c-fluid', version: 1, status: 'published', state: 'live', sortOrder: 0,
  target: { kind: 'series', id: 'MjIxMg', seasonNumber: 1, episodeNumber: 3 },
  title: '2212 · Episode 3: C-Fluid', description: '', artworkUrl: '/coming-soon/2212-episode-3-c-fluid.jpg', premiereAt: null,
  preview: { title: '2212 · Episode 3: C-Fluid', href: '/series/2212' }, trailerStatus: { status: 'empty', source: null, error: '' },
};
const targets = {
  titles: [{ kind: 'title', id: 'coming_soon_film', title: 'Upcoming Film', href: '/title/upcoming-film' }],
  series: [{ kind: 'series', id: 'MjIxMg', title: '2212', comingSoon: false, episodes: [{ seasonNumber: 1, episodeNumber: 1, released: true }, { seasonNumber: 1, episodeNumber: 2, released: true }] }],
  trailers: [{ id: 'coming_soon_dread', title: 'Dread Head' }],
};

async function mount(element = React.createElement(AdminComingSoon)) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MemoryRouter, null, element)));
  await settle();
}

test('Coming Soon Promotions is listed in the Admin Content tools', () => {
  const content = ADMIN_GROUPS.find((group) => group.title === 'Content');
  assert.ok(content.items.some((item) => item.mode === 'coming-soon' && item.label === 'Coming Soon Promotions'));
});

test('the migrated 2212 card is listed as live with TBD, and can be hidden, republished with rights, and removed', async () => {
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
  assert.match(entry.textContent, /No trailer/);

  await act(async () => button('Hide').click());
  await settle();
  assert.equal(saved[0][1].status, 'hidden');
  await act(async () => button('Publish').click());
  assert.equal(saved.length, 1, 'publishing asks for the rights confirmation first');
  assert.match(document.querySelector('.admin-coming-soon__list').textContent, /has the rights to publish/);
  await act(async () => button('Confirm rights & publish').click());
  await settle();
  assert.equal(saved[1][1].status, 'published');
  assert.equal(saved[1][1].rightsConfirmed, true);

  await act(async () => button('Remove').click());
  assert.equal(removed.length, 0, 'removal needs a second confirmation click');
  await act(async () => button('Confirm remove').click());
  await settle();
  assert.deepEqual(removed, [[migrated.id, 3]]);
});

test('promoting an upcoming episode of a streaming show needs the rights confirmation and keeps December 5 in Eastern time', async () => {
  const saved = [];
  api.getComingSoonPromotions = async () => ({ items: [], targets });
  api.saveComingSoonPromotion = async (id, body) => { saved.push([id, body]); return { ...body, id: 'promo-new', version: 1 }; };
  await mount();
  await setValue(labelled('What to promote'), 'series:MjIxMg');
  assert.match(document.querySelector('.admin-coming-soon').textContent, /Streaming now: S1 E1, S1 E2/);
  await setValue(labelled('Season'), '1');
  await setValue(labelled('Episode'), '4');
  await act(async () => labelled('Premiere date TBD').click());
  await setValue(document.querySelector('.admin-coming-soon input[type="date"]'), '2026-12-05');
  await submit();
  await settle();
  assert.equal(saved.length, 0);
  assert.match(document.querySelector('[role="alert"]').textContent, /Confirm the promotional rights/);
  await act(async () => labelled('I confirm PROtv has the rights').click());
  await submit();
  await settle();
  assert.deepEqual(saved[0][1].target, { kind: 'series', id: 'MjIxMg', seasonNumber: '1', episodeNumber: '4' });
  assert.equal(saved[0][1].premiereAt, '2026-12-05T17:00:00.000Z');
  assert.equal(saved[0][1].rightsConfirmed, true);
});

test('a new upcoming title (not in the catalog) is created with a title and content type, then gets an uploaded trailer', async () => {
  let items = [];
  const saved = [];
  const calls = [];
  let status = 'processing';
  api.getComingSoonPromotions = async () => ({ items, targets });
  api.saveComingSoonPromotion = async (id, body) => {
    saved.push([id, body]);
    items = [{ ...body, id: 'promo-doc', version: 1, state: 'hidden', preview: { title: body.title, contentType: 'Documentary', href: null }, trailerStatus: { status: 'empty' } }];
    return items[0];
  };
  api.createComingSoonTrailerUpload = async (id) => { calls.push(['upload-url', id]); return { uploadUrl: 'https://storage.mux.test/up1' }; };
  api.uploadFileToMux = async (url, file, onProgress) => { calls.push(['put', url, file.name]); onProgress(100); };
  api.getComingSoonTrailerStatus = async (id) => {
    calls.push(['status', id]);
    const result = { status, source: 'upload', error: '' };
    if (status === 'processing') status = 'ready';
    else items = items.map((item) => ({ ...item, trailerStatus: { status: 'ready', source: 'upload', error: '' } }));
    return result;
  };
  api.selectComingSoonTrailer = async (id, titleId) => { calls.push(['select', id, titleId]); };
  api.removeComingSoonTrailer = async (id) => { calls.push(['remove-trailer', id]); items = items.map((item) => ({ ...item, trailerStatus: { status: 'empty' } })); };
  await mount();
  assert.match(document.querySelector('.admin-coming-soon__trailer').textContent, /Save the promotion first/);
  await act(async () => document.querySelector('input[value="upcoming"]').click());
  assert.equal(labelled('What to promote'), undefined, 'no catalog picker for a new title');
  await setValue(labelled('Title'), 'Brand New Doc');
  await setValue(labelled('Content type'), 'documentary');
  await setValue(labelled('Status'), 'hidden');
  await submit();
  await settle();
  assert.deepEqual(saved[0][1].target, { kind: 'upcoming', contentType: 'documentary' });
  assert.equal(saved[0][1].title, 'Brand New Doc');
  assert.equal(saved[0][1].status, 'hidden', 'hidden needs no rights confirmation');
  assert.match(document.querySelector('.admin-coming-soon__list').textContent, /New Documentary \(not in the catalog yet\)/);

  // The editor stays on the saved promotion, so the trailer can be added right away.
  const video = new window.File(['x'], 'trailer.mp4', { type: 'video/mp4' });
  await pickFile(labelled('Upload a trailer video'), video);
  await settle();
  await settle();
  assert.deepEqual(calls.slice(0, 3), [['upload-url', 'promo-doc'], ['put', 'https://storage.mux.test/up1', 'trailer.mp4'], ['status', 'promo-doc']]);
  assert.match(document.querySelector('[role="status"]').textContent, /Trailer uploaded and ready/);
  assert.ok(button('Preview Trailer'));

  await setValue(labelled('Or use an existing catalog trailer'), 'coming_soon_dread');
  await act(async () => button('Use This Trailer').click());
  await settle();
  assert.deepEqual(calls.at(-1), ['select', 'promo-doc', 'coming_soon_dread']);
  await act(async () => button('Remove Trailer').click());
  await settle();
  assert.deepEqual(calls.at(-1), ['remove-trailer', 'promo-doc']);
});

test('linking a new-title promotion to its catalog record keeps the same promotion and says so', async () => {
  const upcoming = {
    id: 'promo-doc', version: 2, status: 'hidden', state: 'hidden', sortOrder: 0, target: { kind: 'upcoming', contentType: 'film' },
    title: 'Upcoming Film', description: 'Copy', artworkUrl: 'https://watchprotv.com/api/posters/title-a.jpg', premiereAt: null,
    preview: { title: 'Upcoming Film', contentType: 'Film', href: null }, trailerStatus: { status: 'ready', source: 'upload' },
  };
  const saved = [];
  api.getComingSoonPromotions = async () => ({ items: [upcoming], targets });
  api.saveComingSoonPromotion = async (id, body) => { saved.push([id, body]); return { ...upcoming, ...body, version: 3 }; };
  await mount();
  await act(async () => button('Edit').click());
  assert.equal(labelled('Title').value, 'Upcoming Film');
  await act(async () => document.querySelector('input[value="catalog"]').click());
  assert.match(document.querySelector('.admin-coming-soon form').textContent, /keeps this promotion's artwork, description and trailer/);
  await setValue(labelled('What to promote'), 'title:coming_soon_film');
  await submit();
  await settle();
  assert.equal(saved[0][0], 'promo-doc', 'the same promotion is updated, not replaced');
  assert.deepEqual(saved[0][1].target, { kind: 'title', id: 'coming_soon_film' });
  assert.equal(saved[0][1].artworkUrl, upcoming.artworkUrl);
  assert.equal(saved[0][1].description, 'Copy');
  assert.match(document.querySelector('[role="status"]').textContent, /Linked to the catalog title/);
});

test('a promotional card with a trailer shows Watch Trailer and plays only the signed promotional trailer', async () => {
  const requested = [];
  api.getComingSoonPromotionTrailer = async (id) => { requested.push(id); return { id, muxPlaybackId: 'promo-trailer', playbackToken: 'signed' }; };
  const item = {
    id: 'promo-promo-doc', promotionId: 'promo-doc', kind: 'upcoming', href: null, title: 'Brand New Doc', contentType: 'Documentary',
    artwork: '/x.jpg', comingSoon: true, trailerAvailable: true, promotion: true,
  };
  await mount(React.createElement(ComingSoonCard, { item }));
  const card = document.querySelector('.ptv-card');
  assert.equal(card.querySelector('a') === null, true, 'a title not in the catalog has no page link');
  assert.equal(card.querySelector('.ptv-card__meta').textContent, 'Documentary • Premiere date TBD • Trailer');
  assert.equal(card.querySelector('a[href^="/player/"], .ptv-card__action--play') === null, true);
  await act(async () => button('▶ Watch Trailer').click());
  await settle();
  assert.deepEqual(requested, ['promo-doc']);
  assert.equal(document.querySelector('dialog.trailer-player-overlay').hasAttribute('open'), true);

  await mount(React.createElement(ComingSoonCard, { item: { ...item, trailerAvailable: false } }));
  assert.equal(button('▶ Watch Trailer'), undefined, 'no button without a trailer');
  await mount(React.createElement(ComingSoonCard, { item: { id: 'series-x', kind: 'series', href: '/series/x', title: 'Dread Head', comingSoon: true, trailerAvailable: true } }));
  assert.equal(button('▶ Watch Trailer'), undefined, 'automatic cards keep their existing behaviour');
  assert.equal(document.querySelector('.ptv-card a').getAttribute('href'), '/series/x');
});

test('a load failure is shown and the form stays disabled', async () => {
  api.getComingSoonPromotions = async () => { throw new Error('Admin access is required.'); };
  await mount();
  assert.match(document.querySelector('[role="alert"]').textContent, /Admin access is required/);
  assert.equal(document.querySelector('.admin-coming-soon fieldset').disabled, true);
});

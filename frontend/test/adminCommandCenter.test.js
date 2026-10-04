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
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/admin',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollTo = () => {};
window.confirm = () => false;

let createRoot;
let vite;
let Admin;
let AuthContext;
let api;
let root;
let requests;
const auth = {
  user: { uid: 'local-admin', displayName: 'Local Admin' },
  loading: false, adminLoading: false, isAdmin: true,
  openAuthModal() {}, signOut() {},
};

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({
    configFile: false, envFile: false, root: frontendRoot,
    plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
  });
  ({ default: Admin } = await vite.ssrLoadModule('/src/pages/Admin.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

async function mount(value = auth) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  requests = [];
  const status = { status: 'idle', addedMovies: [], skippedMovies: [], failures: [], warnings: [] };
  for (const name of [
    'getAdminBotStatus', 'getPublicDomainWebStatus', 'getDistributorIngestionStatus',
  ]) {
    api[name] = async () => { requests.push(name); return status; };
  }
  for (const name of ['getAdminAllVideos', 'getAdminBotAudit', 'getDistributorIngestionAudit']) {
    api[name] = async () => { requests.push(name); return []; };
  }
  api.getPublicDomainCandidates = async () => ({
    items: [], status: { pending: 0, processing: 0, failed: 0 }, discovery: status,
  });
  api.getAdminSafetyReports = async () => ({ items: [], nextCursor: null });
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(
    React.createElement(MemoryRouter, { initialEntries: ['/admin'] },
      React.createElement(AuthContext.Provider, { value }, React.createElement(Admin)))
  ));
  await settle();
}

async function click(label, scope = document) {
  const button = [...scope.querySelectorAll('button')].find((item) => item.textContent.trim() === label);
  assert.ok(button, `Missing button: ${label}`);
  await act(async () => button.click());
  await settle();
}

async function navigate(label) {
  await click(label, document.querySelector('[aria-label="Admin tools"]'));
}

function workspace() {
  return document.querySelector('.admin-command__workspace');
}

test('signed-out and non-admin states use the current shell without exposing tools', async () => {
  let signIns = 0;
  await mount({ ...auth, user: null, isAdmin: false, openAuthModal: () => { signIns += 1; } });
  assert.match(document.body.textContent, /Sign in to manage content/);
  assert.ok(document.querySelector('.ptv-header'));
  assert.ok(document.querySelector('.ptv-footer a[href="/report"]'));
  assert.equal(document.querySelector('.ptv-header a[href="/report"]'), null);
  assert.equal(document.querySelector('[aria-label="Admin tools"]'), null);
  await click('Sign In', document.querySelector('main'));
  assert.equal(signIns, 1);
  await mount({ ...auth, isAdmin: false });
  assert.match(document.body.textContent, /Owner access required/);
  assert.match(document.body.textContent, /Activate Owner Access/);
  assert.equal(document.querySelector('[aria-label="Admin tools"]'), null);
  assert.deepEqual(requests, []);
});

test('authenticated Admin starts at Overview without loading tools or fabricating metrics', async () => {
  await mount();
  assert.equal(workspace().getAttribute('aria-label'), 'Overview');
  assert.match(workspace().textContent, /Welcome to PROtv Admin/);
  assert.equal(document.querySelector('.admin-tabs'), null);
  assert.deepEqual(requests, []);
  assert.equal(document.querySelector('.ptv-header a[href="/report"]'), null);
  assert.ok(document.querySelector('.ptv-footer a[href="/report"]'));
});

test('every destination opens its existing tool, including all upload workflows', async () => {
  await mount();
  const destinations = [
    ['Upload Content', '.admin-form'],
    ['Review Content', '.admin-review-container'],
    ['Catalog & Metadata', '.catalog-editor'],
    ['Series & Seasons', '.admin-form'],
    ['Shows & Episodes', '.podcast-admin'],
    ['Public Domain Discovery', '.admin-bot-panel'],
    ['Distributor Feed', '.admin-bot-panel'],
    ['Safety Reports', '.safety-queue'],
    ['Administrator Assistant', '.admin-assistant-panel'],
  ];
  for (const [label, selector] of destinations) {
    await navigate(label);
    assert.equal(workspace().getAttribute('aria-label'), label);
    const visibleTool = [...workspace().querySelectorAll(selector)]
      .find((element) => !element.closest('[hidden]'));
    if (label === 'Series & Seasons') {
      assert.match(workspace().querySelector('form:not([hidden])').textContent, /Episode Video Files/);
    } else {
      assert.ok(visibleTool, `${label} must render its existing tool`);
    }
  }
  await navigate('Upload Content');
  await click('Paste URL', document.querySelector('[aria-label="Upload method"]'));
  assert.match(document.querySelector('form:not([hidden])').textContent, /Video File URL/);
  await click('Add Content With Rights', document.querySelector('[aria-label="Upload method"]'));
  assert.ok(document.querySelector('.admin-content-form:not([hidden])'));
  assert.equal(document.querySelector('.admin-content-form').closest('[hidden]'), null);
  await click('Upload File', document.querySelector('[aria-label="Upload method"]'));
  assert.ok(document.querySelector('label:not([hidden]) input[type="file"]'));
});

test('switching sections preserves mounted tool drafts and upload file selection', async () => {
  await mount();
  await navigate('Upload Content');
  const form = document.querySelector('form:not([hidden])');
  const input = form.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'Retained draft');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const fileInput = form.querySelector('input[type="file"]');
  await navigate('Overview');
  await navigate('Upload Content');
  assert.equal(document.querySelector('form:not([hidden])'), form);
  assert.equal(form.querySelector('input').value, 'Retained draft');
  assert.equal(form.querySelector('input[type="file"]'), fileInput);
  await click('Add Content With Rights', document.querySelector('[aria-label="Upload method"]'));
  const rightsForm = document.querySelector('.admin-content-form');
  await navigate('Administrator Assistant');
  const assistant = document.querySelector('.admin-assistant-panel');
  await navigate('Overview');
  await navigate('Upload Content');
  await click('Add Content With Rights', document.querySelector('[aria-label="Upload method"]'));
  assert.equal(document.querySelector('.admin-content-form'), rightsForm);
  await navigate('Administrator Assistant');
  assert.equal(document.querySelector('.admin-assistant-panel'), assistant);
});

test('Admin navigation pauses during an upload request and resumes after failure', async () => {
  await mount();
  await navigate('Upload Content');
  await click('Paste URL', document.querySelector('[aria-label="Upload method"]'));
  let rejectRequest;
  api.addVideoFromUrl = () => new Promise((resolve, reject) => { rejectRequest = reject; });
  const form = document.querySelector('form:not([hidden])');
  const fileInput = form.querySelector('input[type="file"]');
  const source = [...form.querySelectorAll('input')].find((input) => input.placeholder.includes('cdn.example'));
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(source, 'https://example.test/video.mp4');
    source.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert.ok(form.isConnected, 'Upload state must not unmount a retained draft');
  assert.equal(form.hidden, true);
  assert.equal(form.querySelector('input[type="file"]'), fileInput);
  assert.ok([...document.querySelectorAll('[aria-label="Admin tools"] button')].every((button) => button.disabled));
  assert.match(workspace().textContent, /section switching is paused/);
  await act(async () => rejectRequest(new Error('Local fixture upload failure')));
  assert.equal(document.querySelector('form:not([hidden])'), form);
  assert.ok([...document.querySelectorAll('[aria-label="Admin tools"] button')].every((button) => !button.disabled));
});

test('owner portal still invokes SSO only after explicit navigation and errors are visible', async () => {
  await mount();
  let calls = 0;
  api.createOwnerCreatorSso = async () => { calls += 1; throw new Error('Local SSO fixture'); };
  await click('Owner Portal ↗', document.querySelector('[aria-label="Admin tools"]'));
  assert.equal(calls, 1);
  assert.match(document.querySelector('[role="alert"]').textContent, /Local SSO fixture/);
});

test('mobile menu is a separate section picker and leaving Admin warns after tools are visited', async () => {
  await mount();
  const toggle = document.querySelector('.admin-command__menu-toggle');
  await act(async () => toggle.click());
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  await navigate('Upload Content');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  let confirmations = 0;
  window.confirm = () => { confirmations += 1; return false; };
  await act(async () => document.querySelector('.ptv-header a[href="/movies"]').click());
  assert.equal(confirmations, 1);
  assert.equal(workspace().getAttribute('aria-label'), 'Upload Content');
});

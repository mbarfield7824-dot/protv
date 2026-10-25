import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/delete-account',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let createRoot;
let vite;
let AccountDeletion;
let Privacy;
let AuthContext;
let api;
let root;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({
    configFile: false,
    root: frontendRoot,
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  ({ default: AccountDeletion } = await vite.ssrLoadModule('/src/pages/AccountDeletion.jsx'));
  ({ default: Privacy } = await vite.ssrLoadModule('/src/pages/Privacy.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

async function mountPage({
  page = AccountDeletion,
  user = null,
  request = null,
  submit = async () => request,
  onSignIn = () => {},
  onSignOut = async () => {},
} = {}) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  api.getAccountDeletionRequest = async () => request;
  api.requestAccountDeletion = submit;
  root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        AuthContext.Provider,
        { value: { user, loading: false, openAuthModal: onSignIn, signOut: onSignOut } },
        React.createElement(page),
      ),
    ));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function submitForm() {
  await act(async () => {
    document.querySelector('input[type="checkbox"]').click();
  });
  await act(async () => {
    document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test('signed-out visitors get instructions, an email route and the data explanation without an app', async () => {
  let signInCount = 0;
  await mountPage({ onSignIn: () => { signInCount += 1; } });
  const text = document.body.textContent;
  assert.match(text, /every PROtv app/);
  assert.match(text, /do not need to install an app/i);
  assert.match(text, /What we delete/);
  assert.match(text, /What we keep, and why/);
  assert.match(text, /Data stored on your TV/);
  assert.equal(document.querySelector('form'), null, 'no request form before sign-in');

  const mailto = document.querySelector('a[href^="mailto:support@watchprotv.com?subject="]');
  assert.ok(mailto, 'email fallback for people who cannot sign in');
  assert.match(decodeURIComponent(mailto.getAttribute('href')), /Delete my PROtv account/);

  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Sign in to continue');
  await act(async () => button.click());
  assert.equal(signInCount, 1);
});

test('a signed-in viewer must confirm before the request is sent, then sees its status', async () => {
  let submittedToken = null;
  const user = { email: 'viewer@example.test', getIdToken: async () => 'test-id-token' };
  await mountPage({
    user,
    submit: async (token) => {
      submittedToken = token;
      return { status: 'pending_review', requestedAt: '2026-10-25T12:00:00.000Z', adminMessage: '' };
    },
  });
  assert.match(document.body.textContent, /Signed in as viewer@example\.test/);
  assert.equal(document.querySelector('button[type="submit"]').disabled, true, 'submit stays disabled until confirmed');

  await submitForm();
  assert.equal(submittedToken, 'test-id-token');
  assert.equal(document.querySelector('form'), null);
  assert.match(document.body.textContent, /Status: Received/);
  assert.match(document.body.textContent, /We will email viewer@example\.test when deletion is complete/);
});

test('an existing request shows its status and any message from PROtv', async () => {
  await mountPage({
    user: { email: 'viewer@example.test', getIdToken: async () => 'token' },
    request: {
      status: 'additional_information_required',
      requestedAt: '2026-10-25T12:00:00.000Z',
      adminMessage: 'Please confirm the creator titles.',
    },
  });
  assert.match(document.body.textContent, /Status: More information needed/);
  assert.match(document.body.textContent, /Message from PROtv: Please confirm the creator titles\./);
  assert.equal(document.querySelector('form'), null);
});

test('a stale sign-in is asked to sign in again', async () => {
  let signedOut = 0;
  let modalOpened = 0;
  await mountPage({
    user: { email: 'viewer@example.test', getIdToken: async () => 'token' },
    onSignOut: async () => { signedOut += 1; },
    onSignIn: () => { modalOpened += 1; },
    submit: async () => {
      throw Object.assign(new Error('Sign in again to verify your identity before requesting account deletion.'), { status: 403 });
    },
  });
  await submitForm();
  assert.match(document.querySelector('[role="alert"]').textContent, /Sign in again to verify your identity/);
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Sign in again');
  await act(async () => button.click());
  assert.equal(signedOut, 1);
  assert.equal(modalOpened, 1);
});

test('the privacy page links to the deletion page and keeps the support email route', async () => {
  await mountPage({ page: Privacy });
  assert.ok(document.querySelector('a[href="/delete-account"]'));
  assert.ok(document.querySelector('a[href="mailto:support@watchprotv.com"]'));
  assert.match(document.body.textContent, /watch progress/);
  assert.match(document.body.textContent, /PROtv on your TV/);
});

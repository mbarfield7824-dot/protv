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
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

async function mountPage({
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
        React.createElement(AccountDeletion),
      ),
    ));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test('deletion page offers sign-in without accepting unauthenticated requests', async () => {
  let signInCount = 0;
  await mountPage({ onSignIn: () => { signInCount += 1; } });
  assert.match(document.body.textContent, /does not immediately delete your account or data/i);
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Sign In');
  assert.ok(button);
  await act(async () => button.click());
  assert.equal(signInCount, 1);
});

test('authenticated viewer confirms and records a request without claiming deletion completed', async () => {
  let submittedToken = null;
  const user = { getIdToken: async () => 'test-id-token' };
  await mountPage({
    user,
    submit: async (token) => {
      submittedToken = token;
      return { status: 'received', requestedAt: '2026-10-24T12:00:00.000Z' };
    },
  });
  const checkbox = document.querySelector('input[type="checkbox"]');
  await act(async () => {
    checkbox.click();
  });
  const form = document.querySelector('form');
  await act(async () => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(submittedToken, 'test-id-token');
  assert.match(document.body.textContent, /Request received/);
  assert.match(document.body.textContent, /Your account remains active/);
  assert.match(document.body.textContent, /does not immediately delete/i);
  assert.equal(document.querySelector('form'), null);
});

test('recent-authentication rejection asks the viewer to sign in again', async () => {
  let signedOut = 0;
  let modalOpened = 0;
  const user = { getIdToken: async () => 'test-id-token' };
  await mountPage({
    user,
    onSignOut: async () => { signedOut += 1; },
    onSignIn: () => { modalOpened += 1; },
    submit: async () => {
      throw Object.assign(new Error('Sign in again to verify your identity.'), { status: 403 });
    },
  });
  const checkbox = document.querySelector('input[type="checkbox"]');
  await act(async () => {
    checkbox.click();
    document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const button = [...document.querySelectorAll('button')]
    .find((item) => item.textContent.includes('Sign in again'));
  assert.ok(button);
  await act(async () => button.click());
  assert.equal(signedOut, 1);
  assert.equal(modalOpened, 1);
});

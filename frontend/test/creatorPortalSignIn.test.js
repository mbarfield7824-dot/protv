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
  url: 'http://localhost/creators/portal',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let createRoot;
let vite;
let CreatorPortalSignIn;
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
  ({ default: CreatorPortalSignIn } = await vite.ssrLoadModule('/src/pages/CreatorPortalSignIn.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
  api.getLinearChannelStatus = async () => ({ public: false });
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function viewer({ emailVerified = true } = {}) {
  return { uid: 'viewer-1', email: 'creator@example.invalid', emailVerified, reload: async () => {}, getIdToken: async () => 'id-token' };
}

async function render(auth) {
  const value = { loading: false, isAdmin: false, favorites: [], progress: {}, openAuthModal: () => {}, ...auth };
  await act(async () => {
    root.render(React.createElement(
      MemoryRouter,
      null,
      React.createElement(AuthContext.Provider, { value }, React.createElement(CreatorPortalSignIn)),
    ));
    await settle();
  });
}

async function mount(auth, { sso = async () => ({ url: 'http://localhost/creators/portal#sso=signed-handoff' }) } = {}) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  dom.window.location.hash = '';
  const calls = { sso: 0 };
  api.createCreatorSso = async () => { calls.sso += 1; return sso(); };
  root = createRoot(document.getElementById('root'));
  await render(auth);
  return calls;
}

test('a signed-out creator is asked to sign in once and nothing is sent to the portal', async () => {
  let prompts = 0;
  const auth = { user: null, openAuthModal: () => { prompts += 1; } };
  const calls = await mount(auth);
  await render(auth);
  assert.equal(prompts, 1);
  assert.equal(calls.sso, 0);
  assert.match(document.body.textContent, /Sign in with your PROtv account/);
});

test('waits while PROtv sign-in is still loading', async () => {
  let prompts = 0;
  const calls = await mount({ user: null, loading: true, openAuthModal: () => { prompts += 1; } });
  assert.equal(prompts, 0);
  assert.equal(calls.sso, 0);
});

test('a verified creator continues to the portal through the signed handoff exactly once', async () => {
  const auth = { user: viewer() };
  const calls = await mount(auth);
  await render(auth);
  assert.equal(calls.sso, 1);
  assert.equal(dom.window.location.hash, '#sso=signed-handoff');
});

test('a creator who signs in on this page then continues automatically', async () => {
  const calls = await mount({ user: null });
  assert.equal(calls.sso, 0);
  await render({ user: viewer() });
  assert.equal(calls.sso, 1);
});

test('an unverified email stops at the verification prompt without a handoff', async () => {
  const calls = await mount({ user: viewer({ emailVerified: false }) });
  assert.equal(calls.sso, 0);
  assert.match(document.body.textContent, /Verify your email to continue/);
});

test('a failed handoff shows the error and is not retried on its own', async () => {
  const auth = { user: viewer() };
  const calls = await mount(auth, { sso: async () => { throw new Error('Creator Portal SSO is not configured.'); } });
  await render(auth);
  assert.equal(calls.sso, 1);
  assert.match(document.querySelector('[role="alert"]').textContent, /not configured/);
});

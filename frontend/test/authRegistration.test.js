import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

// Regression tests for the sign-up box that stayed on "Please wait..." (reported 2026-11-18 by a prospective partner).
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 Instagram 350.0.0.0.0 (iPhone15,2; iOS 18_0; en_US)';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/creators' });
let userAgent = SAFARI;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => ({ userAgent }) });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let createRoot;
let vite;
let AuthModal;
let AuthContext;
let flow;
let root;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({
    configFile: false, root: frontendRoot, plugins: [reactPlugin()],
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
  });
  ({ default: AuthModal } = await vite.ssrLoadModule('/src/components/AuthModal.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  flow = await vite.ssrLoadModule('/src/context/authFlow.js');
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const never = () => new Promise(() => {});

// Polls instead of sleeping a fixed time, so the tests hold up when the whole suite runs in parallel.
async function waitFor(condition, limitMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > limitMs) throw new Error('Condition not met in time');
    await act(async () => wait(10));
  }
}

async function mount(auth, props = {}) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  const value = {
    authConfigured: true, register: never, signIn: never, signInWithGoogle: never, resetPassword: never, ...auth,
  };
  await act(async () => {
    root.render(React.createElement(AuthContext.Provider, { value },
      React.createElement(AuthModal, { open: true, onClose: () => {}, timeoutMs: 80, slowMs: 30, ...props })));
  });
}

const buttonNamed = (name) => [...document.querySelectorAll('button')].find((item) => item.textContent === name);

function setInput(label, text) {
  const input = [...document.querySelectorAll('label')].find((item) => item.textContent.startsWith(label)).querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, text);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

async function fillAndSubmitRegistration() {
  await act(async () => buttonNamed('Create an account').click());
  await act(async () => {
    setInput('Name', 'New Partner');
    setInput('Email', 'partner@example.invalid');
    setInput('Password', 'correct horse battery');
  });
  await act(async () => {
    document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
}

test('a registration that never answers stops waiting, explains why and lets the visitor try again', async () => {
  let calls = 0;
  await mount({ register: () => { calls += 1; return never(); } });
  await fillAndSubmitRegistration();
  assert.equal(calls, 1);
  assert.equal(document.querySelector('.auth-primary').textContent, 'Please wait...');
  await waitFor(() => /Still working/.test(document.body.textContent));
  await waitFor(() => document.querySelector('.auth-primary').textContent === 'Create account');
  assert.equal(document.querySelector('.auth-primary').disabled, false);
  assert.match(document.querySelector('[role="alert"]').textContent, /could not reach the PROtv sign-in service/);
  assert.doesNotMatch(document.body.textContent, /Still working/);
});

test('Firebase errors are shown in plain English, never as raw Firebase text', async () => {
  await mount({ register: async () => { throw Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), { code: 'auth/network-request-failed' }); } });
  await fillAndSubmitRegistration();
  const alert = document.querySelector('[role="alert"]').textContent;
  assert.match(alert, /Check your internet connection and try again/);
  assert.doesNotMatch(alert, /Firebase:/);
  for (const code of ['auth/too-many-requests', 'auth/web-storage-unsupported', 'auth/weak-password', 'auth/invalid-email', 'auth/unauthorized-domain', 'auth/some-new-code']) {
    const message = flow.authErrorMessage(Object.assign(new Error(`Firebase: Error (${code}).`), { code }));
    assert.doesNotMatch(message, /Firebase:/, code);
    assert.ok(message.length > 20, code);
  }
  assert.match(flow.authErrorMessage({ code: 'auth/some-new-code' }), /Error code: auth\/some-new-code/);
});

test('an email that already has an account offers a one-tap switch to sign in', async () => {
  await mount({ register: async () => { throw Object.assign(new Error('x'), { code: 'auth/email-already-in-use' }); } });
  await fillAndSubmitRegistration();
  assert.match(document.querySelector('[role="alert"]').textContent, /already exists/);
  await act(async () => buttonNamed('Sign in').click());
  assert.equal(document.getElementById('auth-title').textContent, 'Welcome back');
});

test('a late answer after the time limit does not overwrite the current state', async () => {
  let finish;
  await mount({ register: () => new Promise((_, reject) => { finish = reject; }) });
  await fillAndSubmitRegistration();
  await waitFor(() => document.querySelector('[role="alert"]'));
  const shown = document.querySelector('[role="alert"]').textContent;
  await act(async () => { finish(Object.assign(new Error('late'), { code: 'auth/too-many-requests' })); await wait(0); });
  assert.equal(document.querySelector('[role="alert"]').textContent, shown);
});

test('the Google window is not cut off by the time limit while the visitor is still signing in', async () => {
  let resolveGoogle;
  await mount({ signInWithGoogle: () => new Promise((resolve) => { resolveGoogle = resolve; }) });
  await act(async () => buttonNamed('Continue with Google').click());
  await act(async () => wait(150));
  assert.equal(document.querySelector('[role="alert"]'), null);
  await act(async () => { resolveGoogle(); await wait(0); });
  assert.equal(document.querySelector('[role="alert"]'), null);
});

test('in-app browsers get guidance that Google sign-in is blocked there and how to continue', async () => {
  userAgent = INSTAGRAM;
  try {
    await mount({});
    assert.match(document.body.textContent, /Google sign-in does not work inside Instagram/);
    assert.equal(flow.isInAppBrowser(INSTAGRAM), true);
    assert.equal(flow.isInAppBrowser(SAFARI), false);
    assert.match(flow.authErrorMessage({ code: 'auth/network-request-failed' }, { inAppBrowser: true }), /open watchprotv\.com in Safari or Chrome/);
  } finally {
    userAgent = SAFARI;
  }
  await mount({});
  assert.doesNotMatch(document.body.textContent, /Google sign-in does not work inside/);
});

test('registration copy tells filmmakers the same account opens the Creator Portal', async () => {
  await mount({});
  await act(async () => buttonNamed('Create an account').click());
  assert.match(document.querySelector('.auth-description').textContent, /submit their work through the Creator Portal/);
});

test('once the account exists, a slow or failed name or verification step does not fail the registration', async () => {
  const followUpErrors = [];
  const started = Date.now();
  const { user, followUps } = await flow.createAccount({
    create: async () => ({ uid: 'new-user' }),
    setDisplayName: async () => { throw Object.assign(new Error('x'), { code: 'auth/network-request-failed' }); },
    sendVerification: never,
    onFollowUpError: (step) => followUpErrors.push(step),
    followUpTimeoutMs: 20,
  });
  assert.equal(user.uid, 'new-user');
  assert.ok(Date.now() - started < 50, 'registration resolves as soon as the account exists');
  assert.deepEqual(await followUps, { verificationSent: false }, 'a verification email that never answers is given up on');
  assert.deepEqual(followUpErrors, ['display name', 'verification email']);

  await assert.rejects(
    flow.createAccount({ create: async () => { throw Object.assign(new Error('x'), { code: 'auth/email-already-in-use' }); }, setDisplayName: never, sendVerification: never }),
    { code: 'auth/email-already-in-use' },
  );
});

test('withTimeout rejects with the PROtv timeout code and clears its timer on success', async () => {
  await assert.rejects(flow.withTimeout(never(), 10), { code: flow.AUTH_TIMEOUT_CODE });
  assert.equal(await flow.withTimeout(Promise.resolve('ok'), 10), 'ok');
});

test('verification email requests time out with a clear message and respect the resend cooldown', async () => {
  const user = { uid: 'flow-timeout', email: 'creator@example.invalid' };
  const slow = await flow.requestVerificationEmail(user, { send: () => new Promise(() => {}), timeoutMs: 20 });
  assert.equal(slow.ok, false);
  assert.match(slow.message, /cannot confirm the email was sent/);
  assert.equal(flow.verificationCooldownLeft('flow-timeout'), 0, 'a timed-out request does not block a retry');

  let sends = 0;
  const ok = await flow.requestVerificationEmail(user, { send: async () => { sends += 1; } });
  assert.equal(ok.ok, true);
  const again = await flow.requestVerificationEmail(user, { send: async () => { sends += 1; } });
  assert.equal(again.ok, false);
  assert.equal(sends, 1);
  assert.match(again.message, /less than a minute ago/);
  const later = await flow.requestVerificationEmail(user, { send: async () => { sends += 1; }, now: () => Date.now() + flow.VERIFY_RESEND_COOLDOWN_MS + 1 });
  assert.equal(later.ok, true);
  assert.equal(sends, 2);
});

test('the verification link returns the creator to the PROtv portal sign-in on an authorized domain', () => {
  assert.equal(new URL(flow.verificationActionSettings.url).host, 'watchprotv.com');
  assert.equal(new URL(flow.verificationActionSettings.url).pathname, '/creators/portal');
});

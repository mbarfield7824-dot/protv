import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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

let createRoot;
let vite;
let AdminAccountDeletionRequests;
let api;
let root;

function fixture(overrides = {}) {
  return {
    id: 'viewer-1',
    uid: 'viewer-1',
    channel: 'web',
    status: 'approved_for_processing',
    requestedAt: '2026-10-25T12:00:00.000Z',
    account: { exists: true, email: 'viewer@example.test', providers: ['password'], accountType: null },
    fulfillment: { authAccount: 'present', profile: 'deleted', deviceSessions: 2, complete: false, remaining: ['x'] },
    safetyReportsFromAccountEmail: 0,
    decisionHistory: [],
    ...overrides,
  };
}

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
  ({ default: AdminAccountDeletionRequests } = await vite.ssrLoadModule('/src/components/AdminAccountDeletionRequests.jsx'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

async function mount(request = fixture()) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  api.getAccountDeletionRequests = async () => ({ requests: [request], pendingCount: 0 });
  root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(AdminAccountDeletionRequests));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
}

function setValue(element, value) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

test('the queue shows the runbook with live check results and no destructive action', async () => {
  await mount();
  const text = document.body.textContent;
  assert.match(text, /ACCOUNT DELETION REQUESTS/);
  assert.match(text, /viewer@example\.test/);
  assert.match(text, /\(2 remaining\)/);
  assert.equal(document.querySelectorAll('.account-deletion-admin__check--done').length, 1, 'only the profile step is done');
  assert.equal(document.querySelectorAll('.account-deletion-admin__check--open').length, 2);
  assert.equal(
    [...document.querySelectorAll('button')].some((button) => /^delete/i.test(button.textContent.trim())),
    false,
    'the page never deletes data itself',
  );
  assert.ok(document.querySelector('option[value="completed"]'), 'completion can be requested once approved');
});

test('marking completed warns while steps are open and sends the decision for server verification', async () => {
  await mount();
  let saved = null;
  api.reviewAccountDeletionRequest = async (id, body) => {
    saved = { id, body };
    return { id, status: body.status };
  };
  const form = document.querySelector('.account-deletion-admin__detail form');
  await act(async () => setValue(form.querySelector('select'), 'completed'));
  assert.match(form.textContent, /server will refuse this until the open runbook steps/);
  await act(async () => setValue(form.querySelector('textarea'), 'Runbook done.'));
  await act(async () => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.deepEqual(saved, { id: 'viewer-1', body: { status: 'completed', reason: 'Runbook done.' } });
  assert.match(document.body.textContent, /Recorded: Completed\./);
});

test('server refusals are shown to the admin', async () => {
  await mount();
  api.reviewAccountDeletionRequest = async () => {
    throw new Error('Finish the deletion runbook before marking this completed: the Firebase sign-in account still exists.');
  };
  const form = document.querySelector('.account-deletion-admin__detail form');
  await act(async () => setValue(form.querySelector('select'), 'completed'));
  await act(async () => setValue(form.querySelector('textarea'), 'done'));
  await act(async () => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.match(document.querySelector('[role="alert"]').textContent, /Firebase sign-in account still exists/);
});

test('admins can record an email request by account UID', async () => {
  await mount(fixture({ status: 'completed', fulfillment: { complete: true, verifiedAt: '2026-10-25T13:00:00.000Z', verifiedBy: 'admin-1' } }));
  assert.match(document.body.textContent, /This request is completed/);
  let recorded = null;
  api.recordEmailAccountDeletionRequest = async (body) => {
    recorded = body;
    return { id: 'viewer-9', status: 'pending_review', channel: 'email' };
  };
  const form = document.querySelector('.account-deletion-admin__email-form form');
  await act(async () => setValue(form.querySelector('input'), 'viewer-9'));
  await act(async () => setValue(form.querySelector('textarea'), 'Sent from the account address.'));
  await act(async () => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.deepEqual(recorded, { uid: 'viewer-9', reason: 'Sent from the account address.' });
});

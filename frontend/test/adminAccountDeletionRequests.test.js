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
const fixture = {
  id: 'viewer-1',
  uid: 'viewer-1',
  status: 'pending_review',
  requestedAt: '2026-10-24T18:00:00.000Z',
  account: {
    email: 'creator@example.test',
    emailVerified: true,
    accountType: { status: 'verification_required' },
  },
  creatorLinkage: { status: 'verification_required', projects: [], publishedContent: [], contracts: [] },
  decisionHistory: [],
  fulfillmentPlan: {
    personalData: { details: 'Review personal profile data.' },
    retainedRecords: { details: 'Legal review required.' },
    creatorDependencies: { details: 'Creator links require verification.' },
    sessionsAndTokens: { details: 'Token revocation review required.' },
    externalSystems: { details: 'Provider verification required.' },
    statutoryDeadline: { details: 'Owner/legal review required.' },
    completionEvidence: { details: 'Not started.' },
  },
};

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

async function mount() {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  api.getAccountDeletionRequests = async () => ({ requests: [{ ...fixture }], pendingCount: 1 });
  root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(AdminAccountDeletionRequests));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
}

test('admin review shows verified-source uncertainty and exposes no destructive action', async () => {
  await mount();
  assert.match(document.body.textContent, /ACCOUNT DELETION REQUESTS/);
  assert.match(document.body.textContent, /Pending review: 1/);
  assert.match(document.body.textContent, /creator@example\.test/);
  assert.match(document.body.textContent, /Creator verification required/);
  assert.match(document.body.textContent, /Do not infer creator status from email or activity/);
  assert.match(document.body.textContent, /Approval does not trigger deletion/);
  assert.equal([...document.querySelectorAll('button')].some((button) => /delete account/i.test(button.textContent)), false);
  assert.equal(document.querySelector('option[value="completed"]'), null);
});

test('admin can record a documented review decision without initiating fulfillment', async () => {
  await mount();
  let saved = null;
  api.reviewAccountDeletionRequest = async (id, body) => {
    saved = { id, body };
    return { ...fixture, status: body.status };
  };
  api.getAccountDeletionRequests = async () => ({
    requests: [{ ...fixture, status: 'approved_for_processing', reason: 'Manual review completed.' }],
    pendingCount: 0,
  });

  const select = document.querySelector('select');
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value')
      .set.call(select, 'approved_for_processing');
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  const reason = document.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(reason), 'value')
      .set.call(reason, 'Manual review completed.');
    reason.dispatchEvent(new window.Event('input', { bubbles: true }));
    reason.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await act(async () => {
    document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(saved, {
    id: 'viewer-1',
    body: { status: 'approved_for_processing', reason: 'Manual review completed.' },
  });
  assert.match(document.body.textContent, /No account or content was deleted/);
});

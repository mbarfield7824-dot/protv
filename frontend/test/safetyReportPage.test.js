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
  url: 'http://localhost/report',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let createRoot;
let vite;
let SafetyReport;
let AuthContext;
let SafetyReportRequestError;
let api;
let root;

const authValue = {
  user: null,
  isAdmin: false,
  openAuthModal() {},
  signOut() {},
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
  ({ default: SafetyReport } = await vite.ssrLoadModule('/src/pages/SafetyReport.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ SafetyReportRequestError } = await vite.ssrLoadModule('/src/data/safetyReports.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

async function mountReport(submitSafetyReport) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  api.submitSafetyReport = submitSafetyReport;
  root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: authValue },
          React.createElement(SafetyReport)
        )
      )
    );
  });
}

function setField(id, value) {
  const field = document.getElementById(id);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set;
  setter.call(field, value);
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  field.dispatchEvent(new window.Event('change', { bubbles: true }));
}

async function prepareGeneralReport() {
  await act(async () => {
    setField('reason', 'other');
    setField('description', 'A local safety concern for interaction testing.');
  });
}

async function submitForm() {
  await act(async () => {
    document.querySelector('form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
  });
}

test('rendered report fields are disabled pending submission and ignored edits do not change controlled values', async () => {
  let finishRequest;
  let submissions = 0;
  await mountReport(() => {
    submissions += 1;
    return new Promise((resolve, reject) => { finishRequest = { resolve, reject }; });
  });
  await prepareGeneralReport();
  await submitForm();

  const form = document.querySelector('form');
  const fieldset = form.querySelector('.safety-report__fields');
  assert.equal(form.getAttribute('aria-busy'), 'true');
  assert.equal(fieldset.disabled, true);
  assert.ok([...form.querySelectorAll('input, select, textarea')].every((field) => field.matches(':disabled')));
  assert.equal(form.querySelector('button[type="submit"]').disabled, true);

  await act(async () => {
    setField('description', 'Attempted edit while submission is pending.');
  });
  await submitForm();
  assert.equal(submissions, 1);

  await act(async () => {
    finishRequest.reject(new Error('offline'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(document.getElementById('description').value, 'A local safety concern for interaction testing.');
  assert.match(document.querySelector('[role="alert"]').textContent, /may have been received/);
});

test('rendered field edits clear only the validation errors they resolve', async () => {
  await mountReport(async () => {
    throw new Error('This invalid form must not submit.');
  });
  await act(async () => setField('type', 'content'));
  await submitForm();

  assert.match(document.querySelector('[role="alert"]').textContent, /at least one target reference/);
  assert.match(document.querySelector('[role="alert"]').textContent, /Choose a reason/);
  await act(async () => setField('targetId', 'fixture-content-id'));

  assert.doesNotMatch(document.querySelector('[role="alert"]').textContent, /at least one target reference/);
  assert.match(document.querySelector('[role="alert"]').textContent, /Choose a reason/);
});

test('uncertain-delivery warning survives editing after a failed submission', async () => {
  await mountReport(async () => {
    throw new Error('connection interrupted');
  });
  await prepareGeneralReport();
  await submitForm();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

  const warning = document.querySelector('[role="alert"]').textContent;
  assert.match(warning, /may have been received/);
  await act(async () => setField('description', 'Additional detail after the interruption.'));
  assert.equal(document.getElementById('description').value, 'Additional detail after the interruption.');
  assert.equal(document.querySelector('[role="alert"]').textContent, warning);
});

test('Retry-After warning survives field edits and clears only when a valid resubmission begins', async () => {
  let submissions = 0;
  await mountReport(async () => {
    submissions += 1;
    if (submissions === 1) {
      throw new SafetyReportRequestError('Too many reports.', {
        status: 429,
        retryAfterSeconds: 17,
      });
    }
    return { id: '6f1e8d34-6c85-4fb4-8ae9-2d98197731cd', status: 'received' };
  });
  await prepareGeneralReport();
  await submitForm();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

  const warning = document.querySelector('[role="alert"]').textContent;
  assert.match(warning, /wait about 17 seconds/);
  await act(async () => setField('description', 'Edited after rate limit.'));
  assert.equal(document.querySelector('[role="alert"]').textContent, warning);

  await submitForm();
  assert.equal(submissions, 2);
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.match(document.querySelector('[role="status"]').textContent, /Report received/);
});

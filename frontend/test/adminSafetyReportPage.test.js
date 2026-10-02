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

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const fixture = (id = ids[0], changes = {}) => ({
  id, type: 'content', reason: 'csam_child_sexual_exploitation', status: 'pending',
  description: 'Local fixture description', targetId: 'local-target', targetUrl: '',
  targetDescription: '', contactEmail: 'fixture@example.test', reviewNotes: 'Original notes',
  reviewedBy: null, reviewedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z', ...changes,
});
const authorized = { user: { uid: 'local-admin' }, loading: false, isAdmin: true, adminLoading: false };
let createRoot;
let vite;
let Component;
let AuthContext;
let api;
let RequestError;
let root;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({
    configFile: false, envFile: false, root: frontendRoot,
    plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
  });
  ({ default: Component } = await vite.ssrLoadModule('/src/components/AdminSafetyReports.jsx'));
  ({ AuthContext } = await vite.ssrLoadModule('/src/context/authState.js'));
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
  ({ AdminReportRequestError: RequestError } = await vite.ssrLoadModule('/src/admin/safetyReports.js'));
});

after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const text = () => document.body.textContent;
const detail = () => document.querySelector('[aria-label="Safety report detail"]');
const rows = () => [...document.querySelectorAll('.safety-queue__list > li')];
const button = (label) => [...document.querySelectorAll('button')].find((item) => item.textContent === label);
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
}
async function click(label) {
  const element = button(label);
  assert.ok(element, `Missing button: ${label}`);
  await act(async () => element.click());
  await settle();
}
function setField(id, value) {
  const field = document.getElementById(id);
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, value);
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  field.dispatchEvent(new window.Event('change', { bubbles: true }));
}
async function edit(status = 'resolved', notes = 'New review notes') {
  await act(async () => {
    setField('safety-review-status', status);
    setField('safety-review-notes', notes);
  });
}
async function submit() {
  await act(async () => {
    document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}
async function renderAuth(value) {
  await act(async () => root.render(React.createElement(AuthContext.Provider, { value }, React.createElement(Component))));
  await settle();
}
async function mount(overrides = {}, auth = authorized) {
  await act(async () => root?.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  api.getAdminSafetyReports = async () => ({ items: [fixture()], nextCursor: null });
  api.getAdminSafetyReport = async (id) => fixture(id);
  api.reviewAdminSafetyReport = async (id, payload) => ({ id, status: payload.status });
  Object.assign(api, overrides);
  root = createRoot(document.getElementById('root'));
  await renderAuth(auth);
}
async function select(id = ids[0]) { await click(`Review report ${id}`); }

test('rendered queue preserves page order, deduplicates, retries the failed cursor, and waits for API completion', async () => {
  const calls = [];
  let fail = true;
  await mount({
    getAdminSafetyReports: async ({ cursor }) => {
      calls.push(cursor);
      if (!cursor) return { items: [fixture(ids[1]), fixture()], nextCursor: ids[0] };
      if (fail) { fail = false; throw new Error('Local pagination failure'); }
      return { items: [fixture(), fixture(ids[2]), fixture(ids[2])], nextCursor: null };
    },
  });
  assert.deepEqual(rows().map((row) => row.querySelector('button').textContent), [
    `Review report ${ids[1]}`, `Review report ${ids[0]}`,
  ]);
  assert.doesNotMatch(text(), /All reports.*loaded/);
  await click('Load More');
  assert.match(text(), /Local pagination failure/);
  assert.equal(rows().length, 2);
  await click('Retry queue');
  assert.deepEqual(calls, [undefined, ids[0], ids[0]]);
  assert.equal(rows().length, 3);
  assert.match(text(), /All reports in this queue have been loaded/);
  assert.equal(button('Load More'), undefined);
});

test('rendered loading, empty, error and refresh states do not imply stale completion', async () => {
  const pending = deferred();
  await mount({ getAdminSafetyReports: () => pending.promise });
  assert.match(text(), /Loading safety reports/);
  assert.doesNotMatch(text(), /No safety reports|All reports.*loaded/);
  await act(async () => pending.resolve({ items: [], nextCursor: null }));
  assert.match(text(), /No safety reports/);
  api.getAdminSafetyReports = async () => ({ items: [fixture()], nextCursor: null });
  await click('Refresh queue');
  assert.match(text(), /All reports.*loaded/);
  api.getAdminSafetyReports = async () => { throw new Error('Local refresh failure'); };
  await click('Refresh queue');
  assert.match(text(), /Local refresh failure/);
  assert.doesNotMatch(text(), /All reports.*loaded/);
});

test('rendered repeated cursor is rejected without appending rows or claiming completion', async () => {
  let calls = 0;
  await mount({ getAdminSafetyReports: async () => {
    calls += 1;
    return calls === 1 ? { items: [fixture()], nextCursor: ids[0] }
      : { items: [fixture(ids[1])], nextCursor: ids[0] };
  } });
  await click('Load More');
  assert.match(text(), /cursor did not advance/);
  assert.equal(rows().length, 1);
  assert.doesNotMatch(text(), /All reports.*loaded/);
});

test('submitted text is plain text, CSAM is identified, and unsafe URLs never become links or media', async () => {
  const submitted = '<img src="https://example.test/media" onerror="alert(1)">';
  const report = fixture(ids[0], {
    description: submitted, targetDescription: '<script>unsafe()</script>',
    reviewNotes: '<b>Saved text</b>', targetUrl: 'javascript:alert(1)',
  });
  await mount({
    getAdminSafetyReports: async () => ({ items: [report], nextCursor: null }),
    getAdminSafetyReport: async () => report,
  });
  await select();
  assert.match(text(), /CSAM \/ child sexual exploitation/);
  assert.ok(detail().textContent.includes(submitted));
  assert.ok(detail().textContent.includes('<script>unsafe()</script>'));
  assert.ok(detail().textContent.includes('<b>Saved text</b>'));
  assert.equal(document.querySelector('img, script, iframe, video, audio, embed, object'), null);
  assert.equal(document.querySelector('a'), null);
  for (const url of ['https://user:password@example.test/', 'https://example.test/reference']) {
    api.getAdminSafetyReport = async () => ({ ...report, targetUrl: url });
    await click('Refresh report');
    const link = detail().querySelector('a');
    if (url.includes('password')) assert.equal(link, null);
    else {
      assert.equal(link.href, url);
      assert.equal(link.target, '_blank');
      assert.equal(link.rel, 'noopener noreferrer');
      assert.equal(link.getAttribute('referrerpolicy'), 'no-referrer');
    }
  }
});

test('required notes validate without sending and saved data remains distinct from unsaved drafts', async () => {
  let calls = 0;
  await mount({ reviewAdminSafetyReport: async () => { calls += 1; throw new Error('Local rejected save'); } });
  await select();
  assert.equal(button('Save review').disabled, true);
  await edit('resolved', '   ');
  assert.match(detail().textContent, /Saved statuspending/);
  assert.match(detail().textContent, /Original notes/);
  assert.match(detail().textContent, /Unsaved review edits/);
  await submit();
  assert.equal(calls, 0);
  assert.match(detail().textContent, /nonblank/);
  await edit();
  await submit();
  assert.equal(calls, 1);
  assert.match(detail().textContent, /Local rejected save/);
  assert.equal(document.getElementById('safety-review-notes').value, 'New review notes');
  assert.match(detail().textContent, /Saved statuspending/);
});

test('pending save disables fields and affected controls, ignores edits and prevents duplicate submissions', async () => {
  const pending = deferred();
  let calls = 0;
  await mount({ reviewAdminSafetyReport: () => { calls += 1; return pending.promise; } });
  await select();
  await edit();
  await submit();
  assert.ok([...detail().querySelectorAll('select, textarea')].every((field) => field.matches(':disabled')));
  assert.equal(button('Refresh queue').disabled, true);
  assert.equal(button('Refresh report').disabled, true);
  assert.equal(button(`Review report ${ids[0]}`).disabled, true);
  await act(async () => setField('safety-review-notes', 'Attempted pending edit'));
  await submit();
  assert.equal(calls, 1);
  await act(async () => pending.reject(new Error('Local save rejection')));
  assert.equal(document.getElementById('safety-review-notes').value, 'New review notes');
});

test('accepted save followed by failed refresh confirms save, reconciles status, and blocks repeat until full refresh', async () => {
  let calls = 0;
  let saved = fixture();
  await mount({ reviewAdminSafetyReport: async (id, payload) => {
    calls += 1;
    saved = { ...saved, ...payload };
    return { id, status: payload.status };
  } });
  await select();
  await edit();
  api.getAdminSafetyReport = async () => { throw new Error('Local detail refresh failure'); };
  api.getAdminSafetyReports = async () => { throw new Error('Local queue refresh failure'); };
  await submit();
  assert.match(detail().textContent, /Review saved, but.*could not refresh/);
  assert.match(detail().textContent, /do not repeat the save/);
  assert.match(detail().textContent, /Saved statusresolved/);
  assert.match(rows()[0].textContent, /Status: resolved/);
  assert.equal(document.getElementById('safety-review-notes').value, 'New review notes');
  assert.equal(button('Save review').disabled, true);
  await submit();
  assert.equal(calls, 1);

  api.getAdminSafetyReport = async () => saved;
  await click('Refresh report');
  assert.equal(button('Save review').disabled, true);
  assert.ok(document.getElementById('safety-review-notes').matches(':disabled'));
  const queue = deferred();
  api.getAdminSafetyReports = () => queue.promise;
  await click('Refresh report');
  assert.equal(button('Refresh report').disabled, true);
  assert.ok(document.getElementById('safety-review-status').matches(':disabled'));
  await act(async () => queue.resolve({ items: [saved], nextCursor: null }));
  assert.match(detail().textContent, /Report and queue refreshed/);
  assert.equal(document.getElementById('safety-review-notes').matches(':disabled'), false);
  assert.equal(button('Save review').disabled, true);
  assert.equal(calls, 1);
});

test('confirmed save refreshes review metadata and queue without changing submission ordering', async () => {
  const reviewed = fixture(ids[0], {
    status: 'resolved', reviewNotes: 'New review notes', reviewedBy: 'fixture-admin',
    reviewedAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
  });
  await mount({
    getAdminSafetyReports: async () => ({ items: [fixture(ids[1]), fixture()], nextCursor: null }),
    reviewAdminSafetyReport: async (id, payload) => {
      api.getAdminSafetyReport = async () => reviewed;
      api.getAdminSafetyReports = async () => ({ items: [fixture(ids[1]), reviewed], nextCursor: null });
      return { id, status: payload.status };
    },
  });
  await select();
  await edit();
  await submit();
  assert.match(detail().textContent, /Review saved and displayed data refreshed/);
  assert.match(detail().textContent, /fixture-admin/);
  assert.match(rows()[1].textContent, /Status: resolved/);
  assert.match(rows()[0].textContent, new RegExp(ids[1]));
  assert.match(detail().textContent, /No unsaved review edits/);
});

for (const failedSource of ['detail', 'queue']) {
  test(`accepted save with only ${failedSource} refresh failing still blocks a second save`, async () => {
    let calls = 0;
    const saved = fixture(ids[0], { status: 'resolved', reviewNotes: 'New review notes' });
    await mount({ reviewAdminSafetyReport: async (id, payload) => {
      calls += 1;
      api.getAdminSafetyReport = async () => {
        if (failedSource === 'detail') throw new Error('Local detail failure');
        return saved;
      };
      api.getAdminSafetyReports = async () => {
        if (failedSource === 'queue') throw new Error('Local queue failure');
        return { items: [saved], nextCursor: null };
      };
      return { id, status: payload.status };
    } });
    await select();
    await edit();
    await submit();
    assert.match(detail().textContent, /Review saved, but.*could not refresh/);
    assert.equal(button('Save review').disabled, true);
    assert.ok(document.getElementById('safety-review-notes').matches(':disabled'));
    await submit();
    assert.equal(calls, 1);
  });
}

test('uncertain mutation retains notes and warning, blocks repeats, and preserves draft after verified refresh', async () => {
  let calls = 0;
  await mount({ reviewAdminSafetyReport: async () => {
    calls += 1;
    throw new RequestError('Save may have been received. Refresh before deciding to save again.', { uncertain: true });
  } });
  await select();
  await edit();
  await submit();
  assert.match(detail().textContent, /may have been received/);
  assert.doesNotMatch(detail().textContent, /Review saved/);
  await act(async () => setField('safety-review-notes', 'Blocked draft edit'));
  await submit();
  assert.equal(calls, 1);
  api.getAdminSafetyReport = async () => { throw new Error('Local refresh failure'); };
  await click('Refresh report');
  assert.match(detail().textContent, /Save delivery is uncertain/);
  assert.match(detail().textContent, /this refresh did not send another save/);
  assert.equal(button('Save review').disabled, true);
  api.getAdminSafetyReport = async () => fixture();
  await click('Refresh report');
  assert.equal(document.getElementById('safety-review-notes').value, 'New review notes');
  assert.match(detail().textContent, /Saved statuspending/);
  assert.match(detail().textContent, /Compare saved data with your retained draft/);
  assert.equal(button('Save review').disabled, false);
});

test('late pagination response cannot overwrite queue reconciliation after accepted save', async () => {
  const stale = deferred();
  let staleSignal;
  const saved = fixture(ids[0], { status: 'resolved', reviewNotes: 'New review notes' });
  await mount({
    getAdminSafetyReports: async ({ cursor, signal }) => {
      if (cursor) { staleSignal = signal; return stale.promise; }
      return { items: [fixture()], nextCursor: ids[0] };
    },
    reviewAdminSafetyReport: async (id, payload) => {
      api.getAdminSafetyReport = async () => saved;
      api.getAdminSafetyReports = async () => ({ items: [saved], nextCursor: null });
      return { id, status: payload.status };
    },
  });
  await select();
  await click('Load More');
  await edit();
  await submit();
  assert.equal(staleSignal.aborted, true);
  await act(async () => stale.resolve({ items: [fixture(ids[1])], nextCursor: ids[1] }));
  assert.equal(rows().length, 1);
  assert.match(rows()[0].textContent, /Status: resolved/);
  assert.equal(button('Load More'), undefined);
  assert.match(text(), /All reports.*loaded/);
});

test('selection changes ignore late detail responses and abort the abandoned request', async () => {
  const abandoned = deferred();
  let signal;
  await mount({
    getAdminSafetyReports: async () => ({ items: [fixture(), fixture(ids[1])], nextCursor: null }),
    getAdminSafetyReport: async (id, options) => {
      if (id === ids[0]) { signal = options.signal; return abandoned.promise; }
      return fixture(id, { description: 'Current selected detail' });
    },
  });
  await select();
  await select(ids[1]);
  assert.equal(signal.aborted, true);
  await act(async () => abandoned.resolve(fixture(ids[0], { description: 'Stale detail must not display' })));
  assert.match(detail().textContent, /Current selected detail/);
  assert.doesNotMatch(detail().textContent, /Stale detail must not display/);
});

test('authorization gates prevent requests and logout ignores late private responses', async () => {
  let calls = 0;
  const pending = deferred();
  let signal;
  await mount({ getAdminSafetyReports: async (options) => {
    calls += 1;
    signal = options.signal;
    return pending.promise;
  } }, { ...authorized, isAdmin: false });
  assert.equal(calls, 0);
  assert.match(text(), /authorized Admin sign-in is required/);
  await renderAuth(authorized);
  assert.equal(calls, 1);
  await renderAuth({ ...authorized, user: null, isAdmin: false });
  assert.equal(signal.aborted, true);
  await act(async () => pending.resolve({ items: [fixture()], nextCursor: null }));
  assert.equal(rows().length, 0);
  assert.doesNotMatch(text(), /Local fixture/);
});

test('logout during save aborts request and ignores late save and reconciliation results', async () => {
  const pending = deferred();
  let signal;
  let reads = 0;
  await mount({
    getAdminSafetyReport: async (id) => { reads += 1; return fixture(id); },
    reviewAdminSafetyReport: async (id, payload, options) => {
      signal = options.signal;
      return pending.promise;
    },
  });
  await select();
  await edit();
  await submit();
  await renderAuth({ ...authorized, user: null, isAdmin: false });
  assert.equal(signal.aborted, true);
  await act(async () => pending.resolve({ id: ids[0], status: 'resolved' }));
  assert.equal(reads, 1);
  assert.equal(detail(), null);
  assert.doesNotMatch(text(), /Review saved|New review notes/);
});

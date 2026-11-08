import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let vite, Report, model, createRoot;

const counters = (values = {}) => ({ requests: 0, served: 0, measurable: 0, viewable: 0, clicks: 0, starts: 0, firstQuartiles: 0, midpoints: 0, thirdQuartiles: 0, completes: 0, skips: 0, errors: 0, interrupted: 0, ...values });
const REPORT = {
  from: '2026-10-10', to: '2026-11-08',
  configuration: { measurement: true, nativeBanner: true, videoPreroll: false },
  placements: [{ channel: 'display', placement: 'native_banner', platform: 'web',
    valid: counters({ requests: 40, served: 30, measurable: 25, viewable: 20, clicks: 3, errors: 10 }),
    test: counters({ served: 2 }), invalid: counters({ served: 5 }) }],
  titles: [],
  legacy: { playerImpressions: 12, providerImpressions: 900 },
};

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: false, envFile: false, root: frontendRoot, plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ default: Report } = await vite.ssrLoadModule('/src/components/AdMeasurementReport.jsx'));
  model = await vite.ssrLoadModule('/src/ads/adReport.js');
});
after(async () => { await vite?.close(); dom.window.close(); });

test('the dashboard separates served, viewable, clicks and completions, and marks what is not measured', async () => {
  const ranges = [];
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Report, { load: async (range) => { ranges.push(range); return REPORT; } })));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  const text = document.body.textContent;
  const row = (label) => [...document.querySelectorAll('tbody tr')].find((item) => item.querySelector('th').textContent === label);
  assert.match(row('Served impressions').textContent, /30/);
  assert.match(row('Viewable impressions').textContent, /20\s*80\.0%/, 'viewable rate is out of measured impressions');
  assert.match(row('Clicks').textContent, /3\s*10\.0%/);
  assert.match(row('Video completions').querySelectorAll('td')[0].textContent, /Not applicable/, 'display ads have no completions');
  assert.match(document.querySelector('thead').textContent, /Video pre-roll.*not active/);
  assert.match(text, /Roku and Fire TV.*Not measured/);
  assert.match(text, /5 invalid .* 2 test or Administrator/);
  assert.match(text, /12 player impressions and 900 provider-reported impressions .* not reclassified/);
  assert.match(text, /never asked to confirm/);
  assert.equal(ranges.length, 1, 'loads once, not on every render');
  await act(async () => [...document.querySelectorAll('button')].find((item) => item.textContent === '7 days').click());
  assert.equal(ranges.length, 2);
  await act(async () => root.unmount());
});

test('the sponsor CSV carries valid traffic only, with definitions and unsupported measurements named', () => {
  const csv = model.reportCsv(REPORT);
  assert.match(csv, /"Sponsored · Adsterra Native Banner","Website","40","30","25","20","3","n\/a"/);
  assert.match(csv, /Roku and Fire TV apps","TV","not measured: no ad placements"/);
  assert.match(csv, /Not MRC-accredited/);
  assert.match(csv, /"Viewable impressions","At least 50% of pixels/);
  assert.equal(csv.includes('"5"'), false, 'invalid traffic is not in the sponsor figures');
});

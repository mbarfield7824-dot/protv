import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { validateDraft, restoreDraft, composeBrief } from '../public/sponsors/model.mjs';

const portalRoot = new URL('../public/sponsors/', import.meta.url);
const html = readFileSync(new URL('index.html', portalRoot), 'utf8');
const storageKey = 'protv-partnership-draft-v1';
const draft = { contactName: 'Greensboro Sponsor', business: 'Gate City Arts', email: 'sponsor@example.com', partnership: 'spotlight', budget: 'discuss', idea: 'A local filmmaker showcase.' };
let dom;
let sequence = 0;
let downloads;
const timers = [];
const originalTimeout = globalThis.setTimeout;

beforeEach(async () => {
  dom = new JSDOM(html, { url: 'https://watchprotv.com/sponsors' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.FormData = dom.window.FormData;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => dom.window.localStorage });
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.setTimeout = (...args) => { const timer = originalTimeout(...args); timers.push(timer); return timer; };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  downloads = [];
  dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push({ filename: this.download, href: this.href }); };
  await import(new URL(`../public/sponsors/app.mjs?test=${++sequence}`, import.meta.url));
});

afterEach(() => {
  timers.splice(0).forEach(clearTimeout);
  globalThis.setTimeout = originalTimeout;
  dom.window.close();
});

function fill(values = draft) {
  for (const [name, value] of Object.entries(values)) document.getElementById(name).value = value;
}
function submit() {
  const event = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  document.getElementById('interest-form').dispatchEvent(event);
  assert.equal(event.defaultPrevented, true, 'The form must never navigate or submit externally');
}

test('sponsors can compare options and select a direction from the comparison', () => {
  assert.equal(document.querySelectorAll('[data-package]').length, 3);
  document.getElementById('compare-button').click();
  assert.equal(document.getElementById('compare-dialog').open, true);
  assert.equal(document.querySelectorAll('#compare-table thead th').length, 4);
  document.querySelector('#compare-table [data-choose="community"]').click();
  assert.equal(document.getElementById('partnership').value, 'community');
  assert.equal(document.getElementById('compare-dialog').open, false);
});

test('comparison remains disabled until two options are selected', () => {
  const checkboxes = [...document.querySelectorAll('.compare-check input')];
  for (const checkbox of checkboxes.slice(1)) {
    checkbox.checked = false;
    checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
  assert.equal(document.getElementById('compare-button').disabled, true);
  checkboxes[1].click();
  assert.equal(document.getElementById('compare-button').disabled, false);
});

test('priorities and keyboard activation tabs update the visible proposal', () => {
  document.querySelector('[data-goal="signature"]').click();
  assert.equal(document.querySelector('.package-card.recommended').dataset.package, 'presenting');
  const tab = document.getElementById('tab-premiere');
  tab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(document.getElementById('tab-creator').getAttribute('aria-selected'), 'true');
  assert.match(document.getElementById('mock-title').textContent, /CREATORS/);
  assert.equal(document.getElementById('activation-panel').getAttribute('aria-labelledby'), 'tab-creator');
});

test('invalid details stay on the form and produce accessible field errors', () => {
  submit();
  for (const id of ['contactName', 'business', 'email', 'partnership']) {
    assert.equal(document.getElementById(id).getAttribute('aria-invalid'), 'true');
    assert.ok(document.getElementById(`${id}-error`).textContent);
  }
  assert.equal(localStorage.getItem(storageKey), null);
});

test('saving, editing, downloading, and clearing stay on this device', async () => {
  fill(); submit();
  assert.equal(document.getElementById('saved-panel').hidden, false);
  assert.deepEqual(restoreDraft(localStorage.getItem(storageKey)), draft);
  assert.match(document.getElementById('save-message').textContent, /not been sent/);
  document.getElementById('download-brief').click();
  assert.equal(downloads[0].filename, 'PROtv-Partnership-Brief.txt');
  assert.ok(downloads[0].href.startsWith('blob:'));
  document.getElementById('edit-draft').click();
  assert.equal(document.getElementById('interest-form').hidden, false);
  document.getElementById('business').value = 'Updated Sponsor'; submit();
  assert.equal(restoreDraft(localStorage.getItem(storageKey)).business, 'Updated Sponsor');
  document.getElementById('clear-draft').click();
  assert.equal(localStorage.getItem(storageKey), null);
  assert.equal(document.getElementById('business').value, '');
  assert.match(document.getElementById('form-status').textContent, /cleared/);
});

test('saved user content is rendered as text rather than HTML', () => {
  fill({ ...draft, business: '<img src=x onerror=alert(1)>' }); submit();
  const summary = document.getElementById('saved-summary');
  assert.equal(summary.querySelector('img'), null);
  assert.match(summary.textContent, /<img src=x onerror=alert\(1\)>/);
});

test('unavailable storage still allows a brief download and explains the limitation', () => {
  dom.window.Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  fill(); submit();
  assert.equal(document.getElementById('saved-panel').hidden, false);
  assert.match(document.getElementById('save-message').textContent, /storage is unavailable/);
  document.getElementById('download-brief').click();
  assert.equal(downloads.length, 1);
});

test('mobile menu opens and closes when a destination is chosen', () => {
  document.getElementById('menu-toggle').click();
  assert.equal(document.getElementById('mobile-nav').hidden, false);
  document.querySelector('#mobile-nav a').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(document.getElementById('mobile-nav').hidden, true);
  assert.equal(document.getElementById('menu-toggle').getAttribute('aria-expanded'), 'false');
});

test('direct sponsor routes resolve before the existing application fallback', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const fallback = config.rewrites.findIndex(rule => rule.destination === '/index.html');
  for (const route of ['/sponsors', '/sponsors/']) {
    const index = config.rewrites.findIndex(rule => rule.source === route);
    assert.ok(index >= 0 && index < fallback);
    assert.equal(config.rewrites[index].destination, '/sponsors/index.html');
  }
  for (const filename of ['app.mjs', 'model.mjs', 'styles.css', 'assets/mark.svg', 'assets/filmmaking.svg']) {
    assert.ok(existsSync(new URL(filename, portalRoot)));
  }
  assert.equal(document.querySelector('.site-header .brand').getAttribute('href'), '/');
  assert.equal(document.querySelector('script[type=module]').getAttribute('src'), '/sponsors/app.mjs');
  assert.equal(document.querySelector('link[rel=canonical]').href, 'https://watchprotv.com/sponsors');
});

test('the isolated page forbids external data submission and keeps responsive rules', () => {
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  assert.ok(csp.includes("connect-src 'none'"));
  assert.ok(csp.includes("form-action 'none'"));
  assert.equal(document.querySelector('form').getAttribute('action'), null);
  assert.ok(!html.includes('Private preview'));
  const script = readFileSync(new URL('app.mjs', portalRoot), 'utf8');
  assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(script));
  const css = readFileSync(new URL('styles.css', portalRoot), 'utf8');
  for (const rule of ['@media(max-width:380px)', '@media(max-width:700px)', '@media(prefers-reduced-motion:reduce)', '.table-scroll{overflow-x:auto']) assert.ok(css.includes(rule));
});

test('draft model rejects corrupt storage and downloaded briefs identify the draft clearly', () => {
  for (const value of [null, 'broken', '{}', '{"version":2}']) assert.equal(restoreDraft(value), null);
  assert.ok(validateDraft({ ...draft, email: 'not an email' }).email);
  const brief = composeBrief(draft);
  assert.match(brief, /Gate City Arts/);
  assert.match(brief, /not sent to PROtv/);
  assert.match(brief, /No audience size or performance is guaranteed/);
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/admin', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const realSetTimeout = setTimeout;

let createRoot, vite, designer, helpers, api, root;
before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ configFile: false, envFile: false, root: frontendRoot, plugins: [reactPlugin()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  designer = await vite.ssrLoadModule('/src/admin/CommercialDesigner.jsx');
  helpers = await vite.ssrLoadModule('/src/admin/commercialDesign.js');
  ({ api } = await vite.ssrLoadModule('/src/api.js'));
});
after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom.window.close();
});
const settle = (ms = 30) => act(async () => { await new Promise((resolve) => realSetTimeout(resolve, ms)); });
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
const setValue = async (element, value) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
  setter.call(element, value);
  element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const click = (element) => act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
async function mount(element) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(element));
  await settle();
}

test('preview maths match the render worker: fades in steps, motion eases in, shots by time', () => {
  const layer = { start: 1, end: 3, fade: 0.5, elements: [] };
  assert.equal(helpers.layerStateAt(layer, 0.99), null);
  assert.ok(helpers.layerStateAt(layer, 1.01).opacity < 1);
  assert.equal(helpers.layerStateAt(layer, 2).opacity, 1);
  assert.equal(helpers.layerStateAt(layer, 3), null);
  const moving = helpers.layerStateAt({ ...layer, motion: { dx: 0, dy: 40 } }, 1.05);
  assert.ok(moving.dy > 20 && moving.dy < 40);
  assert.equal(helpers.layerStateAt({ ...layer, motion: { dx: 0, dy: 40 } }, 2).dy, 0);
  const plan = { shots: [{ kind: 'card', durationSeconds: 5, colors: ['#000000', '#111111'] }, { kind: 'footage', durationSeconds: 2, playbackId: 'abc', startSeconds: 100 }], layers: [layer] };
  const frame = helpers.frameAt(plan, 5.5);
  assert.equal(frame.shot.kind, 'footage');
  assert.equal(Math.round(frame.offset * 10) / 10, 0.5);
  assert.equal(helpers.totalSeconds([{ kind: 'card', durationSeconds: 5 }, { kind: 'footage', clips: [{ durationSeconds: 2.3 }, { durationSeconds: 2.4 }] }]), 9.7);
  assert.deepEqual(helpers.moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.equal(helpers.clipFor({ id: 'x', title: 'Three Thirty', scope: 'title', excerptUntil: 100 }).label, 'Three Thirty');
  assert.equal(helpers.clipFor({ id: 'y', title: 'CAESAR', scope: 'title-and-protv', excerptUntil: 100 }).label, '');
  assert.equal(helpers.textFillStyle({ fill: 'custom', color: '#ff0000' }).color, '#ff0000');
  assert.match(helpers.textFillStyle({ fill: 'gold' }).backgroundImage, /linear-gradient/);
});

const commercial = {
  id: 'cm_1', title: 'Happy Thanksgiving from PROtv', durationSeconds: 15, templateName: 'Thanksgiving',
  theme: { name: 'Harvest', background: ['#2a0e06', '#6e2d0f'], headline: '#f6d28b', hero: '#fff3dc', sub: '#f6d28b', accent: '#e0762f', glow: null },
  branding: { bug: true, bugPosition: 'top-right', bugScale: 1 }, music: { kind: 'generated', mood: 'warm', bpm: 92, level: 1 },
  storyboard: [
    { kind: 'card', durationSeconds: 5, purpose: 'Greeting', text: { hero: 'HAPPY THANKSGIVING' }, style: { animation: 'slow-fade' } },
    { kind: 'footage', durationSeconds: 7, purpose: 'Togetherness', text: { hero: 'GOOD FOOD.' }, style: {}, clips: [{ videoId: 'v1', sourceTitle: 'CAESAR', startSeconds: 900, durationSeconds: 3.5, label: '' }, { videoId: 'v2', sourceTitle: 'Three Thirty', startSeconds: 1266, durationSeconds: 3.5, label: 'Three Thirty' }] },
    { kind: 'cta', durationSeconds: 3, purpose: 'Call to action', text: { headline: 'WATCH FREE AT', hero: 'WATCHPROTV.COM' }, style: { logo: 'above' } },
  ],
};
const footage = [{ id: 'v1', title: 'CAESAR', scope: 'title-and-protv', excerptUntil: 1500, muxPlaybackId: 'pbcaesar' }, { id: 'v2', title: 'Three Thirty', scope: 'title', excerptUntil: 3000, muxPlaybackId: 'pbthirty' }];
const plan = { format: 'widescreen', shots: [{ kind: 'card', durationSeconds: 5, colors: ['#2a0e06', '#6e2d0f'] }, { kind: 'footage', durationSeconds: 10, playbackId: 'pbcaesar', startSeconds: 900 }], layers: [{ start: 0, end: 5, fade: 0.6, elements: [{ type: 'text', text: 'HAPPY THANKSGIVING', x: 96, y: 400, width: 1728, size: 140, fill: 'custom', color: '#fff3dc', align: 'centre' }] }] };

test('the styled editor edits wording, style, clips and music, previews the plan and saves one revision', async () => {
  const calls = [];
  api.adminMarketing = async (pathName, options = {}) => {
    calls.push({ pathName, options });
    if (pathName === 'design') return { animations: [{ id: 'fade', label: 'Quick fade' }, { id: 'rise', label: 'Fade and rise' }], bugPositions: ['top-right', 'top-left'], moods: ['warm', 'cinematic'] };
    if (pathName === 'preview') return { plan, rightsCheck: [] };
    if (pathName.endsWith('/storyboard')) return { ...commercial, revision: 1 };
    throw new Error(`unexpected ${pathName}`);
  };
  let dirty = null;
  let saved = null;
  await mount(React.createElement(designer.StyledEditor, { commercial, footage, onSaved: (value) => { saved = value; }, onDirty: (value) => { dirty = value; } }));
  await settle(500);
  assert.ok(calls.some((item) => item.pathName === 'preview'), 'live preview requested');
  assert.ok(document.querySelector('.cd-stage').textContent.includes('HAPPY THANKSGIVING'), 'preview draws the plan text');
  const mainLines = [...document.querySelectorAll('.cd-segment label')].filter((item) => item.textContent.startsWith('Main line')).map((item) => item.querySelector('input:not([type="color"])')).filter(Boolean);
  await setValue(mainLines[0], 'HAPPY HOLIDAYS');
  assert.equal(dirty, true);
  const animation = [...document.querySelectorAll('.cd-segment label')].find((item) => item.textContent.startsWith('Animation')).querySelector('select');
  await setValue(animation, 'rise');
  const lengths = [...document.querySelectorAll('.cd-segment label')].filter((item) => item.textContent.startsWith('Length (s)')).map((item) => item.querySelector('input'));
  await setValue(lengths[1], '3');
  assert.match(document.body.textContent, /14\.5 s of 15 s/);
  assert.equal(button('Save changes').disabled, true, 'cannot save a storyboard that does not add up');
  await setValue(lengths[1], '3.5');
  const titleOnly = [...document.querySelectorAll('label')].find((item) => item.textContent.startsWith('Title on screen (required'));
  assert.ok(titleOnly, 'title-only footage is marked as requiring its title');
  await click(button('Save changes'));
  await settle();
  const put = calls.find((item) => item.pathName === 'commercials/cm_1/storyboard');
  assert.equal(put.options.method, 'PUT');
  assert.equal(put.options.body.storyboard[0].text.hero, 'HAPPY HOLIDAYS');
  assert.equal(put.options.body.storyboard[0].style.animation, 'rise');
  assert.equal(put.options.body.storyboard[1].durationSeconds, 7);
  assert.equal(put.options.body.music.mood, 'warm');
  assert.equal(saved.revision, 1);
});

test('templates: choose, create a commercial, edit, reset and delete', async () => {
  const calls = [];
  const templates = [
    { id: 'thanksgiving', name: 'Thanksgiving', builtIn: true, edited: true, description: 'Warm', theme: commercial.theme, segments: [{ kind: 'card', seconds: 30, text: { hero: 'HAPPY THANKSGIVING' }, style: {} }] },
    { id: 'tp_saved', name: 'Our look', builtIn: false, description: 'Saved', durationSeconds: 30, storyboard: commercial.storyboard, theme: commercial.theme },
  ];
  api.adminMarketing = async (pathName, options = {}) => {
    calls.push({ pathName, options });
    if (pathName === 'templates' && !options.method) return templates;
    if (pathName === 'design') return { animations: [{ id: 'fade', label: 'Quick fade' }] };
    if (pathName === 'commercials') return { id: 'cm_new' };
    return {};
  };
  let chosen = '';
  await mount(React.createElement(designer.TemplateChoice, { value: '', durationSeconds: 15, onChange: (id) => { chosen = id; } }));
  const radios = [...document.querySelectorAll('[role="radio"]')];
  assert.equal(radios.length, 2);
  assert.equal(radios[1].disabled, true, 'a saved 30 s template cannot make a 15 s commercial');
  await click(radios[0]);
  assert.equal(chosen, 'thanksgiving');

  let opened = '';
  window.confirm = () => true;
  await mount(React.createElement(designer.TemplatesManager, { onOpenCommercial: (id) => { opened = id; } }));
  await click(document.querySelectorAll('.cd-template-card')[0].querySelector('button'));
  await setValue(document.querySelector('input[aria-label="Commercial name"]'), 'Happy Thanksgiving 2027');
  await click(button('Create'));
  await settle();
  const created = calls.find((item) => item.pathName === 'commercials');
  assert.deepEqual(created.options.body, { category: 'custom', templateId: 'thanksgiving', durationSeconds: 30, title: 'Happy Thanksgiving 2027' });
  assert.equal(opened, 'cm_new');
  await click(button('Reset to original'));
  await settle();
  assert.ok(calls.some((item) => item.pathName === 'templates/thanksgiving' && item.options.method === 'DELETE'));
  await click(button('Delete'));
  await settle();
  assert.ok(calls.some((item) => item.pathName === 'templates/tp_saved' && item.options.method === 'DELETE'));
  await click([...document.querySelectorAll('button')].filter((item) => item.textContent === 'Edit')[0]);
  await settle();
  const name = [...document.querySelectorAll('label')].find((item) => item.textContent.startsWith('Name')).querySelector('input');
  await setValue(name, 'Thanksgiving (family)');
  await setValue(document.querySelector('input[aria-label="Main line"]'), 'GIVING THANKS');
  await click(button('Save template'));
  await settle();
  const put = calls.find((item) => item.pathName === 'templates/thanksgiving' && item.options.method === 'PUT');
  assert.equal(put.options.body.name, 'Thanksgiving (family)');
  assert.equal(put.options.body.segments[0].text.hero, 'GIVING THANKS');
});

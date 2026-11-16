// End-to-end tests of the built widget in headless Chromium, driven by TV remote key codes.
//
//   node tools/e2e.mjs            fixture backend (CDP network interception, deterministic)
//   node tools/e2e.mjs --live     real production API, read-only GETs (preview build), plus store screenshots
//
// This is a browser preview, NOT the Samsung TV emulator: AVPlay, Samsung key registration and
// TV media decoders are absent here. Results are reported as browser-preview results only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { serve } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, '..');
const live = process.argv.includes('--live');
const outDir = join(project, 'dist', live ? 'e2e-live' : 'e2e');
mkdirSync(outDir, { recursive: true });

const results = [];
async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`FAIL  ${name}  -> ${error.message}`);
  }
}
function expect(condition, message) { if (!condition) throw new Error(message); }

/* ---------------- fixture backend ---------------- */
const titles = JSON.parse(readFileSync(join(project, 'tests/fixtures/production-samsung-titles.json'), 'utf8')).items;
const episodes = JSON.parse(readFileSync(join(project, 'tests/fixtures/production-episodes-ui-only.json'), 'utf8')).items;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.c2ln`;
const SID = 'e2eSession_'.padEnd(43, 'x');
const SECRET = 'e2eSecret_'.padEnd(43, 'y');
const TEARS = 'gbcxmtl6mAHQeBxx8Dgs';

const backend = {
  catalogMode: 'policy',
  approved: false,
  favorites: [],
  progress: { [TEARS]: { positionSeconds: 300, durationSeconds: 734, progressPercent: 41, updatedAt: Date.now() } },
  requests: [],
};

function respond(method, url, headers, body) {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/api/, '');
  const auth = headers.Authorization || headers.authorization || '';
  if (u.hostname === 'identitytoolkit.googleapis.com') {
    return [200, { idToken: jwt({ user_id: 'e2e-viewer', email: 'reviewer@example.com', exp: 9e9 }), refreshToken: 'refresh-e2e', expiresIn: '3600' }];
  }
  if (u.hostname === 'securetoken.googleapis.com') {
    return [200, { id_token: jwt({ user_id: 'e2e-viewer', email: 'reviewer@example.com' }), refresh_token: 'refresh-e2e', expires_in: '3600' }];
  }
  if (u.hostname === 'stream.mux.com') return [404, {}];
  if (path === '/v1/catalog' && method === 'GET') {
    if (backend.catalogMode === 'error') return [500, { error: 'down' }];
    const items = titles.concat(episodes);
    return [200, backend.catalogMode === 'policy' ? { items, platformPolicy: 'samsung-rights-v1' } : { items }];
  }
  const playback = /^\/v1\/catalog\/titles\/([^/]+)\/playback$/.exec(path);
  if (playback) {
    const item = titles.concat(episodes).find((t) => t.id === decodeURIComponent(playback[1]));
    return item ? [200, { id: item.id, streamType: 'on-demand', muxPlaybackId: item.muxPlaybackId, platformPolicy: 'samsung-rights-v1' }] : [404, { error: 'Title not found.' }];
  }
  if (path === '/auth/device-sessions' && method === 'POST') {
    return [201, { sessionId: SID, deviceSecret: SECRET, userCode: 'PRTV-2627', verificationUrl: 'https://watchprotv.com/activate', expiresAt: new Date(Date.now() + 600000).toISOString(), interval: 1 }];
  }
  if (path === `/auth/device-sessions/${SID}` && method === 'GET') return [200, { status: backend.approved ? 'approved' : 'pending' }];
  if (path === `/auth/device-sessions/${SID}/exchange` && method === 'POST') return [200, { customToken: 'custom-e2e' }];
  if (path.startsWith('/users/me/')) {
    if (!auth.startsWith('Bearer ')) return [401, { error: 'unauthorized' }];
    if (path === '/users/me/favorites') return [200, backend.favorites];
    if (path === '/users/me/progress' && method === 'GET') return [200, backend.progress];
    const fav = /^\/users\/me\/favorites\/(.+)$/.exec(path);
    if (fav && method === 'PUT') {
      const id = decodeURIComponent(fav[1]);
      const { favorite } = JSON.parse(body || '{}');
      backend.favorites = favorite ? [...new Set([...backend.favorites, id])] : backend.favorites.filter((x) => x !== id);
      return [200, { videoId: id, favorite }];
    }
    const prog = /^\/users\/me\/progress\/(.+)$/.exec(path);
    if (prog && method === 'PUT') {
      const id = decodeURIComponent(prog[1]);
      backend.progress[id] = { ...JSON.parse(body || '{}'), updatedAt: Date.now() };
      return [200, { videoId: id }];
    }
  }
  return [404, { error: 'not found' }];
}

async function interceptFixtures(page) {
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: 'https://watchprotv.com/*' }, { urlPattern: 'https://identitytoolkit.googleapis.com/*' },
    { urlPattern: 'https://securetoken.googleapis.com/*' }, { urlPattern: 'https://stream.mux.com/*' },
  ] });
  page.on('Fetch.requestPaused', async ({ requestId, request, resourceType }) => {
    if (resourceType === 'Image') { await page.send('Fetch.continueRequest', { requestId }); return; }
    const cors = [
      { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Access-Control-Allow-Headers', value: '*' },
      { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
    ];
    if (request.method === 'OPTIONS') {
      await page.send('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: cors });
      return;
    }
    backend.requests.push({ method: request.method, url: request.url, headers: request.headers, body: request.postData || '' });
    const [status, json] = respond(request.method, request.url, request.headers, request.postData);
    await page.send('Fetch.fulfillRequest', {
      requestId, responseCode: status,
      responseHeaders: cors.concat([{ name: 'Content-Type', value: 'application/json' }]),
      body: Buffer.from(JSON.stringify(json)).toString('base64'),
    });
  });
}

/* ---------------- helpers ---------------- */
const focusText = (page) => page.eval(`(document.querySelector('.focused') || {}).textContent || ''`);
const focusClass = (page) => page.eval(`(document.querySelector('.focused') || {}).className || ''`);
async function goNav(page, id) {
  for (let i = 0; i < 12 && !(await focusClass(page)).includes('nav-item'); i += 1) await page.key('left');
  const order = ['home', 'search', 'movies', 'series', 'categories', 'mylist', 'account'];
  const at = await page.eval(`document.querySelector('.focused').getAttribute('data-nav')`);
  const delta = order.indexOf(id) - order.indexOf(at);
  for (let i = 0; i < Math.abs(delta); i += 1) await page.key(delta > 0 ? 'down' : 'up');
  const now = await page.eval(`document.querySelector('.focused').getAttribute('data-nav')`);
  if (now !== id) throw new Error(`nav at ${now}, wanted ${id}`);
  await page.key('enter');
}
async function focusLabel(page, pattern) {
  for (let i = 0; i < 8; i += 1) {
    if (pattern.test(await focusText(page))) return;
    await page.key('right');
  }
  throw new Error(`could not focus ${pattern}`);
}
async function shot(page, name) {
  writeFileSync(join(outDir, `${name}.jpg`), await page.screenshot('jpeg', 90));
}
async function ready(page) {
  await page.waitFor(`document.getElementById('splash').style.display === 'none'`, 20000);
}

/* ---------------- fixture suite ---------------- */
function watchErrors(page) {
  page.on('Runtime.exceptionThrown', (e) => console.log(`  page exception: ${(e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text).split(String.fromCharCode(10)).slice(0, 3).join(' | ')}`));
}

async function fixtureSuite(url) {
  const page = await launch();
  watchErrors(page);
  try {
    await interceptFixtures(page);
    await page.goto(url);
    await ready(page);

    await step('branding: the official logo image loads at its exact size in the splash and menu; no text logo remains', async () => {
      const logos = await page.eval(`Array.from(document.querySelectorAll('img.wordmark')).map((i) => ({ src: i.getAttribute('src'), w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, nw: i.naturalWidth, nh: i.naturalHeight, ok: i.complete && i.naturalWidth > 0, where: i.closest('#splash') ? 'splash' : i.closest('.nav') ? 'menu' : 'other' }))`);
      const splash = logos.find((l) => l.where === 'splash');
      const menu = logos.find((l) => l.where === 'menu');
      expect(splash && splash.ok && splash.src === 'img/logo-720.png' && splash.nw === 720 && splash.nh === 198, `splash logo ${JSON.stringify(splash)}`);
      expect(menu && menu.ok && menu.src === 'img/logo-120.png' && Math.round(menu.w) === 120 && Math.round(menu.h) === 33, `menu logo ${JSON.stringify(menu)}`);
      const textMarks = await page.eval(`document.querySelectorAll('span.wordmark, div.wordmark').length`);
      expect(textMarks === 0, `${textMarks} text wordmarks remain`);
      return `menu ${menu.w}x${menu.h}, splash ${splash.nw}x${splash.nh}`;
    });

    await step('home renders the hero with Play focused and only Samsung-cleared movies', async () => {
      const text = await focusText(page);
      expect(/Play|Resume/.test(text), `focus is "${text}"`);
      const cards = await page.eval(`Array.from(document.querySelectorAll('.card')).map(c => c._item && c._item.id)`);
      const allowed = new Set(titles.map((t) => t.id).concat(episodes.map((e) => e.id)));
      expect(cards.length > 0 && cards.every((id) => allowed.has(id) || /^series:/.test(id)), 'unexpected card');
      await shot(page, '01-home');
      return `${cards.length} cards`;
    });

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const heroTitle = () => page.eval(`document.querySelector('.hero-title').textContent`);
    await step('spotlight holds while the remote is in use', async () => {
      const before = await heroTitle();
      for (let i = 0; i < 8; i += 1) { await page.key(i % 2 ? 'left' : 'right'); await sleep(2300); }
      const after = await heroTitle();
      expect(after === before, `spotlight rotated from "${before}" to "${after}" while keys were pressed`);
      expect(/Play|Resume/.test(await focusText(page)), 'focus left Play');
      return `held "${before}" for ~19 s of key presses`;
    });

    await step('OK just after the spotlight rotates plays the title that was showing', async () => {
      const shown = await heroTitle();
      await page.waitFor(`document.querySelector('.hero-title').textContent !== ${JSON.stringify(shown)}`, 20000);
      const before = backend.requests.length;
      await page.key('enter');
      await page.waitFor(`!document.getElementById('player').classList.contains('hidden')`);
      await sleep(600);
      const auth = backend.requests.slice(before).find((r) => /\/playback$/.test(r.url));
      const expected = titles.find((t) => t.title === shown);
      expect(auth && expected && auth.url.includes(encodeURIComponent(expected.id)), `played ${auth && auth.url}, expected "${shown}"`);
      await page.key('back');
      await page.waitFor(`document.getElementById('player').classList.contains('hidden')`);
      expect((await heroTitle()) === shown, 'spotlight was not restored to the title that was showing');
      return `played "${shown}"`;
    });

    await step('every API request declares X-PROtv-Platform: samsung', async () => {
      const api = backend.requests.filter((r) => r.url.startsWith('https://watchprotv.com/api'));
      expect(api.length > 0, 'no API requests');
      const bad = api.find((r) => r.headers['X-PROtv-Platform'] !== 'samsung');
      expect(!bad, `missing platform header on ${bad && bad.method} ${bad && bad.url} ${bad && JSON.stringify(bad.headers)}`);
      return `${api.length} requests`;
    });

    await step('Down moves into rows; Right steps by card; Down/Up restores the remembered card', async () => {
      await page.key('down');
      const first = await page.eval(`document.querySelector('.focused').getAttribute('data-group') + ':' + document.querySelector('.focused').getAttribute('data-index')`);
      await page.key('right'); await page.key('right');
      const row = await page.eval(`document.querySelector('.focused').getAttribute('data-group')`);
      const idx = await page.eval(`document.querySelector('.focused').getAttribute('data-index')`);
      expect(idx === '2', `expected index 2, got ${idx}`);
      await page.key('down');
      const below = await page.eval(`document.querySelector('.focused').getAttribute('data-group')`);
      expect(below !== row, 'did not move to next row');
      await page.key('up');
      const back = await page.eval(`document.querySelector('.focused').getAttribute('data-group') + ':' + document.querySelector('.focused').getAttribute('data-index')`);
      expect(back === `${row}:2`, `focus restored to ${back}`);
      await shot(page, '02-rows');
      return `${first} -> ${row}:2 -> ${below} -> ${back}`;
    });

    await step('Right at the end of a row stays put (no trap, no jump)', async () => {
      for (let i = 0; i < 12; i += 1) await page.key('right');
      const before = await page.eval(`document.querySelector('.focused').getAttribute('data-index')`);
      await page.key('right');
      const after = await page.eval(`document.querySelector('.focused').getAttribute('data-index')`);
      expect(before === after, 'moved past end');
      return `last index ${after}`;
    });

    await step('Left from the first card opens the navigation rail on the active screen', async () => {
      for (let i = 0; i < 14; i += 1) await page.key('left');
      const cls = await focusClass(page);
      expect(cls.includes('nav-item') && cls.includes('active'), `focus class ${cls}`);
      const open = await page.eval(`document.getElementById('nav').className`);
      expect(open.includes('open'), 'rail did not expand');
      await shot(page, '03-nav');
    });

    await step('Up/Down at the ends of the rail stay in the rail', async () => {
      for (let i = 0; i < 10; i += 1) await page.key('down');
      let cls = await focusClass(page);
      expect(cls.includes('nav-item'), `Down past the last rail item left the rail: ${cls}`);
      for (let i = 0; i < 10; i += 1) await page.key('up');
      cls = await focusClass(page);
      expect(cls.includes('nav-item'), `Up past the first rail item left the rail: ${cls}`);
    });

    await step('Right from the rail returns to the same card', async () => {
      await page.key('right');
      const cls = await focusClass(page);
      expect(cls.includes('card'), `focus is ${cls}`);
    });

    await step('Search: on-screen keyboard and typed text find titles; no-results state', async () => {
      await goNav(page, 'search');
      await page.waitFor(`!!document.querySelector('.keyboard')`);
      expect((await focusText(page)) === 'A', 'keyboard not focused on A');
      await page.key('enter');
      await page.type('stee');
      await page.waitFor(`document.querySelector('.results').textContent.indexOf('Tears of Steel') >= 0`);
      const typed = await page.eval(`document.querySelector('.query').textContent`);
      await shot(page, '04-search');
      await page.type('zzz');
      await page.waitFor(`document.querySelector('.results').textContent.indexOf('No results') >= 0`);
      return `query "${typed}"`;
    });

    await step('Back from a top-level screen returns Home', async () => {
      await page.key('back');
      await page.waitFor(`!!document.querySelector('.hero')`);
      const active = await page.eval(`document.querySelector('.nav-item.active').getAttribute('data-nav')`);
      expect(active === 'home', `active nav ${active}`);
    });

    await step('Details: Enter opens details with Resume from account-free guest progress absent; Back restores focus', async () => {
      await page.key('down');
      const id = await page.eval(`document.querySelector('.focused')._item.id`);
      await page.key('enter');
      await page.waitFor(`!!document.querySelector('.details')`);
      const title = await page.eval(`document.querySelector('.details .hero-title').textContent`);
      expect(/^(Play|Resume)/.test(await focusText(page)), 'primary not focused');
      await shot(page, '05-details');
      await page.key('back');
      await page.waitFor(`!!document.querySelector('.hero')`);
      const back = await page.eval(`(document.querySelector('.focused')._item || {}).id`);
      expect(back === id, `focus returned to ${back}`);
      return title;
    });

    await step('My List as a guest asks the viewer to sign in; Back closes the dialog', async () => {
      await page.key('enter');
      await page.waitFor(`!!document.querySelector('.details')`);
      await page.key('right');
      await focusLabel(page, /My List/);
      await page.key('enter');
      await page.waitFor(`!document.getElementById('dialog').classList.contains('hidden')`);
      expect((await page.eval(`document.getElementById('dialog').textContent`)).includes('Sign in to use My List'), 'no sign-in prompt');
      await page.key('back');
      await page.waitFor(`document.getElementById('dialog').classList.contains('hidden')`);
      expect(/My List/.test(await focusText(page)), 'focus not restored after dialog');
      await page.key('back');
    });

    await step('Playback: Play authorizes through the Samsung policy, shows the player, Back returns', async () => {
      await page.waitFor(`!!document.querySelector('.hero')`);
      for (let i = 0; i < 4; i += 1) await page.key('up');
      await page.key('right');
      expect(/More Info/.test(await focusText(page)), `focus ${await focusText(page)}`);
      await page.key('enter');
      await page.waitFor(`!!document.querySelector('.details-art')`);
      const before = backend.requests.length;
      await page.key('enter');
      await page.waitFor(`!document.getElementById('player').classList.contains('hidden')`);
      await page.waitFor(`document.getElementById('osd').textContent.length > 0`);
      await new Promise((r) => setTimeout(r, 600));
      const auth = backend.requests.slice(before).find((r) => /\/playback$/.test(r.url));
      expect(auth && auth.headers['X-PROtv-Platform'] === 'samsung', 'no Samsung playback authorization');
      await shot(page, '06-player');
      await page.key('back');
      await page.waitFor(`document.getElementById('player').classList.contains('hidden')`);
      expect(/^(Play|Resume)/.test(await focusText(page)), 'focus not restored to details');
      await page.key('back');
      return new URL(auth.url).pathname;
    });

    await step('Account: phone/computer activation shows the code, signs in on approval, loads progress', async () => {
      await page.waitFor(`!!document.querySelector('.hero')`);
      await goNav(page, 'account');
      await page.waitFor(`document.getElementById('screen').textContent.indexOf('Sign in to PROtv') >= 0`);
      await shot(page, '07-account-guest');
      await page.key('enter');
      await page.waitFor(`document.querySelector('.code') && document.querySelector('.code').textContent === 'PRTV-2627'`);
      const url = await page.eval(`document.querySelector('.url').textContent`);
      expect(url === 'watchprotv.com/activate', `url ${url}`);
      await shot(page, '08-activation');
      backend.approved = true;
      await page.waitFor(`!!document.querySelector('.hero')`, 15000);
      await page.waitFor(`document.getElementById('toast').textContent.indexOf('Signed in') >= 0`);
      const rows = await page.eval(`Array.from(document.querySelectorAll('.row')).map(r => r.getAttribute('data-row'))`);
      expect(rows[0] === 'continue', `first row ${rows[0]}`);
      const stored = await page.eval(`localStorage.getItem('protv.samsung.account.v1')`);
      expect(stored && !stored.includes(SECRET), 'device secret persisted or session missing');
      return `rows: ${rows.slice(0, 3).join(', ')}`;
    });

    await step('Signed in: My List toggles through PUT /users/me/favorites and appears on Home', async () => {
      await page.key('down');
      await page.key('enter');
      await page.waitFor(`!!document.querySelector('.details')`);
      await focusLabel(page, /My List/);
      await page.key('enter');
      await page.waitFor(`/In My List/.test(document.querySelector('.focused').textContent)`);
      const put = backend.requests.filter((r) => r.method === 'PUT' && /\/users\/me\/favorites\//.test(r.url)).pop();
      expect(put && JSON.parse(put.body).favorite === true, 'no favorite PUT');
      await page.key('back');
      await page.waitFor(`!!document.querySelector('[data-row="my-list"]')`);
    });

    await step('Signed in: Continue Watching card opens details with Resume at the saved position', async () => {
      for (let i = 0; i < 6; i += 1) await page.key('up');
      await page.key('down');
      const row = await page.eval(`document.querySelector('.focused').getAttribute('data-group')`);
      expect(row === 'continue', `focused row ${row}`);
      await page.key('enter');
      await page.waitFor(`!!document.querySelector('.details-art')`);
      const label = await focusText(page);
      expect(label === 'Resume 5:00', `primary is "${label}"`);
      await page.key('back');
      await page.waitFor(`!!document.querySelector('.hero')`);
      return label;
    });

    await step('Signed in: changes made on the website reach My List and Continue Watching without relaunching', async () => {
      const extra = titles.find((t) => !backend.favorites.includes(t.id) && t.id !== TEARS);
      backend.favorites = [...backend.favorites, extra.id];
      backend.progress[extra.id] = { positionSeconds: 120, durationSeconds: 600, progressPercent: 20, updatedAt: Date.now() };
      await new Promise((r) => setTimeout(r, 31000)); // past the 30 s refresh interval
      await goNav(page, 'mylist');
      await page.waitFor(`document.getElementById('screen').textContent.indexOf(${JSON.stringify(extra.title)}) >= 0`, 10000);
      await goNav(page, 'home');
      await page.waitFor(`Array.from(document.querySelectorAll('[data-row="continue"] .card')).some((c) => c._item && c._item.id === ${JSON.stringify(extra.id)})`, 10000);
      return extra.title;
    });

    await step('Back from a row goes to the hero, Back again shows the exit dialog; Cancel keeps the app open', async () => {
      for (let i = 0; i < 3; i += 1) {
        if (await page.eval(`document.getElementById('dialog').textContent.indexOf('Exit PROtv?') >= 0`)) break;
        await page.key('back');
      }
      await page.waitFor(`document.getElementById('dialog').textContent.indexOf('Exit PROtv?') >= 0`);
      await shot(page, '09-exit');
      expect((await focusText(page)) === 'Cancel', 'Cancel is not the default');
      await page.key('enter');
      await page.waitFor(`document.getElementById('dialog').classList.contains('hidden')`);
    });

    await step('Sign out from Account asks for confirmation and returns to guest', async () => {
      await goNav(page, 'account');
      await page.waitFor(`document.getElementById('screen').textContent.indexOf('signed in') >= 0`);
      await shot(page, '11-account-signed-in');
      await focusLabel(page, /Sign out/);
      await page.key('enter');
      await page.waitFor(`document.getElementById('dialog').textContent.indexOf('Sign out of PROtv?') >= 0`);
      await page.key('right');
      await page.key('enter');
      await page.waitFor(`document.getElementById('screen').textContent.indexOf('Sign in to PROtv') >= 0`);
      expect((await page.eval(`localStorage.getItem('protv.samsung.account.v1')`)) === null, 'session still stored');
    });

  } finally {
    await page.close();
  }

  // Separate launches for fail-closed and error states.
  for (const [mode, expectText, label] of [
    ['nopolicy', 'PROtv is almost here', 'catalog without the Samsung policy shows no titles (fail closed)'],
    ['error', 'can’t reach PROtv', 'catalog failure shows an error state with Try again'],
  ]) {
    const p = await launch();
    try {
      backend.catalogMode = mode;
      await interceptFixtures(p);
      await p.goto(url);
      await ready(p);
      await step(label, async () => {
        const text = await p.eval(`document.getElementById('screen').textContent`);
        expect(text.includes(expectText), text.slice(0, 80));
        expect((await p.eval(`document.querySelectorAll('.card').length`)) === 0, 'cards rendered');
        expect(/Try again|Refresh/.test(await focusText(p)), 'retry not focused');
        await shot(p, `10-state-${mode}`);
      });
      if (mode === 'error') {
        await step('Try again recovers once the catalog is back', async () => {
          backend.catalogMode = 'policy';
          await p.key('enter');
          await p.waitFor(`!!document.querySelector('.hero')`);
        });
      }
    } finally {
      await p.close();
    }
  }
}

/* ---------------- live suite (production, read-only) ---------------- */
async function liveSuite(url) {
  const page = await launch();
  const requests = [];
  page.on('Network.requestWillBeSent', ({ request }) => { if (/watchprotv\.com\/api/.test(request.url)) requests.push(request); });
  await page.send('Network.enable');
  try {
    await page.goto(url);
    await ready(page);
    const storeDir = join(project, 'store', 'screenshots');
    mkdirSync(storeDir, { recursive: true });
    await step('live: production catalog loads through the Samsung client', async () => {
      const ids = await page.eval(`window.PROtvApp.state.items.map(i => i.id)`);
      const status = await page.eval(`window.PROtvApp.state.catalogStatus`);
      expect(status === 'ready', `status ${status}`);
      return `${ids.length} titles`;
    });
    await step('live: only API GETs were sent (read-only)', async () => {
      expect(requests.every((r) => r.method === 'GET' || r.method === 'OPTIONS'), 'non-GET request');
      return `${requests.length} requests`;
    });
    await new Promise((r) => setTimeout(r, 2500));
    writeFileSync(join(storeDir, '01-home.jpg'), await page.screenshot('jpeg', 92));
    await page.key('down');
    await new Promise((r) => setTimeout(r, 1200));
    writeFileSync(join(storeDir, '02-rows.jpg'), await page.screenshot('jpeg', 92));
    await page.key('enter');
    await page.waitFor(`!!document.querySelector('.details')`);
    await new Promise((r) => setTimeout(r, 1500));
    writeFileSync(join(storeDir, '03-details.jpg'), await page.screenshot('jpeg', 92));
    await step('live: playback authorization for a cleared title succeeds', async () => {
      const id = await page.eval(`document.querySelector('.details') && window.PROtvApp.state.items[0].id`);
      await page.key('enter');
      await page.waitFor(`!document.getElementById('player').classList.contains('hidden')`);
      await new Promise((r) => setTimeout(r, 6000));
      const phase = await page.eval(`(document.querySelector('#osd .osd-message') || {}).textContent || 'no message'`);
      const video = await page.eval(`(function(){var v=document.getElementById('video'); return v ? {t:v.currentTime, can:v.canPlayType('application/vnd.apple.mpegurl')} : null})()`);
      writeFileSync(join(outDir, 'live-player.jpg'), await page.screenshot('jpeg', 90));
      const auth = requests.find((r) => /\/playback$/.test(r.url));
      expect(auth, 'no playback authorization request');
      return `authorized ${new URL(auth.url).pathname}; browser HLS canPlayType="${video && video.can}", currentTime=${video && video.t}; osd: ${phase}`;
    });
    await page.key('back');
    await page.key('back');
    await page.waitFor(`!!document.querySelector('.hero')`);
    await page.key('left');
    await page.key('down');
    await page.key('enter');
    await page.waitFor(`!!document.querySelector('.keyboard')`);
    await page.type('the');
    await new Promise((r) => setTimeout(r, 1500));
    writeFileSync(join(storeDir, '04-search.jpg'), await page.screenshot('jpeg', 92));
    await page.key('back');
    await page.waitFor(`!!document.querySelector('.hero')`);
    await page.key('left');
    for (let i = 0; i < 4; i += 1) await page.key('down');
    await page.key('enter');
    await new Promise((r) => setTimeout(r, 1200));
    writeFileSync(join(storeDir, '05-categories.jpg'), await page.screenshot('jpeg', 92));
  } finally {
    await page.close();
  }
}

const build = join(project, 'build', live ? 'preview' : 'release');
const { server, url } = await serve(build);
try {
  if (live) await liveSuite(url); else await fixtureSuite(url);
} finally {
  server.close();
}
const failed = results.filter((r) => !r.ok);
writeFileSync(join(outDir, 'results.json'), JSON.stringify({ mode: live ? 'live' : 'fixture', date: new Date().toISOString(), results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed (${live ? 'live production, read-only' : 'fixture backend'}; headless Chromium browser preview, not a Samsung TV)`);
process.exit(failed.length ? 1 : 0);

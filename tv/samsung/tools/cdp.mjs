// Minimal Chrome DevTools Protocol driver (Node 22+ global WebSocket). Used for the browser
// preview end-to-end tests, store screenshots and icon rendering. Not part of the TV package.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function chromePath() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error('Chrome not found; set CHROME_PATH');
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch({ width = 1920, height = 1080 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'protv-samsung-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });
  let target;
  for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((entry) => entry.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) { child.kill(); throw new Error('Chrome did not start'); }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    } else if (message.method && listeners.has(message.method)) {
      for (const fn of listeners.get(message.method)) fn(message.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const page = {
    send, on,
    async goto(url) {
      await send('Page.navigate', { url });
      await sleep(300);
    },
    async eval(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    },
    async waitFor(expression, timeout = 15000) {
      const start = Date.now();
      for (;;) {
        try { if (await page.eval(expression)) return true; } catch { /* page navigating */ }
        if (Date.now() - start > timeout) throw new Error(`Timed out waiting for: ${expression}`);
        await sleep(100);
      }
    },
    // Remote keys as the TV delivers them (keyCode on keydown).
    async key(name) {
      const codes = { left: 37, up: 38, right: 39, down: 40, enter: 13, back: 10009, playpause: 10252, play: 415, pause: 19, stop: 413, ff: 417, rw: 412 };
      const code = codes[name];
      await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: ${code}, which: ${code}, bubbles: true }))`);
      await sleep(140);
    },
    async type(text) {
      for (const ch of text) {
        await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(ch)}, keyCode: ${ch.toUpperCase().charCodeAt(0)}, bubbles: true }))`);
        await sleep(60);
      }
    },
    async screenshot(format = 'jpeg', quality = 92) {
      const { data } = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? quality : undefined, captureBeyondViewport: false });
      return Buffer.from(data, 'base64');
    },
    async close() {
      try { socket.close(); } catch { /* closed */ }
      child.kill();
      await sleep(400);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* chrome still releasing files */ }
    },
  };
  return page;
}

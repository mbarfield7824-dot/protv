// Renders tools/assets.html in headless Chrome or Edge and writes assets/.
// Development-only: the PNG/JPG outputs are committed and packaged as-is.
// Optional arguments name the only assets to rewrite, e.g. card-ring.9.png.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './package.mjs';

const browsers = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = browsers.find(existsSync);
if (!browser) throw new Error('Set CHROME_PATH to a Chrome or Edge executable.');

const page = pathToFileURL(path.join(root, 'tools', 'assets.html')).href;
const dom = execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--force-device-scale-factor=1',
  '--allow-file-access-from-files', '--dump-dom', page,
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
const json = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom)?.[1];
if (!json) throw new Error('Asset page produced no output.');
const assets = JSON.parse(json.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
const dir = path.join(root, 'assets');
await mkdir(dir, { recursive: true });
const only = process.argv.slice(2);
for (const [name, url] of Object.entries(assets)) {
  if (only.length && !only.includes(name)) continue;
  const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  await writeFile(path.join(dir, name), bytes);
  console.log(`${name.padEnd(24)} ${bytes.length} bytes`);
}

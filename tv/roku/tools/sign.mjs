// Signs the frozen RC9 sideload ZIP on a developer Roku and downloads the .pkg.
// Secrets never appear in output, arguments or the repository:
//   ROKU_DEV_PASSWORD  - the device's developer (rokudev) password, from the environment
//   signing key file   - written by --genkey to %USERPROFILE%\protv-roku-signing\signing-key.json
//
//   node tools/sign.mjs <tv-ip> --check            device and ZIP checks; with ROKU_DEV_PASSWORD also the device's key
//   node tools/sign.mjs <tv-ip> --genkey           once ever: creates the key on the device, saves it to the key file
//   node tools/sign.mjs <tv-ip> --package          sideloads RC9, packages it, downloads and verifies the .pkg
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { root } from './package.mjs';

// The read-only release archive lives in the main checkout; ROKU_RELEASES_DIR overrides it.
const RELEASES = process.env.ROKU_RELEASES_DIR
  || [path.join(root, 'dist', 'releases'), 'D:\\protv\\tv\\roku\\dist\\releases'].find((dir) => existsSync(path.join(dir, 'protv-roku-v1.0.0-rc9-candidate.zip')))
  || path.join(root, 'dist', 'releases');
// The frozen release candidate (store/RC9-RELEASE-FREEZE.md). Signing anything else needs a new freeze.
const RC9 = path.join(RELEASES, 'protv-roku-v1.0.0-rc9-candidate.zip');
const RC9_SHA256 = 'a3a23130bae680bf4d00da708ed10fc6ad033af6e86fa69456506e59b74c1097';
const KEY_FILE = path.join(os.homedir(), 'protv-roku-signing', 'signing-key.json');
const OUT_DIR = path.join(RELEASES, 'signed');
const [ip, mode] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip || '') || !['--check', '--genkey', '--package'].includes(mode)) {
  console.error('usage: node tools/sign.mjs <tv-ip> --check | --genkey | --package');
  process.exit(2);
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// curl reads the credentials from stdin (-K -), so they never appear in the process list.
function curl(args, password) {
  return execFileSync('curl', ['-s', '-m', '300', '--digest', '-K', '-', ...args], { input: `user = "rokudev:${password}"\n`, maxBuffer: 64 * 1024 * 1024 });
}

async function deviceInfo() {
  const text = await (await fetch(`http://${ip}:8060/query/device-info`, { signal: AbortSignal.timeout(8000) })).text();
  const field = (name) => (new RegExp(`<${name}>([^<]*)</${name}>`).exec(text) || [])[1] || '';
  return { model: field('model-name'), os: field('software-version'), developer: field('developer-enabled'), ui: field('ui-resolution') };
}

function checkZip() {
  const actual = sha256(readFileSync(RC9));
  if (actual !== RC9_SHA256) throw new Error(`RC9 ZIP checksum mismatch (${actual})`);
  console.log(`RC9 ZIP verified: ${RC9_SHA256}`);
}

// The developer installer page reports the device's current signing key (read-only).
function deviceKey(devPassword) {
  const page = curl([`http://${ip}/plugin_install`], devPassword).toString();
  const keyed = /"dev_key"\s*:\s*(true|false)/.exec(page)?.[1];
  if (!keyed) throw new Error('Could not read the device key status (check ROKU_DEV_PASSWORD)');
  return { keyed: keyed === 'true', devId: /"dev_id"\s*:\s*"([^"]*)"/.exec(page)?.[1] || '' };
}

function genkey() {
  if (existsSync(KEY_FILE)) throw new Error(`A signing key file already exists (${KEY_FILE}). Never run genkey twice for PROtv; use Rekey instead.`);
  return new Promise((resolve, reject) => {
    let output = '';
    const socket = net.connect({ host: ip, port: 8080 }, () => socket.write('genkey\n'));
    socket.setTimeout(120000, () => { socket.destroy(); reject(new Error('genkey timed out')); });
    socket.on('data', (chunk) => {
      output += chunk.toString();
      const password = /Password:\s*(\S+)/i.exec(output)?.[1];
      const devId = /DevID:\s*(\S+)/i.exec(output)?.[1];
      if (password && devId) {
        socket.end();
        mkdirSync(path.dirname(KEY_FILE), { recursive: true });
        writeFileSync(KEY_FILE, JSON.stringify({ app: 'PROtv', devId, password, device: ip, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
        chmodSync(KEY_FILE, 0o600);
        console.log(`Signing key created. DevID ${devId}. Password saved to ${KEY_FILE} (not shown).`);
        console.log('Copy that file into your password manager and an encrypted backup now.');
        resolve();
      }
    });
    socket.on('error', reject);
  });
}

function packageRc9(devPassword) {
  const key = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
  const device = deviceKey(devPassword);
  if (!device.keyed) throw new Error(`Device has no signing key: restore it with Utilities > Rekey (DevID ${key.devId}), never genkey`);
  if (device.devId !== key.devId) throw new Error(`Device key ${device.devId} is not PROtv's key ${key.devId}: Rekey with the saved PROtv key first`);
  const install = curl(['-F', 'mysubmit=Install', '-F', `archive=@${RC9}`, `http://${ip}/plugin_install`], devPassword).toString();
  if (!/Install Success|Identical to previous version/.test(install)) throw new Error('Sideload of RC9 failed');
  console.log('RC9 sideloaded.');
  // The signing password reaches curl through a private temporary file, never argv, and is deleted at once.
  const secretFile = path.join(os.tmpdir(), `protv-sign-${process.pid}-${Date.now()}`);
  writeFileSync(secretFile, key.password, { flag: 'wx', mode: 0o600 });
  let page;
  try {
    page = curl(['-F', 'mysubmit=Package', '-F', 'app_name=PROtv/1.0.0', '-F', `pkg_time=${Date.now()}`, '-F', `passwd=<${secretFile}`, `http://${ip}/plugin_package`], devPassword).toString();
  } finally {
    rmSync(secretFile, { force: true });
  }
  if (/Invalid Password|Failed|Error/i.test(page) && !/\.pkg/.test(page)) throw new Error('Packager refused the request (check the signing password and DevID)');
  const href = /(pkgs\/+[^"'<>\s]+\.pkg)/.exec(page)?.[1];
  if (!href) throw new Error('Packager did not return a .pkg link');
  if (!page.includes(key.devId)) console.warn('WARNING: the Packager page does not show the expected DevID. Check before using this package.');
  mkdirSync(OUT_DIR, { recursive: true });
  const target = path.join(OUT_DIR, 'protv-roku-v1.0.0-rc9-signed.pkg');
  if (existsSync(target)) throw new Error(`${target} already exists; refusing to overwrite`);
  const bytes = curl([`http://${ip}/${href.replace(/\/+/g, '/')}`], devPassword);
  if (bytes.length < 100000) throw new Error(`Downloaded package is too small (${bytes.length} bytes)`);
  writeFileSync(target, bytes, { flag: 'wx' });
  writeFileSync(`${target}.sha256`, `${sha256(bytes)}  ${path.basename(target)}\n`, { flag: 'wx' });
  chmodSync(target, 0o444);
  console.log(`Signed package: ${target}\nSize: ${bytes.length} bytes\nSHA-256: ${sha256(bytes)}\nDevID: ${key.devId}`);
}

const info = await deviceInfo();
console.log(`Device ${ip}: ${info.model}, Roku OS ${info.os}, developer mode ${info.developer}, UI ${info.ui}`);
if (info.developer !== 'true') throw new Error('Developer mode is off on this device');
checkZip();
if (mode === '--genkey') {
  if (!process.env.ROKU_DEV_PASSWORD) throw new Error('Set ROKU_DEV_PASSWORD first: genkey checks the device holds no key (it is never printed)');
  const device = deviceKey(process.env.ROKU_DEV_PASSWORD);
  if (device.keyed) throw new Error(`This device already holds signing key ${device.devId}. genkey would replace it; stop and check whether it is PROtv's key`);
  await genkey();
}
if (mode === '--package') {
  if (!process.env.ROKU_DEV_PASSWORD) throw new Error('Set ROKU_DEV_PASSWORD in this terminal first (it is never printed)');
  if (!existsSync(KEY_FILE)) throw new Error(`No signing key file at ${KEY_FILE}: run --genkey once first (or Rekey with an existing key)`);
  packageRc9(process.env.ROKU_DEV_PASSWORD);
}
if (mode === '--check') {
  console.log(`Key file ${existsSync(KEY_FILE) ? 'present' : 'not present'} at ${KEY_FILE}.`);
  if (process.env.ROKU_DEV_PASSWORD) {
    const device = deviceKey(process.env.ROKU_DEV_PASSWORD);
    console.log(device.keyed ? `Device signing key present: DevID ${device.devId}.` : 'Device holds no signing key.');
  } else console.log('Device key status not checked (set ROKU_DEV_PASSWORD to include it).');
  console.log('Ready.');
}

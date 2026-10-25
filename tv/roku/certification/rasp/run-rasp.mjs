// Plays a Roku Remote Tool (.rasp) script on a Roku through ECP, for testing
// the certification scripts before uploading them. Supports the steps these
// scripts use: launch, press, text, pause and loop.
//
//   node run-rasp.mjs <tv-ip> <script.rasp>
//
// "text: script-login" and "text: script-password" are replaced, as App
// Behavior Analysis does, from the RASP_LOGIN and RASP_PASSWORD environment
// variables. Their values are never printed. Before the script, the runner
// returns the TV to its home screen so the launch step starts the app cold,
// as App Behavior Analysis does; the script itself never presses Home.
import { readFileSync } from 'node:fs';

const [ip, file] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip || '') || !file) {
  console.error('usage: node run-rasp.mjs <tv-ip> <script.rasp>');
  process.exit(2);
}
const ecp = `http://${ip}:8060`;
const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
const post = async (route) => {
  const response = await fetch(`${ecp}/${route}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`ECP ${route.split('?')[0]} returned ${response.status}`);
};
const activeApp = async () => /<app id="([^"]*)"/.exec(await (await fetch(`${ecp}/query/active-app`)).text())?.[1] || '';

// Minimal parser for the .rasp YAML subset: nested maps and "- " lists by indentation.
function parse(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => ({ indent: line.search(/\S/), text: line.trim() }));
  let index = 0;
  const scalar = (value) => {
    const unquoted = value.replace(/^(['"])(.*)\1$/, '$2');
    return /^-?\d+(\.\d+)?$/.test(unquoted) ? Number(unquoted) : unquoted;
  };
  function block(indent) {
    if (lines[index].text.startsWith('- ')) {
      const list = [];
      while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith('- ')) {
        const itemIndent = indent + 2;
        lines[index] = { indent: itemIndent, text: lines[index].text.slice(2) };
        list.push(map(itemIndent));
      }
      return list;
    }
    return map(indent);
  }
  function map(indent) {
    const result = {};
    while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith('- ')) {
      const { text } = lines[index++];
      const colon = text.indexOf(':');
      const key = text.slice(0, colon).trim().replace(/^(['"])(.*)\1$/, '$2');
      const value = text.slice(colon + 1).trim();
      result[key] = value !== '' ? scalar(value) : (index < lines.length && lines[index].indent > indent ? block(lines[index].indent) : null);
    }
    return result;
  }
  return block(lines[0].indent);
}

const KEYS = { home: 'Home', up: 'Up', down: 'Down', left: 'Left', right: 'Right', select: 'Select', ok: 'Select', back: 'Back', play: 'Play', reverse: 'Rev', rev: 'Rev', forward: 'Fwd', fwd: 'Fwd', replay: 'InstantReplay', info: 'Info', options: 'Info', backspace: 'Backspace', search: 'Search', enter: 'Enter' };
const script = parse(readFileSync(file, 'utf8'));
const wait = Number(script.params?.default_keypress_wait ?? 1);
const channels = script.params?.channels || {};
let pauses = 0;

async function run(steps, depth = 0) {
  for (const step of steps) {
    const [type, value] = Object.entries(step)[0];
    const pad = '  '.repeat(depth);
    if (type === 'launch') {
      const name = typeof value === 'object' ? value.channel_name : value;
      const id = channels[name];
      if (id === undefined) throw new Error(`launch: "${name}" is not in params.channels`);
      await post(`launch/${encodeURIComponent(id)}`);
      const deadline = Date.now() + 1000 * Number((typeof value === 'object' && value.timeout) || 35);
      while ((await activeApp()) !== String(id)) {
        if (Date.now() > deadline) throw new Error(`launch: ${name} did not start`);
        await sleep(0.5);
      }
      console.log(`${pad}launch ${name} (${id})`);
    } else if (type === 'press') {
      const key = KEYS[String(value).toLowerCase()];
      if (!key) throw new Error(`press: unknown key "${value}"`);
      if (key === 'Home') throw new Error('press: home exits the app; certification scripts must not use it');
      await post(`keypress/${key}`);
      console.log(`${pad}press ${value}`);
      await sleep(wait);
    } else if (type === 'text') {
      let text = String(value);
      if (text === 'script-login' || text === 'script-password') {
        const variable = text === 'script-login' ? 'RASP_LOGIN' : 'RASP_PASSWORD';
        if (!process.env[variable]) throw new Error(`${variable} is not set (needed for ${text})`);
        console.log(`${pad}text ${text} (substituted from ${variable}, ${process.env[variable].length} characters)`);
        text = process.env[variable];
      } else console.log(`${pad}text ${text}`);
      for (const character of text) await post(`keypress/Lit_${encodeURIComponent(character)}`);
      await sleep(wait);
    } else if (type === 'pause') {
      pauses += 1;
      console.log(`${pad}pause ${value}`);
      await sleep(Number(value));
    } else if (type === 'loop') {
      for (let i = 0; i < Number(value.iterations); i += 1) await run(value.steps, depth + 1);
    } else throw new Error(`unsupported step "${type}"`);
  }
}

if (script.params?.rasp_version !== 1) throw new Error('params.rasp_version must be 1');
if (/script-(login|password)/.test(readFileSync(file, 'utf8')) === false && /signin|sign-in/i.test(file)) throw new Error('sign-in script has no script-login/script-password placeholders');
await post('keypress/Home');
await sleep(3);
await run(script.steps);
if (pauses > 10) throw new Error(`${pauses} pause steps; App Behavior Analysis allows at most 10`);
console.log(`Finished: app ${await activeApp()} in foreground, ${pauses} pause steps.`);

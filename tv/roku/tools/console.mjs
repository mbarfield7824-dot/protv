// Captures the Roku developer console (port 8085) to out/roku-console.log.
// Usage: npm run console -- <roku-ip>. Stop with Ctrl+C.
// Long token-like strings are masked as a safety net; the app logs only shapes.
import net from 'node:net';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './package.mjs';

const host = process.argv[2];
if (!host) {
  console.error('Usage: npm run console -- <roku-ip>   (Roku: Settings > Network > About)');
  process.exit(1);
}
mkdirSync(path.join(root, 'out'), { recursive: true });
const file = path.join(root, 'out', 'roku-console.log');
const log = createWriteStream(file, { flags: 'a' });
const mask = (text) => text.replace(/[A-Za-z0-9_\-.]{40,}/g, '[masked]');
const socket = net.connect(8085, host, () => console.log(`Connected to ${host}:8085. Saving to ${file}`));
socket.setEncoding('utf8');
socket.on('data', (chunk) => {
  const safe = mask(chunk);
  process.stdout.write(safe);
  log.write(safe);
});
socket.on('error', (error) => {
  console.error(`Could not read the Roku console: ${error.message}`);
  process.exit(1);
});
socket.on('close', () => log.end());

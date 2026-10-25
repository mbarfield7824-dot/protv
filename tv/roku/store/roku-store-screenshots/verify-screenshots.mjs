// Checks every screenshot in this folder: PNG or JPEG, exactly 1920x1080.
// Reads the dimensions from the file header; never resizes or edits a file.
// Usage: node verify-screenshots.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const folder = path.dirname(fileURLToPath(import.meta.url));

function dimensions(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { format: 'PNG', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i < bytes.length - 9;) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'JPEG', width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
      }
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return null;
}

const files = readdirSync(folder).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort();
let failures = 0;
for (const name of files) {
  const info = dimensions(readFileSync(path.join(folder, name)));
  const ok = info && info.width === 1920 && info.height === 1080;
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${info ? `${info.format} ${info.width}x${info.height}` : 'not a PNG or JPEG'}`);
}
console.log(`${files.length} screenshot(s); ${failures} failing. Roku accepts up to 6.`);
if (!files.length || failures || files.length > 6) process.exitCode = 1;

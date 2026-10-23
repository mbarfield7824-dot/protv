import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';

export const root = fileURLToPath(new URL('..', import.meta.url));

export async function packageBytes() {
  const files = {};
  const firebaseApiKey = process.env.ROKU_FIREBASE_API_KEY || '';
  if (firebaseApiKey && !/^[A-Za-z0-9_-]{20,256}$/.test(firebaseApiKey)) {
    throw new Error('ROKU_FIREBASE_API_KEY must be a Firebase public client API key.');
  }
  async function include(relative) {
    const full = path.join(root, relative);
    const isAsset = relative.startsWith(`assets${path.sep}`) && /\.(png|jpg)$/.test(relative);
    if (relative === 'manifest' || /\.(brs|xml)$/.test(relative) || isAsset) {
      let contents = await readFile(full);
      if (relative === path.join('source', 'firebaseConfig.brs') && firebaseApiKey) {
        contents = Buffer.from(`function FirebaseApiKey() as String\n    return ${JSON.stringify(firebaseApiKey)}\nend function\n`);
      }
      files[relative.split(path.sep).join('/')] = [
        new Uint8Array(contents),
        { mtime: new Date(1980, 0, 1), level: 9 },
      ];
      return;
    }
    for (const entry of (await readdir(full, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() || /\.(brs|xml)$/.test(entry.name) || (relative === 'assets' && /\.(png|jpg)$/.test(entry.name))) {
        await include(path.join(relative, entry.name));
      }
    }
  }
  for (const relative of ['manifest', 'source', 'components', 'assets']) await include(relative);
  return zipSync(files);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = await packageBytes();
  const output = path.join(root, 'dist', 'protv-roku.zip');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(`${output}.sha256`, `${hash}  protv-roku.zip\n`);
  console.log(`Built ${output}\nSHA256 ${hash}\nNo deployment or device verification performed.`);
}

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';

export const root = fileURLToPath(new URL('..', import.meta.url));

// The existing public Firebase web key: ROKU_FIREBASE_API_KEY, otherwise the
// website's gitignored frontend/.env. It is injected into the ZIP only and
// never written to source.
export async function resolveFirebaseApiKey() {
  if (process.env.ROKU_FIREBASE_API_KEY !== undefined) return process.env.ROKU_FIREBASE_API_KEY;
  try {
    const env = await readFile(path.join(root, '..', '..', 'frontend', '.env'), 'utf8');
    return /^VITE_FIREBASE_API_KEY=["']?([^"'\r\n]*)/m.exec(env)?.[1] || '';
  } catch {
    return '';
  }
}

// captionTest builds a separately named, never-submitted package whose manifest
// adds protv_caption_test=1: the app then lists Apple's captioned HLS sample.
export async function packageBytes({ captionTest = false } = {}) {
  const files = {};
  const firebaseApiKey = await resolveFirebaseApiKey();
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
      if (relative === 'manifest' && captionTest) {
        contents = Buffer.from(contents.toString('utf8').replace(/^title=.*$/m, 'title=PROtv CAPTION TEST') + 'protv_caption_test=1\n');
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
  const captionTest = process.argv.includes('--caption-test');
  const bytes = await packageBytes({ captionTest });
  const name = captionTest ? 'protv-roku-caption-test.zip' : 'protv-roku.zip';
  const output = path.join(root, 'dist', name);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(`${output}.sha256`, `${hash}  ${name}\n`);
  if (captionTest) console.log('CAPTION TEST PACKAGE: for TV caption checks only. Never submit or publish it.');
  const linking = (await resolveFirebaseApiKey()) ? 'Account linking: enabled (public Firebase web key injected).' : 'Account linking: DISABLED (no public Firebase web key found).';
  console.log(`Built ${output}\nSHA256 ${hash}\n${linking}\nNo deployment or device verification performed.`);
}

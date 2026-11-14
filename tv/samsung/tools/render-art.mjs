// Renders the Samsung app icon (512x423 PNG) from tools/art.html with headless Chrome.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const page = await launch({ width: 512, height: 423 });
try {
  await page.goto(pathToFileURL(join(here, 'art.html')).href);
  await page.waitFor('document.readyState === "complete"');
  const png = await page.screenshot('png');
  writeFileSync(join(here, '..', 'app', 'icon.png'), png);
  mkdirSync(join(here, '..', 'store'), { recursive: true });
  writeFileSync(join(here, '..', 'store', 'app-icon-512x423.png'), png);
  console.log(`icon.png ${png.length} bytes`);
} finally {
  await page.close();
}

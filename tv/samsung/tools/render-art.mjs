// Renders the Samsung app icon (512x423 PNG) from tools/art.html with headless Chrome.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --seller: render only the 1920x1080 Seller Office icon and background from tools/art-1080.html.
if (process.argv.includes('--seller')) {
  const big = await launch({ width: 1920, height: 1080 });
  try {
    mkdirSync(join(here, '..', 'store'), { recursive: true });
    for (const [query, name] of [['', 'app-icon-1920x1080.png'], ['?bg', 'background-1920x1080.png']]) {
      await big.goto(pathToFileURL(join(here, 'art-1080.html')).href + query);
      await big.waitFor('document.readyState === "complete"');
      const png = await big.screenshot('png');
      writeFileSync(join(here, '..', 'store', name), png);
      console.log(`${name} ${png.length} bytes`);
    }
  } finally {
    await big.close();
  }
  process.exit(0);
}

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

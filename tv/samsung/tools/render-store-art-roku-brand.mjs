// Renders tools/store-art-roku-brand.html (approved Roku brand) into Samsung Seller Office images.
// usage: node tools/render-store-art-roku-brand.mjs <output dir> [--logo <official-logo.png>]
//   --logo: place the owner's logo artwork (transparent PNG) as-is instead of drawing the Roku wordmark.
// Store tooling only: it does not touch the app or the .wgt package.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { launch } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
// --app (with --logo): also write the TV app's logo images: splash 720, details placeholder 320, menu/card 120 px wide.
const APP_LOGO_WIDTHS = [720, 320, 120];
const logoAt = process.argv.indexOf('--logo');
const logoFile = logoAt > 0 ? process.argv[logoAt + 1] : null;
if (!out || out.startsWith('--')) throw new Error('usage: node tools/render-store-art-roku-brand.mjs <output dir> [--logo <png>]');
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// PNG from RGBA pixels: alpha=true -> 32-bit RGBA (color type 6), false -> 24-bit RGB (color type 2).
function png({ w, h, b64 }, alpha) {
  const px = Buffer.from(b64, 'base64');
  const bpp = alpha ? 4 : 3;
  const raw = Buffer.alloc((w * bpp + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * bpp + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4; const d = y * (w * bpp + 1) + 1 + x * bpp;
      raw[d] = px[s]; raw[d + 1] = px[s + 1]; raw[d + 2] = px[s + 2]; if (alpha) raw[d + 3] = px[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const fromDataUrl = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');

const page = await launch({ width: 1920, height: 1080 });
try {
  await page.goto(pathToFileURL(join(here, 'store-art-roku-brand.html')).href);
  await page.waitFor(`document.title === 'ready'`);
  const write = (name, buf) => { writeFileSync(join(out, name), buf); console.log(`${name.padEnd(46)} ${(buf.length / 1024).toFixed(0)} KB`); };
  // JPEG: highest quality (from 0.95 down) that fits the limit.
  async function jpegUnder(fn, limit) {
    for (let q = 0.95; q >= 0.5; q -= 0.05) {
      const buf = fromDataUrl(await page.eval(`ART.${fn}(${q.toFixed(2)})`));
      if (buf.length <= limit) return [buf, q];
    }
    throw new Error(`${fn} does not fit ${limit} bytes`);
  }
  if (logoFile) {
    // Official logo artwork placed as-is on the approved Roku backdrop.
    const info = await page.eval(`ART.setLogo(${JSON.stringify('data:image/png;base64,' + readFileSync(logoFile).toString('base64'))})`);
    console.log(`logo source ${info.source}, visible ${info.visible}`);
    write('app-icon-512x423.png', png(await page.eval('ART.official.icon512()'), false));
    write('app-logo-1920x1080-transparent.png', png(await page.eval('ART.official.logo()'), true));
    const [bg, qb] = await jpegUnder('iconBackground', 300 * 1024); write('icon-background-1920x1080.jpg', bg); console.log(`  (JPEG quality ${qb.toFixed(2)})`);
    const [db, qd] = await jpegUnder('official.detailBackground', 2 * 1024 * 1024); write('detail-background-1920x1080.jpg', db); console.log(`  (JPEG quality ${qd.toFixed(2)})`);
    mkdirSync(join(out, '_review'), { recursive: true });
    write('_review/icon-preview-logo-on-background.jpg', fromDataUrl(await page.eval('ART.official.preview(0.92)')));
    const box = await page.eval('ART.official.logoBox()');
    console.log(`logo placed at ${Math.round(box.width)}x${Math.round(box.height)} px in the 1920x1080 frame`);
    if (process.argv.includes('--app')) {
      // In-app logo images at their exact on-screen widths, and the package icon (same as the store 512x423 icon).
      const appDir = join(here, '..', 'app');
      mkdirSync(join(appDir, 'img'), { recursive: true });
      for (const w of APP_LOGO_WIDTHS) {
        const buf = png(await page.eval(`ART.official.scaled(${w})`), true);
        writeFileSync(join(appDir, 'img', `logo-${w}.png`), buf);
        console.log(`app/img/logo-${w}.png ${buf.length} bytes`);
      }
      writeFileSync(join(appDir, 'icon.png'), readFileSync(join(out, 'app-icon-512x423.png')));
      console.log('app/icon.png = app-icon-512x423.png');
    }
    process.exitCode = 0;
  } else {
  write('app-icon-512x423.png', png(await page.eval('ART.icon512()'), false));
  write('app-logo-1920x1080-transparent.png', png(await page.eval('ART.logo()'), true));
  const [bg, qb] = await jpegUnder('iconBackground', 300 * 1024); write('icon-background-1920x1080.jpg', bg); console.log(`  (JPEG quality ${qb.toFixed(2)})`);
  const [db, qd] = await jpegUnder('detailBackground', 2 * 1024 * 1024); write('detail-background-1920x1080.jpg', db); console.log(`  (JPEG quality ${qd.toFixed(2)}, tagline size ${await page.eval('window.__detailSize')})`);
  mkdirSync(join(out, '_review'), { recursive: true });
  write('_review/icon-preview-logo-on-background.jpg', fromDataUrl(await page.eval('ART.preview(0.92)')));
  write('_review/roku-splash-redrawn-by-this-tool.jpg', fromDataUrl(await page.eval('ART.rokuSplash(0.92)')));
  console.log(`logo wordmark size ${await page.eval('ART.logoSize()')} px (Roku formula 292)`);
  }
} finally {
  await page.close();
}

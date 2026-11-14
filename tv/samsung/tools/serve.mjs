// Serves a built widget (default build/preview) on http://127.0.0.1:<port> for browser preview.
// $WEBAPIS/webapis/webapis.js is answered with an empty script: Samsung APIs exist only on TVs,
// so the app falls back to HTML5 video and keyboard keys.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.xml': 'application/xml', '.json': 'application/json' };

export function serve(root, port = 0) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.includes('$WEBAPIS') || path.includes('%24WEBAPIS')) {
      res.writeHead(200, { 'Content-Type': TYPES['.js'] });
      res.end('/* Samsung webapis are available only on Samsung TVs. */');
      return;
    }
    const file = normalize(join(base, path === '/' ? 'index.html' : path));
    if (!file.startsWith(base) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || join(here, '..', 'build', 'preview');
  const { url } = await serve(root, Number(process.env.PORT || 8790));
  console.log(`PROtv Samsung preview at ${url} (arrows, Enter, Escape/Backspace = Back)`);
}

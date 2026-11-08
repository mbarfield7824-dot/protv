// The readable-address routes through the real Express app, using the public rewrites in vercel.json, a local
// catalog and an in-memory address store. Also checks that the repository's Firestore rules (a copy of the
// deployed release) give browsers no access to the publicSlugs collection or anything else.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const slugs = require('../src/catalog/slugs');
const firebase = require('../src/firebase');

const fixtures = [
  { id: 'creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8', title: 'It’s a Double Date a Classic', description: 'A classic.', contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: 'abc', year: 2026 },
  { id: 'ep1', title: 'One Step Beyond - The Storm', seriesTitle: 'One Step Beyond', contentType: 'EPISODE', seasonNumber: 2, episodeNumber: 39, approvalStatus: 'approved', status: 'ready', muxPlaybackId: 'def' },
  { id: 'hidden', title: 'Hidden Draft', contentType: 'MOVIE', approvalStatus: 'draft', status: 'ready', muxPlaybackId: 'x' },
];

async function site(context) {
  slugs.setDefaultSlugRegistry(slugs.createSlugRegistry({ store: slugs.memorySlugStore() }));
  context.mock.method(firebase, 'getApprovedVideos', async () => fixtures.filter((video) => video.approvalStatus === 'approved'));
  context.mock.method(firebase, 'getAllVideosAdmin', async () => fixtures);
  const app = require('../src/app');
  const rewrites = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8')).rewrites;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    for (const rule of rewrites) {
      const pattern = new RegExp(`^${rule.source.replace(/:(\w+)\*/g, '(?<$1>.*)').replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      const target = new URL(rule.destination.replace(/:(\w+)\*?/g, (_, name) => match.groups[name]), 'http://local');
      for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
      // What api/index.js does: /api/index?path=X&q -> X?q (the local app has no /api prefix).
      const route = target.searchParams.get('path');
      target.searchParams.delete('path');
      req.url = `/${route}${target.search}`;
      return app(req, res);
    }
    res.statusCode = 404;
    return res.end('static');
  }).listen(0, '127.0.0.1');
  context.after(() => { slugs.setDefaultSlugRegistry(null); return new Promise((resolve) => server.close(resolve)); });
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('public addresses through the real app: redirects, canonical pages, player, sitemap and device feeds', async (context) => {
  const base = await site(context);
  const get = (address, headers) => fetch(base + address, { redirect: 'manual', headers });
  const canonical = async (response) => (await response.text()).match(/rel="canonical" href="([^"]+)"/)?.[1];
  const id = 'creator_2bf9e385-b47a-4fa4-8643-cda6c8fe05f8';

  const moved = await get(`/title/${id}?utm_source=ig`);
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('location'), '/title/its-a-double-date-a-classic?utm_source=ig');
  assert.equal(moved.headers.get('cache-control'), 'no-store', 'redirects stay reversible');
  const page = await get('/title/its-a-double-date-a-classic');
  assert.equal(page.status, 200);
  assert.equal(await canonical(page), 'https://watchprotv.com/title/its-a-double-date-a-classic');
  assert.equal((await get('/title/ep1')).headers.get('location'), '/title/one-step-beyond-the-storm');
  assert.equal((await get('/series/b25lIHN0ZXAgYmV5b25k')).headers.get('location'), '/series/one-step-beyond');
  assert.equal(await canonical(await get('/series/one-step-beyond')), 'https://watchprotv.com/series/one-step-beyond');
  assert.equal((await get('/player/its-a-double-date-a-classic')).headers.get('location'), `/player/${id}`);
  assert.equal(await canonical(await get(`/player/${id}`)), 'https://watchprotv.com/title/its-a-double-date-a-classic');
  for (const hidden of ['/title/hidden', '/title/hidden-draft']) assert.equal((await get(hidden)).status, 404, hidden);

  const sitemap = await (await get('/sitemap.xml')).text();
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)/g)].map((match) => match[1]), [
    'https://watchprotv.com/', 'https://watchprotv.com/title/its-a-double-date-a-classic',
    'https://watchprotv.com/title/one-step-beyond-the-storm', 'https://watchprotv.com/series/one-step-beyond']);
  const roku = await (await get('/api/v1/catalog?view=all', { 'User-Agent': 'Roku/DVP-14.0' })).text();
  assert.equal(roku.includes('"slug"'), false);
  const website = await (await get('/api/videos')).json();
  assert.deepEqual(website.map((video) => video.slug).sort(), ['its-a-double-date-a-classic', 'one-step-beyond-the-storm']);
});

test('the Firestore rules in the repository deny every browser read and write (matches the deployed release)', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  const allows = [...rules.matchAll(/allow\s+([^:]+):\s*if\s+([^;]+);/g)].map((match) => [match[1].trim(), match[2].trim()]);
  assert.deepEqual(allows, [['read, write', 'false']]);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.equal(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../firebase.json'), 'utf8')).firestore.rules, 'firestore.rules');
});

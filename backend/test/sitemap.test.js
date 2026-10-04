const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { catalogSitemap } = require('../src/catalog/sitemap');
const { createCatalogRouter } = require('../src/catalog/router');

function title(id, overrides = {}) {
  return {
    id, title: `Title ${id}`, contentType: 'MOVIE',
    approvalStatus: 'approved', status: 'ready', muxPlaybackId: `playback-${id}`,
    ...overrides,
  };
}

test('sitemap contains only the homepage and existing eligible title URLs', () => {
  const show = title('show', { contentType: 'PODCAST_SHOW' });
  const xml = catalogSitemap([
    title('movie'), title('movie'), title('a&<"\'/ space'),
    title('music', { contentType: 'MUSIC', musicFormat: 'music_video' }),
    show,
    title('episode', { contentType: 'PODCAST_EPISODE', podcastShowId: 'show', episodeNumber: 1 }),
    title('orphan', { contentType: 'PODCAST_EPISODE', podcastShowId: 'missing', episodeNumber: 1 }),
    title('draft', { approvalStatus: 'draft' }),
    title('pending', { approvalStatus: 'pending' }),
    title('rejected', { approvalStatus: 'rejected' }),
    title('processing', { status: 'processing' }),
    title('failed', { status: 'errored' }),
    title('unplayable', { muxPlaybackId: '' }),
    title('invalid-music', { contentType: 'MUSIC', musicFormat: 'invalid' }),
  ]);
  const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, [
    'https://watchprotv.com/',
    'https://watchprotv.com/title/a%26%3C%22&apos;%2F%20space',
    'https://watchprotv.com/title/episode',
    'https://watchprotv.com/title/movie',
    'https://watchprotv.com/title/music',
  ]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert.equal(/<lastmod>|<priority>|<changefreq>/.test(xml), false);
  assert.equal(/watchprotv\.com\/(admin|profile|player|search|report|music|podcasts|api)\b/.test(xml), false);
  assert.equal(catalogSitemap([]).match(/<url>/g).length, 1);
});

async function serve(context, loadApproved) {
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({ loadApproved }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}/v1/catalog`;
}

test('sitemap endpoint returns XML and leaves catalog navigation endpoints intact', async (context) => {
  const base = await serve(context, async () => [title('public'), title('hidden', { status: 'processing' })]);
  const response = await fetch(`${base}/sitemap.xml`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/xml/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok((await response.text()).includes('https://watchprotv.com/title/public'));
  assert.deepEqual((await (await fetch(base)).json()).items.map((item) => item.id), ['public']);
  assert.equal((await fetch(`${base}/titles/public`)).status, 200);
  assert.equal((await fetch(`${base}/titles/hidden`)).status, 404);
});

test('catalog failure produces an explicit 503 rather than an incomplete sitemap', async (context) => {
  const logged = [];
  context.mock.method(console, 'error', (...args) => logged.push(args));
  const base = await serve(context, async () => { throw new Error('Catalog unavailable'); });
  const response = await fetch(`${base}/sitemap.xml`);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type'), /^text\/plain/);
  assert.equal(await response.text(), 'The sitemap is temporarily unavailable.');
  assert.equal(logged.length, 1);
});

test('production robots and rewrites preserve public navigation and exclude internal paths', () => {
  const root = path.resolve(__dirname, '..', '..');
  const robots = fs.readFileSync(path.join(root, 'frontend', 'public', 'robots.txt'), 'utf8')
    .replace(/\r\n/g, '\n');
  assert.match(robots, /^User-agent: \*\nAllow: \//);
  for (const route of ['admin', 'profile', 'my-list', 'history', 'report', 'activate', 'search', 'player', 'api/']) {
    assert.ok(robots.includes(`Disallow: /${route}\n`));
  }
  assert.ok(robots.includes('Sitemap: https://watchprotv.com/sitemap.xml'));
  assert.equal(/<html/i.test(robots), false);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites[0], {
    source: '/sitemap.xml', destination: '/api/index?path=v1/catalog/sitemap.xml',
  });
  const fallback = new RegExp(`^${config.rewrites.at(-1).source}$`);
  for (const route of ['/robots.txt', '/sitemap.xml', '/api/videos']) {
    assert.equal(fallback.test(route), false);
  }
  for (const route of ['/', '/movies', '/title/movie', '/player/movie', '/admin']) {
    assert.equal(fallback.test(route), true);
  }
  assert.equal(config.headers[0].headers[0].value, 'text/plain; charset=utf-8');
});

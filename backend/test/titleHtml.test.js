const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { titleHtml, loadTitleTemplate } = require('../src/catalog/titleHtml');
const { createCatalogRouter } = require('../src/catalog/router');

const template = '<html><head><title>PROtv</title><meta name="description" content="Home"><link rel="canonical" href="https://watchprotv.com/"><script src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';
const record = {
  id: 'public', title: 'Real Title', description: 'Real description.',
  contentType: 'MOVIE', approvalStatus: 'approved', status: 'ready', muxPlaybackId: 'ready',
  thumbnailUrl: 'https://images.example/poster.jpg?a=1&b=2',
};

test('title HTML provides exact metadata while preserving the React shell', () => {
  const html = titleHtml(template, record);
  for (const tag of [
    '<title>Real Title | PROtv</title>',
    '<meta name="description" content="Real description.">',
    '<link rel="canonical" href="https://watchprotv.com/title/public">',
    '<meta property="og:title" content="Real Title">',
    '<meta property="og:description" content="Real description.">',
    '<meta property="og:url" content="https://watchprotv.com/title/public">',
    '<meta property="og:type" content="video.other">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="Real Title">',
    '<meta name="twitter:description" content="Real description.">',
    '<meta property="og:image" content="https://images.example/poster.jpg?a=1&amp;b=2">',
    '<meta name="twitter:image" content="https://images.example/poster.jpg?a=1&amp;b=2">',
    '<script src="/assets/app.js"></script>', '<div id="root"><main',
    '<h1>Real Title</h1>', '<p class="title-description">Real description.</p>',
  ]) assert.ok(html.includes(tag), tag);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.equal(html.includes('content="Home"'), false);
});

test('initial JSON cannot terminate its script or inject executable markup', () => {
  const title = { ...record, title: '</script><script>alert("x")</script>',
    description: '<!-- & > \u2028 \u2029', extra: '$& </script>' };
  const html = titleHtml(template, title);
  const json = html.match(/<script id="protv-initial-title" type="application\/json">([^]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(json), title);
  assert.doesNotMatch(json, /[<>&\u2028\u2029]/);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.ok(html.includes('<h1>&lt;/script&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</h1>'));
  assert.equal((html.match(/<main\b/g) || []).length, 1);
});

test('catalog strings and URLs are escaped without replacement-string interpolation', () => {
  const html = titleHtml(template, {
    ...record, id: 'a&/b', title: '<script>&"\' $&</title>',
    description: '"><img src=x onerror=alert(1)> & $&',
  });
  assert.ok(html.includes('&lt;script&gt;&amp;&quot;&#39; $&amp;&lt;/title&gt; | PROtv'));
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; $&amp;'));
  assert.ok(html.includes('https://watchprotv.com/title/a%26%2Fb'));
  assert.equal(html.includes('<img'), false);
});

test('missing fields use only minimal fallbacks and unsafe or absent artwork is omitted', () => {
  for (const thumbnailUrl of ['', 'javascript:alert(1)', 'data:image/png;base64,test',
    '/poster.jpg', 'https://user:password@example.com/poster.jpg', 'not a URL']) {
    const html = titleHtml(template, { ...record, description: null, thumbnailUrl });
    assert.ok(html.includes('name="description" content="Real Title"'));
    assert.equal(html.includes('og:image'), false);
    assert.equal(html.includes('twitter:image'), false);
  }
  const html = titleHtml(template, { ...record, title: null, description: null, thumbnailUrl: '' });
  assert.ok(html.includes('<title>PROtv</title>'));
  assert.ok(html.includes('name="description" content=""'));
  assert.ok(titleHtml(template, { ...record, heroImageUrl: 'https://images.example/hero.jpg' })
    .includes('og:image" content="https://images.example/hero.jpg"'));
  assert.throws(() => titleHtml('<title>Home</title>', record), /template is invalid/);
});

async function serve(context, records, loadHtmlTemplate = async () => template) {
  const app = express();
  app.use('/v1/catalog', createCatalogRouter({
    loadApproved: typeof records === 'function' ? records : async () => records,
    loadHtmlTemplate,
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}/v1/catalog/titles`;
}

test('eligible title requests serve initial HTML and keep JSON/playback routes intact', async (context) => {
  const base = await serve(context, [record]);
  const response = await fetch(`${base}/public/html`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  assert.ok(html.includes('<title>Real Title | PROtv</title>'));
  assert.ok(html.includes('<h1>Real Title</h1>'));
  const initial = JSON.parse(html.match(/type="application\/json">([^]*?)<\/script>/)[1]);
  assert.equal(initial.id, record.id);
  assert.equal(initial.approvalStatus, undefined);
  assert.equal(initial.status, undefined);
  assert.equal((await fetch(`${base}/public`)).status, 200);
  assert.equal((await (await fetch(`${base}/public/playback`)).json()).muxPlaybackId, 'ready');
});

test('homepage canonical header is scoped to the static homepage', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8'));
  assert.deepEqual(config.headers.filter((rule) => rule.headers.some((header) => header.key === 'Link')), [{
    source: '/',
    headers: [{ key: 'Link', value: '<https://watchprotv.com/>; rel="canonical"' }],
  }]);
});

test('nonexistent and every ineligible title fail closed without metadata or template reads', async (context) => {
  const hidden = [
    { id: 'draft', approvalStatus: 'draft' }, { id: 'pending', approvalStatus: 'pending' },
    { id: 'rejected', approvalStatus: 'rejected' }, { id: 'processing', status: 'processing' },
    { id: 'failed', status: 'errored' }, { id: 'unplayable', muxPlaybackId: '' },
    { id: 'music', contentType: 'MUSIC', musicFormat: 'invalid' },
    { id: 'show', contentType: 'PODCAST_SHOW' },
    { id: 'orphan', contentType: 'PODCAST_EPISODE', podcastShowId: 'missing', episodeNumber: 1 },
  ].map((overrides) => ({ ...record, title: 'PRIVATE SECRET', ...overrides }));
  const base = await serve(context, hidden, async () => { throw new Error('Must not read template'); });
  for (const id of ['missing', ...hidden.map((item) => item.id)]) {
    const response = await fetch(`${base}/${id}/html`);
    assert.equal(response.status, 404, id);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.equal(await response.text(), 'Title not found.');
  }
});

test('catalog and template failures return explicit 503s with no metadata leakage', async (context) => {
  const logged = [];
  context.mock.method(console, 'error', (...args) => logged.push(args));
  const failingCatalog = await serve(context, async () => { throw new Error('Unavailable'); });
  const failingTemplate = await serve(context, [record], async () => { throw new Error('Missing build'); });
  for (const base of [failingCatalog, failingTemplate]) {
    const response = await fetch(`${base}/public/html`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.equal(await response.text(), 'The title page is temporarily unavailable.');
  }
  assert.equal(logged.length, 2);
});

test('production routing bundles the built template and limits the rewrite to title pages', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites[0], {
    source: '/title/:id', destination: '/api/index?path=v1/catalog/titles/:id/html',
  });
  assert.equal(config.functions['api/index.js'].includeFiles, 'frontend/dist/index.html');
});

test('built HTML includes homepage metadata and supplies the real React assets for title responses', async () => {
  const built = await loadTitleTemplate();
  assert.equal(built.includes('rel="canonical"'), false);
  assert.ok(built.includes('name="description"'));
  assert.match(built, /src="\/assets\/[^"]+\.js"/);
  const html = titleHtml(built, record);
  assert.ok(html.includes('<title>Real Title | PROtv</title>'));
  assert.deepEqual(html.match(/<(script|link)[^>]+(?:src|href)="\/assets\/[^>]+>/g),
    built.match(/<(script|link)[^>]+(?:src|href)="\/assets\/[^>]+>/g));
});

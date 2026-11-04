const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const sharp = require('sharp');

const origin = 'https://watchprotv.com';
const agents = ['WhatsApp/2.26.1', 'facebookexternalhit/1.1', 'Twitterbot/1.0'];
const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (index < 0) throw new Error('Use --base=URL and optional --report=FILE.');
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
const base = options.base || origin;
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function request(url, agent = agents[0]) {
  const response = await fetch(url, { headers: { 'User-Agent': agent }, signal: AbortSignal.timeout(45000) });
  assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
  return response;
}

async function concurrent(items, action) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) await action(items[next++]);
  }));
}

async function main() {
  const [catalog, series, podcasts] = await Promise.all([
    '/api/v1/catalog', '/api/v1/catalog/series', '/api/v1/catalog/podcasts',
  ].map(async route => (await (await request(base + route)).json()).items));
  const pages = [
    ...catalog.flatMap(title => ['title', 'player'].map(route => ({
      path: `/${route}/${encodeURIComponent(title.id)}`, title: title.title,
      description: title.description, canonical: `/title/${encodeURIComponent(title.id)}`,
    }))),
    ...series.map(show => ({ path: `/series/${show.key}`, canonical: `/series/${show.key}`, title: show.title })),
    ...podcasts.map(show => ({ path: `/podcasts/${show.id}`, canonical: `/podcasts/${show.id}`, title: show.title })),
    { path: '/MMWF', canonical: '/MMWF', title: 'Me and My White Friend' },
    { path: '/podcast/me-and-my-white-friend', canonical: '/podcast/me-and-my-white-friend', title: 'Me and My White Friend' },
  ];
  const results = [];
  const images = new Set();
  await concurrent(pages, async page => {
    let tags;
    for (const agent of agents) {
      const response = await request(base + page.path, agent);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      const html = await response.text();
      const meta = {};
      for (const match of html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)"/g)) {
        assert.equal(meta[match[1]], undefined, `${page.path}: duplicate ${match[1]}`);
        meta[match[1]] = decode(match[2]);
      }
      assert.equal(meta['og:title'], `${page.title} | PROtv`, page.path);
      assert.equal(meta['og:url'], origin + page.canonical, page.path);
      assert.equal(meta['twitter:card'], 'summary_large_image', page.path);
      assert.equal(meta['twitter:image'], meta['og:image'], page.path);
      assert.ok(meta['og:description']?.trim(), page.path);
      if (page.description?.trim()) assert.equal(meta['og:description'], page.description.trim(), page.path);
      assert.equal(meta['og:image:width'], '1200', page.path);
      assert.equal(meta['og:image:height'], '630', page.path);
      assert.ok(meta['og:image'].startsWith(origin + '/api/social/artwork/'), page.path);
      if (tags) assert.deepEqual(meta, tags, `${page.path}: crawler-specific metadata`);
      tags = meta;
    }
    images.add(tags['og:image']);
    results.push({ url: origin + page.path, title: tags['og:title'], description: tags['og:description'],
      canonical: tags['og:url'], type: tags['og:type'], image: tags['og:image'] });
  });
  const imageResults = [];
  await concurrent([...images], async image => {
    const url = new URL(image);
    const response = await request(base + url.pathname + url.search);
    assert.equal(response.headers.get('content-type'), 'image/jpeg', image);
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'jpeg', image);
    assert.equal(metadata.width, 1200, image);
    assert.equal(metadata.height, 630, image);
    assert.ok(bytes.length < 4 * 1024 * 1024, image);
    imageResults.push({ url: image, status: 200, type: 'image/jpeg', width: 1200, height: 630,
      bytes: bytes.length, source: response.headers.get('x-protv-artwork') });
  });
  for (const route of ['/player/not-a-published-title', '/series/not-a-published-show', '/podcasts/not-a-published-show',
    '/api/social/artwork/title/not-a-published-title', '/Dreadheads', '/MrCeasefire', '/TheThirst']) {
    const response = await fetch(base + route, { headers: { 'User-Agent': agents[1] }, signal: AbortSignal.timeout(45000) });
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(await response.text(), /property="og:title"/, route);
  }
  const report = { verifiedAt: new Date().toISOString(), base, agents, titleCount: catalog.length,
    seriesCount: series.length, podcastCount: podcasts.length, htmlChecks: pages.length * agents.length,
    results: results.sort((a, b) => a.url.localeCompare(b.url)), images: imageResults.sort((a, b) => a.url.localeCompare(b.url)) };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verifiedAt: report.verifiedAt, titleCount: catalog.length, seriesCount: series.length,
    podcastCount: podcasts.length, htmlChecks: report.htmlChecks, images: imageResults.length,
    fallbackImages: imageResults.filter(image => image.source === 'branded-fallback').map(image => image.url) }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

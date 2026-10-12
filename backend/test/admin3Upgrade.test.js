// Regression tests for the PROtv 3.0 admin AI upgrade (stages 1-5). No network, no paid AI.
const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeTitle, compareTitles, yearRelation } = require('../src/acquisition/titleMatcher');
const { checkDuplicate, partitionCandidates } = require('../src/acquisition/duplicateDetector');
const { classifyRights } = require('../src/acquisition/rightsClassifier');
const { detectGenre, buildFilmQuery } = require('../src/acquisition/genres');
const { classifyFilmKind, clusterAlternateUploads } = require('../src/acquisition/filmAnalysis');
const { classifyCatalogItem } = require('../src/acquisition/contentTypes');
const { FilmDiscoveryService } = require('../src/acquisition/filmDiscoveryService');
const { parseFilmDoc } = require('../src/adminBot/internetArchiveService');
const { filterExistingCatalogCandidates } = require('../src/adminBot/catalogDeduplication');
const { AssistantToolkit } = require('../src/admin/assistantTools');
const { AssistantAgent, MAX_TOOL_CALLS, routeIntent } = require('../src/admin/assistantAgent');
const { AdminAssistantService } = require('../src/admin/adminAssistantService');

const doc = (identifier, title, year, extra = {}) => ({
  identifier, title, year: String(year), runtime: '01:10:00', downloads: 5000,
  subject: ['horror'], collection: ['feature_films'], description: `${title} full movie`, ...extra,
});

const CATALOG = [
  { id: 'a', title: 'Nosferatu', year: 1922, status: 'errored', approvalStatus: 'draft', contentType: 'MOVIE' },
  { id: 'b', title: 'The Cabinet of Dr. Caligari', year: 1920, status: 'ready', approvalStatus: 'approved', hidden: true },
  { id: 'c', title: 'Night of the Living Dead', status: 'processing', approvalStatus: 'draft' },
  { id: 'm1', title: 'Summer Nights Live', contentType: 'MUSIC', musicFormat: 'live-performance', status: 'ready', approvalStatus: 'approved' },
  { id: 'p1', title: 'Film Talk', contentType: 'PODCAST_SHOW', status: 'ready', approvalStatus: 'approved' },
  { id: 'p2', title: 'Why Horror Works', contentType: 'PODCAST_EPISODE', podcastShowId: 'p1', episodeNumber: 3, status: 'ready', approvalStatus: 'approved' },
  { id: 'o1', title: 'Neon Dreams', category: 'originals', contentType: 'original', status: 'ready', approvalStatus: 'approved' },
];

// Stage 1
test('stage 1: titles normalize across articles, editions, years and underscores', () => {
  assert.equal(normalizeTitle('The Phantom of the Opera (1925)'), normalizeTitle('Phantom of the Opera'));
  assert.equal(normalizeTitle('Nosferatu_DVD_quality'), normalizeTitle('Nosferatu'));
  assert.equal(compareTitles('Nosferatu', "NOSFERATU - Director's Cut").relation !== 'none', true);
  assert.equal(yearRelation(1922, null), 'unknown');
  assert.equal(yearRelation(1922, 1950), 'different');
});

test('stage 1: drafts, errored and hidden records count; missing year is a possible duplicate', () => {
  assert.equal(checkDuplicate({ title: 'Nosferatu', year: 1922 }, CATALOG).status, 'already-in-catalog');
  assert.equal(checkDuplicate({ title: 'Cabinet of Dr. Caligari', year: 1920 }, CATALOG).status !== 'new', true);
  const missingYear = checkDuplicate({ title: 'Night of the Living Dead' }, CATALOG);
  assert.notEqual(missingYear.status, 'new');
  assert.ok(missingYear.reasons.length);
  assert.equal(checkDuplicate({ title: 'Nosferatu', year: 1979 }, CATALOG).status, 'new');
});

test('stage 1: candidate filter excludes existing titles and never mutates the catalog', () => {
  const before = JSON.stringify(CATALOG);
  const candidates = [parseFilmDoc(doc('n1', 'Nosferatu_DVD_quality', 1922)), parseFilmDoc(doc('x1', 'Dracula', 1931))];
  const out = filterExistingCatalogCandidates(candidates, CATALOG);
  assert.deepEqual(out.items.map((item) => item.title), ['Dracula']);
  assert.equal(partitionCandidates(candidates, CATALOG).existing.length, 1);
  assert.equal(JSON.stringify(CATALOG), before);
});

// Stage 2
test('stage 2: rights classifier separates likely PD, needs review and not cleared', () => {
  assert.equal(classifyRights({ year: 1925, title: 'Silent Film' }).classification, 'likely-pd');
  assert.equal(classifyRights({ year: 1925, title: 'Film', description: 'restored with a new score' }).classification, 'needs-review');
  assert.equal(classifyRights({ year: 1959, licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/' }).classification, 'needs-review');
  assert.equal(classifyRights({ year: 1975 }).classification, 'not-cleared');
  assert.equal(classifyRights({ year: 1925, licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' }).classification, 'not-cleared');
  assert.equal(classifyRights({ year: 1925 }).basis.length > 0, true);
});

// Stage 3
test('stage 3: genres, kinds and alternate-upload clustering', () => {
  assert.equal(detectGenre('Find quality horror movies'), 'horror');
  assert.match(buildFilmQuery({ genreKey: 'horror' }), /mediatype:\(movies\)/);
  assert.equal(classifyFilmKind({ title: 'Official Trailer', runtimeSeconds: 120 }), 'trailer');
  assert.equal(classifyFilmKind({ title: 'Metropolis', runtimeSeconds: 7200, description: 'feature' }), 'feature');
  const uploads = [
    { title: 'Nosferatu', year: 1922, downloads: 10 }, { title: 'Nosferatu (1922)', year: 1922, downloads: 99 },
  ].map((item, index) => ({ id: String(index), rights: { classification: 'likely-pd' }, ...item }));
  assert.equal(clusterAlternateUploads(uploads, (a, b) => a.downloads - b.downloads).length, 1);
});

function discovery(docs, extra = {}) {
  return new FilmDiscoveryService({
    archive: { searchFilms: async () => ({ total: docs.length, items: docs.map(parseFilmDoc) }) },
    loadCatalog: async () => CATALOG,
    ...extra,
  });
}

test('stage 3: discovery returns scored, explained candidates and excludes owned titles', async () => {
  const result = await discovery([
    doc('n1', 'Nosferatu', 1922), doc('n2', 'Nosferatu_DVD_quality', 1922),
    doc('c1', 'Carnival of Souls', 1962, { licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/' }),
    doc('p1', 'The Phantom of the Opera', 1925), doc('g1', 'The Golem', 1920),
    doc('m1', 'Modern Slasher', 1998),
  ]).discover({ genre: 'horror', limit: 10 });
  const titles = result.shortlist.map((item) => item.title);
  assert.ok(!titles.some((title) => /nosferatu/i.test(title)));
  assert.ok(titles.includes('The Phantom of the Opera'));
  assert.ok(!titles.includes('Modern Slasher'));
  assert.ok(result.shortlist.every((item) => item.score > 0 && item.reasons.length && item.rights.classification));
  assert.ok(result.excluded.alreadyInCatalog.length >= 1);
  assert.match(result.notes.join(' '), /Only \d+ of the 10/);
  assert.ok(result.shortlist.every((item) => !item.reference), 'no fabricated ratings without OMDb');
});

test('stage 3: OMDb enrichment is used only when a reference is returned', async () => {
  const result = await discovery([doc('p1', 'The Phantom of the Opera', 1925)], {
    getReference: async () => ({ title: 'The Phantom of the Opera', year: 1925, rating: 7.6, votes: 20000, genres: ['Horror'] }),
  }).discover({ genre: 'horror', limit: 3 });
  assert.equal(result.shortlist[0].reference.rating, 7.6);
});

// Stage 4
function toolkit(docs = [doc('p1', 'The Phantom of the Opera', 1925), doc('n1', 'Nosferatu', 1922)]) {
  const film = discovery(docs);
  return new AssistantToolkit({ getCatalog: async () => CATALOG, getFilmDiscovery: () => film });
}

test('stage 4: read-only tools are defined and unknown tools fail safely', async () => {
  const kit = toolkit();
  const names = kit.definitions().map((tool) => tool.function.name);
  for (const name of ['search_catalog', 'check_duplicate', 'search_film_candidates', 'inspect_acquisition_evidence', 'check_mux_asset_status', 'find_catalog_gaps', 'catalog_health_summary']) {
    assert.ok(names.includes(name), name);
  }
  assert.match((await kit.run('delete_everything', {})).error, /Unknown tool/);
  assert.equal((await kit.run('check_duplicate', { title: 'Nosferatu', year: 1922 })).status, 'already-in-catalog');
});

test('stage 4: deterministic fallback researches, excludes owned films and says AI is unavailable', async () => {
  const agent = new AssistantAgent({ toolkit: toolkit(), responseService: { configured: false } });
  const result = await agent.run({ message: 'Find quality horror movies we do not own', history: [], snapshot: {} });
  assert.equal(result.mode, 'deterministic');
  assert.match(result.reply, /not configured/);
  assert.match(result.reply, /Phantom of the Opera/);
  assert.doesNotMatch(result.reply, /1\. Nosferatu/);
  assert.match(result.reply, /Nothing was added/);
});

test('stage 4: follow-ups reuse the earlier genre', () => {
  const history = [{ role: 'user', content: 'find 5 horror films' }, { role: 'assistant', content: 'ok' }];
  const intent = routeIntent('give me more', history);
  assert.equal(intent.tool, 'search_film_candidates');
  assert.equal(intent.args.genre, 'horror');
  const withShown = routeIntent('give me more', [{ role: 'assistant', content: 'horror list\n1. A\n2. B\n3. C' }]);
  assert.equal(withShown.args.offset, 3);
});

test('stage 4: model tool loop is bounded and reports provider failure', async () => {
  const looping = {
    configured: true,
    complete: async () => ({ content: null, tool_calls: [{ id: 't', function: { name: 'catalog_health_summary', arguments: '{}' } }] }),
  };
  const calls = [];
  const kit = toolkit();
  const original = kit.run.bind(kit);
  kit.run = async (name, args) => { calls.push(name); return original(name, args); };
  const result = await new AssistantAgent({ toolkit: kit, responseService: looping })
    .run({ message: 'Find horror movies', history: [], snapshot: { currentTime: 'now' } });
  assert.ok(calls.length <= MAX_TOOL_CALLS);
  assert.match(result.reply, /AI research step failed/);
});

test('stage 4: a tool-calling model gets real tool results', async () => {
  let round = 0;
  let toolPayload = '';
  const model = {
    configured: true,
    complete: async ({ messages }) => {
      round += 1;
      if (round === 1) return { content: null, tool_calls: [{ id: 't1', function: { name: 'search_film_candidates', arguments: '{"genre":"horror","limit":3}' } }] };
      toolPayload = messages.find((message) => message.role === 'tool').content;
      return { content: 'Try The Phantom of the Opera.' };
    },
  };
  const result = await new AssistantAgent({ toolkit: toolkit(), responseService: model })
    .run({ message: 'Find horror', history: [], snapshot: { currentTime: 'now' } });
  assert.equal(result.mode, 'ai-tools');
  assert.match(toolPayload, /Phantom of the Opera/);
  assert.doesNotMatch(toolPayload, /"title":"Nosferatu"/);
});

// Stage 5
test('stage 5: content families are distinguished using existing schemas', () => {
  assert.deepEqual(CATALOG.map(classifyCatalogItem), ['movie', 'movie', 'movie', 'music', 'podcast-show', 'podcast-episode', 'original']);
});

test('stage 5: music queries return music, podcast queries distinguish shows from episodes', async () => {
  const kit = toolkit();
  const music = await kit.run('search_catalog', { query: '', contentType: 'music' });
  assert.deepEqual(music.items.map((item) => item.title), ['Summer Nights Live']);
  const podcasts = await kit.run('search_catalog', { query: '', contentType: 'podcast' });
  const byTitle = Object.fromEntries(podcasts.items.map((item) => [item.title, item]));
  assert.equal(byTitle['Film Talk'].family, 'podcast-show');
  assert.equal(byTitle['Film Talk'].episodeCount, 1);
  assert.equal(byTitle['Why Horror Works'].showTitle, 'Film Talk');
  const unsupported = await kit.run('search_film_candidates', { contentType: 'music' });
  assert.equal(unsupported.unsupported, true);
  const agent = new AssistantAgent({ toolkit: kit, responseService: { configured: false } });
  const reply = (await agent.run({ message: 'find music videos', history: [], snapshot: {} })).reply;
  assert.match(reply, /Summer Nights Live/);
  assert.doesNotMatch(reply, /Nosferatu/);
});

test('stage 5: assistant refuses movie metadata and category writes on music and podcast records', async () => {
  const service = new AdminAssistantService({
    candidateStore: { snapshot: async () => ({ status: {}, items: [] }) },
    listAuditEvents: async () => [],
    getCatalog: async () => CATALOG,
    getPublicDomainStatus: () => ({}),
    getDistributorStatus: () => ({}),
    catalogService: { get: async () => { throw new Error('must not be called'); } },
    posterService: {}, metadataService: {},
    responseService: { configured: false, answer: async () => { throw new Error('off'); } },
    log: async () => {}, audit: async () => {},
  });
  const reply = await service.query({ message: 'regenerate metadata for Summer Nights Live', actorId: 'admin' });
  assert.match(reply.reply, /music video/);
  assert.equal(reply.action, undefined);
  const research = await service.query({ message: 'Find quality horror movies we don\'t own', actorId: 'admin' });
  assert.equal(research.research.mode, 'deterministic');
  assert.ok(research.research.tools.some((tool) => tool.name === 'search_film_candidates'));
});

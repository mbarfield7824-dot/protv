// Readable public addresses (catalog/slugs.js): inspection and the one controlled correction path.
//
//   node scripts/public-slugs.js list                    Every recorded address (read-only).
//   node scripts/public-slugs.js dry-run                 Addresses the current public catalog would receive (read-only).
//   node scripts/public-slugs.js correct --kind title --target <internal id or series key> --slug <new-slug>
//        --reason "<why>" [--by <name>] [--apply]
//
// A correction is for a genuine metadata error (for example a misspelled title). It never deletes or changes an
// existing address: it records a new one, marked primary, and every earlier address of that page permanently
// redirects to it. Without --apply it only prints what it would record. Addresses are never regenerated
// automatically after a rename.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const {
  COLLECTION, SLUG_PATTERN, PublicPaths, publicSlugEntries, createSlugRegistry, memorySlugStore, firestoreSlugStore,
} = require('../src/catalog/slugs');

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

// Pure planning step, shared with the tests: validates a correction against the recorded addresses and the
// current public catalog. Returns the document to record.
function planCorrection({ documents, videos, kind, target, slug, reason, by, now = new Date() }) {
  if (!['title', 'series'].includes(kind)) throw new Error('--kind must be title or series.');
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug) || slug.length > 80) {
    throw new Error('--slug must be lowercase letters, digits and single hyphens (at most 80 characters).');
  }
  if (typeof reason !== 'string' || reason.trim().length < 10) throw new Error('--reason must explain the correction (10+ characters).');
  const entries = publicSlugEntries(videos);
  const entry = entries.find((item) => item.kind === kind && item.target === target);
  if (!entry) throw new Error('The target is not currently public. Only public pages can receive a corrected address.');
  if ((videos || []).some((video) => video.id === slug)) throw new Error('That address equals an internal ID.');
  const owner = documents.find((document) => document.kind === kind && document.slug === slug);
  const paths = new PublicPaths(documents, entries);
  if (owner) {
    // An address is never reused for other content, and re-recording the current address changes nothing.
    if (paths.target(kind, slug, () => false) !== target) throw new Error('That address already belongs to other content.');
    if (paths.slug(kind, target) === slug) throw new Error('That is already the page’s address.');
  }
  return {
    kind, slug, target, name: entry.name, createdAt: now.toISOString(), primary: true,
    correctedFrom: paths.slug(kind, target), reason: reason.trim(), correctedBy: by || process.env.USERNAME || process.env.USER || 'administrator',
    ...(entry.members ? { members: entry.members } : {}),
  };
}

async function main(args) {
  const { db, getApprovedVideos } = require('../src/firebase');
  if (!db) throw new Error('Firestore credentials are required (the same configuration as the API).');
  const store = firestoreSlugStore(db);
  const command = args[0];
  if (command === 'list') {
    const documents = await store.list();
    for (const document of documents.sort((a, b) => `${a.kind}${a.slug}`.localeCompare(`${b.kind}${b.slug}`))) {
      console.log([document.kind, `/${document.kind}/${document.slug}`, document.target, document.primary ? 'PRIMARY' : '', document.createdAt].join('\t'));
    }
    console.log(`${documents.length} recorded addresses.`);
    return;
  }
  const videos = await getApprovedVideos();
  if (command === 'dry-run') {
    // A copy of the recorded addresses in memory: nothing is written.
    const copy = memorySlugStore(await store.list());
    const before = copy.documents.size;
    await createSlugRegistry({ store: copy }).ensure(publicSlugEntries(videos), { reservedTargets: new Set(videos.map((video) => video.id)) });
    const added = [...copy.documents.values()].slice(before);
    for (const document of added) console.log(`NEW\t/${document.kind}/${document.slug}\t${document.target}\t"${document.name}"`);
    console.log(`${before} recorded; ${added.length} would be added on the next public request.`);
    return;
  }
  if (command === 'correct') {
    const document = planCorrection({
      documents: await store.list(), videos, kind: option(args, 'kind'), target: option(args, 'target'),
      slug: option(args, 'slug'), reason: option(args, 'reason'), by: option(args, 'by'),
    });
    console.log(`${args.includes('--apply') ? 'Recording' : 'Would record'}: /${document.kind}/${document.slug} for ${document.target}`
      + (document.correctedFrom ? ` (/${document.kind}/${document.correctedFrom} will redirect to it)` : ''));
    if (!args.includes('--apply')) { console.log('Dry run only. Add --apply to record it.'); return; }
    if (!await store.create(document)) throw new Error('That address was claimed at the same moment; nothing was recorded.');
    console.log(`Recorded in ${COLLECTION}. Servers pick it up within a minute.`);
    return;
  }
  throw new Error('Usage: node scripts/public-slugs.js list | dry-run | correct --kind title|series --target <id> --slug <slug> --reason "<why>" [--apply]');
}

if (require.main === module) {
  main(process.argv.slice(2)).then(() => process.exit(0)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { planCorrection };

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const assetDirectory = path.resolve(__dirname, '../../public/assets/legacy-posters/20261021');
const manifest = require('../../public/assets/legacy-posters/20261021/manifest.json');
const creatorFields = [
  'creatorProjectId', 'creatorSubmissionId', 'creatorEpisodeId', 'creatorEpisodeAuthorization',
  'creatorContractReference', 'creatorContractSignedAt', 'creatorRequestId', 'creatorPromotionalBinding',
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value.toJSON === 'function') return stable(value.toJSON());
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest('hex');
}
function withoutPoster(data) {
  const { posterUrl, ...rest } = data;
  return rest;
}
function normalizedTitle(title) {
  return title.toLowerCase().replace(/\([^)]*\)/g, '').replace(/\b(?:19|20)\d{2}\b/g, '').replace(/[^a-z0-9]/g, '');
}
function assertLegacy(entry, data) {
  if (!data || creatorFields.some(key => Boolean(data[key]))
    || String(data.copyrightStatus || '').toLowerCase().includes('creator')
    || /creator|schedule b/i.test(String(data.licenseType || ''))
    || !['unknown', 'public-domain'].includes(data.copyrightStatus)
    || !['MOVIE', 'movie'].includes(data.contentType)
    || normalizedTitle(data.title || '') !== normalizedTitle(entry.title)) {
    throw new Error(`Legacy identity/provenance guard failed: ${entry.id}`);
  }
}
function posterUrl(entry) {
  const key = `legacy-posters/${manifest.version}/${entry.sha256}/${entry.file}`;
  return `https://storage.googleapis.com/${manifest.bucket}/${key}`;
}
function buildPlan(documents) {
  if (manifest.entries.length !== 10 || new Set(manifest.entries.map(entry => entry.id)).size !== 10) throw new Error('Expected ten unique allowlisted IDs.');
  return manifest.entries.map(entry => {
    const data = documents.get(entry.id);
    assertLegacy(entry, data);
    if (Object.hasOwn(data, 'posterUrl') && data.posterUrl !== null && typeof data.posterUrl !== 'string') throw new Error(`Unexpected old poster field type: ${entry.id}`);
    return {
      id: entry.id, title: data.title, expectedDocumentHash: hash(data),
      unaffectedFieldsHash: hash(withoutPoster(data)),
      before: { present: Object.hasOwn(data, 'posterUrl'), ...(Object.hasOwn(data, 'posterUrl') ? { value: data.posterUrl } : {}) },
      after: posterUrl(entry),
    };
  });
}
function rollbackValue(row, current, deleteValue) {
  const entry = manifest.entries.find(entry => entry.id === row.id);
  if (!entry || row.after !== posterUrl(entry)) throw new Error(`Invalid rollback mapping: ${row.id}`);
  assertLegacy(entry, current);
  if (current.posterUrl !== row.after || hash(withoutPoster(current)) !== row.unaffectedFieldsHash) throw new Error(`Rollback precondition failed: ${row.id}`);
  return row.before.present ? row.before.value : deleteValue;
}
async function validateAssets() {
  const sharp = require('sharp');
  for (const entry of manifest.entries) {
    if (!/^[a-z0-9-]+\.jpg$/.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid asset manifest.');
    const bytes = await fs.readFile(path.join(assetDirectory, entry.file));
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 2_000_000 });
    const metadata = await image.metadata();
    if (hash(bytes) !== entry.sha256 || metadata.width !== 900 || metadata.height !== 1350 || metadata.format !== 'jpeg') throw new Error(`Asset validation failed: ${entry.file}`);
    await image.raw().toBuffer();
  }
}
async function publicBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) throw new Error(`Public poster unavailable: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Public poster exceeds limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function stageAssets(bucket) {
  for (const entry of manifest.entries) {
    const key = new URL(posterUrl(entry)).pathname.split('/').slice(2).join('/');
    const file = bucket.file(key);
    const bytes = await fs.readFile(path.join(assetDirectory, entry.file));
    const [exists] = await file.exists();
    if (!exists) {
      await file.save(bytes, {
        resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable', metadata: { sha256: entry.sha256 } },
      });
    }
    const [stored] = await file.download({ validation: 'crc32c' });
    if (!stored.equals(bytes)) throw new Error(`Existing object mismatch: ${entry.id}`);
    await file.makePublic();
    if (hash(await publicBytes(posterUrl(entry))) !== entry.sha256) throw new Error(`Public object hash mismatch: ${entry.id}`);
    console.log(`Verified controlled public asset: ${entry.file}`);
  }
}
async function snapshot(db) {
  const all = await db.collection('videos').get();
  return new Map(all.docs.map(doc => [doc.id, doc.data()]));
}
async function writeNew(file, data) {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
}
async function main() {
  const [mode, checkpointPath] = process.argv.slice(2);
  if (!['dry-run', 'apply', 'rollback'].includes(mode) || !checkpointPath || !path.isAbsolute(checkpointPath)) {
    throw new Error('Usage: node legacyPosterRollout.js <dry-run|apply|rollback> <absolute-local-checkpoint.json>');
  }
  // Never initialize the application's Firebase module or its local-storage fallback.
  const admin = require('firebase-admin');
  const credentialsPath = process.env.PROTV_POSTER_CREDENTIALS;
  if (!credentialsPath) throw new Error('Set PROTV_POSTER_CREDENTIALS to the ignored local service-account file.');
  const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
  if (credentials.project_id !== manifest.projectId) throw new Error('Unexpected Firebase project.');
  const app = admin.initializeApp({ credential: admin.credential.cert(credentials), projectId: manifest.projectId }, `legacy-posters-${Date.now()}`);
  try {
    const db = admin.firestore(app);
    if (mode === 'rollback') {
      const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
      if (checkpoint.projectId !== manifest.projectId || checkpoint.manifestHash !== hash(manifest) || checkpoint.rows?.length !== 10
        || new Set(checkpoint.rows.map(row => row.id)).size !== 10) throw new Error('Checkpoint identity mismatch.');
      await db.runTransaction(async transaction => {
        const docs = await transaction.getAll(...checkpoint.rows.map(row => db.collection('videos').doc(row.id)));
        const values = docs.map((doc, index) => rollbackValue(checkpoint.rows[index], doc.data(), admin.firestore.FieldValue.delete()));
        docs.forEach((doc, index) => transaction.update(doc.ref, { posterUrl: values[index] }));
      });
      console.log('Restored original poster field values/presence for ten legacy records. Assets retained for recovery.');
      return;
    }
    await validateAssets();
    const before = await snapshot(db);
    const rows = buildPlan(before);
    if (mode === 'dry-run') {
      await writeNew(checkpointPath, { mode, createdAt: new Date().toISOString(), projectId: manifest.projectId, manifestHash: hash(manifest), rows });
      console.log('DRY RUN: ten legacy records and ten asset hashes validated; no storage or catalog writes.');
      return;
    }
    if (rows.some(row => before.get(row.id).posterUrl === row.after)) throw new Error('One or more records already use this rollout; inspect the previous checkpoint instead of overwriting it.');
    const checkpoint = {
      mode, createdAt: new Date().toISOString(), projectId: manifest.projectId, manifestHash: hash(manifest), rows,
      catalogHashes: [...before].map(([id, data]) => ({ id, hash: hash(data) })),
    };
    await writeNew(checkpointPath, checkpoint);
    // All public assets must round-trip before the single atomic catalog update.
    await stageAssets(admin.storage(app).bucket(manifest.bucket));
    await db.runTransaction(async transaction => {
      const docs = await transaction.getAll(...rows.map(row => db.collection('videos').doc(row.id)));
      docs.forEach((doc, index) => {
        assertLegacy(manifest.entries[index], doc.data());
        if (hash(doc.data()) !== rows[index].expectedDocumentHash) throw new Error(`Concurrent catalog change: ${doc.id}`);
      });
      docs.forEach((doc, index) => transaction.update(doc.ref, { posterUrl: rows[index].after }));
    });
    const after = await snapshot(db);
    if (after.size !== before.size) throw new Error('Catalog membership changed during verification; inspect checkpoint.');
    const rowMap = new Map(rows.map(row => [row.id, row]));
    for (const [id, data] of before) {
      const next = after.get(id);
      const row = rowMap.get(id);
      if (!next || (row ? next.posterUrl !== row.after || hash(withoutPoster(next)) !== row.unaffectedFieldsHash : hash(next) !== hash(data))) {
        throw new Error(`Post-write verification mismatch: ${id}. Checkpoint is available; no automatic rollback attempted.`);
      }
    }
    await writeNew(`${checkpointPath}.result.json`, { status: 'verified', changed: rows.length, unchangedRecords: after.size - rows.length, fieldsChanged: ['posterUrl'], creatorRecordsChanged: 0, manifestHash: hash(manifest) });
    console.log(`VERIFIED: ten posterUrl updates; ${after.size - rows.length} other records and all non-poster fields unchanged.`);
  } finally { await app.delete(); }
}

module.exports = { hash, withoutPoster, assertLegacy, buildPlan, rollbackValue, posterUrl, validateAssets };
if (require.main === module) main().catch(error => { console.error(`Legacy poster rollout failed: ${error.message}`); process.exitCode = 1; });

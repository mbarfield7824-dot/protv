// PROtv rights remediation: replacement media and posters (CHANGE-MANIFEST.md).
//
//   node apply-remediation.cjs check                      read-only; writes a local checkpoint
//   node apply-remediation.cjs stage  --approved "<ref>"   new Mux assets + poster objects; no catalog change
//   node apply-remediation.cjs apply  --approved "<ref>"   one guarded transaction on the target records
//   node apply-remediation.cjs verify                     public catalog and playback checks
//   node apply-remediation.cjs rollback --approved "<ref>" restores the exact prior values
//
// Old Mux assets and stored artwork are never deleted. Requires D:\protv\backend\.env
// (Firebase service account, MUX_ACCESS_TOKEN, MUX_SECRET_KEY). Never prints secrets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const BACKEND = 'D:\\protv\\backend';
const req = (name) => require(path.join(BACKEND, 'node_modules', name));
const STAGING = 'D:\\protv\\audit-reports\\roku-rights-remediation-2026-10-24';
const PROJECT = 'protv-2f48e';
const BUCKET = 'protv-2f48e.firebasestorage.app';
const POSTER_PREFIX = 'approved-posters/rights-remediation-20261024';

// Each row names the exact record, the fields it may change and the verified source.
const MEDIA = [
  { id: 'IHkqDr5bGIY0Nw5Lhkky', title: 'Detour (1945)', url: 'https://archive.org/download/Detour/Detour.MPEG', bytes: 1783015424, sha1: '6ab29d86e7fbb2b6f28361c045ffd8c8d14836ed', seconds: 4058.25 },
  { id: 'WIVB9NPQQzvtvjTBsiKw', title: 'Carnival of Souls (1962)', url: 'https://archive.org/download/CarnivalOfSouls720p1962/CarnivalOfSouls720p.mp4', bytes: 512082539, sha1: '814775ffaaf080379e65666628b84aa41212afd6', seconds: 4664 },
  { id: 'zGpbFWvSaup6ioUaoqsN', title: 'Night of the Living Dead (1968)', url: 'https://archive.org/download/Night_Of_The_Living_Dead_raw_HD_WS/NightOfTheLivingDeadWSInternationalPrint.mp4', bytes: 817380054, sha1: 'ab7a006c34a7a2f6e62c05b10f7ce44d3470fc06', seconds: 5742.44 },
  { id: 'tuwoR1lZN8VnSTCSEiTc', title: 'The Scar of Shame (1927)', url: 'https://archive.org/download/the-scar-of-shame_1927/the-scar-of-shame_1927.mp4', bytes: 6235413237, sha1: '5e4c4da4d4852be5417c596040803bf2a8ea2690', seconds: 5194.58 },
  { id: 'WeNPJRItOH2nOdbwLkDG', title: 'The Phantom of the Opera (1925)', url: 'https://archive.org/download/ThePhantomOfTheOpera_201612/The%20Phantom%20of%20the%20Opera.mp4', bytes: 1093984342, sha1: '521bb6c1be15e0948dc79c4cbfbb313aba0b8a28', seconds: 6416.21 },
  { id: 'hFVcdczhgn8dT3cZcXAR', title: 'KIPHO', file: 'media/KIPHO-silent.webm', sha256: 'b076e60d8f54f165c95b3405cc950d8300e875711d1d1bbd2b9878a42539106f', seconds: 244.75 },
];
const POSTERS = [
  { id: 'LiMNMZWXBxJj3LoP73kU', title: 'His Girl Friday (1940)', file: 'posters/his-girl-friday.jpg', sha256: 'd76f508f4442bdd88f5fe1a2fc484560efcd1da18fb6ddb9d3e2cd7113414d2b' },
  { id: '1l1uGB4v8CaUr9p4TTGv', title: 'The Duke Is Tops (1938)', file: 'posters/the-duke-is-tops.jpg', sha256: 'b0a2ae5a0da319f0066fb91c949d5bd44844bc36be733c12bbbba3ee9eab83a4' },
  { id: 'MZ6Q6DI2S62pP8laH9Ku', title: 'The Incredible Petrified World (1959)', file: 'posters/the-incredible-petrified-world.jpg', sha256: '029ca5f9ce7e25e5959c383b21159b015e34720db9412a7a799949848378e6c2' },
];
const MEDIA_FIELDS = ['muxAssetId', 'muxPlaybackId', 'duration'];
const POSTER_FIELDS = ['posterUrl', 'thumbnailUrl'];

const sha = (algorithm, bytes) => crypto.createHash(algorithm).update(bytes).digest('hex');
function stable(v) {
  if (v && typeof v.toJSON === 'function') return stable(v.toJSON());
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
}
const hash = (v) => sha('sha256', JSON.stringify(stable(v)));
const out = (name) => path.join(STAGING, 'run', name);
const read = (name) => JSON.parse(fs.readFileSync(out(name), 'utf8'));
function writeNew(name, data) {
  fs.mkdirSync(path.dirname(out(name)), { recursive: true });
  fs.writeFileSync(out(name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
}
function journal(type, data = {}) {
  fs.mkdirSync(path.dirname(out('journal.jsonl')), { recursive: true });
  fs.appendFileSync(out('journal.jsonl'), JSON.stringify({ at: new Date().toISOString(), type, ...data }) + '\n');
}
function approval() {
  const index = process.argv.indexOf('--approved');
  const value = index > 0 ? String(process.argv[index + 1] || '').trim() : '';
  assert(value.length >= 8, 'This mode changes production: pass --approved "<owner approval reference>".');
  return value;
}

function connect() {
  const env = req('dotenv').parse(fs.readFileSync(path.join(BACKEND, '.env')));
  assert.equal(env.FIREBASE_PROJECT_ID, PROJECT);
  const credentials = JSON.parse(fs.readFileSync(path.resolve(BACKEND, env.FIREBASE_SERVICE_ACCOUNT_KEY)));
  assert.equal(credentials.project_id, PROJECT);
  const admin = req('firebase-admin');
  const app = admin.initializeApp({ credential: admin.credential.cert(credentials), projectId: PROJECT, storageBucket: BUCKET }, `remediation-${Date.now()}`);
  const Mux = req('@mux/mux-node');
  const mux = env.MUX_ACCESS_TOKEN ? new Mux({ tokenId: env.MUX_ACCESS_TOKEN, tokenSecret: env.MUX_SECRET_KEY }) : null;
  return { admin, app, db: admin.firestore(app), bucket: admin.storage(app).bucket(BUCKET), mux };
}

async function checkSources() {
  for (const row of MEDIA) {
    if (row.file) {
      assert.equal(sha('sha256', fs.readFileSync(path.join(STAGING, row.file))), row.sha256, `Staged file changed: ${row.title}`);
      continue;
    }
    const head = await fetch(row.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(60000) });
    assert(head.ok, `Source unreachable (${head.status}): ${row.title}`);
    assert.equal(Number(head.headers.get('content-length')), row.bytes, `Source size changed: ${row.title}`);
    const [, item, file] = /archive\.org\/download\/([^/]+)\/(.+)$/.exec(row.url);
    const meta = await (await fetch(`https://archive.org/metadata/${item}`)).json();
    const entry = meta.files.find((f) => f.name === decodeURIComponent(file));
    assert.equal(entry?.sha1, row.sha1, `Archive checksum changed: ${row.title}`);
  }
  for (const row of POSTERS) {
    assert.equal(sha('sha256', fs.readFileSync(path.join(STAGING, row.file))), row.sha256, `Poster changed: ${row.title}`);
  }
}

async function check({ db }) {
  await checkSources();
  const rows = [];
  for (const row of [...MEDIA.map((r) => ({ ...r, kind: 'media', fields: MEDIA_FIELDS })), ...POSTERS.map((r) => ({ ...r, kind: 'poster', fields: POSTER_FIELDS }))]) {
    const doc = await db.collection('videos').doc(row.id).get();
    assert(doc.exists, `Missing record: ${row.title}`);
    const data = doc.data();
    assert.equal(data.title, row.title, `Title changed: ${row.id}`);
    assert.equal(data.approvalStatus, 'approved', `Not approved: ${row.title}`);
    for (const field of row.fields) assert(field === 'duration' || !Object.hasOwn(data, field) || typeof data[field] === 'string', `Unexpected ${field}: ${row.title}`);
    rows.push({ id: row.id, title: row.title, kind: row.kind, documentHash: hash(data), before: Object.fromEntries(row.fields.map((f) => [f, Object.hasOwn(data, f) ? { value: data[f] } : { absent: true }])) });
  }
  const name = `checkpoint-${Date.now()}.json`;
  writeNew(name, { createdAt: new Date().toISOString(), projectId: PROJECT, rows, productionWrites: 0 });
  journal('CHECK_PASSED', { checkpoint: name, rows: rows.length });
  console.log(`CHECK PASSED: ${MEDIA.length} media sources and ${POSTERS.length} posters verified; ${rows.length} records baselined in run/${name}. No production writes.`);
}

async function waitReady(mux, assetId) {
  for (let i = 0; i < 240; i += 1) {
    const asset = await mux.video.assets.retrieve(assetId);
    if (asset.status === 'ready') return asset;
    assert.notEqual(asset.status, 'errored', `Mux asset errored: ${assetId}`);
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error(`Mux asset not ready after 60 minutes: ${assetId}`);
}

async function stage({ mux, bucket }) {
  const approved = approval();
  assert(mux, 'MUX_ACCESS_TOKEN / MUX_SECRET_KEY missing');
  await checkSources();
  const staged = { approved, stagedAt: new Date().toISOString(), media: [], posters: [] };
  for (const row of MEDIA) {
    let asset;
    if (row.url) {
      asset = await mux.video.assets.create({ inputs: [{ url: row.url }], playback_policies: ['public'], video_quality: 'basic', passthrough: `rights-remediation:${row.id}` });
    } else {
      const upload = await mux.video.uploads.create({ cors_origin: '*', new_asset_settings: { playback_policies: ['public'], video_quality: 'basic', passthrough: `rights-remediation:${row.id}` } });
      const file = path.join(STAGING, row.file);
      const put = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Length': String(fs.statSync(file).size) }, body: fs.createReadStream(file), duplex: 'half' });
      assert(put.ok, `Upload failed: ${row.title}`);
      let current = upload;
      for (let i = 0; i < 60 && !current.asset_id; i += 1) { await new Promise((r) => setTimeout(r, 5000)); current = await mux.video.uploads.retrieve(upload.id); }
      asset = { id: current.asset_id };
    }
    journal('MUX_ASSET_CREATED', { id: row.id, assetId: asset.id });
    const ready = await waitReady(mux, asset.id);
    assert(Math.abs(ready.duration - row.seconds) < 3, `Duration mismatch for ${row.title}: ${ready.duration}`);
    const playbackId = ready.playback_ids.find((p) => p.policy === 'public').id;
    const manifest = await fetch(`https://stream.mux.com/${playbackId}.m3u8`);
    assert(manifest.ok, `Manifest not playable: ${row.title}`);
    staged.media.push({ id: row.id, title: row.title, muxAssetId: ready.id, muxPlaybackId: playbackId, duration: Math.round(ready.duration) });
    console.log(`MEDIA_STAGED ${row.title} (${Math.round(ready.duration)} s)`);
  }
  for (const row of POSTERS) {
    const bytes = fs.readFileSync(path.join(STAGING, row.file));
    const key = `${POSTER_PREFIX}/${row.id}/${row.sha256}.jpg`;
    const object = bucket.file(key);
    const [exists] = await object.exists();
    if (!exists) {
      await object.save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable', metadata: { sha256: row.sha256, catalogId: row.id } } });
    }
    await object.makePublic();
    const url = `https://storage.googleapis.com/${BUCKET}/${key}`;
    const live = Buffer.from(await (await fetch(url)).arrayBuffer());
    assert.equal(sha('sha256', live), row.sha256, `Public poster bytes mismatch: ${row.title}`);
    staged.posters.push({ id: row.id, title: row.title, url });
    console.log(`POSTER_STAGED ${row.title}`);
  }
  writeNew('staged.json', staged);
  journal('STAGED', { approved });
  console.log('All replacements staged. No catalog record changed.');
}

function latestCheckpoint() {
  const names = fs.readdirSync(path.join(STAGING, 'run')).filter((n) => n.startsWith('checkpoint-')).sort();
  assert(names.length, 'Run check first.');
  return read(names[names.length - 1]);
}

async function apply({ db }) {
  const approved = approval();
  const checkpoint = latestCheckpoint();
  const staged = read('staged.json');
  const updates = new Map();
  for (const m of staged.media) updates.set(m.id, { muxAssetId: m.muxAssetId, muxPlaybackId: m.muxPlaybackId, duration: m.duration });
  for (const p of staged.posters) updates.set(p.id, { ...(updates.get(p.id) || {}), posterUrl: p.url, thumbnailUrl: p.url });
  await db.runTransaction(async (tx) => {
    const refs = [...updates.keys()].map((id) => db.collection('videos').doc(id));
    const snaps = await tx.getAll(...refs);
    for (const snap of snaps) {
      const base = checkpoint.rows.find((r) => r.id === snap.id);
      assert.equal(hash(snap.data()), base.documentHash, `Record changed since check: ${snap.id}. Run check again.`);
    }
    for (const snap of snaps) tx.update(snap.ref, { ...updates.get(snap.id), rightsRemediation: { appliedAt: new Date().toISOString(), approval: approved } });
  });
  writeNew('applied.json', { appliedAt: new Date().toISOString(), approved, updates: Object.fromEntries(updates) });
  journal('APPLIED', { approved, records: updates.size });
  console.log(`APPLIED to ${updates.size} records. Run verify.`);
}

async function verify() {
  const applied = read('applied.json');
  const catalog = await (await fetch(`https://watchprotv.com/api/v1/catalog?view=all&remediationCheck=${Date.now()}`)).json();
  let failures = 0;
  for (const [id, fields] of Object.entries(applied.updates)) {
    const item = catalog.items.find((t) => t.id === id);
    const problems = [];
    if (!item) problems.push('missing from catalog');
    if (fields.muxPlaybackId && item?.muxPlaybackId !== fields.muxPlaybackId) problems.push('playback ID not live');
    if (fields.posterUrl && item?.posterUrl !== fields.posterUrl) problems.push('poster not live');
    if (fields.muxPlaybackId && !(await fetch(`https://stream.mux.com/${fields.muxPlaybackId}.m3u8`)).ok) problems.push('manifest not playable');
    failures += problems.length ? 1 : 0;
    console.log(`${problems.length ? 'FAILED' : 'LIVE_OK'} ${item?.title || id}${problems.length ? `: ${problems.join(', ')}` : ''}`);
  }
  journal('VERIFIED', { failures });
  if (failures) process.exitCode = 2;
}

async function rollback({ db, admin }) {
  const approved = approval();
  const checkpoint = latestCheckpoint();
  const applied = read('applied.json');
  await db.runTransaction(async (tx) => {
    const ids = Object.keys(applied.updates);
    const snaps = await tx.getAll(...ids.map((id) => db.collection('videos').doc(id)));
    for (const snap of snaps) {
      for (const [field, value] of Object.entries(applied.updates[snap.id])) assert.equal(snap.data()[field], value, `Rollback conflict: ${snap.id}/${field}`);
    }
    for (const snap of snaps) {
      const before = checkpoint.rows.filter((r) => r.id === snap.id).flatMap((r) => Object.entries(r.before));
      tx.update(snap.ref, { ...Object.fromEntries(before.map(([f, v]) => [f, v.absent ? admin.firestore.FieldValue.delete() : v.value])), rightsRemediation: admin.firestore.FieldValue.delete() });
    }
  });
  writeNew(`rolled-back-${Date.now()}.json`, { at: new Date().toISOString(), approved });
  journal('ROLLED_BACK', { approved });
  console.log('ROLLED BACK: prior Mux IDs, durations and artwork restored. New assets kept for inspection.');
}

async function main() {
  const mode = process.argv[2];
  assert(['check', 'stage', 'apply', 'verify', 'rollback'].includes(mode), 'Mode: check | stage | apply | verify | rollback');
  if (mode === 'verify') return verify();
  const ctx = connect();
  try {
    await { check, stage, apply, rollback }[mode](ctx);
  } finally {
    await ctx.app.delete();
  }
}

if (require.main === module) main().catch((error) => { console.error(`REMEDIATION_ABORTED: ${error.message}`); process.exitCode = 1; });
module.exports = { MEDIA, POSTERS, hash, stable };

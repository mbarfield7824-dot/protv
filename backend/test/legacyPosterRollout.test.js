const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../../public/assets/legacy-posters/20261021/manifest.json');
const { hash, buildPlan, rollbackValue, posterUrl, validateAssets } = require('../scripts/legacyPosterRollout');

function fixtures() {
  return new Map(manifest.entries.map(entry => [entry.id, {
    title: `${entry.title} (1942)`, contentType: 'MOVIE', copyrightStatus: 'unknown',
    thumbnailUrl: 'https://example.test/original.jpg', heroImageUrl: '', runtime: 120,
  }]));
}
test('exact ten-ID plan changes only posterUrl and retains absent, null, empty and existing values', () => {
  const docs = fixtures();
  docs.get(manifest.entries[1].id).posterUrl = 'https://example.test/old.jpg';
  docs.get(manifest.entries[2].id).posterUrl = '';
  docs.get(manifest.entries[3].id).posterUrl = null;
  const plan = buildPlan(docs);
  assert.equal(plan.length, 10);
  assert.deepEqual(plan[0].before, { present: false });
  assert.deepEqual(plan[1].before, { present: true, value: 'https://example.test/old.jpg' });
  assert.deepEqual(plan[2].before, { present: true, value: '' });
  assert.deepEqual(plan[3].before, { present: true, value: null });
  assert.equal(plan[0].after, posterUrl(manifest.entries[0]));
  assert.equal(docs.get(plan[0].id).posterUrl, undefined);
});
test('rejects creator linkage, creator rights, wrong identity, missing ID and unexpected types', () => {
  for (const patch of [
    { creatorProjectId: 'creator-project' }, { creatorSubmissionId: 'submission' },
    { creatorEpisodeId: 'episode' }, { creatorContractReference: 'contract' },
    { creatorRequestId: 'request' }, { copyrightStatus: 'creator-owned' },
    { licenseType: 'Creator Schedule B' }, { title: 'Different film' },
    { contentType: 'EPISODE' }, { posterUrl: {} },
  ]) {
    const docs = fixtures();
    Object.assign(docs.get(manifest.entries[0].id), patch);
    assert.throws(() => buildPlan(docs));
  }
  const docs = fixtures();
  docs.delete(manifest.entries[0].id);
  assert.throws(() => buildPlan(docs));
});
test('rollback restores field absence and original value, but rejects concurrent edits or tampering', () => {
  const docs = fixtures();
  const rows = buildPlan(docs);
  const row = rows[0];
  const current = { ...docs.get(row.id), posterUrl: row.after };
  const deletion = Symbol('delete field');
  assert.equal(rollbackValue(row, current, deletion), deletion);
  assert.equal(rollbackValue({ ...row, before: { present: true, value: 'old' } }, current, deletion), 'old');
  assert.throws(() => rollbackValue(row, { ...current, posterUrl: 'newer' }, deletion));
  assert.throws(() => rollbackValue(row, { ...current, runtime: 999 }, deletion));
  assert.throws(() => rollbackValue({ ...row, after: 'tampered' }, current, deletion));
});
test('document hashes ignore object-key order, not field presence or values', () => {
  assert.equal(hash({ b: 2, a: { z: 1, y: 2 } }), hash({ a: { y: 2, z: 1 }, b: 2 }));
  assert.notEqual(hash({}), hash({ posterUrl: '' }));
});
test('all ten approved asset bytes match hashes, fully decode and have exact 900x1350 dimensions', async () => {
  await validateAssets();
});

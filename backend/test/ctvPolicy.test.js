// Unified connected-TV rights policy (development).
const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluate, ctvView, PLATFORMS, registry } = require('../src/catalog/ctvPolicy');

const US = { country: 'US', reason: 'ip' };
const CA = { country: 'CA', reason: 'ip' };
const UNKNOWN = { country: null, reason: 'unknown' };
const VPN = { country: null, reason: 'region-mismatch' };
const NOW = new Date('2026-12-01T12:00:00Z');
const SIGNED = 'SignedPlaybackId0001';
const v = (id, extra = {}) => ({ id, title: id, muxPlaybackId: 'PublicPlaybackId0001', ...extra });
const agreement = (extra = {}) => ({ kind: 'agreement', signed: '2026-11-01', ends: '2028-10-31', territory: 'WORLDWIDE', services: 'all-protv-apps', signer: 'confirmed', master: 'verified', rating: 'TV-14', ...extra });
const pd = (extra = {}) => ({ kind: 'public-domain', territory: 'US', film: 'public-domain-us', music: 'reviewed', sourceCopy: 'confirmed', rating: 'TV-PG', ...extra });
const run = (entry, platform = 'samsung', opts = {}, video = v('t', { muxSignedPlaybackId: SIGNED })) =>
  evaluate(video, platform, { now: NOW, territory: US, rights: { t: entry }, ...opts });

test('a fully established worldwide agreement is eligible on Roku and Samsung alike, anywhere', () => {
  for (const platform of ['roku', 'samsung']) {
    for (const territory of [US, CA, UNKNOWN]) assert.deepEqual(run(agreement(), platform, { territory }).deny, [], `${platform} ${territory.country}`);
  }
});

test('deny by default: no record, unknown platform, unknown rights kind, unknown territory value', () => {
  assert.deepEqual(evaluate(v('x'), 'samsung', { rights: {} }).deny, ['no-rights-record']);
  assert.deepEqual(evaluate(v('t'), 'tizen-oops', { rights: { t: agreement() } }).deny, ['unknown-platform']);
  assert.ok(run({ ...agreement(), kind: 'mystery' }).deny.includes('unknown-rights-kind'));
  assert.ok(run(agreement({ territory: 'EU' })).deny.includes('territory-unknown'));
});

test('executed rights: signer authority, granted platforms and contract dates', () => {
  assert.ok(run(agreement({ signer: 'unconfirmed' })).deny.includes('signer-authority-unconfirmed'));
  assert.deepEqual(run(agreement({ signer: 'counsel-check' })).review, ['signer-authority-counsel-check']);
  assert.ok(run(agreement({ services: 'named:website' })).deny.includes('platform-not-granted'));
  assert.ok(run(agreement({ services: 'counsel-check' })).review.includes('platform-scope-counsel-check'));
  assert.ok(run(agreement({ signed: '2026-12-02' })).deny.includes('before-term'));
  assert.ok(run(agreement({ ends: '2026-11-30' })).deny.includes('term-expired'));
  assert.deepEqual(run(agreement({ ends: '2026-12-01' })).deny, [], 'the last day of the term is inside it');
  assert.ok(run(agreement({ master: 'untraced' })).review.includes('master-not-traced'));
});

test('territory-limited titles: U.S. store, U.S. viewer and a signed stream, or nothing', () => {
  const us = agreement({ territory: 'US' });
  assert.deepEqual(run(us).deny, []);
  for (const territory of [CA, UNKNOWN, VPN, null]) assert.ok(run(us, 'samsung', { territory }).deny.includes('viewer-not-confirmed-in-us'));
  assert.ok(run(us, 'samsung', {}, v('t')).deny.includes('no-signed-playback-id'), 'never the public stream');
  const original = PLATFORMS.samsung.storeTerritories;
  PLATFORMS.samsung.storeTerritories = ['US', 'CA'];
  try { assert.ok(run(us).deny.includes('store-not-us-only')); } finally { PLATFORMS.samsung.storeTerritories = original; }
  const decision = run(us);
  const view = ctvView(v('t', { muxSignedPlaybackId: SIGNED }), decision);
  assert.equal(view.muxPlaybackId, SIGNED);
  assert.equal(view.muxPlaybackPolicy, 'signed');
  assert.equal(ctvView(v('t'), run(agreement())).muxPlaybackId, 'PublicPlaybackId0001', 'worldwide titles keep their stream');
});

test('maturity: the rating must fit each store classification; unknown ratings are flagged', () => {
  assert.deepEqual(run(agreement({ rating: 'TV-MA' }), 'roku').deny, []);
  assert.ok(run(agreement({ rating: 'TV-MA' }), 'samsung').deny.includes('rating-exceeds-platform'));
  assert.ok(run(agreement({ rating: 'TV-14' }), 'firetv').deny.includes('rating-exceeds-platform'), 'no store rating chosen yet');
  assert.deepEqual(run(agreement({ rating: 'TV-MA' }), 'ios').deny, [], 'Apple apps are rated 18+');
  assert.deepEqual(run(agreement({ rating: null }), 'appletv').review, [], 'every rating fits an 18+ app');
  assert.ok(run(agreement({ rating: 'X-99' })).deny.includes('rating-unrecognized'));
  assert.ok(run(agreement({ rating: null })).review.includes('rating-unconfirmed'));
});

test('public domain: U.S. only, film status, conflicting labels, and the element review', () => {
  assert.deepEqual(run(pd()).deny, []);
  assert.ok(run(pd({ film: 'unresolved' })).deny.includes('copyright-unresolved'));
  assert.ok(run(pd({ flag: 'CC BY-NC-ND copy' })).deny.includes('conflicting-licence-label'));
  assert.deepEqual(run(pd({ music: 'not-reviewed', sourceCopy: 'unconfirmed' })).deny, ['soundtrack-not-reviewed', 'source-copy-unconfirmed']);
  assert.deepEqual(run(pd({ music: 'not-reviewed', sourceCopy: 'unconfirmed' }), 'samsung', { standard: 'film-only' }).deny, []);
  assert.ok(run(pd(), 'samsung', { territory: CA }).deny.includes('viewer-not-confirmed-in-us'));
});

test('open licences: version must be verified; holds always win', () => {
  const cc = { kind: 'open-licence', territory: 'WORLDWIDE', version: 'unverified', sourceCopy: 'unconfirmed', rating: null };
  assert.ok(run(cc).deny.includes('licence-version-unverified'));
  assert.deepEqual(run({ ...cc, version: 'verified' }).deny, []);
  assert.ok(run(agreement(), 'samsung', {}, v('t', { samsungHold: true, muxSignedPlaybackId: SIGNED })).deny.includes('samsung-hold'));
  assert.deepEqual(run(agreement(), 'roku', {}, v('t', { samsungHold: true })).deny, [], 'a Samsung hold does not affect Roku');
  const held = evaluate(v('p532d2Aqpb3bC2rvYkQw'), 'roku', { now: NOW, territory: US, rights: { p532d2Aqpb3bC2rvYkQw: agreement() } });
  assert.ok(held.deny.includes('rights-hold'));
});

test('the registry is complete and well formed for every connected-TV title on record', () => {
  const ids = Object.keys(registry);
  assert.equal(ids.length, 40);
  for (const [id, entry] of Object.entries(registry)) {
    assert.ok(['agreement', 'public-domain', 'open-licence'].includes(entry.kind), id);
    assert.ok(['WORLDWIDE', 'US'].includes(entry.territory), id);
    if (entry.kind === 'agreement') assert.match(entry.signed, /^\d{4}-\d{2}-\d{2}$/, id);
  }
  // Facts verified 2026-11-23.
  assert.equal(registry['creator_89303465-51e3-46bb-bd21-ff5ed2db2c49'].signer, 'unconfirmed', 'Dead Air');
  assert.equal(registry['creator_613e215e-709f-48ee-91bb-b225d8da4a33'].territory, 'US', 'The Thirst');
  assert.equal(registry['creator_08283e5a-f35c-402e-9639-50e1711a5d67'].rating, 'TV-MA', 'You Did Me Dirty');
});

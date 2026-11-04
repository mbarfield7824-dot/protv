const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { CreatorSeriesPromotionService, validateSeriesPromotionRequest, trailerSource } = require('../src/integrations/creatorSeriesPromotion');
const { validateCreatorActionRequest } = require('../src/integrations/creatorPublishingService');
const { seriesDetails, titleDetails } = require('../src/catalog/details');
const { eligibleForPlatform } = require('../src/catalog/platformEligibility');
const { createCatalogRouter } = require('../src/catalog/router');
const { seriesKey } = require('../src/catalog/readModel');

// Synthetic fixtures only; nothing here reaches Firestore or Mux.
const ORIGIN = 'https://creators.example';
const SECRET = 'synthetic-publishing-secret';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const TRAILER = '33333333-3333-4333-8333-333333333333';
const POSTER = '44444444-4444-4444-8444-444444444444';

function signed(path, assetId, kind) {
  const expires = Date.now() + 3_600_000;
  const signature = crypto.createHmac('sha256', SECRET).update(`${PROJECT}:${assetId}:${kind}:${expires}`).digest('hex');
  return `${ORIGIN}${path}?expires=${expires}&signature=${signature}`;
}

function payload(overrides = {}) {
  const trailer = overrides.trailerId || TRAILER;
  const action = overrides.action || 'series_promotion';
  return {
    action, requestId: `${action}:${PROJECT}`, timestamp: Date.now(),
    project: {
      id: PROJECT, title: 'Synthetic Show', synopsis: 'A synthetic synopsis.', genre: 'Drama', contentType: 'Series',
      ownership: { status: 'verified', copyrightHolderName: 'Synthetic Holder' },
      contract: { status: 'signed', signedAt: '2026-10-01T00:00:00.000Z', revokedAt: null, reference: 'synthetic-envelope', seriesSubmissionId: PROJECT, contentType: 'Series' },
      contractApproval: 'approved', ...overrides.project,
    },
    approval: { actorId: ADMIN, role: 'admin', approvedAt: '2026-11-04T12:00:00.000Z', trailerAssetId: trailer, rightsConfirmation: 'PRIVATE CLAUSE NOTE', ...overrides.approval },
    trailer: { assetId: trailer, mimeType: 'video/mp4', bytes: 1000, sourceUrl: signed(`/api/integrations/protv/promotional-video/${PROJECT}/${trailer}`, trailer, 'trailer') },
    poster: overrides.poster === null ? null : { assetId: POSTER, mimeType: 'image/jpeg', bytes: 500, sourceUrl: signed(`/api/integrations/protv/promotional/${PROJECT}/${POSTER}`, POSTER, 'poster') },
    schedule: { premiereAt: null, weekday: null, localTime: null, timeZone: 'America/New_York', ...overrides.schedule },
  };
}

function harness(seed = []) {
  const records = new Map(seed.map(record => [record.id, { ...record }]));
  const mux = { created: [], deleted: [], status: 'preparing' };
  const dependencies = {
    getAllVideos: async () => [...records.values()].map(record => ({ ...record })),
    transactSeries: async (id, mutate) => {
      const current = records.has(id) ? { ...records.get(id), id } : null;
      const { write, result } = mutate(current);
      if (write) records.set(id, { ...write, id });
      return result;
    },
    createAssetFromUrl: async (url, options) => {
      mux.created.push({ url, options });
      return { id: `asset-${mux.created.length}` };
    },
    getAsset: async id => ({ id, status: mux.status, duration: 61, playback_ids: [{ id: `signed-${id}`, policy: 'signed' }] }),
    getPlaybackId: (asset, policy) => asset.playback_ids.find(item => item.policy === policy)?.id || null,
    deleteAsset: async id => { mux.deleted.push(id); },
    transferPoster: async () => 'https://watchprotv.com/api/posters/creator-synthetic.jpg',
    logAdminEvent: async () => {},
  };
  const service = new CreatorSeriesPromotionService({ creatorAgentOrigin: ORIGIN, publishingSecret: SECRET, dependencies });
  return { records, mux, service, all: () => [...records.values()] };
}

const heldEpisode = {
  id: 'creator_episode_e1', contentType: 'EPISODE', title: 'Pilot', seriesTitle: 'Synthetic Show', seasonNumber: 1, episodeNumber: 1,
  creatorProjectId: PROJECT, seriesId: PROJECT, status: 'held', approvalStatus: 'draft', releaseStatus: 'held', muxPlaybackId: null,
  muxAssetId: 'private-episode-asset',
};

test('validation requires a signed series agreement and Administrator approval of the exact trailer', () => {
  assert.doesNotThrow(() => validateSeriesPromotionRequest(payload()));
  assert.throws(() => validateSeriesPromotionRequest(payload({ project: { contract: { ...payload().project.contract, status: 'expired' } } })), /signed series agreement/);
  assert.throws(() => validateSeriesPromotionRequest(payload({ project: { contract: { ...payload().project.contract, revokedAt: '2026-11-01T00:00:00.000Z' } } })), /signed series agreement/);
  assert.throws(() => validateSeriesPromotionRequest(payload({ project: { ownership: { status: 'pending', copyrightHolderName: 'x' } } })), /Verified ownership/);
  assert.throws(() => validateSeriesPromotionRequest(payload({ approval: { trailerAssetId: POSTER } })), /exact trailer/);
  assert.throws(() => validateSeriesPromotionRequest(payload({ approval: { role: 'creator' } })), /Administrator/);
  assert.throws(() => validateSeriesPromotionRequest(payload({ schedule: { weekday: 'Someday' } })), /schedule/);
  // Withdrawal still works after the agreement is revoked.
  assert.doesNotThrow(() => validateSeriesPromotionRequest(payload({ action: 'series_promotion_withdraw', project: { contract: { status: 'revoked' } } })));
});

test('the signed bridge accepts the new action through the existing HMAC check', () => {
  const body = JSON.stringify(payload());
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  assert.equal(validateCreatorActionRequest(body, signature, SECRET).action, 'series_promotion');
  assert.throws(() => validateCreatorActionRequest(body, '0'.repeat(64), SECRET), /signature/i);
});

test('the trailer link must be the signed Creator Portal link for the approved asset', () => {
  const trailer = payload().trailer;
  assert.ok(trailerSource(PROJECT, trailer, ORIGIN, SECRET).startsWith(ORIGIN));
  assert.throws(() => trailerSource(PROJECT, { ...trailer, sourceUrl: trailer.sourceUrl.replace(ORIGIN, 'https://evil.example') }, ORIGIN, SECRET), /match/);
  assert.throws(() => trailerSource(PROJECT, { ...trailer, sourceUrl: trailer.sourceUrl.replace('signature=', 'signature=0') }, ORIGIN, SECRET), /signature/);
  assert.throws(() => trailerSource(PROJECT, { ...trailer, assetId: POSTER }, ORIGIN, SECRET), /match/);
});

test('creates one show record, sends the trailer to Mux once with signed playback, and reuses it afterwards', async () => {
  const { records, mux, service, all } = harness([heldEpisode]);
  const first = await service.execute(payload());
  assert.equal(first.externalId, `creator_series_${PROJECT}`);
  assert.equal(first.status, 'processing');
  assert.equal(mux.created.length, 1);
  assert.deepEqual(mux.created[0].options, { playbackPolicy: 'signed' });
  assert.match(mux.created[0].url, new RegExp(`/promotional-video/${PROJECT}/${TRAILER}`));
  const show = records.get(first.externalId);
  assert.equal(show.contentType, 'SERIES');
  assert.equal(show.approvalStatus, 'approved');
  assert.equal(show.posterUrl, 'https://watchprotv.com/api/posters/creator-synthetic.jpg');
  assert.equal(show.rokuCleared, undefined);
  assert.equal(show.firetvCleared, undefined);

  // Coming Soon is public while the trailer processes, with no trailer button and no assumed date.
  let [detail] = seriesDetails(all());
  assert.equal(detail.title, 'Synthetic Show');
  assert.equal(detail.comingSoon, true);
  assert.equal(detail.episodeCount, 0);
  assert.equal(detail.trailerAvailable, undefined);
  assert.equal(detail.premiereAt, undefined);
  assert.equal(detail.airingSchedule, undefined);
  assert.doesNotMatch(JSON.stringify(detail), /PRIVATE CLAUSE|synthetic-envelope|Synthetic Holder|private-episode-asset/);

  mux.status = 'ready';
  const second = await service.execute(payload());
  assert.equal(second.status, 'published');
  assert.equal(second.trailerReady, true);
  assert.equal(mux.created.length, 1, 'a later sync reuses the existing Mux asset');
  [detail] = seriesDetails(all());
  assert.equal(detail.trailerAvailable, true);
  assert.equal(detail.trailerTitleId, first.externalId);
  assert.equal([...records.values()].filter(record => record.contentType === 'SERIES').length, 1);
});

test('Watch Trailer plays through the public catalog while unreleased episodes stay unavailable', async t => {
  const { mux, service, all } = harness([heldEpisode]);
  mux.status = 'ready';
  await service.execute(payload());
  await service.execute(payload());
  const app = express();
  app.use(createCatalogRouter({ loadApproved: async () => all().filter(record => record.approvalStatus === 'approved'), signPlaybackToken: async id => `token-${id}` }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const trailer = await (await fetch(`${base}/titles/creator_series_${PROJECT}/trailer/playback`)).json();
  assert.equal(trailer.muxPlaybackId, 'signed-asset-1');
  assert.equal(trailer.playbackToken, 'token-signed-asset-1');
  const shows = await (await fetch(`${base}/series-details`)).json();
  assert.equal(shows.items[0].episodes.length, 0);
  for (const path of ['details', 'playback', 'trailer/playback']) {
    assert.equal((await fetch(`${base}/titles/creator_episode_e1/${path}`)).status, 404);
  }
  assert.equal((await fetch(`${base}/titles/creator_episode_e1`)).status, 404);
  assert.equal(titleDetails(heldEpisode, all()), null);
});

test('only confirmed premiere facts are shown, and only while upcoming', async () => {
  const { service, all } = harness();
  await service.execute(payload({ schedule: { premiereAt: '2099-11-10T01:00:00.000Z', weekday: 'Tuesday', localTime: '20:00' } }));
  let [detail] = seriesDetails(all());
  assert.equal(detail.premiereAt, '2099-11-10T01:00:00.000Z');
  assert.deepEqual(detail.airingSchedule, { weekday: 'Tuesday', time: '20:00', timeZone: 'America/New_York' });
  await service.execute(payload({ schedule: { premiereAt: '2020-01-01T01:00:00.000Z', weekday: 'Tuesday', localTime: '20:00' } }));
  [detail] = seriesDetails(all());
  assert.equal(detail.premiereAt, undefined);
});

const snapshot = (records) => JSON.stringify([...records.entries()]);

test('an existing show record with the same title is never claimed by title alone', async () => {
  const manual = {
    id: 'manual-show', contentType: 'SERIES', title: 'synthetic  show', seriesTitle: 'synthetic  show', status: 'ready', approvalStatus: 'approved',
    rightsHolder: 'Manual Holder', trailerStatus: 'ready', trailerPlaybackId: 'admin-trailer', trailerAssetId: 'admin-asset',
  };
  const { records, mux, service } = harness([manual]);
  assert.equal(seriesKey(manual.title), seriesKey('Synthetic Show'));
  const before = snapshot(records);
  await assert.rejects(service.execute(payload()), /without a link to this creator series/);
  assert.equal(snapshot(records), before, 'the existing record and its ownership are unchanged');
  assert.equal(mux.created.length, 0);
});

test('a manual or legacy episode using the title also blocks the request', async () => {
  const legacy = { id: 'legacy-ep', contentType: 'EPISODE', title: 'Old', seriesTitle: 'SYNTHETIC SHOW', seasonNumber: 1, episodeNumber: 1, approvalStatus: 'approved' };
  const { records, mux, service } = harness([legacy]);
  await assert.rejects(service.execute(payload()), /without a link/);
  assert.equal(records.size, 1);
  assert.equal(mux.created.length, 0);
});

test('a record squatting on the reserved ID without the project link is not overwritten', async () => {
  const squatter = { id: `creator_series_${PROJECT}`, contentType: 'SERIES', title: 'Unrelated', seriesTitle: 'Unrelated', approvalStatus: 'draft' };
  const { records, service } = harness([squatter]);
  const before = snapshot(records);
  await assert.rejects(service.execute(payload()), /belongs to something else/);
  assert.equal(snapshot(records), before);
});

test('two show records claiming the same creator series are ambiguous and refused', async () => {
  const a = { id: `creator_series_${PROJECT}`, contentType: 'SERIES', title: 'Synthetic Show', seriesTitle: 'Synthetic Show', creatorProjectId: PROJECT };
  const b = { id: 'copy-show', contentType: 'SERIES', title: 'Copy', seriesTitle: 'Copy', creatorProjectId: PROJECT };
  const { records, service } = harness([a, b]);
  const before = snapshot(records);
  await assert.rejects(service.execute(payload()), /More than one/);
  assert.equal(snapshot(records), before);
});

test('the transaction refuses a record that lost its project link between read and write', async () => {
  const { records, service } = harness();
  await service.execute(payload());
  const id = `creator_series_${PROJECT}`;
  const original = service.dependencies.getAllVideos;
  service.dependencies.getAllVideos = async () => {
    const all = await original();
    records.set(id, { ...records.get(id), creatorProjectId: 'someone-else' });
    return all;
  };
  await assert.rejects(service.execute(payload()), /not linked to this creator series/);
  assert.equal(records.get(id).creatorProjectId, 'someone-else');
});

test('refuses a title that belongs to a different creator series', async () => {
  const other = { ...heldEpisode, id: 'creator_episode_other', creatorProjectId: '99999999-9999-4999-8999-999999999999', seriesId: '99999999-9999-4999-8999-999999999999' };
  const { records, service } = harness([other]);
  await assert.rejects(service.execute(payload()), /without a link/);
  assert.equal(records.size, 1);
});

test('a re-approved replacement trailer hides the old one at once and retires its asset', async () => {
  const { records, mux, service } = harness();
  mux.status = 'ready';
  await service.execute(payload());
  await service.execute(payload());
  assert.equal(records.get(`creator_series_${PROJECT}`).trailerPlaybackId, 'signed-asset-1');
  mux.status = 'preparing';
  const replacement = '55555555-5555-4555-8555-555555555555';
  await service.execute(payload({ trailerId: replacement }));
  const show = records.get(`creator_series_${PROJECT}`);
  assert.equal(mux.created.length, 2);
  assert.equal(show.trailerAssetId, 'asset-2');
  assert.equal(show.trailerPlaybackId, null);
  assert.equal(show.creatorTrailerAssetId, replacement);
  assert.deepEqual(mux.deleted, ['asset-1']);
});

test('withdrawing hides the page and trailer but keeps the Mux asset for a later approval', async () => {
  const { records, mux, service, all } = harness();
  mux.status = 'ready';
  await service.execute(payload());
  await service.execute(payload());
  const result = await service.execute(payload({ action: 'series_promotion_withdraw' }));
  assert.equal(result.status, 'withdrawn');
  assert.equal(seriesDetails(all()).length, 0);
  assert.deepEqual(mux.deleted, []);
  await service.execute(payload());
  assert.equal(mux.created.length, 1, 're-approval reuses the processed trailer');
  assert.equal(records.get(`creator_series_${PROJECT}`).approvalStatus, 'approved');
});

test('Roku and Fire TV catalogs do not receive the show record', async () => {
  const { service, all } = harness();
  await service.execute(payload());
  assert.equal(eligibleForPlatform(all(), 'roku').length, 0);
  assert.equal(eligibleForPlatform(all(), 'firetv').length, 0);
  assert.equal(eligibleForPlatform(all(), 'default').length, 1);
});

test('a forged or expired trailer link is rejected before anything is written', async () => {
  const { records, mux, service } = harness();
  const bad = payload();
  bad.trailer.sourceUrl = bad.trailer.sourceUrl.replace(/expires=\d+/, 'expires=1000000000000');
  await assert.rejects(service.execute(bad), /expired|signature/);
  assert.equal(records.size, 0);
  assert.equal(mux.created.length, 0);
});

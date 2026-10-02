import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPodcastReconciler, episodeActions, episodeAfterShowSave, episodeForm, episodePayload,
  isPodcast, mergeEpisodeStatus, recoverPodcastConflict, showForm, showPayload,
} from '../src/admin/podcastAdmin.js';

const shows = [
  { id: 'stable-show-1', title: 'Old Title', contentType: 'PODCAST_SHOW', approvalStatus: 'draft' },
  { id: 'stable-show-2', title: 'Old Title', contentType: 'PODCAST_SHOW', approvalStatus: 'approved' },
];

test('Show payload preserves editable metadata but never sends ID or approval', () => {
  const form = showForm({ ...shows[0], description: 'About', genres: ['Culture', 'Music'] });
  form.title = 'Renamed Show';
  form.genres = ' Culture, Music, Culture, ';
  assert.deepEqual(showPayload(form), {
    title: 'Renamed Show', description: 'About', artworkUrl: '', host: '',
    creator: '', category: '', genres: ['Culture', 'Music'],
  });
  assert.equal(shows[0].id, 'stable-show-1');
});

test('Episode selects stable parent ID, validates positive integer, and preserves rights', () => {
  const form = episodeForm(null, shows[1].id);
  Object.assign(form, {
    title: ' Pilot ', episodeNumber: '3', rightsHolder: ' Producer ',
    rightsVerificationNotes: ' Documentation pending ',
  });
  assert.deepEqual(episodePayload(form, shows), {
    title: 'Pilot', description: '', thumbnailUrl: '', posterUrl: '',
    category: '', genres: [], podcastShowId: 'stable-show-2', episodeNumber: 3,
    rightsHolder: 'Producer', rightsVerificationNotes: 'Documentation pending',
  });
  assert.throws(() => episodePayload({ ...form, podcastShowId: 'Old Title' }, shows), /existing Podcast Show/);
  for (const episodeNumber of ['0', '1.5', '-2', 'abc', '9007199254740992']) {
    assert.throws(() => episodePayload({ ...form, episodeNumber }, shows), /positive whole/);
  }
});

test('Sanitized status preserves private and approval metadata and rejects unrelated responses', () => {
  const episode = {
    id: 'episode-1', contentType: 'PODCAST_EPISODE', podcastShowId: shows[0].id,
    approvalStatus: 'draft', rightsHolder: 'Producer', rightsVerificationNotes: 'Private',
    muxPlaybackId: null, duration: 0, status: 'processing',
  };
  const merged = mergeEpisodeStatus(episode, {
    id: 'episode-1', contentType: 'PODCAST_EPISODE', status: 'ready',
    muxPlaybackId: 'mux-id', duration: 120, rightsHolder: '',
    approvalStatus: 'approved',
  });
  assert.equal(merged.rightsHolder, 'Producer');
  assert.equal(merged.rightsVerificationNotes, 'Private');
  assert.equal(merged.approvalStatus, 'draft');
  assert.equal(merged.muxPlaybackId, 'mux-id');
  assert.deepEqual(episodeForm(merged), episodeForm(episode));
  assert.equal(mergeEpisodeStatus(merged, {
    id: 'episode-1', contentType: 'PODCAST_EPISODE', status: 'processing',
  }).rightsHolder, 'Producer');
  assert.throws(() => mergeEpisodeStatus(episode, { id: 'other', contentType: 'PODCAST_EPISODE' }), /Unexpected/);
  assert.equal(isPodcast(shows[0]), true);
  assert.equal(isPodcast(episode), true);
  assert.equal(isPodcast({ contentType: 'MUSIC' }), false);
});

test('accepted creation survives a failed refresh and reconciles by ID without another create', async () => {
  const reconciler = createPodcastReconciler();
  const showDraft = showForm();
  showDraft.title = 'Unsaved elsewhere';
  let creates = 0;
  const createdShow = async () => { creates += 1; return { id: 'stable-show-7', contentType: 'PODCAST_SHOW' }; };
  const response = await createdShow();
  reconciler.accept('PODCAST_SHOW', response);
  const failedRefresh = async () => { throw new Error('Catalog offline'); };
  await assert.rejects(failedRefresh(), /offline/);
  assert.equal(reconciler.idFor('PODCAST_SHOW', ''), 'stable-show-7');
  assert.equal(showDraft.title, 'Unsaved elsewhere');
  assert.throws(() => reconciler.reconcile([]), /stable-show-7/);
  assert.equal(reconciler.idFor('PODCAST_SHOW', ''), 'stable-show-7');
  const records = [{ id: 'stable-show-7', contentType: 'PODCAST_SHOW', title: 'Unsaved elsewhere', genres: [] }];
  assert.equal(reconciler.reconcile(records).PODCAST_SHOW.id, response.id);
  assert.equal(creates, 1);
  assert.equal(reconciler.idFor('PODCAST_SHOW', records[0].id), response.id);

  const episodeDraft = episodeForm(null, response.id);
  episodeDraft.title = 'Pilot';
  episodeDraft.rightsHolder = 'Creator';
  reconciler.accept('PODCAST_EPISODE', { id: 'episode-2' });
  assert.equal(reconciler.idFor('PODCAST_EPISODE', ''), 'episode-2');
  assert.equal(episodeDraft.title, 'Pilot');
  assert.equal(reconciler.reconcile([{ id: 'episode-2', contentType: 'PODCAST_EPISODE' }]).PODCAST_EPISODE.id, 'episode-2');
});

test('Show save cannot replace a selected Episode parent or its entered fields', () => {
  const draft = { ...episodeForm(null, 'stable-show-2'), title: 'Work in progress', rightsHolder: 'Owner' };
  assert.equal(episodeAfterShowSave(draft, 'stable-show-1'), draft);
  assert.equal(draft.podcastShowId, 'stable-show-2');
  assert.equal(draft.title, 'Work in progress');
  assert.equal(episodeAfterShowSave(episodeForm(), 'stable-show-1').podcastShowId, 'stable-show-1');
});

test('failed metadata save leaves entered Show and Episode fields intact for retry', async () => {
  const show = { ...showForm(shows[0]), title: 'New title', description: 'Work in progress' };
  const episode = { ...episodeForm(null, 'stable-show-2'), title: 'Pilot', rightsHolder: 'Owner' };
  const beforeShow = structuredClone(show);
  const beforeEpisode = structuredClone(episode);
  const failSave = async () => { throw new Error('Backend rejected metadata'); };
  await assert.rejects(failSave(showPayload(show)), /rejected/);
  await assert.rejects(failSave(episodePayload({
    ...episode, episodeNumber: '1', rightsVerificationNotes: 'Review pending',
  }, shows)), /rejected/);
  assert.deepEqual(show, beforeShow);
  assert.deepEqual(episode, beforeEpisode);
});

test('processing recovery preserves private fields and gates ingestion/approval by saved state', () => {
  const processing = {
    id: 'episode-2', contentType: 'PODCAST_EPISODE', status: 'processing',
    approvalStatus: 'draft', podcastShowId: 'stable-show-2',
    muxUploadId: 'upload-1', rightsHolder: 'Owner', rightsVerificationNotes: 'Private',
  };
  assert.deepEqual(episodeActions(processing), { canIngest: false, canApprove: false });
  const ready = mergeEpisodeStatus(processing, {
    id: 'episode-2', contentType: 'PODCAST_EPISODE', status: 'ready', muxPlaybackId: 'playback-1',
    rightsHolder: '', approvalStatus: 'approved',
  });
  assert.equal(ready.rightsHolder, 'Owner');
  assert.equal(ready.approvalStatus, 'draft');
  assert.deepEqual(episodeActions(ready), { canIngest: true, canApprove: true });
  const assetReady = { ...ready, muxAssetId: 'asset-1' };
  assert.deepEqual(episodeActions(assetReady), { canIngest: false, canApprove: true });
  assert.deepEqual(episodeActions({ ...assetReady, status: 'errored' }), { canIngest: true, canApprove: false });
});

test('conflict recovery distinguishes a refreshed catalog from a failed refresh', async () => {
  const conflict = Object.assign(new Error('Attempt changed.'), { status: 409 });
  let attempts = 0;
  const failed = await recoverPodcastConflict(conflict, async () => {
    attempts += 1;
    throw new Error('Admin catalog unavailable');
  });
  assert.equal(failed.stale, true);
  assert.match(failed.message, /refresh failed.*Admin catalog unavailable/i);
  assert.doesNotMatch(failed.message, /Catalog refreshed/);
  const recovered = await recoverPodcastConflict(conflict, async () => { attempts += 1; });
  assert.equal(recovered.stale, false);
  assert.match(recovered.message, /Catalog refreshed/);
  assert.equal(attempts, 2);
});

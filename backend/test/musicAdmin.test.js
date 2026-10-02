const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

test('Music Admin routes validate, persist, classify and retain rights without changing movie or episode writes', async (context) => {
  const firebase = require('../src/firebase');
  const mux = require('../src/mux');
  const auth = require('../src/middleware/auth');
  const omdb = require('../src/omdb');
  const records = new Map([
    ['existing-music', {
      id: 'existing-music',
      title: 'Existing Music',
      contentType: 'MUSIC',
      musicFormat: 'music_video',
      category: 'Music',
      subgenre: 'Jazz',
      genres: ['Jazz'],
      categories: ['Music', 'Arts'],
      rightsHolder: 'Artist',
      rightsVerificationNotes: 'License documented',
      approvalStatus: 'draft',
      status: 'ready',
      muxPlaybackId: 'existing-playback',
      seriesTitle: 'stale-series',
      seasonNumber: 4,
      episodeNumber: 5,
      episodeTitle: 'stale episode',
    }],
    ['existing-movie', {
      id: 'existing-movie',
      title: 'Legacy Music Category',
      contentType: 'MOVIE',
      category: 'Music',
      status: 'ready',
      approvalStatus: 'approved',
      approvedAt: 'previous-approval',
      approvedBy: 'previous-admin',
      approvalNotes: 'Previously approved movie',
      muxPlaybackId: 'movie-playback',
    }],
    ['legacy-music-category', {
      id: 'legacy-music-category',
      title: 'Legacy Music category only',
      category: 'Music',
      approvalStatus: 'approved',
      status: 'ready',
      muxPlaybackId: 'legacy-playback',
    }],
    ['invalid-music', {
      id: 'invalid-music',
      title: 'Incomplete Music record',
      contentType: 'MUSIC',
      approvalStatus: 'draft',
      status: 'ready',
      muxPlaybackId: 'invalid-playback',
      rightsHolder: 'Artist',
      rightsVerificationNotes: 'Rights documented',
    }],
    ['approved-music-movie-transition', {
      id: 'approved-music-movie-transition',
      title: 'Approved Music to Movie',
      contentType: 'MUSIC',
      musicFormat: 'music_video',
      rightsHolder: 'Artist',
      rightsVerificationNotes: 'License verified',
      approvalStatus: 'approved',
      approvedAt: 'approved-time',
      approvedBy: 'approver',
      approvalNotes: 'approved notes',
    }],
    ['approved-music-episode-transition', {
      id: 'approved-music-episode-transition',
      title: 'Approved Music to Episode',
      contentType: 'MUSIC',
      musicFormat: 'music_video',
      rightsHolder: 'Artist',
      rightsVerificationNotes: 'License verified',
      approvalStatus: 'approved',
      approvedAt: 'approved-time',
      approvedBy: 'approver',
      approvalNotes: 'approved notes',
    }],
    ['approved-movie-music-transition', {
      id: 'approved-movie-music-transition',
      title: 'Approved Movie to Music',
      contentType: 'MOVIE',
      approvalStatus: 'approved',
      approvedAt: 'approved-time',
      approvedBy: 'approver',
      approvalNotes: 'approved notes',
    }],
    ...['format', 'rights-holder', 'rights-notes', 'unchanged', 'unrelated'].map((caseName) => [
      `approved-music-${caseName}`,
      {
        id: `approved-music-${caseName}`,
        title: `Approved Music ${caseName}`,
        contentType: 'MUSIC',
        musicFormat: 'music_video',
        rightsHolder: 'Artist',
        rightsVerificationNotes: 'License verified',
        approvalStatus: 'approved',
        approvedAt: 'approved-time',
        approvedBy: 'approver',
        approvalNotes: 'approved notes',
      },
    ]),
  ]);
  const writes = [];
  const muxCalls = [];

  context.mock.method(auth, 'verifyAdmin', (req, res, next) => {
    req.user = { uid: 'test-admin' };
    next();
  });
  context.mock.method(firebase, 'addVideo', async (data) => {
    const id = `created-${records.size}`;
    records.set(id, { id, ...data });
    writes.push({ kind: 'create', id, data });
    return id;
  });
  context.mock.method(firebase, 'updateVideo', async (id, changes) => {
    writes.push({ kind: 'update', id, changes });
    records.set(id, { ...records.get(id), ...changes });
  });
  context.mock.method(firebase, 'updateVideoApproval', async (id, changes) => {
    writes.push({ kind: 'approval', id, changes });
    records.set(id, { ...records.get(id), ...changes });
  });
  context.mock.method(firebase, 'getVideoById', async (id) => {
    const video = records.get(id);
    if (!video) throw new Error('Video not found');
    return { ...video };
  });
  context.mock.method(firebase, 'getAllVideosAdmin', async () => [...records.values()].map((record) => ({ ...record })));
  context.mock.method(mux, 'createDirectUpload', async () => {
    muxCalls.push('upload');
    return { id: 'mux-upload', url: 'https://mux.example/upload' };
  });
  context.mock.method(mux, 'createAssetFromUrl', async () => {
    muxCalls.push('asset');
    return { id: 'mux-asset' };
  });
  context.mock.method(mux, 'getUpload', async () => ({ asset_id: 'ready-asset' }));
  context.mock.method(mux, 'getAsset', async () => ({
    id: 'ready-asset',
    status: 'ready',
    duration: 123.4,
    playback_ids: [{ policy: 'public', id: 'ready-playback' }],
  }));
  context.mock.method(omdb, 'getImdbRating', async () => null);

  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const app = express();
  app.use(express.json());
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    delete require.cache[routePath];
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/videos`;

  async function request(path, method, data) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }

  const musicMetadata = {
    title: 'Music Documentary',
    description: 'Rights-cleared documentary programming',
    category: 'Music',
    subgenre: 'Jazz',
    contentType: 'MUSIC',
    musicFormat: 'music_documentary',
    rightsHolder: 'Artist Estate',
    rightsVerificationNotes: 'Written license recorded by Admin',
  };

  const adminCatalogResponse = await request('/admin/all', 'GET');
  assert.equal(adminCatalogResponse.status, 200);
  const adminMusic = adminCatalogResponse.body.find((record) => record.id === 'existing-music');
  assert.equal(adminMusic.rightsHolder, 'Artist');
  assert.equal(adminMusic.rightsVerificationNotes, 'License documented');

  const invalidFormat = await request('/upload-url', 'POST', {
    ...musicMetadata,
    musicFormat: 'podcast',
  });
  assert.equal(invalidFormat.status, 400);
  assert.equal(muxCalls.length, 0);
  assert.equal(writes.length, 0);

  const missingFormat = await request('/upload-url', 'POST', {
    ...musicMetadata,
    musicFormat: undefined,
  });
  assert.equal(missingFormat.status, 400);
  assert.equal(muxCalls.length, 0);
  assert.equal(writes.length, 0);

  const missingRights = await request('/from-url', 'POST', {
    ...musicMetadata,
    sourceUrl: 'https://media.example/music.mp4',
    rightsHolder: '',
  });
  assert.equal(missingRights.status, 400);
  assert.equal(muxCalls.length, 0, 'rights validation runs before Mux ingestion');

  const upload = await request('/upload-url', 'POST', musicMetadata);
  assert.equal(upload.status, 201);
  const uploaded = records.get(upload.body.videoId);
  assert.equal(uploaded.contentType, 'MUSIC');
  assert.equal(uploaded.musicFormat, 'music_documentary');
  assert.equal(uploaded.approvalStatus, 'draft');
  assert.equal(uploaded.status, 'processing');
  assert.equal(uploaded.rightsHolder, 'Artist Estate');
  assert.equal(uploaded.rightsVerificationNotes, 'Written license recorded by Admin');
  assert.deepEqual(uploaded.genres, ['Documentary']);
  assert.equal(uploaded.category, 'Music');
  assert.equal(uploaded.subgenre, 'Jazz');
  assert.equal(muxCalls.at(-1), 'upload');

  const urlIngest = await request('/from-url', 'POST', {
    ...musicMetadata,
    title: 'Music Video',
    musicFormat: 'music_video',
    sourceUrl: 'https://media.example/music.mp4',
  });
  assert.equal(urlIngest.status, 201);
  const ingested = records.get(urlIngest.body.videoId);
  assert.equal(ingested.contentType, 'MUSIC');
  assert.equal(ingested.musicFormat, 'music_video');
  assert.equal(ingested.approvalStatus, 'draft');
  assert.equal(ingested.muxAssetId, 'mux-asset');

  const documentary = await request('/', 'POST', {
    title: 'Manual Music Documentary',
    videoUrl: 'https://media.example/manual.mp4',
    genre: 'Music',
    subgenre: 'Jazz',
    contentType: 'MUSIC',
    musicFormat: 'music_documentary',
    rightsHolder: 'Manual Rights Holder',
    rightsVerificationNotes: 'Manual rights evidence',
    approvalStatus: 'approved',
  });
  assert.equal(documentary.status, 201);
  const manuallyCreated = records.get(documentary.body.videoId);
  assert.equal(manuallyCreated.contentType, 'MUSIC');
  assert.equal(manuallyCreated.musicFormat, 'music_documentary');
  assert.equal(manuallyCreated.approvalStatus, 'draft', 'Music creation cannot request automatic approval');
  assert.deepEqual(manuallyCreated.genres, ['Documentary']);
  assert.equal(manuallyCreated.category, 'Music');

  const approvalCount = writes.length;
  const invalidApproval = await request('/admin/invalid-music/approve', 'PATCH', {});
  assert.equal(invalidApproval.status, 400);
  assert.equal(writes.length, approvalCount, 'incomplete Music cannot pass Admin publication review');
  const validApproval = await request(`/admin/${uploaded.id}/approve`, 'PATCH', {
    approvalNotes: 'Music rights and format reviewed.',
  });
  assert.equal(validApproval.status, 200);
  assert.equal(records.get(uploaded.id).approvalStatus, 'approved');

  const beforeInvalidPatch = writes.length;
  const invalidPatch = await request('/existing-music', 'PATCH', {
    contentType: 'MUSIC',
    musicFormat: 'invalid',
    title: 'Invalid transition',
    rightsHolder: 'Artist',
    rightsVerificationNotes: 'Documented',
  });
  assert.equal(invalidPatch.status, 400);
  assert.equal(writes.length, beforeInvalidPatch);

  const missingFormatTransition = await request('/existing-movie', 'PATCH', {
    contentType: 'MUSIC',
    title: 'Explicit Music transition',
    rightsHolder: 'Artist',
    rightsVerificationNotes: 'Documented',
  });
  assert.equal(missingFormatTransition.status, 400);
  assert.equal(writes.length, beforeInvalidPatch);

  for (const [field, value] of [
    ['musicFormat', ''],
    ['rightsHolder', '   '],
    ['rightsVerificationNotes', ''],
  ]) {
    const writesBeforeClear = writes.length;
    const rejectedClear = await request('/existing-music', 'PATCH', { [field]: value });
    assert.equal(rejectedClear.status, 400, `${field} cannot be cleared on Music`);
    assert.equal(writes.length, writesBeforeClear, `${field} clear did not persist`);
  }

  const unrelatedEdit = await request('/existing-music', 'PATCH', {
    description: 'Updated description',
  });
  assert.equal(unrelatedEdit.status, 200);
  assert.equal(unrelatedEdit.body.musicFormat, 'music_video');
  assert.equal(records.get('existing-music').musicFormat, 'music_video');

  const approvedUnchanged = await request('/approved-music-unchanged', 'PATCH', {
    musicFormat: 'music_video',
    rightsHolder: ' Artist ',
    rightsVerificationNotes: ' License verified ',
    title: 'Approved Music unchanged',
  });
  assert.equal(approvedUnchanged.status, 200);
  assert.equal(approvedUnchanged.body.approvalStatus, 'approved');
  assert.equal(approvedUnchanged.body.approvedAt, 'approved-time');
  assert.equal(approvedUnchanged.body.approvedBy, 'approver');
  assert.equal(approvedUnchanged.body.approvalNotes, 'approved notes');

  const approvedUnrelatedEdit = await request('/approved-music-unrelated', 'PATCH', {
    description: 'A harmless description edit',
  });
  assert.equal(approvedUnrelatedEdit.status, 200);
  assert.equal(approvedUnrelatedEdit.body.approvalStatus, 'approved');
  assert.equal(approvedUnrelatedEdit.body.approvedAt, 'approved-time');

  for (const [recordId, patch] of [
    ['approved-music-format', { musicFormat: 'live_performance' }],
    ['approved-music-rights-holder', { rightsHolder: 'New Artist' }],
    ['approved-music-rights-notes', { rightsVerificationNotes: 'Updated license evidence' }],
  ]) {
    const reset = await request(`/${recordId}`, 'PATCH', patch);
    assert.equal(reset.status, 200, recordId);
    assert.equal(reset.body.approvalStatus, 'draft', recordId);
    assert.equal(reset.body.approvedAt, null, recordId);
    assert.equal(reset.body.approvedBy, null, recordId);
    assert.equal(reset.body.approvalNotes, '', recordId);
  }

  const musicToMovie = await request('/approved-music-movie-transition', 'PATCH', {
    contentType: 'MOVIE',
    title: 'Approved Music is now a Movie',
  });
  assert.equal(musicToMovie.status, 200);
  assert.equal(musicToMovie.body.approvalStatus, 'draft');
  assert.equal(musicToMovie.body.approvedAt, null);
  assert.equal(musicToMovie.body.approvedBy, null);
  assert.equal(musicToMovie.body.approvalNotes, '');

  const musicToEpisode = await request('/approved-music-episode-transition', 'PATCH', {
    contentType: 'EPISODE',
    seriesTitle: 'Transition Series',
    seasonNumber: 1,
    episodeNumber: 1,
  });
  assert.equal(musicToEpisode.status, 200);
  assert.equal(musicToEpisode.body.approvalStatus, 'draft');
  assert.equal(musicToEpisode.body.approvedAt, null);
  assert.equal(musicToEpisode.body.approvedBy, null);
  assert.equal(musicToEpisode.body.approvalNotes, '');

  const movieToMusic = await request('/approved-movie-music-transition', 'PATCH', {
    contentType: 'MUSIC',
    musicFormat: 'artist_showcase',
    rightsHolder: 'Artist',
    rightsVerificationNotes: 'License verified',
  });
  assert.equal(movieToMusic.status, 200);
  assert.equal(movieToMusic.body.approvalStatus, 'draft');
  assert.equal(movieToMusic.body.approvedAt, null);
  assert.equal(movieToMusic.body.approvedBy, null);
  assert.equal(movieToMusic.body.approvalNotes, '');

  const draftMusicApproveAttempt = await request('/existing-music', 'PATCH', {
    description: 'Attempt to approve through generic patch',
    approvalStatus: 'approved',
    approvedAt: 'forged-time',
    approvedBy: 'forged-admin',
    approvalNotes: 'forged approval',
  });
  assert.equal(draftMusicApproveAttempt.status, 200);
  assert.equal(draftMusicApproveAttempt.body.approvalStatus, 'draft');
  assert.equal(draftMusicApproveAttempt.body.approvedAt, undefined);
  assert.equal(draftMusicApproveAttempt.body.approvedBy, undefined);
  assert.equal(draftMusicApproveAttempt.body.approvalNotes, undefined);

  const documentaryEdit = await request('/existing-music', 'PATCH', {
    musicFormat: 'music_documentary',
    category: 'Music',
  });
  assert.equal(documentaryEdit.status, 200);
  assert.equal(documentaryEdit.body.category, 'Music');
  assert.equal(documentaryEdit.body.musicFormat, 'music_documentary');
  assert.ok(documentaryEdit.body.genres.includes('Jazz'));
  assert.ok(documentaryEdit.body.genres.includes('Documentary'));
  assert.deepEqual(documentaryEdit.body.categories, ['Music', 'Arts']);

  const transitionToMovie = await request('/existing-music', 'PATCH', {
    contentType: 'MOVIE',
    title: 'Now a Movie',
  });
  assert.equal(transitionToMovie.status, 200);
  assert.equal(transitionToMovie.body.contentType, 'MOVIE');
  assert.equal(transitionToMovie.body.musicFormat, null);
  assert.equal(transitionToMovie.body.seriesTitle, '');
  assert.equal(transitionToMovie.body.seasonNumber, null);
  assert.equal(transitionToMovie.body.episodeNumber, null);
  assert.equal(transitionToMovie.body.episodeTitle, '');

  const transitionToEpisode = await request('/existing-music', 'PATCH', {
    contentType: 'EPISODE',
    seriesTitle: 'New Series',
    seasonNumber: 1,
    episodeNumber: 2,
  });
  assert.equal(transitionToEpisode.status, 200);
  assert.equal(transitionToEpisode.body.contentType, 'EPISODE');
  assert.equal(transitionToEpisode.body.musicFormat, null);
  assert.equal(transitionToEpisode.body.seriesTitle, 'New Series');
  assert.equal(transitionToEpisode.body.episodeNumber, 2);

  const transitionToMusic = await request('/existing-movie', 'PATCH', {
    contentType: 'MUSIC',
    musicFormat: 'artist_showcase',
    rightsHolder: 'Artist',
    rightsVerificationNotes: 'Evidence',
  });
  assert.equal(transitionToMusic.status, 200);
  assert.equal(transitionToMusic.body.contentType, 'MUSIC');
  assert.equal(transitionToMusic.body.musicFormat, 'artist_showcase');
  assert.equal(transitionToMusic.body.seriesTitle, '');
  assert.equal(transitionToMusic.body.seasonNumber, null);
  assert.equal(transitionToMusic.body.approvalStatus, 'draft');
  assert.equal(transitionToMusic.body.approvedAt, null);
  assert.equal(transitionToMusic.body.approvedBy, null);
  assert.equal(transitionToMusic.body.approvalNotes, '');

  const legacyCategoryEdit = await request('/legacy-music-category', 'PATCH', { category: 'Music' });
  assert.equal(legacyCategoryEdit.status, 200);
  assert.equal(legacyCategoryEdit.body.contentType, undefined);
  assert.equal(records.get('legacy-music-category').contentType, undefined);

  const movieCreate = await request('/', 'POST', {
    title: 'Existing Movie Flow',
    videoUrl: 'https://media.example/movie.mp4',
    genre: 'Drama',
    rightsHolder: 'Studio',
    rightsVerificationNotes: 'Movie rights documented',
  });
  assert.equal(movieCreate.status, 201);
  assert.equal(records.get(movieCreate.body.videoId).contentType, 'MOVIE');
  assert.equal(records.get(movieCreate.body.videoId).approvalStatus, 'draft');

  const movieUpload = await request('/upload-url', 'POST', {
    title: 'Existing Movie Upload',
    category: 'Drama',
    contentType: 'MOVIE',
  });
  assert.equal(movieUpload.status, 201);
  assert.equal(records.get(movieUpload.body.videoId).contentType, 'MOVIE');
  assert.equal(records.get(movieUpload.body.videoId).approvalStatus, 'approved');

  const episodeUpload = await request('/upload-url', 'POST', {
    title: 'Existing Episode',
    category: 'Drama',
    contentType: 'EPISODE',
    seriesTitle: 'Existing Series',
    seasonNumber: 1,
    episodeNumber: 1,
  });
  assert.equal(episodeUpload.status, 201);
  assert.equal(records.get(episodeUpload.body.videoId).contentType, 'EPISODE');
  assert.equal(records.get(episodeUpload.body.videoId).approvalStatus, 'approved');
});

test('Admin Mux readiness updates preserve Music metadata and draft publication state', async (context) => {
  const firebase = require('../src/firebase');
  const mux = require('../src/mux');
  const auth = require('../src/middleware/auth');
  const omdb = require('../src/omdb');
  const video = {
    id: 'music-processing',
    title: 'Processing Music',
    contentType: 'MUSIC',
    musicFormat: 'live_performance',
    category: 'Music',
    subgenre: 'Jazz',
    genres: ['Jazz'],
    rightsHolder: 'Artist',
    rightsVerificationNotes: 'Rights verified in Admin',
    approvalStatus: 'draft',
    status: 'processing',
    muxUploadId: 'music-upload',
  };
  const updates = [];
  context.mock.method(auth, 'verifyAdmin', (req, res, next) => {
    req.user = { uid: 'test-admin' };
    next();
  });
  context.mock.method(firebase, 'getVideoById', async () => ({ ...video }));
  context.mock.method(firebase, 'updateVideo', async (id, changes) => {
    updates.push({ id, changes });
    Object.assign(video, changes);
  });
  context.mock.method(mux, 'getUpload', async () => ({ asset_id: 'music-asset' }));
  context.mock.method(mux, 'getAsset', async () => ({
    id: 'music-asset',
    status: 'ready',
    duration: 88,
    playback_ids: [{ policy: 'public', id: 'music-playback' }],
  }));
  context.mock.method(omdb, 'getImdbRating', async () => ({ imdbRating: 0 }));

  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const app = express();
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    delete require.cache[routePath];
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/videos/music-processing/status`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ready');
  assert.equal(body.muxPlaybackId, 'music-playback');
  assert.equal(body.musicFormat, 'live_performance');
  assert.equal(body.contentType, 'MUSIC');
  assert.equal(body.rightsHolder, undefined, 'rights metadata stays private in the Admin status response');
  assert.equal(video.rightsHolder, 'Artist', 'readiness update retains persisted rights metadata');
  assert.equal(body.approvalStatus, 'draft');
  assert.deepEqual(updates[0], {
    id: 'music-processing',
    changes: {
      status: 'ready',
      muxPlaybackId: 'music-playback',
      muxAssetId: 'music-asset',
      duration: 88,
    },
  });
  assert.equal(video.approvalStatus, 'draft');
});

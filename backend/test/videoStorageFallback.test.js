const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const fs = require('node:fs');

test('production video operations never load filesystem fallback and preserve Firestore results', async (context) => {
  const admin = require('firebase-admin');
  const firebasePath = require.resolve('../src/firebase');
  const storagePath = require.resolve('../src/storage');
  const routePath = require.resolve('../src/routes/videos');
  const previous = {
    VERCEL: process.env.VERCEL,
    NODE_ENV: process.env.NODE_ENV,
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  };
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[firebasePath];
    delete require.cache[routePath];
    delete require.cache[storagePath];
  };
  context.after(restore);
  process.env.VERCEL = '1';
  process.env.NODE_ENV = 'production';
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
  delete require.cache[firebasePath];
  delete require.cache[storagePath];

  let failure = false;
  let document = null;
  const writes = [];
  const unavailable = () => { throw new Error('private Firestore failure'); };
  const doc = (id) => ({
    id,
    get: async () => {
      if (failure) unavailable();
      return { exists: Boolean(document), id, data: () => document };
    },
    update: async (fields) => {
      if (failure) unavailable();
      writes.push(['update', fields]);
    },
    delete: async () => {
      if (failure) unavailable();
      writes.push(['delete']);
    },
    create: async (fields) => {
      if (failure) unavailable();
      writes.push(['create', fields]);
    },
  });
  const db = {
    collection: () => ({
      doc,
      add: async (fields) => {
        if (failure) unavailable();
        writes.push(['add', fields]);
        return { id: 'created' };
      },
      get: async () => {
        if (failure) unavailable();
        return { forEach: (callback) => {
          if (document) callback({ id: 'known', data: () => document });
        } };
      },
      where: () => ({
        limit: () => ({ get: async () => {
          if (failure) unavailable();
          return { empty: true };
        } }),
        get: async () => {
          if (failure) unavailable();
          return { forEach: () => {} };
        },
      }),
      orderBy: () => ({ get: async () => {
        if (failure) unavailable();
        return { forEach: () => {} };
      } }),
    }),
  };
  context.mock.method(admin, 'initializeApp', () => ({}));
  context.mock.method(admin.credential, 'cert', () => ({}));
  Object.defineProperty(admin, 'auth', {
    configurable: true, value: () => ({ verifyIdToken: async () => ({}) }),
  });
  Object.defineProperty(admin, 'firestore', { configurable: true, value: Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'now' },
  }) });
  context.after(() => {
    delete admin.auth;
    delete admin.firestore;
  });
  const firebase = require(firebasePath);
  context.mock.method(fs, 'mkdirSync', () => { throw new Error('storage.js was loaded'); });
  assert.equal(require.cache[storagePath], undefined);

  await assert.rejects(firebase.getVideoById('missing'), (error) =>
    error instanceof firebase.VideoNotFoundError && error.message === 'Video not found');
  assert.equal(require.cache[storagePath], undefined);
  document = { title: 'Known video' };
  assert.deepEqual(await firebase.getVideoById('known'), { id: 'known', ...document });
  assert.equal(await firebase.addVideo({ title: 'New video' }), 'created');
  assert.equal(await firebase.updateVideo('known', { title: 'Updated' }), true);
  assert.equal(await firebase.deleteVideo('known'), true);
  assert.equal(writes.length, 3);

  failure = true;
  for (const action of [
    () => firebase.getVideoById('known'),
    () => firebase.addVideo({ title: 'Failed' }),
    () => firebase.updateVideo('known', { title: 'Failed' }),
    () => firebase.updateVideoApproval('known', { approvalStatus: 'approved' }),
    () => firebase.deleteVideo('known'),
    () => firebase.getAllVideos(),
    () => firebase.getAllVideosAdmin(),
    () => firebase.getCategories(),
    () => firebase.getVideoByUploadId('upload'),
    () => firebase.getVideoByAssetId('asset'),
  ]) {
    await assert.rejects(action(), /Video storage is temporarily unavailable|private Firestore failure/);
    assert.equal(require.cache[storagePath], undefined);
  }

  const candidateStore = require('../src/adminBot/candidateStore');
  context.mock.method(candidateStore, 'createCandidateStore', () => ({ get: async () => null }));
  delete require.cache[routePath];
  const app = express();
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/videos/`;
  document = null;
  failure = false;
  const missing = await fetch(`${url}missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Video not found' });
  failure = true;
  const unavailableResponse = await fetch(`${url}known`);
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(await unavailableResponse.json(), { error: 'Video is temporarily unavailable.' });
  assert.equal(require.cache[storagePath], undefined);

  delete process.env.VERCEL;
  failure = false;
  await assert.rejects(firebase.getVideoById('missing'), firebase.VideoNotFoundError);
  failure = true;
  await assert.rejects(firebase.getVideoById('known'), /Video storage is temporarily unavailable/);
  assert.equal(require.cache[storagePath], undefined);

  process.env.NODE_ENV = 'development';
  require.cache[storagePath] = {
    id: storagePath, filename: storagePath, loaded: true,
    exports: { getVideoById: (id) => ({ id, source: 'local fixture' }) },
  };
  assert.deepEqual(await firebase.getVideoById('known'), { id: 'known', source: 'local fixture' });

  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  process.env.VERCEL = '1';
  delete require.cache[firebasePath];
  const noDbProduction = require(firebasePath);
  delete require.cache[storagePath];
  for (const action of [
    () => noDbProduction.getVideoById('missing'),
    () => noDbProduction.addVideo({ title: 'Not stored' }),
    () => noDbProduction.createCreatorVideo('project', {}),
    () => noDbProduction.getAllVideos(),
    () => noDbProduction.getApprovedVideos(),
    () => noDbProduction.getAllVideosAdmin(),
    () => noDbProduction.updateVideo('missing', {}),
    () => noDbProduction.updateVideoApproval('missing', {}),
    () => noDbProduction.deleteVideo('missing'),
    () => noDbProduction.getVideoByUploadId('upload'),
    () => noDbProduction.getVideoByAssetId('asset'),
    () => noDbProduction.getVideoByCreatorProjectId('project'),
    () => noDbProduction.getCategories(),
  ]) {
    await assert.rejects(action(), /Video storage is temporarily unavailable/);
    assert.equal(require.cache[storagePath], undefined);
  }

  delete process.env.VERCEL;
  delete require.cache[firebasePath];
  const noDbLocal = require(firebasePath);
  require.cache[storagePath] = {
    id: storagePath, filename: storagePath, loaded: true,
    exports: { getVideoById: (id) => ({ id, source: 'local fixture' }) },
  };
  assert.deepEqual(await noDbLocal.getVideoById('known'), { id: 'known', source: 'local fixture' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_POSTER_UPLOAD_BYTES, posterUploadProblem, preparePosterUpload, uploadTitlePoster } from '../src/admin/posterUpload.js';

const file = (type, size) => ({ type, size });

test('only PNG and JPEG posters are accepted', () => {
  assert.equal(posterUploadProblem(null), 'Choose a poster image.');
  assert.equal(posterUploadProblem(file('image/gif', 10)), 'Posters must be PNG or JPEG images.');
  assert.equal(posterUploadProblem(file('image/png', 10)), '');
  assert.equal(posterUploadProblem(file('image/jpeg', 10)), '');
});

test('small files upload unchanged; large files are downscaled or refused', async () => {
  const small = file('image/jpeg', 1000);
  assert.equal(await preparePosterUpload(small, { resize: () => { throw new Error('not needed'); } }), small);
  const reduced = file('image/jpeg', MAX_POSTER_UPLOAD_BYTES - 1);
  assert.equal(await preparePosterUpload(file('image/png', MAX_POSTER_UPLOAD_BYTES + 1), { resize: async () => reduced }), reduced);
  await assert.rejects(preparePosterUpload(file('image/png', MAX_POSTER_UPLOAD_BYTES + 1), {
    resize: async () => file('image/jpeg', MAX_POSTER_UPLOAD_BYTES + 1),
  }), /4 MB or smaller/);
});

test('upload sends the raw image with only the Authorization header and surfaces server errors', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: calls.length === 1, json: async () => (calls.length === 1 ? { posterUrl: 'https://watchprotv.com/api/posters/title-x.jpg' } : { error: 'Title not found.' }) };
  };
  const headers = async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer token' });
  const body = file('image/jpeg', 10);
  assert.equal((await uploadTitlePoster('https://watchprotv.com/api', headers, 'id with/slash', body, { fetchImpl })).posterUrl, 'https://watchprotv.com/api/posters/title-x.jpg');
  assert.equal(calls[0].url, 'https://watchprotv.com/api/admin/title-posters/id%20with%2Fslash');
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'image/jpeg', Authorization: 'Bearer token' });
  assert.equal(calls[0].init.body, body);
  await assert.rejects(uploadTitlePoster('https://x', headers, 'missing', body, { fetchImpl }), /Title not found/);
});

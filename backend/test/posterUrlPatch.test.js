const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

test('editing a title keeps an uploaded poster pair consistent and leaves other artwork alone', async (context) => {
  const firebase = require('../src/firebase');
  const auth = require('../src/middleware/auth');
  const uploaded = 'https://watchprotv.com/api/posters/title-' + 'a'.repeat(64) + '.jpg';
  const records = new Map([
    ['uploaded', { id: 'uploaded', title: 'Bundy', contentType: 'MOVIE', posterUrl: uploaded, thumbnailUrl: uploaded }],
    ['approved', { id: 'approved', title: 'Sintel', contentType: 'MOVIE', posterUrl: 'https://storage.googleapis.com/b/approved-posters/s.jpg', thumbnailUrl: 'data:image/jpeg;base64,AA==' }],
  ]);
  const writes = [];
  context.mock.method(auth, 'verifyAdmin', (req, res, next) => { req.user = { uid: 'test-admin' }; next(); });
  context.mock.method(firebase, 'getVideoById', async (id) => ({ ...records.get(id) }));
  context.mock.method(firebase, 'updateVideo', async (id, changes) => {
    writes.push({ id, changes });
    records.set(id, { ...records.get(id), ...changes });
  });
  const routePath = require.resolve('../src/routes/videos');
  delete require.cache[routePath];
  const app = express();
  app.use(express.json());
  app.use('/videos', require(routePath));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => { server.close(); delete require.cache[routePath]; });
  await new Promise((resolve) => server.once('listening', resolve));
  const patch = async (id, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/videos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return writes.at(-1).changes;
  };

  // Unrelated edits resend the same artwork and must not touch posterUrl.
  assert.equal('posterUrl' in await patch('uploaded', { title: 'The Bundy Chronicles', thumbnailUrl: uploaded }), false);
  // Pasting a different link replaces both halves of the uploaded pair.
  const replaced = await patch('uploaded', { thumbnailUrl: 'https://example.com/new.jpg' });
  assert.equal(replaced.posterUrl, 'https://example.com/new.jpg');
  // Approved artwork with distinct poster and thumbnail fields is never rewritten by a thumbnail edit.
  assert.equal('posterUrl' in await patch('approved', { thumbnailUrl: 'https://example.com/other.jpg' }), false);
  assert.equal(records.get('approved').posterUrl, 'https://storage.googleapis.com/b/approved-posters/s.jpg');
});

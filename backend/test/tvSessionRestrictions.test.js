const assert = require('node:assert/strict');
const test = require('node:test');

// TV sign-in returns a Firebase custom token without developer claims, but
// Firebase still copies the user's stored claims (admin: true) into every
// session. This sweeps every privileged endpoint with an admin's TV session
// to prove the restriction comes from the server, not from the token.
const PRIVILEGED = [
  ['GET', '/videos/admin/all'],
  ['POST', '/videos/admin/claim-owner'],
  ['PATCH', '/videos/admin/x/approve'],
  ['PATCH', '/videos/admin/x/reject'],
  ['PATCH', '/videos/admin/x/verify'],
  ['POST', '/videos/admin/x/ingest'],
  ['POST', '/videos/admin/x/imdb-rating'],
  ['PATCH', '/videos/x'],
  ['DELETE', '/videos/x'],
  ['POST', '/videos'],
  ['POST', '/videos/upload-url'],
  ['POST', '/videos/from-url'],
  ['GET', '/videos/x/status'],
  ['POST', '/auth/creator-sso'],
  ['POST', '/auth/owner-creator-sso'],
  ['POST', '/auth/device-sessions/approve'],
  ['POST', '/admin/creator-posters/storage-check'],
  ['PUT', '/admin/title-posters/x'],
  ['POST', '/admin-bot/run'],
  ['GET', '/admin-bot/status'],
  ['GET', '/admin-bot/audit'],
  ['GET', '/admin-bot/web-search'],
  ['POST', '/admin-bot/discovery/run'],
  ['GET', '/admin-bot/discovery/status'],
  ['GET', '/admin-bot/discovery/candidates'],
  ['POST', '/admin-bot/discovery/candidates/x/reject'],
  ['POST', '/admin-bot/web-ingest'],
  ['GET', '/admin-bot/web-status'],
  ['POST', '/distributor-ingestion/run'],
  ['GET', '/distributor-ingestion/status'],
  ['GET', '/distributor-ingestion/audit'],
  ['POST', '/admin-assistant/query'],
  ['POST', '/admin-assistant/update-poster'],
  ['POST', '/admin-assistant/update-metadata'],
  ['POST', '/admin-assistant/regenerate-poster'],
  ['POST', '/admin-assistant/regenerate-metadata'],
  ['GET', '/ads/admin/titles/x'],
  ['GET', '/admin/podcasts'],
  ['GET', '/admin/live'],
  ['GET', '/admin/reports'],
];

test('an admin account signed in on a TV has no administrative capability anywhere', async (context) => {
  const firebase = require('../src/firebase');
  const previous = { auth: firebase.auth, db: firebase.db, owner: process.env.OWNER_EMAIL, creatorOwner: process.env.CREATOR_PORTAL_OWNER_EMAIL };
  process.env.OWNER_EMAIL = 'owner@example.test';
  process.env.CREATOR_PORTAL_OWNER_EMAIL = 'owner@example.test';
  const identity = (provider) => ({
    uid: 'owner-uid', email: 'owner@example.test', email_verified: true, admin: true, firebase: { sign_in_provider: provider },
  });
  const identities = { tv: identity('custom'), web: identity('password') };
  firebase.auth = {
    verifyIdToken: async (token) => {
      if (!Object.hasOwn(identities, token)) throw new Error('Invalid token');
      return structuredClone(identities[token]);
    },
  };
  firebase.db = null; // Nothing can be written even if a route were reached.
  const loaded = Object.keys(require.cache).filter((key) => key.includes(`${require('path').sep}src${require('path').sep}`) && !key.endsWith(`${require('path').sep}firebase.js`));
  for (const key of loaded) delete require.cache[key];
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    firebase.auth = previous.auth;
    firebase.db = previous.db;
    process.env.OWNER_EMAIL = previous.owner;
    process.env.CREATOR_PORTAL_OWNER_EMAIL = previous.creatorOwner;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const call = async (method, path, token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(method === 'GET' || method === 'DELETE' ? {} : { 'Content-Type': 'application/json' }) },
      ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
    });
    return response.status;
  };
  for (const [method, path] of PRIVILEGED) {
    assert.equal(await call(method, path, 'tv'), 403, `${method} ${path} must reject a TV session`);
  }
  // A malformed TV sign-in body is refused and never logged, even though the
  // JSON parser's error text quotes part of the body.
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));
  const malformed = await fetch(`http://127.0.0.1:${server.address().port}/auth/tv/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"a@example.test","password":"leak-me-not" broken',
  });
  console.error = originalError;
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Invalid request.' });
  assert.doesNotMatch(logged.join('\n'), /leak-me-not|example\.test/);

  // Control: the same admin signed in on the website is not rejected for
  // being an admin, so the 403 above comes from the TV sign-in type.
  for (const [method, path] of [['GET', '/videos/admin/all'], ['GET', '/admin-bot/status'], ['GET', '/distributor-ingestion/status']]) {
    const status = await call(method, path, 'web');
    assert.notEqual(status, 403, `${method} ${path} with a website admin session`);
    assert.notEqual(status, 401, `${method} ${path} with a website admin session`);
  }
});

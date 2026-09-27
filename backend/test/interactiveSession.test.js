const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

test('interactive admin, owner and Creator authorization preserves custom-provider viewer access', async (context) => {
  const firebase = require('../src/firebase');
  const previousAuth = firebase.auth;
  const previousDb = firebase.db;
  const previousOwner = process.env.OWNER_EMAIL;
  const previousPortal = process.env.CREATOR_PORTAL_URL;
  const previousSsoSecret = process.env.CREATOR_SSO_SECRET;
  const previousCreatorOwner = process.env.CREATOR_PORTAL_OWNER_EMAIL;

  process.env.OWNER_EMAIL = 'owner@example.test';
  process.env.CREATOR_PORTAL_URL = 'https://creator.example.test';
  process.env.CREATOR_SSO_SECRET = 'isolated-creator-sso-secret';
  process.env.CREATOR_PORTAL_OWNER_EMAIL = 'owner@example.test';

  const tokenFor = (provider, overrides = {}) => ({
    uid: 'owner-uid',
    email: 'owner@example.test',
    email_verified: true,
    admin: true,
    firebase: provider === null ? undefined : { sign_in_provider: provider },
    ...overrides,
  });
  const identities = {
    password: tokenFor('password'),
    google: tokenFor('google.com'),
    custom: tokenFor('custom'),
    missing: tokenFor(null),
    unsupported: tokenFor('github.com'),
    nonadmin: tokenFor('password', { admin: false }),
    unverified: tokenFor('password', { email_verified: false }),
    wrongOwner: tokenFor('password', { email: 'other@example.test' }),
    noEmail: tokenFor('password', { email: undefined }),
    noUid: tokenFor('password', { uid: '' }),
    creatorPassword: tokenFor('password', { uid: 'creator-uid', email: 'creator@example.test', admin: false }),
    creatorGoogle: tokenFor('google.com', { uid: 'creator-uid', email: 'creator@example.test', admin: false }),
    creatorCustom: tokenFor('custom', { uid: 'creator-uid', email: 'creator@example.test', admin: false }),
  };
  firebase.auth = {
    verifyIdToken: async (token) => {
      if (!Object.hasOwn(identities, token)) throw new Error('Invalid token');
      return identities[token];
    },
  };
  const viewerUids = [];
  firebase.db = {
    collection: (name) => ({
      doc: (uid) => {
        if (name === 'users') viewerUids.push(uid);
        return {
          get: async () => ({
            exists: true,
            data: () => ({
              favoriteVideoIds: ['movie-1'],
              watchProgress: { 'movie-1': { positionSeconds: 42 } },
            }),
          }),
        };
      },
    }),
  };
  const grants = [];
  context.mock.method(firebase, 'grantAdminRole', async (email) => {
    grants.push(email);
  });
  context.mock.method(firebase, 'getAllVideosAdmin', async () => []);

  const modules = [
    '../src/middleware/auth',
    '../src/routes/auth',
    '../src/routes/videos',
    '../src/routes/users',
  ];
  for (const modulePath of modules) delete require.cache[require.resolve(modulePath)];

  const app = express();
  app.use(express.json());
  app.use('/auth', require('../src/routes/auth'));
  app.use('/videos', require('../src/routes/videos'));
  app.use('/users', require('../src/routes/users'));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    for (const modulePath of modules) delete require.cache[require.resolve(modulePath)];
    firebase.auth = previousAuth;
    firebase.db = previousDb;
    for (const [key, value] of [
      ['OWNER_EMAIL', previousOwner],
      ['CREATOR_PORTAL_URL', previousPortal],
      ['CREATOR_SSO_SECRET', previousSsoSecret],
      ['CREATOR_PORTAL_OWNER_EMAIL', previousCreatorOwner],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, token, body, method = 'POST') {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  for (const token of ['password', 'google']) {
    assert.equal((await request('/videos/admin/all', token, null, 'GET')).status, 200);
  }
  for (const token of ['custom', 'missing', 'unsupported', 'nonadmin']) {
    const result = await request('/videos/admin/all', token, null, 'GET');
    assert.equal(result.status, 403, `admin: ${token}`);
    assert.equal(result.body.error.includes('owner@example.test'), false);
  }
  assert.equal((await request('/videos/admin/all', 'invalid', null, 'GET')).status, 401);

  for (const token of ['password', 'google']) {
    assert.equal((await request('/videos/admin/claim-owner', token, {
      uid: 'attacker-uid', email: 'attacker@example.test',
    })).status, 200);
  }
  assert.deepEqual(grants, ['owner@example.test', 'owner@example.test']);
  for (const token of ['custom', 'missing', 'unsupported', 'unverified', 'wrongOwner', 'noEmail', 'noUid']) {
    assert.equal((await request('/videos/admin/claim-owner', token)).status, 403, `owner: ${token}`);
  }
  assert.equal((await request('/videos/admin/claim-owner', 'invalid')).status, 401);
  delete process.env.OWNER_EMAIL;
  assert.equal((await request('/videos/admin/claim-owner', 'password')).status, 503);
  process.env.OWNER_EMAIL = 'owner@example.test';
  assert.equal(grants.length, 2, 'only verified interactive owners grant the account claim');

  for (const token of ['creatorPassword', 'creatorGoogle']) {
    const result = await request('/auth/creator-sso', token);
    assert.equal(result.status, 200, `creator: ${token}`);
    assert.match(result.body.url, /^https:\/\/creator\.example\.test\/#sso=/);
  }
  for (const token of ['creatorCustom', 'custom', 'missing', 'unsupported', 'unverified']) {
    assert.equal((await request('/auth/creator-sso', token)).status, 403, `creator: ${token}`);
  }
  for (const token of ['password', 'google']) {
    assert.equal((await request('/auth/owner-creator-sso', token)).status, 200, `owner Creator: ${token}`);
  }
  for (const token of ['custom', 'missing', 'unsupported', 'nonadmin', 'wrongOwner']) {
    assert.equal((await request('/auth/owner-creator-sso', token)).status, 403, `owner Creator: ${token}`);
  }

  assert.deepEqual((await request('/users/me/favorites', 'custom', null, 'GET')), {
    status: 200, body: ['movie-1'],
  });
  assert.deepEqual((await request('/users/me/progress', 'custom', null, 'GET')), {
    status: 200, body: { 'movie-1': { positionSeconds: 42 } },
  });
  assert.deepEqual(viewerUids, ['owner-uid', 'owner-uid']);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { createCreatorSsoToken } = require('../src/auth/creatorSso');

test('creator SSO token contains a signed short-lived verified identity', () => {
  const token = createCreatorSsoToken({
    secret: 'shared-test-secret',
    user: {
      uid: 'firebase-creator-1',
      email: 'creator@example.com',
      email_verified: true,
      name: 'Creator',
    },
  });
  const [header, payload, signature] = token.split('.');
  assert.ok(header);
  assert.ok(signature);
  assert.equal(signature, crypto.createHmac('sha256', 'shared-test-secret')
    .update(`${header}.${payload}`).digest('base64url'));
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(parsed.iss, 'protv');
  assert.equal(parsed.aud, 'protv-creator-agent');
  assert.equal(parsed.sub, 'firebase-creator-1');
  assert.equal(parsed.emailVerified, true);
  assert.equal(parsed.exp - parsed.iat, 120);
  assert.match(parsed.jti, /^[0-9a-f-]{36}$/);
  assert.equal(parsed.access, 'creator');
});

test('owner handoff signs the normalized authenticated email without substituting another identity', () => {
  for (const email of ['admin@watchprotv.com', 'ADMIN@WATCHPROTV.COM', '  admin@watchprotv.com  ']) {
    const token = createCreatorSsoToken({
      secret: 'shared-test-secret',
      user: { uid: 'owner-uid', email, email_verified: true },
      access: 'owner',
    });
    const parsed = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(parsed.email, 'admin@watchprotv.com');
    assert.equal(parsed.sub, 'owner-uid');
    assert.equal(parsed.access, 'owner');
    assert.equal(parsed.emailVerified, true);
  }
});

test('creator SSO refuses unusable authenticated identities', () => {
  for (const user of [
    { uid: '', email: 'admin@watchprotv.com' },
    { uid: 'owner-uid', email: '   ' },
    { uid: 'owner-uid' },
  ]) {
    assert.throws(() => createCreatorSsoToken({
      secret: 'shared-test-secret', user,
    }), /usable email address/);
  }
});

test('creator SSO refuses to issue without a configured secret', () => {
  assert.throws(() => createCreatorSsoToken({
    secret: '',
    user: { uid: 'creator', email: 'creator@example.com' },
  }), /not configured/);
});

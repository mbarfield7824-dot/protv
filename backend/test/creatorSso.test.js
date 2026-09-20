const assert = require('node:assert/strict');
const test = require('node:test');
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
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(parsed.iss, 'protv');
  assert.equal(parsed.aud, 'protv-creator-agent');
  assert.equal(parsed.sub, 'firebase-creator-1');
  assert.equal(parsed.emailVerified, true);
  assert.equal(parsed.exp - parsed.iat, 120);
  assert.match(parsed.jti, /^[0-9a-f-]{36}$/);
});

test('creator SSO refuses to issue without a configured secret', () => {
  assert.throws(() => createCreatorSsoToken({
    secret: '',
    user: { uid: 'creator', email: 'creator@example.com' },
  }), /not configured/);
});

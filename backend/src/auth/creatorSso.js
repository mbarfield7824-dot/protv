const crypto = require('crypto');

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createCreatorSsoToken({ user, secret, lifetimeSeconds = 120, access = 'creator' }) {
  if (!secret) throw new Error('Creator Portal SSO is not configured.');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'PROTV-SSO' });
  const payload = encode({
    iss: 'protv',
    aud: 'protv-creator-agent',
    sub: user.uid,
    email: user.email,
    emailVerified: user.email_verified === true,
    name: user.name || user.email.split('@')[0],
    access,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + lifetimeSeconds,
  });
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

module.exports = { createCreatorSsoToken };

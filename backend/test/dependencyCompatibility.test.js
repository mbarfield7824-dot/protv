const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const express = require('express');

test('patched Firebase Admin signs and verifies SSO custom tokens without provider calls', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccount = {
    projectId: 'dependency-regression',
    clientEmail: 'synthetic@dependency-regression.iam.gserviceaccount.com',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'dependency-regression');
  try {
    const token = await admin.auth(app).createCustomToken('synthetic-owner', { admin: true });
    const [header, body, signature] = token.split('.');
    assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
    const payload = JSON.parse(Buffer.from(body, 'base64url'));
    assert.equal(payload.uid, 'synthetic-owner');
    assert.equal(payload.claims.admin, true);
    assert.equal(payload.iss, serviceAccount.clientEmail);
    assert.equal(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${body}`), publicKey,
      Buffer.from(signature, 'base64url')), true);
    assert.equal(typeof admin.firestore(app).runTransaction, 'function');
    const file = admin.storage(app).bucket('synthetic-existing-bucket').file('creator-posters/synthetic.png');
    assert.equal(typeof file.save, 'function');
    assert.equal(typeof file.createReadStream, 'function');
  } finally {
    await app.delete();
  }
});

test('patched UUID dependency retains Google SDK CommonJS v4/v5 APIs', () => {
  const requireSdk = require('node:module').createRequire(require.resolve('google-gax'));
  const uuid = requireSdk('uuid');
  assert.equal(uuid.validate(uuid.v4()), true);
  assert.equal(uuid.v5('protv', uuid.v5.DNS), uuid.v5('protv', uuid.v5.DNS));
  assert.throws(() => uuid.v5('protv', uuid.v5.DNS, Buffer.alloc(8), 0), RangeError);
});

test('patched Express handles query parsing and mapped IPv6 proxy identity', async () => {
  const app = express();
  app.set('trust proxy', ['loopback', '10.0.0.0/8']);
  app.use(express.urlencoded({ extended: true }));
  app.post('/', (req, res) => res.json({ ip: req.ip, query: req.query, body: req.body }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/?tag[0]=film&tag[1]=poster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': '198.51.100.7, ::ffff:192.0.2.5' },
      body: 'credits[director]=Supplied&__proto__[polluted]=true',
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ip, '::ffff:192.0.2.5');
    assert.deepEqual(result.query.tag, ['film', 'poster']);
    assert.equal(result.body.credits.director, 'Supplied');
    assert.equal({}.polluted, undefined);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

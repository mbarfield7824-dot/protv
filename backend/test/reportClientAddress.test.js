const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { reportingClientAddress } = require('../src/reports/clientAddress');
const { ReportStore, ReportRateLimitError } = require('../src/reports/store');

const request = (value, changes = {}) => ({
  headers: { 'x-vercel-forwarded-for': value },
  rawHeaders: value === undefined ? [] : ['X-Vercel-Forwarded-For', value],
  socket: { remoteAddress: '127.0.0.1' },
  ...changes,
});
async function storeFor(context, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'protv-address-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new ReportStore({
    db: null, production: false, filePath: path.join(directory, 'reports.json'),
    now: () => 1_800_000_000_000, ...options,
  });
}

test('Vercel selects only its single validated header, not req.ip or other forwarded headers', () => {
  assert.equal(reportingClientAddress(request('192.0.2.10', {
    ip: '198.51.100.1', headers: {
      'x-vercel-forwarded-for': '192.0.2.10',
      'x-forwarded-for': '198.51.100.1', 'x-real-ip': '203.0.113.1',
    },
  }), true), '192.0.2.10');
  assert.equal(reportingClientAddress(request(' 2001:DB8::1 '), true), '2001:db8::1');
});

test('outside Vercel forged forwarding headers and req.ip are ignored', () => {
  assert.equal(reportingClientAddress(request('192.0.2.10', { ip: '192.0.2.10' }), false), '127.0.0.1');
  assert.equal(reportingClientAddress(request('198.51.100.20'), false), '127.0.0.1');
  assert.equal(reportingClientAddress(request('192.0.2.10', { socket: {} }), false), 'unknown');
});

test('missing malformed comma-separated array and duplicate values share one fallback', () => {
  const fallback = reportingClientAddress(request(undefined), true);
  for (const value of [
    '', ' ', 'invalid', '192.0.2.1:123', '[2001:db8::1]', '192.0.2.1,192.0.2.2',
    '192.0.2.1, 192.0.2.1', '010.0.0.1', 'fe80::1%eth0', ['192.0.2.1'],
  ]) assert.equal(reportingClientAddress(request(value), true), fallback);
  assert.equal(reportingClientAddress(request('192.0.2.1', {
    rawHeaders: ['X-Vercel-Forwarded-For', '192.0.2.1', 'x-vercel-forwarded-for', '192.0.2.1'],
  }), true), fallback);
});

test('equivalent IPv6 and IPv4-mapped forms canonicalize into the same buckets', () => {
  const canonical = reportingClientAddress(request('2001:db8::1'), true);
  for (const value of ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8:0:0::1']) {
    assert.equal(reportingClientAddress(request(value), true), canonical);
  }
  for (const value of ['::ffff:192.0.2.10', '0:0:0:0:0:FFFF:c000:020a', '192.0.2.10']) {
    assert.equal(reportingClientAddress(request(value), true), '192.0.2.10');
  }
});

test('distinct Vercel clients have separate five-attempt buckets and repeated clients throttle', async (context) => {
  const store = await storeFor(context);
  const first = reportingClientAddress(request('192.0.2.10'), true);
  const second = reportingClientAddress(request('198.51.100.20'), true);
  for (let index = 0; index < 5; index += 1) await store.consumeRateLimit(first);
  await assert.rejects(store.consumeRateLimit(first), ReportRateLimitError);
  await store.consumeRateLimit(second);
  const disk = await fs.readFile(store.filePath, 'utf8');
  assert.ok(!disk.includes(first) && !disk.includes(second));
});

test('fallback and equivalent IPv6 clients cannot evade per-client throttling', async (context) => {
  const store = await storeFor(context);
  for (const value of [undefined, 'invalid', '', '192.0.2.1,192.0.2.2', ['192.0.2.1']]) {
    await store.consumeRateLimit(reportingClientAddress(request(value), true));
  }
  await assert.rejects(store.consumeRateLimit(reportingClientAddress(request(undefined), true)), ReportRateLimitError);
  for (let index = 0; index < 5; index += 1) {
    await store.consumeRateLimit(reportingClientAddress(request(index % 2 ? '2001:DB8:0:0:0:0:0:1' : '2001:db8::1'), true));
  }
  await assert.rejects(store.consumeRateLimit(reportingClientAddress(request('2001:0db8::0001'), true)), ReportRateLimitError);
});

test('global limit remains 120 per minute across distinct Vercel clients', async (context) => {
  const store = await storeFor(context);
  for (let index = 1; index <= 120; index += 1) {
    await store.consumeRateLimit(reportingClientAddress(request(`192.0.2.${index}`), true));
  }
  await assert.rejects(store.consumeRateLimit(reportingClientAddress(request('198.51.100.1'), true)), ReportRateLimitError);
});

test('real Node duplicate header handling retains shared fallback and Express trust proxy stays false', async (context) => {
  const app = express();
  app.get('/', (req, res) => res.json({
    selected: reportingClientAddress(req, true), trustProxy: app.get('trust proxy'),
  }));
  const server = app.listen(0, '127.0.0.1');
  context.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise((resolve) => server.once('listening', resolve));
  const send = (headers) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end();
  });
  const duplicate = await send([
    'Host', '127.0.0.1', 'X-Vercel-Forwarded-For', '192.0.2.1', 'x-vercel-forwarded-for', '192.0.2.1',
  ]);
  assert.equal(duplicate.selected, reportingClientAddress(request(undefined), true));
  assert.equal(duplicate.trustProxy, false);
  assert.equal((await send({ 'x-vercel-forwarded-for': '192.0.2.2' })).selected, '192.0.2.2');
});

test('public reporting route wires runtime-selected addresses into the existing limiter', async (context) => {
  const { createReportRouters } = require('../src/reports/router');
  const store = await storeFor(context);
  const previous = process.env.VERCEL;
  context.after(() => {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  });
  process.env.VERCEL = '1';
  const app = express();
  app.use('/reports', createReportRouters({ store }).publicRouter);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise((resolve) => server.once('listening', resolve));
  const send = async (address) => fetch(`http://127.0.0.1:${server.address().port}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': address },
    body: '{}',
  });
  for (let index = 0; index < 5; index += 1) assert.equal((await send('192.0.2.10')).status, 400);
  assert.equal((await send('192.0.2.10')).status, 429);
  assert.equal((await send('198.51.100.20')).status, 400);
  assert.equal(app.get('trust proxy'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSafetyReportPayload,
  SafetyReportRequestError,
  safetyReportUrl,
  submitSafetyReport,
  validateSafetyReport,
  validateSafetyReportReceipt,
} from '../src/data/safetyReports.js';

const receipt = { id: '6f1e8d34-6c85-4fb4-8ae9-2d98197731cd', status: 'received' };
const okResponse = (body = receipt, status = 201) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: new Headers(),
});
const report = {
  type: 'account',
  reason: 'harassment_hate',
  description: 'A creator is targeting a viewer.',
  targetDescription: 'Creator name: A Creator',
};

test('payload uses only backend submission fields and includes an account descriptive reference', () => {
  assert.deepEqual(buildSafetyReportPayload({
    ...report,
    contactEmail: ' viewer@example.org ',
    evidence: 'must never be sent',
    status: 'pending',
  }), {
    type: 'account',
    reason: 'harassment_hate',
    description: 'A creator is targeting a viewer.',
    targetDescription: 'Creator name: A Creator',
    contactEmail: 'viewer@example.org',
  });
  assert.deepEqual(validateSafetyReport({
    type: 'content',
    reason: 'csam_child_sexual_exploitation',
    description: ' Concern ',
    targetId: 'stable-id_1',
  }), {});
  assert.match(validateSafetyReport({ ...report, targetDescription: '' }).target, /at least one target reference/);
  assert.match(validateSafetyReport({
    ...report, targetDescription: '', targetId: '', targetUrl: '',
  }).target, /at least one target reference/);
  assert.equal(validateSafetyReport({
    ...report, type: 'general', targetDescription: '',
  }).target, undefined);
});

test('content shortcuts prefill safe stable IDs, URLs, and descriptive references', () => {
  assert.equal(
    safetyReportUrl('content', {
      targetId: 'music-id_1',
      targetUrl: 'https://protv.example/title/music-id_1',
      targetDescription: 'Music title: Sample',
    }),
    '/report?type=content&targetId=music-id_1&targetUrl=https%3A%2F%2Fprotv.example%2Ftitle%2Fmusic-id_1&targetDescription=Music+title%3A+Sample'
  );
  assert.equal(safetyReportUrl('account', {
    targetId: 'invalid id',
    targetDescription: 'Creator: A Name',
  }), '/report?type=account&targetDescription=Creator%3A+A+Name');
});

test('only the exact persisted-report receipt response is accepted', () => {
  assert.equal(validateSafetyReportReceipt(receipt), true);
  for (const invalid of [
    null, [], { ...receipt, status: 'pending' }, { ...receipt, id: 'not-a-uuid' },
    { ...receipt, extra: true }, { id: receipt.id },
  ]) assert.equal(validateSafetyReportReceipt(invalid), false);

  return assert.rejects(
    submitSafetyReport('https://protv.example/api', report, {
      fetchImpl: async () => okResponse({ ...receipt, status: 'pending' }),
    }),
    (error) => error instanceof SafetyReportRequestError && error.uncertain
  );
});

test('single POST returns a valid receipt and includes JSON headers at the configured API base', async () => {
  const calls = [];
  const result = await submitSafetyReport('https://protv.example/api/', report, {
    fetchImpl: async (...args) => {
      calls.push(args);
      return okResponse();
    },
  });
  assert.deepEqual(result, receipt);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://protv.example/api/reports');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0][1].body), report);
  assert.ok(calls[0][1].signal instanceof AbortSignal);
});

test('HTTP validation, rate-limit, and storage errors preserve status and Retry-After without retrying', async () => {
  for (const [status, body, retryAfter, expectedDelay] of [
    [400, { error: 'Unsupported report reason.' }, null, null],
    [429, { error: 'Too many reports.' }, '120', 120],
    [503, { error: 'Safety reporting is temporarily unavailable.' }, null, null],
  ]) {
    let calls = 0;
    await assert.rejects(
      submitSafetyReport('https://protv.example/api', report, {
        fetchImpl: async () => {
          calls += 1;
          const response = okResponse(body, status);
          response.headers = new Headers(retryAfter ? { 'Retry-After': retryAfter } : {});
          return response;
        },
      }),
      (error) => error instanceof SafetyReportRequestError
        && error.status === status
        && error.retryAfterSeconds === expectedDelay
        && error.message === body.error
    );
    assert.equal(calls, 1);
  }
});

test('timeout is bounded, aborts the request, and reports uncertain delivery without retrying', async () => {
  let calls = 0;
  let requestSignal;
  await assert.rejects(
    submitSafetyReport('https://protv.example/api', report, {
      timeoutMs: 10,
      fetchImpl: async (url, options) => {
        calls += 1;
        requestSignal = options.signal;
        return new Promise(() => {});
      },
    }),
    (error) => error instanceof SafetyReportRequestError
      && error.uncertain && /may have been received/.test(error.message)
  );
  assert.equal(calls, 1);
  assert.equal(requestSignal.aborted, true);
});

test('network interruptions are not retried and explain that delivery is uncertain', async () => {
  let calls = 0;
  await assert.rejects(
    submitSafetyReport('https://protv.example/api', report, {
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError('offline');
      },
    }),
    (error) => error instanceof SafetyReportRequestError
      && error.uncertain && /may have been received/.test(error.message)
  );
  assert.equal(calls, 1);
});

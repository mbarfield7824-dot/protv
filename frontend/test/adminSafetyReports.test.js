import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminReportRequest, appendReportPage, reportDetail, reportPage, reviewPayload, safeReportUrl,
} from '../src/admin/safetyReports.js';

const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const report = {
  id, type: 'content', reason: 'other', status: 'pending',
  description: 'Local fixture', targetId: 'fixture', targetUrl: '', targetDescription: '',
  contactEmail: '', reviewNotes: '', reviewedBy: null, reviewedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const headers = async () => ({ Authorization: 'fixture-admin', 'Content-Type': 'application/json' });
const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });

test('pagination preserves server order and deduplicates within and across pages', () => {
  const second = { ...report, id: secondId };
  assert.deepEqual(appendReportPage([second], [report, second, report]), [second, report]);
  assert.deepEqual(reportPage({ items: [second, report], nextCursor: id }), {
    items: [second, report], nextCursor: id,
  });
  assert.deepEqual(reportPage({ items: [], nextCursor: null }), { items: [], nextCursor: null });
  assert.throws(() => reportPage({ items: [], nextCursor: id }), /page is invalid/);
  assert.throws(() => reportPage({ items: [report], nextCursor: id }, id), /page is invalid/);
  assert.throws(() => reportPage({ items: [report, second], nextCursor: id }), /page is invalid/);
  assert.throws(() => reportPage({ items: [report] }), /page is invalid/);
});

test('detail responses reject invalid IDs, fields, statuses, and review dates', () => {
  assert.equal(reportDetail(report, id), report);
  for (const change of [
    { id: secondId }, { description: {} }, { status: 'received' },
    { reviewedAt: 'invalid' }, { reviewedBy: 1 }, { createdAt: undefined },
  ]) assert.throws(() => reportDetail({ ...report, ...change }, id), /response is invalid/);
});

test('safe links permit only HTTP(S) with no credentials', () => {
  assert.equal(safeReportUrl('https://example.test/report?q=1'), 'https://example.test/report?q=1');
  assert.equal(safeReportUrl('http://example.test/'), 'http://example.test/');
  for (const url of [
    '', '/relative', 'javascript:alert(1)', 'data:text/html,test',
    'https://user:password@example.test/', 'https://user@example.test/', 'file:///test',
  ]) assert.equal(safeReportUrl(url), null);
});

test('review validation matches required notes, exact statuses, raw length and controls', () => {
  for (const status of ['pending', 'in_review', 'resolved', 'dismissed']) {
    assert.deepEqual(reviewPayload({ status, reviewNotes: ' Reviewed \n' }), { status, reviewNotes: 'Reviewed' });
  }
  for (const reviewNotes of ['', ' \n\t ', 'x'.repeat(5001), 'note\u0000', undefined]) {
    assert.throws(() => reviewPayload({ status: 'resolved', reviewNotes }));
  }
  assert.equal(reviewPayload({ status: 'resolved', reviewNotes: 'x'.repeat(5000) }).reviewNotes.length, 5000);
  assert.throws(() => reviewPayload({ status: 'received', reviewNotes: 'notes' }), /allowed review status/);
});

test('protected requests use bounded authenticated backend GET/PATCH and no-store', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    return response(options.method === 'PATCH' ? { id, status: 'resolved' }
      : url.includes(`/${id}`) ? report : { items: [report], nextCursor: null });
  };
  await adminReportRequest('https://api.example.test/api/', headers, { cursor: secondId, fetchImpl });
  await adminReportRequest('https://api.example.test/api/', headers, { id, fetchImpl });
  await adminReportRequest('https://api.example.test/api/', headers, {
    id, body: { status: 'resolved', reviewNotes: ' reviewed ' }, fetchImpl,
  });
  assert.equal(calls[0].url, `https://api.example.test/api/admin/reports?limit=25&cursor=${secondId}`);
  assert.equal(calls[1].url, `https://api.example.test/api/admin/reports/${id}`);
  assert.equal(calls[2].method, 'PATCH');
  assert.equal(calls[2].body, JSON.stringify({ status: 'resolved', reviewNotes: 'reviewed' }));
  assert.ok(calls.every((call) => call.headers.Authorization === 'fixture-admin'
    && call.cache === 'no-store' && call.signal instanceof AbortSignal));
});

test('missing authorization and invalid reviews never dispatch', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(report); };
  await assert.rejects(adminReportRequest('https://api.example.test', async () => ({}), { id, fetchImpl }),
    (error) => error.status === 401 && !error.uncertain);
  await assert.rejects(adminReportRequest('https://api.example.test', headers, {
    id, body: { status: 'resolved', reviewNotes: ' ' }, fetchImpl,
  }), /nonblank/);
  assert.equal(calls, 0);
});

test('mutations require an exact successful receipt and never automatically retry', async () => {
  for (const reply of [
    response({ id, status: 'pending' }), response({ id, status: 'resolved', extra: true }),
    response({ id: secondId, status: 'resolved' }), response({ id, status: 'resolved' }, 201),
    response({}, 500), response({}, 503),
  ]) {
    let calls = 0;
    await assert.rejects(adminReportRequest('https://api.example.test', headers, {
      id, body: { status: 'resolved', reviewNotes: 'notes' },
      fetchImpl: async () => { calls += 1; return reply; },
    }), (error) => error.uncertain && /may have been received/.test(error.message));
    assert.equal(calls, 1);
  }
});

test('dispatched timeout, interrupted body, and cancellation are uncertain; auth timeout is not sent', async () => {
  const options = { id, body: { status: 'resolved', reviewNotes: 'notes' }, timeoutMs: 10 };
  await assert.rejects(adminReportRequest('https://api.example.test', headers, {
    ...options, fetchImpl: () => new Promise(() => {}),
  }), (error) => error.uncertain);
  await assert.rejects(adminReportRequest('https://api.example.test', headers, {
    ...options, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('interrupted'); } }),
  }), (error) => error.uncertain);
  const controller = new AbortController();
  await assert.rejects(adminReportRequest('https://api.example.test', headers, {
    ...options, signal: controller.signal,
    fetchImpl: async () => { controller.abort(); return new Promise(() => {}); },
  }), (error) => error.uncertain);
  await assert.rejects(adminReportRequest('https://api.example.test', () => new Promise(() => {}), options),
    (error) => !error.uncertain && /not sent/.test(error.message));
});

test('rejected reviews expose sanitized errors without uncertain-success claims', async () => {
  await assert.rejects(adminReportRequest('https://api.example.test', headers, {
    id, body: { status: 'resolved', reviewNotes: 'notes' },
    fetchImpl: async () => response({ error: 'private submitted text' }, 403),
  }), (error) => error.status === 403 && !error.uncertain
    && !error.message.includes('private submitted text'));
});

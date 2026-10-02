import { REPORT_REASONS, REPORT_TYPES } from '../data/safetyReports.js';
import { loadWithinDeadline } from '../utils/requestDeadline.js';

export const REVIEW_STATUSES = ['pending', 'in_review', 'resolved', 'dismissed'];
const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function reportReason(reason) {
  return REPORT_REASONS.find((option) => option.value === reason)?.label || reason;
}

export function reportType(type) {
  return REPORT_TYPES.find((option) => option.value === type)?.label || type;
}

export function safeReportUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : null;
  } catch {
    return null;
  }
}

export function reportDetail(value, expectedId = value?.id) {
  const textFields = ['description', 'targetId', 'targetUrl', 'targetDescription', 'contactEmail', 'reviewNotes'];
  const dateFields = ['createdAt', 'updatedAt', 'reviewedAt'];
  if (!value || !REPORT_ID.test(value.id) || value.id !== expectedId
    || !REPORT_TYPES.some((option) => option.value === value.type)
    || !REPORT_REASONS.some((option) => option.value === value.reason)
    || !REVIEW_STATUSES.includes(value.status)
    || textFields.some((field) => typeof value[field] !== 'string')
    || dateFields.some((field) => value[field] !== null
      && (typeof value[field] !== 'string' || !Number.isFinite(Date.parse(value[field]))))
    || (value.reviewedBy !== null && typeof value.reviewedBy !== 'string')) {
    throw new Error('The safety report response is invalid. Refresh to retrieve verified data.');
  }
  return value;
}

export function reportPage(value, cursor) {
  if (!value || !Array.isArray(value.items)
    || !(value.nextCursor === null || (typeof value.nextCursor === 'string' && REPORT_ID.test(value.nextCursor)))
    || (value.nextCursor !== null && (value.nextCursor === cursor
      || value.items.at(-1)?.id !== value.nextCursor))) {
    throw new Error('The safety report page is invalid. Refresh the queue.');
  }
  return { items: value.items.map((item) => reportDetail(item)), nextCursor: value.nextCursor };
}

export function appendReportPage(existing, incoming) {
  const ids = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  })];
}

export function reviewPayload(draft) {
  if (!REVIEW_STATUSES.includes(draft.status)) throw new Error('Choose an allowed review status.');
  if (typeof draft.reviewNotes !== 'string' || !draft.reviewNotes.trim() || draft.reviewNotes.length > 5000) {
    throw new Error('Review notes must be nonblank text of at most 5000 characters.');
  }
  for (const character of draft.reviewNotes) {
    const code = character.charCodeAt(0);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      throw new Error('Review notes contain unsupported control characters.');
    }
  }
  return { status: draft.status, reviewNotes: draft.reviewNotes.trim() };
}

export class AdminReportRequestError extends Error {
  constructor(message, { status, uncertain = false } = {}) {
    super(message);
    this.name = 'AdminReportRequestError';
    this.status = status;
    this.uncertain = uncertain;
  }
}

export async function adminReportRequest(baseUrl, getHeaders, {
  id, cursor, body, signal, timeoutMs = 15000, fetchImpl = fetch,
} = {}) {
  const mutation = body !== undefined;
  if (id !== undefined && !REPORT_ID.test(id)) throw new Error('A valid report receipt ID is required.');
  if (cursor !== undefined && cursor !== null && !REPORT_ID.test(cursor)) throw new Error('A valid report cursor is required.');
  if (mutation && id === undefined) throw new Error('A report receipt ID is required for review.');
  const payload = mutation ? reviewPayload(body) : null;
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('The PROtv API base URL is not configured.');
  const url = `${base}/admin/reports${id ? `/${id}` : `?limit=25${cursor ? `&cursor=${cursor}` : ''}`}`;
  let dispatched = false;
  try {
    return await loadWithinDeadline(async (requestSignal) => {
      const headers = await getHeaders();
      requestSignal.throwIfAborted();
      if (!headers.Authorization) {
        throw new AdminReportRequestError('Sign in with an authorized Admin account.', { status: 401 });
      }
      dispatched = true;
      const res = await fetchImpl(url, {
        method: mutation ? 'PATCH' : 'GET',
        headers,
        cache: 'no-store',
        signal: requestSignal,
        ...(mutation ? { body: JSON.stringify(payload) } : {}),
      });
      if (!res.ok) {
        const messages = {
          400: 'The report request was rejected. Check the fields and refresh before retrying.',
          401: 'Your Admin session is unavailable. Sign in again.',
          403: 'An interactive sign-in with Admin authorization is required.',
          404: 'This report is no longer available.',
          413: 'The review request exceeds the server size limit. Shorten the notes.',
          429: 'Too many requests. Wait before trying again.',
          503: 'Safety report storage is unavailable. Your entered notes have been retained.',
        };
        throw new AdminReportRequestError(messages[res.status] || 'The safety report request failed.', {
          status: res.status,
          uncertain: mutation && res.status >= 500,
        });
      }
      const response = await res.json();
      if (mutation) {
        if (res.status !== 200 || !response || Object.keys(response).length !== 2
          || response.id !== id || response.status !== payload.status) {
          throw new AdminReportRequestError('The review receipt could not be verified.', { uncertain: true });
        }
        return response;
      }
      if (res.status !== 200) throw new Error('Unexpected report response status.');
      return id ? reportDetail(response, id) : reportPage(response, cursor);
    }, 'Safety report request', timeoutMs, signal);
  } catch (error) {
    if (mutation && dispatched && (!(error instanceof AdminReportRequestError) || error.uncertain)) {
      throw new AdminReportRequestError(
        'The save could not be confirmed. It may have been received. Your notes are retained; refresh the report before deciding whether to save again.',
        { uncertain: true }
      );
    }
    if (error instanceof AdminReportRequestError) throw error;
    throw new AdminReportRequestError(
      mutation ? 'The save was not sent. Check your Admin session and try again.'
        : 'The safety report request was interrupted, timed out, or returned invalid data. Try refreshing.'
    );
  }
}

const REPORT_TYPES = ['content', 'account', 'general'];
const REPORT_REASONS = [
  'csam_child_sexual_exploitation', 'harassment_hate', 'violence_threats',
  'self_harm', 'sexual_content', 'copyright', 'fraud', 'privacy', 'other',
];
const REVIEW_STATUSES = ['pending', 'in_review', 'resolved', 'dismissed'];
const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class ReportInputError extends Error {}

function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ReportInputError('A JSON object is required.');
  }
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new ReportInputError('Unsupported report fields. Only text references are accepted.');
  }
}

function text(value, field, maximum, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new ReportInputError(`${field} must be ${required ? 'nonblank ' : ''}text of at most ${maximum} characters.`);
  }
  return value.trim();
}

function submission(body) {
  fields(body, ['type', 'reason', 'description', 'targetId', 'targetUrl', 'targetDescription', 'contactEmail']);
  if (!REPORT_TYPES.includes(body.type)) throw new ReportInputError('type must be content, account, or general.');
  if (!REPORT_REASONS.includes(body.reason)) throw new ReportInputError('Unsupported report reason.');
  const report = {
    type: body.type,
    reason: body.reason,
    description: text(body.description, 'description', 5000, true),
    targetId: text(body.targetId, 'targetId', 200),
    targetUrl: text(body.targetUrl, 'targetUrl', 2048),
    targetDescription: text(body.targetDescription, 'targetDescription', 1000),
    contactEmail: text(body.contactEmail, 'contactEmail', 254),
  };
  if (report.targetId && !/^[A-Za-z0-9_.:-]{1,200}$/.test(report.targetId)) {
    throw new ReportInputError('targetId must be a stable identifier without spaces or slashes.');
  }
  if (report.targetUrl) {
    let url;
    try { url = new URL(report.targetUrl); } catch { throw new ReportInputError('targetUrl must be an HTTP(S) URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new ReportInputError('targetUrl must be an HTTP(S) URL without embedded credentials.');
    }
    report.targetUrl = url.toString();
  }
  if (report.type !== 'general' && !report.targetId && !report.targetUrl && !report.targetDescription) {
    throw new ReportInputError('Content/account reports require targetId, targetUrl, or targetDescription.');
  }
  if (report.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(report.contactEmail)) {
    throw new ReportInputError('contactEmail must be a valid email address.');
  }
  return report;
}

function review(body) {
  fields(body, ['status', 'reviewNotes']);
  if (!REVIEW_STATUSES.includes(body.status)) throw new ReportInputError('Unsupported review status.');
  return { status: body.status, reviewNotes: text(body.reviewNotes, 'reviewNotes', 5000, true) };
}

function pagination(query) {
  if (Object.keys(query).some((key) => !['limit', 'cursor'].includes(key))) {
    throw new ReportInputError('Unsupported list query.');
  }
  const limit = query.limit === undefined ? 25 : typeof query.limit === 'string' && /^\d+$/.test(query.limit) ? Number(query.limit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ReportInputError('limit must be 1 to 100.');
  if (query.cursor !== undefined && (typeof query.cursor !== 'string' || !REPORT_ID.test(query.cursor))) {
    throw new ReportInputError('cursor must be a report ID.');
  }
  return { limit, cursor: query.cursor };
}

module.exports = { REPORT_TYPES, REPORT_REASONS, REVIEW_STATUSES, REPORT_ID, ReportInputError, submission, review, pagination };

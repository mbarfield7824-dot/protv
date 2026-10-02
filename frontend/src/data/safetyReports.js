export const REPORT_TYPES = [
  { value: 'content', label: 'Content report' },
  { value: 'account', label: 'Account or creator report' },
  { value: 'general', label: 'General safety report' },
];

export const REPORT_REASONS = [
  { value: 'csam_child_sexual_exploitation', label: 'Child sexual abuse material or child sexual exploitation.' },
  { value: 'harassment_hate', label: 'Harassment or hateful conduct' },
  { value: 'violence_threats', label: 'Violence or threats' },
  { value: 'self_harm', label: 'Self-harm' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'copyright', label: 'Copyright' },
  { value: 'fraud', label: 'Fraud or scam' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'other', label: 'Other safety concern' },
];

const REPORT_TYPE_VALUES = new Set(REPORT_TYPES.map(({ value }) => value));
const REPORT_REASON_VALUES = new Set(REPORT_REASONS.map(({ value }) => value));
const TARGET_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;
const REPORT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasForbiddenControl(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

export function safetyReportUrl(type, references = {}) {
  const params = new URLSearchParams({ type });
  if (typeof references.targetId === 'string' && TARGET_ID_PATTERN.test(references.targetId)) {
    params.set('targetId', references.targetId);
  }
  for (const field of ['targetUrl', 'targetDescription']) {
    if (typeof references[field] === 'string' && references[field].trim()) {
      params.set(field, references[field].trim());
    }
  }
  return `/report?${params.toString()}`;
}

export function validateSafetyReport(values) {
  const errors = {};
  const type = String(values.type || '');
  const reason = String(values.reason || '');
  const description = String(values.description || '').trim();
  const targetId = String(values.targetId || '').trim();
  const targetUrl = String(values.targetUrl || '').trim();
  const targetDescription = String(values.targetDescription || '').trim();
  const contactEmail = String(values.contactEmail || '').trim();

  if (!REPORT_TYPE_VALUES.has(type)) errors.type = 'Choose a report type.';
  if (!REPORT_REASON_VALUES.has(reason)) errors.reason = 'Choose a reason for this report.';
  if (!description) errors.description = 'Describe the safety concern.';
  else if (description.length > 5000) errors.description = 'Description must be 5000 characters or fewer.';
  else if (hasForbiddenControl(description)) errors.description = 'Description contains unsupported control characters.';
  if (targetId && !TARGET_ID_PATTERN.test(targetId)) {
    errors.targetId = 'Enter a stable ID using letters, numbers, underscores, dots, colons, or hyphens.';
  }
  if (targetUrl) {
    if (hasForbiddenControl(targetUrl)) {
      errors.targetUrl = 'URL contains unsupported control characters.';
    } else {
      try {
        const url = new URL(targetUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
          errors.targetUrl = 'Enter an HTTP(S) URL without embedded credentials.';
        }
      } catch {
        errors.targetUrl = 'Enter a valid HTTP(S) URL.';
      }
    }
    if (targetUrl.length > 2048) errors.targetUrl = 'URL must be 2048 characters or fewer.';
  }
  if (targetDescription.length > 1000) {
    errors.targetDescription = 'Reference details must be 1000 characters or fewer.';
  } else if (hasForbiddenControl(targetDescription)) {
    errors.targetDescription = 'Reference details contain unsupported control characters.';
  }
  if (REPORT_TYPE_VALUES.has(type) && type !== 'general'
    && !targetId && !targetUrl && !targetDescription) {
    errors.target = 'Add at least one target reference: an ID, URL, or descriptive reference.';
  }
  if (contactEmail.length > 254 || (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
    errors.contactEmail = 'Enter a valid email address of 254 characters or fewer.';
  }
  return errors;
}

export function buildSafetyReportPayload(values) {
  const payload = {
    type: String(values.type || '').trim(),
    reason: String(values.reason || '').trim(),
    description: String(values.description || '').trim(),
  };
  for (const field of ['targetId', 'targetUrl', 'targetDescription', 'contactEmail']) {
    const value = String(values[field] || '').trim();
    if (value) payload[field] = value;
  }
  return payload;
}

export function validateSafetyReportReceipt(response) {
  return Boolean(response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).length === 2
    && typeof response.id === 'string' && REPORT_ID_PATTERN.test(response.id)
    && response.status === 'received');
}

function retryAfterSeconds(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : null;
}

export class SafetyReportRequestError extends Error {
  constructor(message, { status, retryAfterSeconds: retryDelay, uncertain = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SafetyReportRequestError';
    this.status = status;
    this.retryAfterSeconds = retryDelay;
    this.uncertain = uncertain;
  }
}

export async function submitSafetyReport(apiBaseUrl, payload, {
  fetchImpl = fetch,
  timeoutMs = 15000,
} = {}) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('The PROtv API base URL is not configured.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Report request timeout must be a positive finite number.');
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const request = Promise.resolve().then(async () => {
    const response = await fetchImpl(`${base}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const retryDelay = response.status === 429
        ? retryAfterSeconds(response.headers?.get?.('Retry-After')) : null;
      throw new SafetyReportRequestError(
        typeof body?.error === 'string' ? body.error : 'Unable to submit the report.',
        { status: response.status, retryAfterSeconds: retryDelay }
      );
    }
    if (response.status !== 201 || !validateSafetyReportReceipt(body)) {
      throw new SafetyReportRequestError(
        'We could not verify a report receipt. Your report may have been received; please avoid resubmitting immediately.',
        { status: response.status, uncertain: true }
      );
    }
    return body;
  });
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new SafetyReportRequestError(
        'The request timed out. Your report may have been received; please avoid resubmitting immediately.',
        { uncertain: true }
      ));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, deadline]);
  } catch (error) {
    if (timedOut || error instanceof SafetyReportRequestError) throw error;
    throw new SafetyReportRequestError(
      'We could not confirm the submission. Your report may have been received; please avoid resubmitting immediately.',
      { uncertain: true, cause: error }
    );
  } finally {
    clearTimeout(timer);
  }
}

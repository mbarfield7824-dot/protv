import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ProTVFooter from '../components/ProTVFooter';
import ProTVHeader from '../components/ProTVHeader';
import ProTVShell from '../components/ProTVShell';
import { api } from '../api';
import {
  buildSafetyReportPayload,
  REPORT_REASONS,
  REPORT_TYPES,
  SafetyReportRequestError,
  validateSafetyReport,
} from '../data/safetyReports';
import '../styles/SafetyReport.css';

function initialValues(search) {
  const params = new URLSearchParams(search);
  const type = REPORT_TYPES.some((option) => option.value === params.get('type'))
    ? params.get('type') : 'general';
  return {
    type,
    reason: '',
    description: '',
    targetId: params.get('targetId') || '',
    targetUrl: params.get('targetUrl') || '',
    targetDescription: params.get('targetDescription') || '',
    contactEmail: '',
  };
}

function retryMessage(seconds) {
  if (seconds === null || seconds === undefined) return '';
  if (seconds === 0) return ' The retry interval has elapsed.';
  return ` Please wait about ${seconds} second${seconds === 1 ? '' : 's'} before trying again.`;
}

export default function SafetyReport() {
  const { search } = useLocation();
  const [values, setValues] = useState(() => initialValues(search));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const submittingRef = useRef(false);
  const focusErrorSummaryRef = useRef(false);
  const errorSummaryRef = useRef(null);

  useEffect(() => {
    if (!focusErrorSummaryRef.current) return;
    focusErrorSummaryRef.current = false;
    errorSummaryRef.current?.focus();
  }, [errors, formError]);

  const update = (field) => (event) => {
    if (submittingRef.current) return;
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      if (field === 'type' || field.startsWith('target')) delete next.target;
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submittingRef.current || receipt) return;
    const validation = validateSafetyReport(values);
    if (Object.keys(validation).length) {
      focusErrorSummaryRef.current = true;
      setErrors(validation);
      return;
    }
    setErrors({});
    setFormError('');

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const persisted = await api.submitSafetyReport(buildSafetyReportPayload(values));
      setReceipt(persisted);
    } catch (error) {
      const message = error instanceof SafetyReportRequestError
        ? `${error.message}${error.status === 429 ? retryMessage(error.retryAfterSeconds) : ''}`
        : 'Unable to submit the report. Your report may have been received; please avoid resubmitting immediately.';
      focusErrorSummaryRef.current = true;
      setFormError(message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const fieldError = (field) => errors[field]
    ? <span className="safety-report__field-error" id={`${field}-error`}>{errors[field]}</span>
    : null;
  const describedBy = (field, ...helpIds) => [
    ...helpIds,
    errors[field] ? `${field}-error` : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="safety-report-page">
        <header className="safety-report__hero">
          <p className="safety-report__eyebrow">PROtv Safety</p>
          <h1>Report a safety concern</h1>
          <p>
            Use this form to report content, an account or creator, or another safety concern.
            Reports are stored for review; submitting one does not guarantee removal, enforcement
            action, or a response.
          </p>
        </header>

        {receipt ? (
          <section className="safety-report__receipt" role="status" aria-live="polite">
            <h2>Report received</h2>
            <p>Your report was saved. Keep this receipt ID for your records.</p>
            <p className="safety-report__receipt-id"><span>Receipt ID</span> {receipt.id}</p>
            <Link to="/" className="safety-report__button safety-report__button--secondary">Return to PROtv</Link>
          </section>
        ) : (
          <form className="safety-report__form" onSubmit={submit} noValidate aria-busy={submitting}>
            {(formError || Object.keys(errors).length > 0) && (
              <div
                className="safety-report__errors"
                role="alert"
                aria-live="assertive"
                tabIndex="-1"
                ref={errorSummaryRef}
              >
                <h2>{formError ? 'Report not confirmed' : 'Check your report'}</h2>
                {formError && <p>{formError}</p>}
                {Object.keys(errors).length > 0 && (
                  <ul>
                    {Object.entries(errors).map(([field, message]) => (
                      <li key={field}><a href={`#${field}`}>{message}</a></li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <fieldset className="safety-report__fields" disabled={submitting}>
              <div className="safety-report__field">
                <label htmlFor="type">What are you reporting?</label>
                <select id="type" name="type" value={values.type} onChange={update('type')}
                  aria-invalid={Boolean(errors.type)} aria-describedby={describedBy('type')}>
                  {REPORT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
                {fieldError('type')}
                {values.type === 'account' && (
                  <p className="safety-report__hint">No account or creator profile page is required.</p>
                )}
              </div>

              <div className="safety-report__field">
                <label htmlFor="reason">Reason for report</label>
                <select id="reason" name="reason" value={values.reason} onChange={update('reason')}
                  aria-invalid={Boolean(errors.reason)} aria-describedby={describedBy('reason')}>
                  <option value="">Choose a reason</option>
                  {REPORT_REASONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
                {fieldError('reason')}
              </div>

              <fieldset className="safety-report__references" id="target">
                <legend>What should we review?</legend>
                {errors.target && <p className="safety-report__field-error" id="target-error">{errors.target}</p>}
                <div className="safety-report__field">
                  <label htmlFor="targetId">Stable content, account, or creator ID</label>
                  <input id="targetId" name="targetId" type="text" maxLength="200" value={values.targetId}
                    onChange={update('targetId')} aria-invalid={Boolean(errors.targetId)}
                    aria-describedby={describedBy('targetId', errors.target ? 'target-error' : null)}
                    autoComplete="off" />
                  {fieldError('targetId')}
                </div>
                <div className="safety-report__field">
                  <label htmlFor="targetUrl">Page URL</label>
                  <input id="targetUrl" name="targetUrl" type="url" maxLength="2048" value={values.targetUrl}
                    onChange={update('targetUrl')} aria-invalid={Boolean(errors.targetUrl)}
                    aria-describedby={describedBy('targetUrl', errors.target ? 'target-error' : null)}
                    inputMode="url" />
                  {fieldError('targetUrl')}
                </div>
                <div className="safety-report__field">
                  <label htmlFor="targetDescription">Descriptive reference</label>
                  <textarea id="targetDescription" name="targetDescription" maxLength="1000" rows="3"
                    value={values.targetDescription} onChange={update('targetDescription')}
                    aria-invalid={Boolean(errors.targetDescription)}
                    aria-describedby={describedBy('targetDescription', 'targetDescription-help',
                      errors.target ? 'target-error' : null)} />
                  <span className="safety-report__hint" id="targetDescription-help">
                    For example, a creator name or a description of where the concern appears.
                  </span>
                  {fieldError('targetDescription')}
                </div>
              </fieldset>

              <div className="safety-report__field">
                <label htmlFor="description">Describe the concern</label>
                <textarea id="description" name="description" required maxLength="5000" rows="7"
                  value={values.description} onChange={update('description')}
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={describedBy('description', 'description-help')} />
                <span className="safety-report__hint" id="description-help">
                  Share text details that can help identify and understand the safety issue.
                </span>
                {fieldError('description')}
              </div>

              <div className="safety-report__notice" role="note">
                <strong>Text references only. Do not upload, attach, email, or otherwise send suspected
                  child sexual abuse material or exploitation files.</strong> Describe the concern in
                text; this form does not accept evidence uploads.
              </div>

              <div className="safety-report__field">
                <label htmlFor="contactEmail">Contact email (optional)</label>
                <input id="contactEmail" name="contactEmail" type="email" maxLength="254"
                  autoComplete="email" value={values.contactEmail} onChange={update('contactEmail')}
                  aria-invalid={Boolean(errors.contactEmail)}
                  aria-describedby={describedBy('contactEmail', 'contactEmail-help')} />
                <span className="safety-report__hint" id="contactEmail-help">
                  Add an address only if you want to provide contact information.
                </span>
                {fieldError('contactEmail')}
              </div>
            </fieldset>

            <button className="safety-report__button" type="submit" disabled={submitting}>
              {submitting ? 'Submitting report…' : 'Submit report'}
            </button>
          </form>
        )}
      </main>
      <ProTVFooter />
    </ProTVShell>
  );
}

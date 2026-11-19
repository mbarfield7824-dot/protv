import { useRef, useState } from 'react';
import { isFirebaseConfigured } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { AUTH_SLOW_MS, AUTH_TIMEOUT_MS, authErrorMessage, isInAppBrowser, withTimeout } from '../context/authFlow';
import '../styles/AuthModal.css';

const LOGIN = 'login';
const REGISTER = 'register';
const RESET = 'reset';

export default function AuthModal({ open, onClose, timeoutMs = AUTH_TIMEOUT_MS, slowMs = AUTH_SLOW_MS }) {
  const { register, signIn, signInWithGoogle, resetPassword, authConfigured = isFirebaseConfigured } = useAuth();
  const [mode, setMode] = useState(LOGIN);
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);
  const attempt = useRef(0);
  const inAppBrowser = typeof navigator !== 'undefined' && isInAppBrowser(navigator.userAgent);

  // AuthProvider remounts the box each time it opens, so a request still in flight from an earlier opening
  // can never leave a fresh box stuck on "Please wait...".
  if (!open) return null;

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setErrorCode('');
    setNotice('');
  };

  // Runs one auth request with a time limit. The button always comes back, with a clear message on failure.
  // The Google window is not time-limited: the visitor may still be typing in it.
  const run = async (request, onSuccess, { timeLimited = true } = {}) => {
    const id = ++attempt.current;
    setError('');
    setErrorCode('');
    setNotice('');
    setSubmitting(true);
    setSlow(false);
    const slowTimer = timeLimited ? setTimeout(() => { if (attempt.current === id) setSlow(true); }, slowMs) : null;
    try {
      await (timeLimited ? withTimeout(request(), timeoutMs) : request());
      if (attempt.current === id) onSuccess?.();
    } catch (requestError) {
      if (attempt.current === id) {
        setError(authErrorMessage(requestError, { inAppBrowser }));
        setErrorCode(requestError?.code || '');
      }
    } finally {
      clearTimeout(slowTimer);
      if (attempt.current === id) {
        setSubmitting(false);
        setSlow(false);
      }
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (mode === REGISTER) return run(() => register(form));
    if (mode === RESET) {
      return run(() => resetPassword(form.email),
        () => setNotice('Password-reset instructions have been sent if this email has an account.'));
    }
    return run(() => signIn(form));
  };

  const handleGoogleSignIn = () => run(() => signInWithGoogle(), null, { timeLimited: false });

  return (
    <div className="auth-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Close sign in">x</button>
        <p className="auth-wordmark" aria-label="PROtv">
          PRO<span>tv</span>
        </p>
        <h2 id="auth-title">
          {mode === REGISTER ? 'Create your account' : mode === RESET ? 'Reset your password' : 'Welcome back'}
        </h2>
        <p className="auth-description">
          {mode === REGISTER
            ? 'One free PROtv account lets you watch, and lets filmmakers submit their work through the Creator Portal.'
            : mode === RESET
              ? 'Enter your email to receive password-reset instructions.'
              : 'Sign in to watch PROtv or open the Creator Portal.'}
        </p>
        {!authConfigured ? (
          <p className="auth-error">Sign-in is not configured yet. Add the Firebase web configuration to the frontend environment first.</p>
        ) : (
          <>
            <form onSubmit={handleSubmit}>
              {mode === REGISTER && (
                <label>
                  Name
                  <input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} autoComplete="name" />
                </label>
              )}
              <label>
                Email
                <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" />
              </label>
              {mode !== RESET && (
                <label>
                  Password
                  <input required type="password" minLength="6" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete={mode === REGISTER ? 'new-password' : 'current-password'} />
                </label>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                  {errorCode === 'auth/email-already-in-use' && (
                    <>
                      {' '}
                      <button type="button" className="auth-inline-link" onClick={() => switchMode(LOGIN)}>Sign in</button>
                    </>
                  )}
                </p>
              )}
              {notice && <p className="auth-notice" role="status">{notice}</p>}
              {slow && <p className="auth-notice" role="status">Still working. This can take a few seconds on a slow connection.</p>}
              <button className="auth-primary" disabled={submitting}>
                {submitting ? 'Please wait...' : mode === REGISTER ? 'Create account' : mode === RESET ? 'Send reset email' : 'Sign in'}
              </button>
            </form>
            {mode !== RESET && (
              <>
                <div className="auth-divider"><span>or</span></div>
                <button className="auth-google" onClick={handleGoogleSignIn} disabled={submitting}>Continue with Google</button>
                {inAppBrowser && (
                  <p className="auth-hint">
                    Google sign-in does not work inside Instagram, Facebook and other in-app browsers. Use your email above,
                    or open watchprotv.com in Safari or Chrome.
                  </p>
                )}
              </>
            )}
            <div className="auth-links">
              {mode === LOGIN && <><button onClick={() => switchMode(REGISTER)}>Create an account</button><button onClick={() => switchMode(RESET)}>Forgot password?</button></>}
              {mode !== LOGIN && <button onClick={() => switchMode(LOGIN)}>Back to sign in</button>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

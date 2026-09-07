import { useState } from 'react';
import { isFirebaseConfigured } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import '../styles/AuthModal.css';

const LOGIN = 'login';
const REGISTER = 'register';
const RESET = 'reset';

function messageFor(error) {
  return error.code === 'auth/invalid-credential'
    ? 'Incorrect email or password.'
    : error.code === 'auth/email-already-in-use'
      ? 'An account already exists for this email address.'
      : error.code === 'auth/popup-closed-by-user'
        ? 'Google sign-in was cancelled.'
        : error.message;
}

export default function AuthModal({ open, onClose }) {
  const { register, signIn, signInWithGoogle, resetPassword } = useAuth();
  const [mode, setMode] = useState(LOGIN);
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      if (mode === REGISTER) await register(form);
      else if (mode === RESET) {
        await resetPassword(form.email);
        setNotice('Password-reset instructions have been sent if this email has an account.');
      } else await signIn(form);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="auth-close" onClick={onClose} aria-label="Close sign in">x</button>
        <p className="auth-eyebrow">PROtv</p>
        <h2 id="auth-title">
          {mode === REGISTER ? 'Create your account' : mode === RESET ? 'Reset your password' : 'Welcome back'}
        </h2>
        {!isFirebaseConfigured ? (
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
              {error && <p className="auth-error">{error}</p>}
              {notice && <p className="auth-notice">{notice}</p>}
              <button className="auth-primary" disabled={submitting}>
                {submitting ? 'Please wait...' : mode === REGISTER ? 'Create account' : mode === RESET ? 'Send reset email' : 'Sign in'}
              </button>
            </form>
            {mode !== RESET && (
              <>
                <div className="auth-divider"><span>or</span></div>
                <button className="auth-google" onClick={handleGoogleSignIn} disabled={submitting}>Continue with Google</button>
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

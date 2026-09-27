import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import ProTVHeader from '../components/ProTVHeader';
import ProTVShell from '../components/ProTVShell';
import { useAuth } from '../hooks/useAuth';
import '../styles/Activate.css';

const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const STORAGE_KEY = 'protv:pending-activation-code';
const CODE_LIFETIME_MS = 10 * 60 * 1000;

function normalizeCode(value) {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

function formatCode(code) {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function readPendingCode() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return '';
    const { code, expiresAt } = JSON.parse(saved);
    return typeof code === 'string' && CODE_PATTERN.test(code)
      && typeof expiresAt === 'number' && Date.now() < expiresAt ? code : '';
  } catch (storageError) {
    console.warn('Unable to restore pending TV activation code:', storageError);
    return '';
  }
}

const errorMessages = {
  400: 'Enter a valid 8-character code shown on your TV.',
  401: 'Your session has expired. Please sign in again to activate your TV.',
  403: 'An interactive PROtv Web sign-in is required. Please sign in again.',
  404: 'This code is invalid, expired, or no longer available. Check your TV for a new code.',
  429: 'Too many activation attempts. Please try again later.',
  503: 'TV activation is temporarily unavailable. Please try again later.',
};

export default function Activate() {
  const { user, loading, openAuthModal } = useAuth();
  const [code, setCode] = useState(readPendingCode);
  const [phase, setPhase] = useState('editing');
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (storageError) {
      console.warn('Unable to clear restored TV activation code:', storageError);
    }
  }, []);

  useEffect(() => {
    if (!user || loading) return;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (storageError) {
      console.warn('Unable to clear pending TV activation code:', storageError);
    }
  }, [user, loading]);

  const handleCodeChange = (event) => {
    setCode(normalizeCode(event.target.value));
    setError('');
    setErrorStatus(null);
  };

  const requestSignIn = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        code,
        expiresAt: Date.now() + CODE_LIFETIME_MS,
      }));
    } catch (storageError) {
      console.warn('Unable to preserve TV activation code for redirect sign-in:', storageError);
    }
    openAuthModal();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current || phase === 'success' || loading) return;

    if (!CODE_PATTERN.test(code)) {
      setError('Enter the 8-character code shown on your TV. Use only the characters displayed.');
      return;
    }
    setError('');
    setErrorStatus(null);

    if (!user) {
      requestSignIn();
      return;
    }

    submittingRef.current = true;
    setPhase('submitting');
    try {
      await api.approveDeviceSession(code);
      setPhase('success');
    } catch (requestError) {
      setError(errorMessages[requestError.status] || 'Unable to connect your TV right now. Please try again.');
      setErrorStatus(requestError.status);
      setPhase('editing');
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <ProTVShell>
      <ProTVHeader />
      <main className="ptv-activate">
        <div className="ptv-activate__eyebrow"><span aria-hidden="true" /> TV &amp; devices</div>
        <section className="ptv-activate__card" aria-labelledby="activate-title">
          <div className="ptv-activate__icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="6" y="10" width="36" height="26" rx="4" stroke="currentColor" strokeWidth="2" />
              <path d="M17 42h14M24 36v6M19 23l4 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="ptv-activate__kicker">Bring PROtv to the big screen</p>
          <h1 id="activate-title">Activate your TV</h1>
          {phase === 'success' ? (
            <div className="ptv-activate__result" role="status">
              <p>Your TV is connected. You can return to your TV.</p>
              <Link to="/">Explore PROtv</Link>
            </div>
          ) : (
            <>
              <p className="ptv-activate__lead">Enter the code shown on your TV.</p>
              <form onSubmit={handleSubmit}>
                <label htmlFor="activation-code">TV activation code</label>
                <input
                  id="activation-code"
                  type="text"
                  value={formatCode(code)}
                  onChange={handleCodeChange}
                  placeholder="XXXX-XXXX"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'activation-error' : 'activation-hint'}
                  disabled={phase === 'submitting'}
                />
                <p className="ptv-activate__hint" id="activation-hint">The code expires after a short time. Keep your TV screen open.</p>
                {error && <p className="ptv-activate__error" id="activation-error" role="alert">{error}</p>}
                {(errorStatus === 401 || errorStatus === 403) && (
                  <button className="ptv-activate__reauth" type="button" onClick={requestSignIn}>Sign in again</button>
                )}
                {!loading && !user && <p className="ptv-activate__auth">You will be asked to sign in before activating your TV.</p>}
                <button type="submit" disabled={loading || phase === 'submitting'}>
                  {loading ? 'Checking your account...' : phase === 'submitting' ? 'Connecting your TV...' : user ? 'Activate TV' : 'Continue to sign in'}
                </button>
              </form>
              <div className="ptv-activate__warning">
                <span aria-hidden="true">!</span>
                <p>Only enter a code displayed on a TV you are using. Never enter a code someone else sends you.</p>
              </div>
            </>
          )}
        </section>
        <p className="ptv-activate__footer">Your screen. Your stories. <Link to="/">Back to PROtv</Link></p>
      </main>
    </ProTVShell>
  );
}

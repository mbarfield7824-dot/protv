import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import '../styles/InfoPages.css';

export default function AccountDeletion() {
  const { user, loading, openAuthModal, signOut } = useAuth();
  const [requestSnapshot, setRequestSnapshot] = useState(null);
  const [confirmedViewer, setConfirmedViewer] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) return () => { cancelled = true; };

    user.getIdToken()
      .then((token) => api.getAccountDeletionRequest(token))
      .then((currentRequest) => {
        if (!cancelled) setRequestSnapshot({ viewer: user, request: currentRequest, loaded: true });
      })
      .catch((loadError) => {
        if (!cancelled) {
          setRequestSnapshot({
            viewer: user,
            request: null,
            loaded: true,
            error: loadError.message || 'Unable to load your deletion request.',
          });
        }
      });

    return () => { cancelled = true; };
  }, [user]);

  const currentSnapshot = requestSnapshot?.viewer === user ? requestSnapshot : null;
  const request = currentSnapshot?.request || null;
  const requestLoaded = !user || currentSnapshot?.loaded === true;
  const confirmed = Boolean(user && confirmedViewer === user);

  const submit = async (event) => {
    event.preventDefault();
    if (!user || !confirmed || submitting) return;
    setSubmitting(true);
    setError(null);
    setNeedsReauthentication(false);
    try {
      const token = await user.getIdToken();
      const createdRequest = await api.requestAccountDeletion(token);
      setRequestSnapshot({ viewer: user, request: createdRequest, loaded: true });
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit your deletion request.');
      setNeedsReauthentication(submitError.status === 403);
    } finally {
      setSubmitting(false);
    }
  };

  const signInAgain = async () => {
    try {
      await signOut();
      setError(null);
      setNeedsReauthentication(false);
      openAuthModal();
    } catch (signOutError) {
      setError(signOutError.message || 'Unable to restart your sign-in. Please try again.');
    }
  };

  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero">
          <p className="info-eyebrow">Account privacy</p>
          <h1>Request account deletion</h1>
          <p className="info-lead">
            Use this page to submit an authenticated request for PROtv to review.
            Submitting a request does not immediately delete your account or data.
          </p>
        </section>
        <section className="info-copy account-deletion-copy" aria-live="polite">
          <h2>What happens next</h2>
          <p>
            Requests are recorded for manual review. No account, viewing history,
            creator records, reports, or other data are automatically removed by
            this request form. We do not yet provide a completion date here.
          </p>
          <p>
            Creator agreements, payment/tax records, safety reports, security
            records, backups, and provider-held data may need separate review.
            Those retention decisions are still being finalized.
          </p>
          {loading ? <p>Checking your sign-in…</p> : !user ? (
            <div className="account-deletion-panel">
              <p>Sign in to submit or view a request for your account.</p>
              <button className="info-link-button" type="button" onClick={openAuthModal}>Sign In</button>
            </div>
          ) : !requestLoaded ? (
            <p>Loading your request status…</p>
          ) : request ? (
            <div className="account-deletion-panel" role="status">
              <h2>Request received</h2>
              <p>
                Status: <strong>{request.status}</strong>
                {request.requestedAt ? ` · ${new Date(request.requestedAt).toLocaleString()}` : ''}
              </p>
              <p>Your account remains active while the request is awaiting review.</p>
            </div>
          ) : (
            <form className="account-deletion-panel" onSubmit={submit} aria-busy={submitting}>
              <label className="account-deletion-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmedViewer(event.target.checked ? user : null)}
                  disabled={submitting}
                />
                <span>
                  I am requesting a review of account deletion and understand this
                  submission does not immediately delete my account or data.
                </span>
              </label>
              <button
                className="info-link-button"
                type="submit"
                disabled={!confirmed || submitting}
              >
                {submitting ? 'Submitting…' : 'Submit deletion request'}
              </button>
            </form>
          )}
          {(error || currentSnapshot?.error) && <p role="alert">{error || currentSnapshot.error}</p>}
          {needsReauthentication && (
            <button className="info-link-button" type="button" onClick={() => void signInAgain()}>
              Sign in again to verify your identity
            </button>
          )}
          <p><Link to="/profile">Account settings</Link> · <Link to="/privacy">Privacy</Link></p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

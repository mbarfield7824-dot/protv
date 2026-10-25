import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import '../styles/InfoPages.css';

const SUPPORT_EMAIL = 'support@watchprotv.com';
const EMAIL_REQUEST_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my PROtv account')}`;

const requestStatuses = {
  pending_review: {
    label: 'Received',
    detail: 'We review every request by hand. We will email you if we need anything else.',
  },
  additional_information_required: {
    label: 'More information needed',
    detail: 'Please reply to our email or contact support so we can continue.',
  },
  approved_for_processing: {
    label: 'Being processed',
    detail: 'Your request is approved and your data is being deleted.',
  },
  sign_in_deleted: {
    label: 'Being processed',
    detail: 'Your sign-in account has been deleted and the rest of your data is being removed.',
  },
  on_hold: {
    label: 'On hold',
    detail: 'We have paused this request and will email you to explain why.',
  },
  completed: {
    label: 'Completed',
    detail: 'Your account and its data have been deleted.',
  },
};

function RequestPanel() {
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
            unavailable: loadError.code === 'deletion_unavailable_in_environment',
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

  let body;
  if (loading) {
    body = <p>Checking your sign-in…</p>;
  } else if (!user) {
    body = (
      <>
        <p>Sign in with the PROtv account you want to delete. This confirms the request comes from you.</p>
        <button className="info-link-button" type="button" onClick={openAuthModal}>Sign in to continue</button>
      </>
    );
  } else if (!requestLoaded) {
    body = <p>Loading your request status…</p>;
  } else if (currentSnapshot?.unavailable) {
    body = null;
  } else if (request) {
    const status = requestStatuses[request.status] || { label: request.status, detail: '' };
    body = (
      <div role="status">
        <p className="account-deletion-status">
          Status: <strong>{status.label}</strong>
        </p>
        {request.requestedAt && (
          <p>Requested {new Date(request.requestedAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
        )}
        <p>{status.detail}</p>
        {request.adminMessage && <p className="account-deletion-message">Message from PROtv: {request.adminMessage}</p>}
        {request.status !== 'completed' && user.email && (
          <p>We will email <strong>{user.email}</strong> when deletion is complete. After that you will not be able to sign in.</p>
        )}
      </div>
    );
  } else {
    body = (
      <form className="account-deletion-form" onSubmit={submit} aria-busy={submitting}>
        {user.email && <p>Signed in as <strong>{user.email}</strong></p>}
        <label className="account-deletion-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmedViewer(event.target.checked ? user : null)}
            disabled={submitting}
          />
          <span>
            I want to permanently delete this PROtv account and the data described below,
            on the website and in every PROtv app.
          </span>
        </label>
        <button className="info-link-button" type="submit" disabled={!confirmed || submitting}>
          {submitting ? 'Submitting…' : 'Request account deletion'}
        </button>
      </form>
    );
  }

  return (
    <div className="account-deletion-panel" aria-live="polite">
      <h2>Request deletion</h2>
      {body}
      {(error || currentSnapshot?.error) && <p role="alert" className="account-deletion-error">{error || currentSnapshot.error}</p>}
      {needsReauthentication && (
        <button className="info-link-button" type="button" onClick={() => void signInAgain()}>
          Sign in again
        </button>
      )}
    </div>
  );
}

export default function AccountDeletion() {
  return (
    <div className="info-page">
      <Header />
      <main className="info-content">
        <section className="info-hero account-deletion-hero">
          <p className="info-eyebrow">Account privacy</p>
          <h1>Delete your PROtv account</h1>
          <p className="info-lead">
            One PROtv account works on the website and in every PROtv app, on TVs and other devices.
            Deleting it removes it everywhere. You do not need to install an app to ask.
          </p>
        </section>

        <section className="info-copy account-deletion-copy">
          <RequestPanel />

          <h2>Can't sign in?</h2>
          <p>
            If you forgot your password, choose “Forgot password?” in the sign-in window to reset it.
            Otherwise, email <a href={EMAIL_REQUEST_HREF}>{SUPPORT_EMAIL}</a> from the email address on your
            PROtv account, with the subject “Delete my PROtv account”. To protect your account, we
            only act on requests sent from that address.
          </p>

          <h2>What we delete</h2>
          <ul className="account-deletion-list">
            <li>Your sign-in account: email address, display name, password and any Google sign-in link.</li>
            <li>My List.</li>
            <li>Watch progress, Continue Watching and watch history.</li>
            <li>Links to TVs you activated with a code. Any TV or browser still signed in stops working with your account within about an hour.</li>
            <li>Safety reports you sent from your account's email address, if you ask us to and none is still under review.</li>
          </ul>

          <h2>What we keep, and why</h2>
          <ul className="account-deletion-list">
            <li>
              <strong>A record of your request</strong> — your account ID (not your email), the
              request dates and its status — so we can show the request was handled.
            </li>
            <li>
              <strong>Creator Portal records.</strong> If you have opened the PROtv Creator Portal,
              it keeps your name, email address and any projects in a separate system, which we
              review with your request. Signed creator agreements are kept as contract records.
              Contact us about titles you have licensed to PROtv.
            </li>
            <li><strong>Safety reports still under review</strong>, until the review is finished.</li>
            <li><strong>Emails you send us</strong>, as part of our support records.</li>
          </ul>
          <p>
            Sign-in, password-reset and safety-report rate limits are stored under a one-way hash of
            the email or network address used, not under your account, and are not removed when
            your account is deleted. Ad statistics use random session IDs and are not linked to
            your account. Our service providers (Google
            Firebase, Vercel and Mux) may keep limited operational logs under their own retention schedules.
          </p>

          <h2>Data stored on your TV</h2>
          <p>
            PROtv TV apps keep some data on the TV itself: your sign-in, and recent watch progress
            (including progress saved while browsing as a guest, which is never sent to PROtv). We
            cannot erase a TV remotely. To remove it, sign out on the TV, then uninstall the PROtv
            app — uninstalling removes everything the app stored on that device.
          </p>

          <h2>What to expect</h2>
          <p>
            We review every request by hand. You can come back to this page while signed in to
            check its status. When deletion is complete we will email you, and you will no longer
            be able to sign in. To use PROtv again later, create a new account.
          </p>

          <p className="account-deletion-links">
            <Link to="/privacy">Privacy Policy</Link> · <Link to="/profile">Account settings</Link> ·{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

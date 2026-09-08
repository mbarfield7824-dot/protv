import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useAuth } from '../hooks/useAuth';
import '../styles/Profile.css';

export default function Profile() {
  const navigate = useNavigate();
  const { user, loading, favorites, openAuthModal, resetPassword, signOut } = useAuth();

  if (loading) return <div className="loading">Loading PROtv...</div>;

  if (!user) {
    return (
      <div className="profile-page">
        <Header />
        <main className="profile-content profile-sign-in">
          <p className="profile-eyebrow">PROtv Member</p>
          <h1>Your account</h1>
          <p>Sign in to view your profile, saved titles, and account settings.</p>
          <button className="profile-primary" onClick={openAuthModal}>Sign In</button>
        </main>
        <Footer />
      </div>
    );
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'PROtv Member';
  const provider = user.providerData?.some((item) => item.providerId === 'google.com')
    ? 'Google'
    : 'Email and password';

  const sendReset = async () => {
    try {
      await resetPassword(user.email);
      window.alert('Password-reset instructions have been sent to your email address.');
    } catch (error) {
      window.alert(error.message || 'Unable to send password-reset instructions.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="profile-page">
      <Header />
      <main className="profile-content">
        <section className="profile-hero">
          <div className="profile-large-avatar">{displayName.charAt(0).toUpperCase()}</div>
          <div>
            <p className="profile-eyebrow">PROtv Member</p>
            <h1>{displayName}</h1>
            <p>{user.email}</p>
          </div>
        </section>

        <section className="profile-grid">
          <article className="profile-card">
            <p className="profile-card-label">My List</p>
            <strong>{favorites.length} saved {favorites.length === 1 ? 'title' : 'titles'}</strong>
            <p>Keep your next watch close at hand.</p>
            <Link className="profile-card-link" to="/#my-list">View My List</Link>
          </article>

          <article className="profile-card">
            <p className="profile-card-label">Account details</p>
            <dl>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Sign-in method</dt><dd>{provider}</dd></div>
            </dl>
          </article>

          <article className="profile-card">
            <p className="profile-card-label">Security</p>
            <p>Send password-reset instructions to your account email.</p>
            <button className="profile-card-link" onClick={() => void sendReset()}>Reset Password</button>
          </article>

          <article className="profile-card profile-card-muted">
            <p className="profile-card-label">Membership</p>
            <strong>Subscription settings</strong>
            <p>Membership plans and billing controls will appear here when available.</p>
          </article>
        </section>

        <button className="profile-sign-out" onClick={() => void handleSignOut()}>Sign Out</button>
      </main>
      <Footer />
    </div>
  );
}

import { useCallback, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { api } from '../api';
import { useAuth } from './useAuth';

export function useCreatorPortal() {
  const { user, openAuthModal } = useAuth();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  const openCreatorPortal = useCallback(async () => {
    setError('');
    setVerificationMessage('');
    if (!user) {
      openAuthModal();
      return;
    }

    setOpening(true);
    try {
      await user.reload();
      if (!user.emailVerified) {
        setVerificationRequired(true);
        return;
      }
      await user.getIdToken(true);
      const { url } = await api.createCreatorSso();
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open the Creator Portal.');
    } finally {
      setOpening(false);
    }
  }, [openAuthModal, user]);

  const sendVerification = useCallback(async () => {
    setError('');
    setVerificationMessage('');
    if (!user) {
      openAuthModal();
      return;
    }
    setOpening(true);
    try {
      await sendEmailVerification(user);
      setVerificationRequired(true);
      setVerificationMessage(`Verification email sent to ${user.email}. Check your inbox and spam folder.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send the verification email.');
    } finally {
      setOpening(false);
    }
  }, [openAuthModal, user]);

  return {
    openCreatorPortal,
    opening,
    error,
    verificationRequired,
    verificationMessage,
    sendVerification,
  };
}

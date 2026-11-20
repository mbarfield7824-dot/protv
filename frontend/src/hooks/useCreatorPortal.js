import { useCallback, useEffect, useRef, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { api } from '../api';
import { useAuth } from './useAuth';
import {
  authErrorMessage,
  isInAppBrowser,
  lastVerificationSent,
  NOT_VERIFIED_YET,
  requestVerificationEmail,
  verificationActionSettings,
  verificationCooldownLeft,
  verificationSentMessage,
} from '../context/authFlow';

const firebaseSend = (user) => sendEmailVerification(user, verificationActionSettings);

function friendlyError(reason, fallback) {
  if (reason?.code?.startsWith?.('auth/')) {
    return authErrorMessage(reason, { inAppBrowser: isInAppBrowser(globalThis.navigator?.userAgent || '') });
  }
  return reason instanceof Error ? reason.message : fallback;
}

export function useCreatorPortal() {
  const { user, openAuthModal, signOut, sendVerificationEmail } = useAuth();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const announced = useRef(false);

  // Counts down until another verification email may be requested, so the button cannot trigger Firebase's limit.
  // Sign-up sends the first email in the background, so once it is recorded, say where it went (once).
  useEffect(() => {
    if (!verificationRequired || !user) return undefined;
    const tick = () => {
      setCooldownSeconds(Math.ceil(verificationCooldownLeft(user.uid) / 1000));
      if (!announced.current && lastVerificationSent(user.uid)) {
        announced.current = true;
        setVerificationMessage((current) => current || verificationSentMessage(user.email));
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [verificationRequired, user]);

  const openCreatorPortal = useCallback(async () => {
    setError('');
    if (!user) {
      openAuthModal();
      return;
    }

    setOpening(true);
    try {
      await user.reload();
      if (!user.emailVerified) {
        if (verificationRequired) {
          setVerificationMessage('');
          setError(NOT_VERIFIED_YET);
        } else if (lastVerificationSent(user.uid)) {
          announced.current = true;
          setVerificationMessage(verificationSentMessage(user.email));
        }
        setVerificationRequired(true);
        return;
      }
      setVerificationMessage('');
      await user.getIdToken(true);
      const { url } = await api.createCreatorSso();
      window.location.assign(url);
    } catch (reason) {
      setError(friendlyError(reason, 'Unable to open the Creator Portal.'));
    } finally {
      setOpening(false);
    }
  }, [openAuthModal, user, verificationRequired]);

  const sendVerification = useCallback(async () => {
    setError('');
    setVerificationMessage('');
    if (!user) {
      openAuthModal();
      return;
    }
    setOpening(true);
    try {
      const result = await requestVerificationEmail(user, { send: sendVerificationEmail || firebaseSend });
      setVerificationRequired(true);
      announced.current = true;
      if (result.ok) setVerificationMessage(result.message);
      else setError(result.message);
      setCooldownSeconds(Math.ceil(verificationCooldownLeft(user.uid) / 1000));
    } finally {
      setOpening(false);
    }
  }, [openAuthModal, sendVerificationEmail, user]);

  return {
    user,
    openCreatorPortal,
    opening,
    error,
    verificationRequired,
    verificationMessage,
    sendVerification,
    cooldownSeconds,
    signOut,
  };
}

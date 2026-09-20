import { useCallback, useState } from 'react';
import { api } from '../api';
import { useAuth } from './useAuth';

export function useCreatorPortal() {
  const { user, openAuthModal } = useAuth();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  const openCreatorPortal = useCallback(async () => {
    setError('');
    if (!user) {
      openAuthModal();
      return;
    }

    setOpening(true);
    try {
      const { url } = await api.createCreatorSso();
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open the Creator Portal.');
      setOpening(false);
    }
  }, [openAuthModal, user]);

  return { openCreatorPortal, opening, error };
}

import { useCallback, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { firebaseAuth, googleProvider, isFirebaseConfigured } from '../firebase';
import { api } from '../api';
import AuthModal from '../components/AuthModal';
import { AuthContext } from './authState';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [progress, setProgress] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!firebaseAuth) return undefined;
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setFavorites([]);
        setProgress({});
        setIsAdmin(false);
        setAdminLoading(false);
      } else {
        setAdminLoading(true);
        nextUser.getIdTokenResult()
          .then((tokenResult) => setIsAdmin(tokenResult.claims.admin === true))
          .catch((error) => {
            console.error('Failed to load account permissions:', error);
            setIsAdmin(false);
          })
          .finally(() => setAdminLoading(false));
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;
    user.getIdToken()
      .then((token) => api.getFavorites(token))
      .then((favoriteIds) => {
        if (!cancelled) setFavorites(favoriteIds);
      })
      .catch((error) => console.error('Failed to load favorites:', error));

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;
    user.getIdToken()
      .then((token) => api.getProgress(token))
      .then((watchProgress) => {
        if (!cancelled) setProgress(watchProgress || {});
      })
      .catch((error) => console.error('Failed to load watch progress:', error));

    return () => {
      cancelled = true;
    };
  }, [user]);

  const updateProgress = useCallback(async (videoId, { positionSeconds, durationSeconds }) => {
    if (!user || !durationSeconds) return;

    const progressPercent = Math.min(100, Math.max(0, Math.round((positionSeconds / durationSeconds) * 100)));
    const entry = { positionSeconds, durationSeconds, progressPercent, updatedAt: Date.now() };
    setProgress((current) => ({ ...current, [videoId]: entry }));

    try {
      const token = await user.getIdToken();
      await api.setProgress(videoId, { positionSeconds, durationSeconds }, token);
    } catch (error) {
      console.error('Failed to save watch progress:', error);
    }
  }, [user]);

  const removeProgress = useCallback(async (videoId) => {
    if (!user) return;

    setProgress((current) => {
      const next = { ...current };
      delete next[videoId];
      return next;
    });

    try {
      const token = await user.getIdToken();
      await api.clearProgress(videoId, token);
    } catch (error) {
      console.error('Failed to remove watch progress:', error);
    }
  }, [user]);

  const toggleFavorite = useCallback(async (videoId) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    const wasFavorite = favorites.includes(videoId);
    setFavorites((current) =>
      wasFavorite ? current.filter((id) => id !== videoId) : [...current, videoId]
    );

    try {
      const token = await user.getIdToken();
      await api.setFavorite(videoId, !wasFavorite, token);
    } catch (error) {
      setFavorites((current) =>
        wasFavorite ? [...current, videoId] : current.filter((id) => id !== videoId)
      );
      throw error;
    }
  }, [favorites, user]);

  const register = useCallback(async ({ displayName, email, password }) => {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    await updateProfile(credential.user, { displayName });
    await sendEmailVerification(credential.user);
    setAuthModalOpen(false);
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    setAuthModalOpen(false);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
      setAuthModalOpen(false);
    } catch (error) {
      if (error.code !== 'auth/popup-blocked') throw error;
      await signInWithRedirect(firebaseAuth, googleProvider);
    }
  }, []);

  const resetPassword = useCallback((email) => sendPasswordResetEmail(firebaseAuth, email), []);

  const value = {
    user,
    loading,
    favorites,
    progress,
    isAdmin,
    adminLoading,
    isFavorite: (videoId) => favorites.includes(videoId),
    toggleFavorite,
    updateProgress,
    removeProgress,
    openAuthModal: () => setAuthModalOpen(true),
    signOut: () => signOut(firebaseAuth),
    register,
    signIn,
    signInWithGoogle,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </AuthContext.Provider>
  );
}

import { useCallback, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
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

  useEffect(() => {
    if (!firebaseAuth) return undefined;
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      if (!nextUser) setFavorites([]);
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
    setAuthModalOpen(false);
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    setAuthModalOpen(false);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(firebaseAuth, googleProvider);
    setAuthModalOpen(false);
  }, []);

  const resetPassword = useCallback((email) => sendPasswordResetEmail(firebaseAuth, email), []);

  const value = {
    user,
    loading,
    favorites,
    isFavorite: (videoId) => favorites.includes(videoId),
    toggleFavorite,
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

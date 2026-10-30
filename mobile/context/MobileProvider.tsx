import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { User } from 'firebase/auth';
import { DEMO_FAVORITES, DEMO_PROGRESS, DEMO_TITLES, type CatalogTitle } from '../data/catalog';
import {
  fetchCatalog,
  fetchCreatorPortalUrl,
  fetchPlaybackUrl,
  fetchViewerAccount,
  isApiConfigured,
  saveProgress as saveProgressRequest,
  setFavorite as setFavoriteRequest,
  type WatchProgress,
} from '../lib/api';
import {
  FIREBASE_CONFIGURED,
  firebaseAuth,
  onAuthStateChanged,
  registerViewer,
  reload,
  sendViewerPasswordReset,
  signInViewer,
  signOutViewer,
} from '../lib/firebase';

type MobileContextValue = {
  user: User | null;
  authLoading: boolean;
  authError: string;
  setAuthError: (message: string) => void;
  signIn: typeof signInViewer;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: typeof sendViewerPasswordReset;
  signOut: typeof signOutViewer;
  titles: CatalogTitle[];
  catalogError: string;
  usingFixtures: boolean;
  favorites: string[];
  progress: Record<string, WatchProgress>;
  accountError: string;
  toggleFavorite: (titleId: string) => Promise<void>;
  recordProgress: (titleId: string, positionSeconds: number, durationSeconds: number) => Promise<void>;
  playbackUrl: typeof fetchPlaybackUrl;
  creatorPortalUrl: () => Promise<string>;
};

const MobileContext = createContext<MobileContextValue | null>(null);

export function MobileProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(FIREBASE_CONFIGURED);
  const [authError, setAuthError] = useState('');
  const [titles, setTitles] = useState(DEMO_TITLES);
  const [catalogError, setCatalogError] = useState('');
  const [usingFixtures, setUsingFixtures] = useState(!isApiConfigured);
  const [favorites, setFavorites] = useState(isApiConfigured ? [] : DEMO_FAVORITES);
  const [progress, setProgress] = useState<Record<string, WatchProgress>>(
    isApiConfigured ? {} : demoProgress(),
  );
  const [accountError, setAccountError] = useState('');

  useEffect(() => {
    if (!firebaseAuth) return;
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      setAuthError('');
    });
  }, []);

  useEffect(() => {
    if (!isApiConfigured) return;
    let active = true;
    fetchCatalog()
      .then((result) => {
        if (active) {
          setTitles(result);
          setUsingFixtures(false);
          setCatalogError('');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setUsingFixtures(true);
          setCatalogError(error instanceof Error ? error.message : 'The live catalog could not be loaded.');
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || !isApiConfigured) {
      setFavorites(isApiConfigured ? [] : DEMO_FAVORITES);
      setProgress(isApiConfigured ? {} : demoProgress());
      setAccountError('');
      return;
    }
    let active = true;
    setAccountError('');
    user.getIdToken()
      .then(fetchViewerAccount)
      .then((account) => {
        if (active) {
          setFavorites(account.favorites);
          setProgress(account.progress);
        }
      })
      .catch((error: unknown) => {
        if (active) setAccountError(error instanceof Error ? error.message : 'My PROtv could not be loaded.');
      });
    return () => { active = false; };
  }, [user]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    await registerViewer(email, password, displayName);
  }, []);

  const toggleFavorite = useCallback(async (titleId: string) => {
    const shouldFavorite = !favorites.includes(titleId);
    const currentUser = user;
    setAccountError('');
    if (!isApiConfigured) {
      setFavorites((current) => shouldFavorite
        ? [...new Set([...current, titleId])]
        : current.filter((id) => id !== titleId));
      return;
    }
    if (!currentUser) throw new Error('Sign in to sync titles to My List.');
    const token = await currentUser.getIdToken();
    await setFavoriteRequest(token, titleId, shouldFavorite);
    setFavorites((current) => shouldFavorite
      ? [...new Set([...current, titleId])]
      : current.filter((id) => id !== titleId));
  }, [favorites, user]);

  const recordProgress = useCallback(async (
    titleId: string,
    positionSeconds: number,
    durationSeconds: number,
  ) => {
    if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    if (isApiConfigured && !user) return;
    const entry: WatchProgress = {
      positionSeconds,
      durationSeconds,
      progressPercent: Math.min(100, Math.max(0, Math.round(positionSeconds / durationSeconds * 100))),
      updatedAt: Date.now(),
    };
    setProgress((current) => ({ ...current, [titleId]: entry }));
    if (user && isApiConfigured) {
      try {
        const token = await user.getIdToken();
        await saveProgressRequest(token, titleId, positionSeconds, durationSeconds);
      } catch (error) {
        setAccountError(error instanceof Error ? error.message : 'Watch progress could not be saved.');
      }
    }
  }, [user]);

  const creatorPortalUrl = useCallback(async () => {
    if (!user) {
      throw new Error('Sign in with a verified email address to open the Creator Portal.');
    }
    await reload(user);
    if (!user.emailVerified) {
      throw new Error('Sign in with a verified email address to open the Creator Portal.');
    }
    if (!isApiConfigured) throw new Error('Set a staging API URL before connecting Creator Portal.');
    return fetchCreatorPortalUrl(await user.getIdToken(true));
  }, [user]);

  const value = useMemo<MobileContextValue>(() => ({
    user,
    authLoading,
    authError,
    setAuthError,
    signIn: signInViewer,
    register,
    resetPassword: sendViewerPasswordReset,
    signOut: signOutViewer,
    titles,
    catalogError,
    usingFixtures,
    favorites,
    progress,
    accountError,
    toggleFavorite,
    recordProgress,
    playbackUrl: fetchPlaybackUrl,
    creatorPortalUrl,
  }), [
    user, authLoading, authError, register, titles, catalogError, usingFixtures,
    favorites, progress, accountError, toggleFavorite, recordProgress, creatorPortalUrl,
  ]);

  return <MobileContext.Provider value={value}>{children}</MobileContext.Provider>;
}

export function useMobile(): MobileContextValue {
  const context = useContext(MobileContext);
  if (!context) throw new Error('useMobile must be used within MobileProvider.');
  return context;
}

function demoProgress(): Record<string, WatchProgress> {
  return Object.fromEntries(Object.entries(DEMO_PROGRESS).map(([id, fraction]) => [
    id,
    {
      positionSeconds: fraction * 1800,
      durationSeconds: 1800,
      progressPercent: Math.round(fraction * 100),
      updatedAt: Date.now(),
    },
  ]));
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import type { User } from 'firebase/auth';
import { DEMO_FAVORITES, DEMO_PROGRESS, DEMO_TITLES, NO_ORIGINALS, type CatalogTitle, type OriginalsIndex } from '../data/catalog';
import {
  fetchCatalog,
  fetchCreatorPortalUrl,
  fetchOriginals,
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
import { DEMO_MODE } from '../lib/config';

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
  originals: OriginalsIndex;
  catalogError: string;
  catalogLoading: boolean;
  refreshCatalog: () => void;
  usingFixtures: boolean;
  favorites: string[];
  progress: Record<string, WatchProgress>;
  accountError: string;
  toggleFavorite: (titleId: string) => Promise<void>;
  recordProgress: (titleId: string, positionSeconds: number, durationSeconds: number) => Promise<void>;
  playbackUrl: typeof fetchPlaybackUrl;
  creatorPortalUrl: () => Promise<string>;
};

const CATALOG_REFRESH_MS = 15 * 60 * 1000;

const MobileContext = createContext<MobileContextValue | null>(null);

export function MobileProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(FIREBASE_CONFIGURED);
  const [authError, setAuthError] = useState('');
  const [titles, setTitles] = useState<CatalogTitle[]>(DEMO_MODE ? DEMO_TITLES : []);
  const [originals, setOriginals] = useState<OriginalsIndex>(NO_ORIGINALS);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(!DEMO_MODE);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const refreshCatalog = useCallback(() => setCatalogRevision((current) => current + 1), []);
  const catalogLoadedAt = useRef(0);
  const usingFixtures = DEMO_MODE;
  const [favorites, setFavorites] = useState<string[]>(DEMO_MODE ? DEMO_FAVORITES : []);
  const [progress, setProgress] = useState<Record<string, WatchProgress>>(
    DEMO_MODE ? demoProgress() : {},
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
    if (DEMO_MODE) return;
    let active = true;
    setCatalogLoading(true);
    setCatalogError('');
    // Originals only decide ordering, so a failure there never hides the catalog.
    fetchOriginals()
      .then((result) => { if (active) setOriginals(result); })
      .catch((error: unknown) => console.warn('PROtv Originals unavailable:', error instanceof Error ? error.message : error));
    fetchCatalog()
      .then((result) => {
        if (active) {
          setTitles(result);
          setCatalogError('');
          catalogLoadedAt.current = Date.now();
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCatalogError(error instanceof Error ? error.message : 'The live catalog could not be loaded.');
        }
      })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [catalogRevision]);

  // Newly published titles, artwork and categories arrive without a new build: the catalog reloads on launch, on
  // pull-to-refresh, and when the app returns to the foreground after a while.
  useEffect(() => {
    if (DEMO_MODE) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && catalogLoadedAt.current && Date.now() - catalogLoadedAt.current > CATALOG_REFRESH_MS) {
        refreshCatalog();
      }
    });
    return () => subscription.remove();
  }, [refreshCatalog]);

  useEffect(() => {
    if (!user || !isApiConfigured) {
      setFavorites(DEMO_MODE ? DEMO_FAVORITES : []);
      setProgress(DEMO_MODE ? demoProgress() : {});
      setAccountError('');
      return;
    }
    let active = true;
    setAccountError('');
    setFavorites([]);
    setProgress({});
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
    if (DEMO_MODE) {
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
    if (!Number.isFinite(positionSeconds) || positionSeconds < 0
      || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      setAccountError('Invalid playback progress could not be saved.');
      return;
    }
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
    originals,
    catalogError,
    catalogLoading,
    refreshCatalog,
    usingFixtures,
    favorites,
    progress,
    accountError,
    toggleFavorite,
    recordProgress,
    playbackUrl: fetchPlaybackUrl,
    creatorPortalUrl,
  }), [
    user, authLoading, authError, register, titles, originals, catalogError, catalogLoading, refreshCatalog, usingFixtures,
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

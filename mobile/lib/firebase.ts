import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { FIREBASE_CONFIG, FIREBASE_CONFIGURED } from './config';

let firebaseAuth: ReturnType<typeof initializeAuth> | null = null;

if (FIREBASE_CONFIGURED) {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  firebaseAuth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export { firebaseAuth, FIREBASE_CONFIGURED };

export async function registerViewer(email: string, password: string, displayName: string): Promise<User> {
  if (!firebaseAuth) throw new Error('Firebase is not configured for this prototype.');
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
  await updateProfile(credential.user, { displayName: displayName.trim() });
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function signInViewer(email: string, password: string): Promise<void> {
  if (!firebaseAuth) throw new Error('Firebase is not configured for this prototype.');
  await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
}

export async function sendViewerPasswordReset(email: string): Promise<void> {
  if (!firebaseAuth) throw new Error('Firebase is not configured for this prototype.');
  await sendPasswordResetEmail(firebaseAuth, email.trim());
}

export async function signOutViewer(): Promise<void> {
  if (!firebaseAuth) throw new Error('Firebase is not configured for this prototype.');
  await signOut(firebaseAuth);
}

export { onAuthStateChanged, reload, sendEmailVerification };

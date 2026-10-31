import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
  type Auth,
} from 'firebase/auth';
import { FIREBASE_CONFIG, FIREBASE_CONFIGURED } from './config';
import { createFirebaseAuth } from './firebaseAuth';

let firebaseAuth: Auth | null = null;

if (FIREBASE_CONFIGURED) {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  firebaseAuth = createFirebaseAuth(app);
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

export async function reauthenticateViewer(password: string): Promise<User> {
  const user = firebaseAuth?.currentUser;
  if (!user?.email) throw new Error('Sign in before managing your account.');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  return user;
}

export async function updateViewerName(displayName: string): Promise<void> {
  const user = firebaseAuth?.currentUser;
  if (!user) throw new Error('Sign in before managing your account.');
  const name = displayName.trim();
  if (!name || name.length > 100) throw new Error('Enter a display name of 1 to 100 characters.');
  await updateProfile(user, { displayName: name });
}

export { onAuthStateChanged, reload, sendEmailVerification };

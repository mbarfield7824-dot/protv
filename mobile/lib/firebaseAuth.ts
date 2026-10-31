import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

export function createFirebaseAuth(app: FirebaseApp) {
  return getAuth(app);
}

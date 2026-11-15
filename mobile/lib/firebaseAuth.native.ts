import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';

export function createFirebaseAuth(app: FirebaseApp) {
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}

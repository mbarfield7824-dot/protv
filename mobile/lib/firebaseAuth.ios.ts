import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { FirebaseApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { createChunkedStorage } from './chunkedStorage';

const KEYCHAIN_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const keychain = {
  getItem: (key: string) => SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS),
};

export function createFirebaseAuth(app: FirebaseApp) {
  return initializeAuth(app, {
    persistence: getReactNativePersistence(createChunkedStorage(keychain, AsyncStorage)),
  });
}

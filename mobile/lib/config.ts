export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');

export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

export const FIREBASE_CONFIGURED = Object.values(FIREBASE_CONFIG).every(Boolean);

export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://watchprotv.com/privacy';
export const DELETE_ACCOUNT_URL = process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL || 'https://watchprotv.com/delete-account';
export const CREATOR_PORTAL_ORIGIN = process.env.EXPO_PUBLIC_CREATOR_PORTAL_ORIGIN || 'https://creators.watchprotv.com';
export const ACCOUNT_DELETION_ENABLED = process.env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED === 'true';

export const DEMO_HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

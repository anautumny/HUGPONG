// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile Firebase Authentication Configuration
// ══════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const requiredFirebaseValue = (name, value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`[HUGPONG Firebase] Missing required Mobile configuration: ${name}`);
  }
  return normalized;
};

export const mobileFirebaseConfig = Object.freeze({
  apiKey: requiredFirebaseValue('EXPO_PUBLIC_FIREBASE_API_KEY', process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: requiredFirebaseValue('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: requiredFirebaseValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: requiredFirebaseValue('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: requiredFirebaseValue('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: requiredFirebaseValue('EXPO_PUBLIC_FIREBASE_APP_ID', process.env.EXPO_PUBLIC_FIREBASE_APP_ID)
});

// Initialize or reuse Firebase App
const app = getApps().length === 0 ? initializeApp(mobileFirebaseConfig) : getApp();

// Initialize Firebase Auth with AsyncStorage persistence (guarantees session persists across app close)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  auth = getAuth(app);
}

export { app, auth };

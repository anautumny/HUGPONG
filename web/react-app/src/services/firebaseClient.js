/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Firebase Client SDK Initializer
 * Provides custom-token authenticated sessions. Application data reads and
 * writes are intentionally routed through the server-authoritative API.
 * ══════════════════════════════════════════════════════════════
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

const FIREBASE_ENV = Object.freeze({
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID'
});

function requiredFirebaseValue(name) {
  const value = String(import.meta.env[name] || '').trim();
  if (!value) {
    throw new Error(`[HUGPONG Firebase] Missing required Web configuration: ${name}`);
  }
  return value;
}

export const webFirebaseConfig = Object.freeze(
  Object.fromEntries(
    Object.entries(FIREBASE_ENV).map(([key, name]) => [key, requiredFirebaseValue(name)])
  )
);

const app = !getApps().length ? initializeApp(webFirebaseConfig) : getApp();
export const auth = getAuth(app);

// Configure local session persistence
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('[HUGPONG Firebase] Persistence warning:', err.message);
});

export async function signInWithCustomTokenSilently(customToken) {
  if (!customToken) return null;
  return signInWithCustomToken(auth, customToken);
}

export async function signOutFirebase() {
  return signOut(auth);
}

export { onAuthStateChanged };

export default {
  app,
  auth,
  signInWithCustomTokenSilently,
  signOutFirebase
};

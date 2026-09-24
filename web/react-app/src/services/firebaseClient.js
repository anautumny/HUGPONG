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

export const webFirebaseConfig = {
  apiKey: "AIzaSyDYkv9afZa2ZlhxLzIEZfk2b5wP_s2XXpI",
  authDomain: "hugpong-ff.firebaseapp.com",
  projectId: "hugpong-ff",
  storageBucket: "hugpong-ff.firebasestorage.app",
  messagingSenderId: "516809927909",
  appId: "1:516809927909:web:195ec4886bde93e811f80c"
};

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

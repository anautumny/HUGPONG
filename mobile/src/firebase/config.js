// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile Firebase Configuration & Firestore Connector
// Project: hugpong-ff
// ══════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, setLogLevel } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const mobileFirebaseConfig = {
  apiKey: "AIzaSyDYkv9afZa2ZlhxLzIEZfk2b5wP_s2XXpI",
  authDomain: "hugpong-ff.firebaseapp.com",
  projectId: "hugpong-ff",
  storageBucket: "hugpong-ff.firebasestorage.app",
  messagingSenderId: "516809927909",
  appId: "1:516809927909:web:056ba59feb82ce5111f80c"
};

// Initialize or reuse Firebase App
const app = getApps().length === 0 ? initializeApp(mobileFirebaseConfig) : getApp();

// Suppress routine WebChannel stream retry notices in React Native console
try {
  setLogLevel('error');
} catch (e) {}

// Initialize Firestore Database with long-polling transport for React Native
let db;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    experimentalAutoDetectLongPolling: false
  });
} catch (e) {
  db = getFirestore(app);
}

// Initialize Firebase Auth with AsyncStorage persistence (guarantees session persists across app close)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  // If already initialized or in fallback context
  auth = null;
}

export { app, db, auth };

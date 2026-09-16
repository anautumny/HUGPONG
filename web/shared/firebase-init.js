// ══════════════════════════════════════════════════════════════
// HUGPONG Web Firebase SDK Initializer & Cloud Connector
// Project: hugpong-ff
// ══════════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  where
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';

export const webFirebaseConfig = (typeof window !== 'undefined' && window.HUGPONG_FIREBASE_CONFIG) ? window.HUGPONG_FIREBASE_CONFIG : {
  apiKey: "AIzaSyDYkv9afZa2ZlhxLzIEZfk2b5wP_s2XXpI",
  authDomain: "hugpong-ff.firebaseapp.com",
  projectId: "hugpong-ff",
  storageBucket: "hugpong-ff.firebasestorage.app",
  messagingSenderId: "516809927909",
  appId: "1:516809927909:web:195ec4886bde93e811f80c"
};

// Initialize Firebase App & Firestore Database
const app = initializeApp(webFirebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);

// Attach globally for core.js and role dashboards
window.firebaseApp = app;
window.firebaseDB = db;
window.firebaseAuth = auth;
window.signInHugpongWithCustomToken = async customToken => {
  if (!customToken) throw new Error('Firebase custom token is required.');
  return signInWithCustomToken(auth, customToken);
};
window.signOutHugpongFirebase = () => signOut(auth);
window.firestore = {
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  where
};

let initialAuthStateResolved = false;
let resolveInitialAuthState;
window.hugpongFirebaseAuthReady = new Promise(resolve => { resolveInitialAuthState = resolve; });
onAuthStateChanged(auth, user => {
  window.dispatchEvent(new CustomEvent('hugpong:firebase_auth_state', { detail: { user } }));
  if (!initialAuthStateResolved) {
    initialAuthStateResolved = true;
    resolveInitialAuthState(user);
    window.dispatchEvent(new CustomEvent('hugpong:firebase_ready', { detail: { db, app, auth, user } }));
  }
});
console.log('[HUGPONG] Firebase initialized; Firestore listeners require an authenticated Firebase user.');

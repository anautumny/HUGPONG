import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithCustomToken, signOut } from 'firebase/auth';
import { collection, getFirestore, onSnapshot } from 'firebase/firestore';

const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyDYkv9afZa2ZlhxLzIEZfk2b5wP_s2XXpI',
  authDomain: 'hugpong-ff.firebaseapp.com', projectId: 'hugpong-ff',
  storageBucket: 'hugpong-ff.firebasestorage.app', messagingSenderId: '516809927909',
  appId: '1:516809927909:web:195ec4886bde93e811f80c'
});

const app = initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const firebaseAuth = getAuth(app);
const persistenceReady = setPersistence(firebaseAuth, browserLocalPersistence);

export async function signInFirebase(customToken) {
  if (!customToken) throw new Error('Firebase custom token is required.');
  await persistenceReady;
  return signInWithCustomToken(firebaseAuth, customToken);
}

export async function signOutFirebase() {
  await persistenceReady;
  return signOut(firebaseAuth);
}

export async function currentFirebaseUser() {
  await persistenceReady;
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, user => { unsubscribe(); resolve(user); });
  });
}

export function subscribeCollection(name, onData, onError) {
  return onSnapshot(collection(firestore, name), snapshot => {
    onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}


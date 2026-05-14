import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

console.log('[Firebase] Config check:', {
  apiKey: firebaseConfig.apiKey ? '✅ Set' : '❌ MISSING',
  authDomain: firebaseConfig.authDomain ? '✅ Set' : '❌ MISSING',
  projectId: firebaseConfig.projectId ? '✅ Set' : '❌ MISSING',
  appId: firebaseConfig.appId ? '✅ Set' : '❌ MISSING',
});

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

const auth = getAuth(app);

const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export { app, auth, db, googleProvider };
export default app;
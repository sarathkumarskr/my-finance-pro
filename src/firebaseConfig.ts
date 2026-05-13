// ============================================================
// My Finance Pro — Firebase Configuration
// With iOS PWA Auth Persistence Fix
// ============================================================

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  initializeAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import {
  getFirestore,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED,
  initializeFirestore,
} from 'firebase/firestore';

// ============================================================
// Firebase Config
// ============================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ============================================================
// Initialize Firebase App (prevent duplicate init)
// ============================================================
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ============================================================
// Auth — IndexedDB Persistence for iOS PWA Fix
//
// WHY: iOS Safari in PWA mode clears localStorage frequently.
// IndexedDB is more persistent and survives PWA restarts.
// initializeAuth() lets us specify persistence BEFORE first use.
// ============================================================
let auth: ReturnType<typeof getAuth>;

try {
  // Use initializeAuth with IndexedDB as PRIMARY persistence
  // This is the KEY fix for iOS PWA login persistence
  auth = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,  // Primary: IndexedDB (survives iOS PWA restarts)
      browserLocalPersistence,    // Fallback: localStorage
    ],
  });
} catch (error: any) {
  // If auth already initialized (HMR in dev), get existing instance
  if (error.code === 'auth/already-initialized') {
    auth = getAuth(app);
  } else {
    console.error('[Firebase] Auth init error:', error);
    auth = getAuth(app);
  }
}

// ============================================================
// Firestore — With Offline Persistence
// ============================================================
const db = initializeFirestore(app, {
  // Unlimited cache for offline support
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  // Use long polling for better iOS compatibility
  experimentalForceLongPolling: false,
  // Ignore undefined properties
  ignoreUndefinedProperties: true,
});

// Enable Firestore offline persistence
// This allows data to work offline
enableIndexedDbPersistence(db, {
  forceOwnership: false,
}).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open — persistence only works in one tab at a time
    console.warn('[Firestore] Multiple tabs: offline persistence disabled');
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support required features
    console.warn('[Firestore] Offline persistence not supported in this browser');
  }
});

// ============================================================
// Google Auth Provider
// ============================================================
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
// Force account selection even when already signed in
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// ============================================================
// Exports
// ============================================================
export { app, auth, db, googleProvider };
export default app;
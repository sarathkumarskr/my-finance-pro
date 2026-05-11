import { initializeApp } from 'firebase/app';
import {
  indexedDBLocalPersistence,
  initializeAuth
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAl5_gHq7j_4BYwKdh6o_dbGrk5oUy4wNU",
  authDomain: "my-finance-pro-b115a.firebaseapp.com", // ✅ Firebase domain
  projectId: "my-finance-pro-b115a",
  storageBucket: "my-finance-pro-b115a.firebasestorage.app",
  messagingSenderId: "785519739079",
  appId: "1:785519739079:web:d0275c5e58fa0fa2093ee2"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: indexedDBLocalPersistence
});

export const db = getFirestore(app);
export default app;
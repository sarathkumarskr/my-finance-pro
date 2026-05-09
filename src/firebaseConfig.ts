import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAl5_gHq7j_4BYwKdh6o_dbGrk5oUy4wNU',
  authDomain: 'my-finance-pro-b115a.firebaseapp.com',
  projectId: 'my-finance-pro-b115a',
  storageBucket: 'my-finance-pro-b115a.firebasestorage.app',
  messagingSenderId: '785519739079',
  appId: '1:785519739079:web:d0275c5e58fa0fa2093ee2',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
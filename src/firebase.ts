import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Identify if standard Firebase environment variables or real credentials are actively configured
export const isFirebaseConfigured = !!(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_API_KEY.startsWith('AIzaSy') &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID !== 'your-project-id' &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID !== 'dummy-project-id' &&
  import.meta.env.VITE_FIREBASE_API_KEY !== 'your-firebase-api-key'
);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAjp_W9JpJm1XJ69ZCjkoboBbxXf6QjtwY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "seller-pro-management.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "seller-pro-management",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "seller-pro-management.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1002477588512",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1002477588512:web:c14fb91d826134834fec45"
};

// Use getApps() to prevent re-initialization of Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);

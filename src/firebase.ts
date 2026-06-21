import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Identify if standard Firebase environment variables or real credentials are actively configured
export const isFirebaseConfigured = !!(
  (import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCcLk2o17_f38b7NvFvVx9rhcoOVxZz65E") &&
  (import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCcLk2o17_f38b7NvFvVx9rhcoOVxZz65E").startsWith('AIzaSy') &&
  (import.meta.env.VITE_FIREBASE_PROJECT_ID || "seller-manager-pro") &&
  (import.meta.env.VITE_FIREBASE_PROJECT_ID || "seller-manager-pro") !== 'your-project-id' &&
  (import.meta.env.VITE_FIREBASE_PROJECT_ID || "seller-manager-pro") !== 'dummy-project-id'
);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCcLk2o17_f38b7NvFvVx9rhcoOVxZz65E",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "seller-manager-pro.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "seller-manager-pro",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "seller-manager-pro.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "502382117884",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:502382117884:web:38c7d9d77e9c475c5b6879"
};

// Use getApps() to prevent re-initialization of Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);

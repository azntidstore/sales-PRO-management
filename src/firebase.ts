import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const cleanEnvVar = (val: any) => {
  if (typeof val === 'string') {
    return val.replace(/^["']|["']$/g, '').trim();
  }
  return val;
};

const firebaseConfig = {
  apiKey: cleanEnvVar(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnvVar(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnvVar(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnvVar(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnvVar(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnvVar(import.meta.env.VITE_FIREBASE_APP_ID)
};

// Identify if standard Firebase environment variables or real credentials are actively configured
export const isFirebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your-project-id' &&
  firebaseConfig.projectId !== 'dummy-project-id' &&
  firebaseConfig.apiKey !== 'your-firebase-api-key'
);

let app;
let db: any = null;

if (isFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
}

export { db };

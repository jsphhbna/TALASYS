import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const isConfigValid = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey.startsWith("AIzaSy") &&
  !firebaseConfig.apiKey.includes("your_")
);

// Fallback configuration strictly for static prerendering when live environment credentials are unset
const effectiveConfig = isConfigValid
  ? firebaseConfig
  : {
      apiKey: "AIzaSyB00000000000000000000000000000000",
      projectId: "talasys-build-placeholder",
      authDomain: "talasys-build-placeholder.firebaseapp.com",
    };

const app = getApps().length > 0 ? getApp() : initializeApp(effectiveConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

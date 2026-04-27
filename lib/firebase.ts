import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB_JyiI8WPajhsqYD7kGPHPQdS8sVgKThY",
  authDomain: "talasyssystem.firebaseapp.com",
  projectId: "talasyssystem",
  storageBucket: "talasyssystem.firebasestorage.app",
  messagingSenderId: "685072726942",
  appId: "1:685072726942:web:c79452e8dab5e818c1b48f",
  measurementId: "G-C4TD7CVLNB"
};

// Initialize Firebase only if there are no existing apps
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

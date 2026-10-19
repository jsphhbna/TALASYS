import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
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

interface TalasysE2EConfig {
  projectId: string;
  authUrl: string;
  firestoreHost: string;
  firestorePort: number;
}

declare global {
  interface Window {
    __TALASYS_E2E_CONFIG__?: TalasysE2EConfig;
  }
}

const e2eBrowserConfig = typeof window !== "undefined" ? window.__TALASYS_E2E_CONFIG__ : undefined;
const isE2EServer = Boolean(
  process.env.TALASYS_E2E_MODE === "true" ||
  process.env.FIREBASE_PROJECT_ID === "talasys-e2e" ||
  process.env.GCLOUD_PROJECT === "talasys-e2e" ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "talasys-e2e"
);
const isE2E = Boolean(e2eBrowserConfig || isE2EServer);

const isConfigValid = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey.startsWith("AIzaSy") &&
  !firebaseConfig.apiKey.includes("your_")
);

// Fallback configuration strictly for static prerendering when live environment credentials are unset
const effectiveConfig = isE2E
  ? {
      apiKey: "AIzaSyB00000000000000000000000000000000",
      projectId: e2eBrowserConfig?.projectId || "talasys-e2e",
      authDomain: `${e2eBrowserConfig?.projectId || "talasys-e2e"}.firebaseapp.com`,
    }
  : isConfigValid
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

const emulatorGlobal = globalThis as typeof globalThis & { __talasysFirebaseEmulatorsConnected?: boolean };
const shouldConnectEmulators = typeof window !== "undefined" && (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" || isE2E);

if (shouldConnectEmulators && !emulatorGlobal.__talasysFirebaseEmulatorsConnected) {
  const authUrl = e2eBrowserConfig?.authUrl || process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL || (isE2E ? "http://127.0.0.1:9199" : "http://127.0.0.1:9099");
  const host = e2eBrowserConfig?.firestoreHost || process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "127.0.0.1";
  const port = Number(e2eBrowserConfig?.firestorePort || process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || (isE2E ? 8180 : 8080));
  connectAuthEmulator(auth, authUrl, { disableWarnings: true });
  connectFirestoreEmulator(db, host, port);
  emulatorGlobal.__talasysFirebaseEmulatorsConnected = true;
}

export default app;

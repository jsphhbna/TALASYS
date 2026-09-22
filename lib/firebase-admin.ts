import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function initAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  
  try {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error("Missing Firebase Admin environment variables");
    }

    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    });
  } catch (error: any) {
    console.error('Firebase Admin initialization bypassed:', error.message);
    return null;
  }
}

const adminApp = initAdminApp();

// If env vars are missing, these will be null. 
// When used, they will throw a JS error, which is caught gracefully by our try/catch blocks!
export const adminDb = adminApp ? getFirestore(adminApp) : null as any;
export const adminStorage = adminApp ? getStorage(adminApp) : null as any;

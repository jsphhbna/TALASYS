"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { AuthUser, UserRole } from "./auth-types"
import { auth, db } from "@/lib/firebase"
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut 
} from "firebase/auth"
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore"
import { initializeFirebaseStorage } from "@/lib/master-store"
import { delay } from "@/lib/async-delay"
import {
  SUPERADMIN_EMAIL,
  SUPERADMIN_BOOTSTRAP_PASSWORD,
  SUPERADMIN_FIRESTORE_ID,
  SUPERADMIN_DISPLAY_NAME,
  SUPERADMIN_INITIALS,
  SUPERADMIN_LOCAL_STORAGE_KEY,
} from "@/lib/constants"

// ─── Helpers ───

/**
 * Retries a Firestore getDoc up to `maxRetries` times with a delay between attempts.
 *
 * Why: Firebase Auth and Firestore propagate new user credentials asynchronously.
 * Immediately after account creation, a getDoc call can fail with "permission-denied"
 * because the security rules have not yet recognized the new auth token.
 */
const fetchDocumentWithRetry = async (docRef: any, maxRetries = 3, retryDelayMs = 500) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { getDoc } = await import("firebase/firestore")
      return await getDoc(docRef)
    } catch (error: any) {
      if (error?.code === "permission-denied" && attempt < maxRetries - 1) {
        await delay(retryDelayMs)
        continue
      }
      throw error
    }
  }
  throw new Error(
    `Firestore read failed after ${maxRetries} retries. ` +
    `The user document may not exist yet or auth token permissions have not propagated.`
  )
}

// ─── Context Interface ───

interface AuthContextType {
  user: AuthUser | null
  login: (username: string, password: string) => Promise<AuthUser | null>
  logout: () => void
  updateUser: (updates: Partial<AuthUser>) => void
  isAuthenticated: boolean
  isReady: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Bootstrap superadmin — always available so the system is never locked out.
// This account bypasses the normal Firestore user document requirement.
const BOOTSTRAP_SUPERADMIN: AuthUser = {
  id: SUPERADMIN_FIRESTORE_ID,
  name: SUPERADMIN_DISPLAY_NAME,
  email: SUPERADMIN_EMAIL,
  initials: SUPERADMIN_INITIALS,
  role: "superadmin",
  dateOfBirth: "",
  contactNumber: "",
  address: "",
  accountExpiry: "",
}

// ─── Provider ───

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid)
          const userDoc = await fetchDocumentWithRetry(userDocRef)
          
          if (userDoc.exists()) {
            const userData = userDoc.data() as AuthUser
            
            if (userData.role === "Deleted" as any || userData.status === "Deleted") {
               const { signOut: firebaseSignOut } = await import("firebase/auth")
               await firebaseSignOut(auth)
               setUser(null)
               setIsReady(true)
               return
            }

            // NOTE: Email verification is enforced in the login() function, NOT here.
            // Checking it here causes a race condition during registration:
            // createUserWithEmailAndPassword triggers onAuthStateChanged, which sees
            // an unverified resident and signs them out WHILE registerResidentAccount
            // is still writing to Firestore, causing permission-denied errors.
            setUser(userData)
            initializeFirebaseStorage(userData.role, userData.id)
          } else {
            // The user document is missing. This can happen in two cases:
            // 1. Immediately after registration, before setDoc has finished writing.
            // 2. The account was physically deleted from Firestore.
            // For the superadmin, we bootstrap the document. For all others, we do
            // nothing and let the login() flow handle the error on their next attempt.
            if (firebaseUser.email === SUPERADMIN_EMAIL) {
              const superadminFallback: AuthUser = {
                id: firebaseUser.uid,
                name: SUPERADMIN_DISPLAY_NAME,
                email: firebaseUser.email || "",
                initials: SUPERADMIN_INITIALS,
                role: "superadmin",
                dateOfBirth: "",
                contactNumber: "",
                address: "",
                accountExpiry: "",
              }
              setUser(superadminFallback)
              initializeFirebaseStorage(superadminFallback.role, superadminFallback.id)
              await setDoc(doc(db, "users", firebaseUser.uid), superadminFallback)
            } else {
              // We do NOT recreate the profile. Signing out is safe here because
              // during registration the user is signed out explicitly after all writes
              // complete (see registerResidentAccount in local-storage-store.ts).
              setUser(null)
            }
          }
        } catch (error) {
          console.error("Failed to load user document:", error)
          setUser(null)
        }
      } else {
        // No Firebase session — check if a bootstrap superadmin session exists in localStorage.
        // This covers the case where superadmin used the fallback local-only login path.
        const storedSuperadmin = window.localStorage.getItem(SUPERADMIN_LOCAL_STORAGE_KEY)
        if (storedSuperadmin) {
          const storedUser = JSON.parse(storedSuperadmin)
          setUser(storedUser)
          initializeFirebaseStorage(storedUser.role, storedUser.id)
        } else {
          setUser(null)
          initializeFirebaseStorage(null, null)
        }
      }
      setIsReady(true)
    })

    return () => unsubscribe()
  }, [])

  /**
   * Authenticates a user by username or email.
   *
   * The username is converted to an email if it does not contain "@".
   * Returns the authenticated `AuthUser` on success, or an object with `_error`
   * on failure so the UI can display a human-readable message without throwing.
   */
  const login = async (username: string, password: string): Promise<AuthUser | null> => {
    try {
      const normalizedEmail = username.trim().toLowerCase().includes("@")
        ? username.trim().toLowerCase()
        : `${username.trim().toLowerCase()}@barangay.gov.ph`
      
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password)
      } catch (authError: any) {
        // If this is the bootstrap superadmin and no Firebase Auth account exists yet,
        // create it automatically so the system is never permanently locked out.
        if (
          normalizedEmail === SUPERADMIN_EMAIL &&
          password === SUPERADMIN_BOOTSTRAP_PASSWORD &&
          authError.code === "auth/invalid-credential"
        ) {
          const { createUserWithEmailAndPassword } = await import("firebase/auth")
          userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
        } else {
          throw authError
        }
      }
      
      const userDocRef = doc(db, "users", userCredential.user.uid)
      const userDoc = await fetchDocumentWithRetry(userDocRef)
      
      let userData: AuthUser
      if (userDoc.exists()) {
        userData = userDoc.data() as AuthUser
        
        // Block login immediately for soft-deleted accounts.
        if (userData.role === "Deleted" as any || userData.status === "Deleted" || userData.status === "Deleted by Resident") {
          await firebaseSignOut(auth)
          return { _error: "This account has been deactivated. Please contact the barangay office if you believe this is an error." } as any
        }

        // Block login for admins who haven't verified their email.
        if (userData.role !== "resident" && userData.role !== "superadmin" && !userCredential.user.emailVerified) {
          await firebaseSignOut(auth)
          return { _error: "Please verify your email address before logging in. Check your inbox for the verification link." } as any
        }

        // Block login for locked admin accounts.
        if (userData.role !== "resident" && userData.role !== "superadmin" && userData.status === "Locked") {
          await firebaseSignOut(auth)
          return { _error: "This account has been locked. Please contact the Super Admin." } as any
        }

        // Update isVerified flag in Firestore for admins who verified their email.
        if (userData.role !== "resident" && userData.role !== "superadmin" && !userData.isVerified && userCredential.user.emailVerified) {
          await updateDoc(userDocRef, { isVerified: true })
          userData.isVerified = true
        }

        // Enforce email verification for residents before granting access.
        // We resend the link on each blocked attempt so they always have a fresh one.
        if (userData.role === "resident" && !userCredential.user.emailVerified) {
          const { sendEmailVerification } = await import("firebase/auth")
          try {
            await sendEmailVerification(userCredential.user)
          } catch (resendError) {
            console.error("Failed to resend verification email (uid:", userCredential.user.uid, "):", resendError)
          }
          await firebaseSignOut(auth)
          return { _error: "Please verify your email address before logging in. A new verification link has been sent to your inbox." } as any
        }
      } else {
        // No Firestore document — bootstrap superadmin or treat as deleted account.
        if (normalizedEmail === SUPERADMIN_EMAIL) {
           userData = {
             id: userCredential.user.uid,
             name: SUPERADMIN_DISPLAY_NAME,
             email: normalizedEmail,
             initials: SUPERADMIN_INITIALS,
             role: "superadmin",
             dateOfBirth: "",
             contactNumber: "",
             address: "",
             accountExpiry: "",
           } as AuthUser
           await setDoc(userDocRef, userData)
        } else {
           // The Firestore document is missing for a non-superadmin user.
           // This means the account was physically removed from the database.
           await firebaseSignOut(auth)
           return { _error: "No account was found with these credentials. It may have been removed." } as any
        }
      }
      setUser(userData)
      return userData
    } catch (error: any) {
      const errorCode = error.code ? ` (code: ${error.code})` : ""
      return { _error: error.message ? `${error.message}${errorCode}` : "Login failed. Please try again or contact support." } as any
    }
  }

  /**
   * Persists partial updates to the currently authenticated user — both in local
   * React state and in Firestore (or localStorage for the bootstrap superadmin).
   */
  const updateUser = async (updates: Partial<AuthUser>) => {
    if (!user) return

    const updatedUser = { ...user, ...updates }
    setUser(updatedUser)

    if (user.id !== SUPERADMIN_FIRESTORE_ID) {
      try {
        const userDocRef = doc(db, "users", user.id)
        await updateDoc(userDocRef, updates)
      } catch (error) {
        console.error(`Failed to update Firestore user document (uid: ${user.id}):`, error)
      }
    } else {
      // Bootstrap superadmin has no persistent Firestore doc, so we fall back to localStorage.
      window.localStorage.setItem(SUPERADMIN_LOCAL_STORAGE_KEY, JSON.stringify(updatedUser))
    }
  }

  /** Signs the user out of Firebase Auth and clears all local session state. */
  const logout = async () => {
    try {
      await firebaseSignOut(auth)
    } catch (signOutError) {
      console.error("Firebase sign-out failed:", signOutError)
    }
    window.localStorage.removeItem(SUPERADMIN_LOCAL_STORAGE_KEY)
    setUser(null)
    router.push("/auth/login")
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, isAuthenticated: !!user, isReady }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider. Wrap your component tree with <AuthProvider>.")
  }
  return context
}

export type { AuthUser, UserRole }

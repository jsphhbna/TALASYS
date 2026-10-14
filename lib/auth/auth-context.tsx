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
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore"
import { initializeFirebaseStorage } from "@/lib/master-store"
import { delay } from "@/lib/async-delay"
import {
  SUPERADMIN_EMAIL,
  SUPERADMIN_DISPLAY_NAME,
  SUPERADMIN_INITIALS,
} from "@/lib/constants"

// ─── Helpers ───

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

// ─── Provider ───

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let userDocUnsubscribe: (() => void) | null = null

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (userDocUnsubscribe) {
        userDocUnsubscribe()
        userDocUnsubscribe = null
      }

      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid)
          
          // Use onSnapshot to actively observe role/status changes in real-time (#30)
          userDocUnsubscribe = onSnapshot(userDocRef, async (snapshot) => {
            if (snapshot.exists()) {
              const userData = { id: snapshot.id, ...snapshot.data() } as AuthUser
              
              // Immediately revoke active session if locked or deleted (#30)
              if (
                userData.role === "Deleted" ||
                userData.status === "Deleted" ||
                userData.status === "Deleted by Resident" ||
                userData.status === "Locked"
              ) {
                await firebaseSignOut(auth)
                setUser(null)
                initializeFirebaseStorage(null, null)
                setIsReady(true)
                return
              }

              setUser(userData)
              initializeFirebaseStorage(userData.role, userData.id)
            } else {
              // Document does not exist in Firestore
              setUser(null)
              initializeFirebaseStorage(null, null)
            }
            setIsReady(true)
          }, (err) => {
            console.error("Firestore user snapshot error:", err)
            setIsReady(true)
          })
        } catch (error) {
          console.error("Failed to initialize user session observer:", error)
          setUser(null)
          setIsReady(true)
        }
      } else {
        // No Firebase user session exists (#54: removed localStorage spoofing)
        setUser(null)
        initializeFirebaseStorage(null, null)
        setIsReady(true)
      }
    })

    return () => {
      authUnsubscribe()
      if (userDocUnsubscribe) {
        userDocUnsubscribe()
      }
    }
  }, [])

  /**
   * Authenticates a user by username or email.
   */
  const login = async (username: string, password: string): Promise<AuthUser | null> => {
    try {
      const normalizedEmail = username.trim().toLowerCase().includes("@")
        ? username.trim().toLowerCase()
        : `${username.trim().toLowerCase()}@barangay.gov.ph`
      
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password)
      const userDocRef = doc(db, "users", userCredential.user.uid)
      const userDoc = await fetchDocumentWithRetry(userDocRef)
      
      if (!userDoc.exists()) {
        await firebaseSignOut(auth)
        return { _error: "No active account profile found. Please contact administration." } as any
      }

      const userData = { id: userDoc.id, ...(userDoc.data() as any) } as AuthUser
      
      // Block login immediately for soft-deleted accounts
      if (userData.role === "Deleted" || userData.status === "Deleted" || userData.status === "Deleted by Resident") {
        await firebaseSignOut(auth)
        return { _error: "This account has been deactivated. Please contact the barangay office if you believe this is an error." } as any
      }

      // Block login for locked accounts
      if (userData.status === "Locked") {
        await firebaseSignOut(auth)
        return { _error: "This account has been locked. Please contact the Super Admin." } as any
      }

      // Block login for admins who haven't verified their email
      if (userData.role !== "resident" && userData.role !== "superadmin" && !userCredential.user.emailVerified) {
        await firebaseSignOut(auth)
        return { _error: "Please verify your email address before logging in. Check your inbox for the verification link." } as any
      }

      // Enforce email verification for residents before granting access
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

      setUser(userData)
      return userData
    } catch (error: any) {
      const errorCode = error.code ? ` (code: ${error.code})` : ""
      return { _error: error.message ? `${error.message}${errorCode}` : "Login failed. Please try again or contact support." } as any
    }
  }

  /**
   * Persists partial updates to the currently authenticated user in Firestore.
   */
  const updateUser = async (updates: Partial<AuthUser>) => {
    if (!user) return

    const updatedUser = { ...user, ...updates }
    setUser(updatedUser)

    try {
      const userDocRef = doc(db, "users", user.id)
      await updateDoc(userDocRef, updates)
    } catch (error) {
      console.error(`Failed to update Firestore user document (uid: ${user.id}):`, error)
    }
  }

  /** Signs the user out of Firebase Auth and clears all local session state. */
  const logout = async () => {
    try {
      localStorage.removeItem("talasys_trusted_device")
      await firebaseSignOut(auth)
    } catch (signOutError) {
      console.error("Firebase sign-out failed:", signOutError)
    }
    sessionStorage.removeItem("adminSecurityDisclaimerShown")
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

"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { AuthUser, UserRole } from "@/lib/auth-types"
import { auth, db } from "@/lib/firebase"
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut 
} from "firebase/auth"
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore"
import { initializeFirebaseStorage } from "@/lib/master-store"
import { delay } from "@/lib/async-delay"

// Helper to retry getDoc to avoid Auth/Firestore propagation race conditions
const getDocWithRetry = async (docRef: any, retries = 3, delayMs = 500) => {
  for (let i = 0; i < retries; i++) {
    try {
      const { getDoc } = await import("firebase/firestore")
      return await getDoc(docRef)
    } catch (error: any) {
      if (error?.code === "permission-denied" && i < retries - 1) {
        await delay(delayMs)
        continue
      }
      throw error
    }
  }
  throw new Error("Failed to get document after retries")
}
interface AuthContextType {
  user: AuthUser | null
  login: (username: string, password: string) => Promise<AuthUser | null>
  logout: () => void
  updateUser: (updates: Partial<AuthUser>) => void
  isAuthenticated: boolean
  isReady: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Bootstrap superadmin — always available so the system is never locked out
const BOOTSTRAP_SUPERADMIN: AuthUser = {
  id: "superadmin-bootstrap",
  name: "Super Admin",
  email: "superadmin@barangay.gov.ph",
  initials: "SA",
  role: "superadmin",
  dateOfBirth: "",
  contactNumber: "",
  address: "",
  accountExpiry: "",
}
const BOOTSTRAP_USERNAME = "superadmin@barangay.gov.ph"
const BOOTSTRAP_PASSWORD = "superadmin123"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          console.log("[DEBUG AUTH STATE] Auth state changed. UID:", firebaseUser.uid)
          // Fetch user document from Firestore (users collection)
          const userDocRef = doc(db, "users", firebaseUser.uid)
          const userDoc = await getDocWithRetry(userDocRef)
          
          if (userDoc.exists()) {
            console.log("[DEBUG AUTH STATE] User doc EXISTS! Data:", userDoc.data())
            const userData = userDoc.data() as AuthUser
            
            if (userData.role === "Deleted" as any || userData.status === "Deleted") {
               const { signOut: firebaseSignOut } = await import("firebase/auth")
               await firebaseSignOut(auth)
               setUser(null)
               setIsReady(true)
               return
            }
            
            setUser(userData)
            initializeFirebaseStorage(userData.role, userData.id)
          } else {
            // Document missing during auth state change
            // This happens either immediately during registration (before setDoc finishes)
            // or if the user was physically deleted. 
            // For superadmin, we bootstrap. For others, we just do nothing and let the login flow handle errors.
            if (firebaseUser.email === "superadmin@barangay.gov.ph" || firebaseUser.email === BOOTSTRAP_USERNAME) {
              const fallback: AuthUser = {
                id: firebaseUser.uid,
                name: "Super Admin",
                email: firebaseUser.email || "",
                initials: "SA",
                role: "superadmin",
                dateOfBirth: "",
                contactNumber: "",
                address: "",
                accountExpiry: "",
              }
              setUser(fallback)
              initializeFirebaseStorage(fallback.role, fallback.id)
              await setDoc(doc(db, "users", firebaseUser.uid), fallback)
            } else {
               // We DO NOT recreate the profile! Just sign them out if it's missing (they were deleted)
               // However, to avoid race conditions during registration, we only sign them out if they aren't actively registering
               // For now, setting user to null is enough to bounce them to login
               setUser(null)
            }
          }
        } catch (error) {
          console.error("Failed to load user document:", error)
          setUser(null)
        }
      } else {
        // Fallback for bootstrap superadmin session in local storage
        const local = window.localStorage.getItem("talasys.superadmin")
        if (local) {
          const u = JSON.parse(local)
          setUser(u)
          initializeFirebaseStorage(u.role, u.id)
        } else {
          setUser(null)
          initializeFirebaseStorage(null, null)
        }
      }
      setIsReady(true)
    })

    return () => unsubscribe()
  }, [])

  const login = async (username: string, password: string): Promise<AuthUser | null> => {
    // 1. Authenticate with Firebase Auth
    try {
      // Normalizing username since it might have been stored as email
      const cleanUsername = username.trim().toLowerCase()
      const email = cleanUsername.includes("@") ? cleanUsername : `${cleanUsername}@barangay.gov.ph`
      
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password)
      } catch (authError: any) {
        // If this is the bootstrap superadmin and it doesn't exist yet, automatically create it in Firebase!
        if (
          (email === BOOTSTRAP_USERNAME || email === "superadmin@barangay.gov.ph") && 
          password === BOOTSTRAP_PASSWORD && 
          authError.code === "auth/invalid-credential"
        ) {
          const { createUserWithEmailAndPassword } = await import("firebase/auth")
          userCredential = await createUserWithEmailAndPassword(auth, email, password)
        } else {
          throw authError // Rethrow if it's a normal invalid login
        }
      }
      
      const userDocRef = doc(db, "users", userCredential.user.uid)
      console.log("[DEBUG LOGIN] Fetching user doc for UID:", userCredential.user.uid)
      const userDoc = await getDocWithRetry(userDocRef)
      
      let userData: AuthUser
      if (userDoc.exists()) {
        console.log("[DEBUG LOGIN] User doc EXISTS! Data:", userDoc.data())
        userData = userDoc.data() as AuthUser
        
        // If the account was soft-deleted, block login immediately!
        if (userData.role === "Deleted" as any || userData.status === "Deleted") {
          await firebaseSignOut(auth)
          return { _error: "This account has been permanently deleted by an administrator." } as any
        }
      } else {
        console.log("[DEBUG LOGIN] User doc DOES NOT EXIST for UID:", userCredential.user.uid)
        
        // If it's the exact superadmin email, allow bootstrap creation
        if (email === "superadmin@barangay.gov.ph" || email === BOOTSTRAP_USERNAME) {
           userData = {
             id: userCredential.user.uid,
             name: "Super Admin",
             email,
             initials: "SA",
             role: "superadmin",
             dateOfBirth: "",
             contactNumber: "",
             address: "",
             accountExpiry: "",
           } as AuthUser
           await setDoc(userDocRef, userData)
        } else {
           // For any other missing user, it means their account was physically deleted from the database
           await firebaseSignOut(auth)
           return { _error: "This account has been deleted by an administrator." } as any
        }
      }
      setUser(userData)
      return userData
    } catch (error: any) {
      console.error("Firebase Login Error:", error)
      // Return a special object containing the error message so the UI can display it
      return { _error: error.message || "An unknown error occurred during login." } as any
    }
  }

  const updateUser = async (updates: Partial<AuthUser>) => {
    if (!user) return

    const nextUser = { ...user, ...updates }
    setUser(nextUser)

    if (user.id !== "superadmin-bootstrap") {
      try {
        const userDocRef = doc(db, "users", user.id)
        await updateDoc(userDocRef, updates)
      } catch (error) {
        console.error("Error updating user document in Firebase:", error)
      }
    } else {
      window.localStorage.setItem("talasys.superadmin", JSON.stringify(nextUser))
    }
  }

  const logout = async () => {
    try {
      await firebaseSignOut(auth)
    } catch (e) {
      console.error("Error during firebase signout:", e)
    }
    window.localStorage.removeItem("talasys.superadmin")
    setUser(null)
    router.push("/login")
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
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export type { AuthUser, UserRole }

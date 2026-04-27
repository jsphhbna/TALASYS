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
          // Fetch user document from Firestore (users collection)
          const userDocRef = doc(db, "users", firebaseUser.uid)
          const userDoc = await getDoc(userDocRef)
          
          if (userDoc.exists()) {
            setUser(userDoc.data() as AuthUser)
          } else {
            // Check if they are an admin or superadmin
            let role: UserRole = "resident"
            
            if (firebaseUser.email === "superadmin@barangay.gov.ph") {
               role = "superadmin"
            } else {
              const { getDocs, query, collection, where } = await import("firebase/firestore")
              const adminQ = query(collection(db, "admins"), where("email", "==", firebaseUser.email))
              const qSnap = await getDocs(adminQ)
              if (!qSnap.empty) {
                role = "admin"
              }
            }

            // Unlikely, but create fallback if record is missing
            const fallback: AuthUser = {
              id: firebaseUser.uid,
              name: firebaseUser.displayName || firebaseUser.email || "User",
              email: firebaseUser.email || "",
              initials: (firebaseUser.displayName || firebaseUser.email || "U")[0].toUpperCase(),
              role: role,
              dateOfBirth: "",
              contactNumber: "",
              address: "",
              accountExpiry: "",
            }
            setUser(fallback)
            // also create in firestore so it doesnt do this again
            await setDoc(doc(db, "users", firebaseUser.uid), fallback)
          }
        } catch (error) {
          console.error("Failed to load user document:", error)
          setUser(null)
        }
      } else {
        // Fallback for bootstrap superadmin session in local storage
        const local = window.localStorage.getItem("talasys.superadmin")
        if (local) {
          setUser(JSON.parse(local))
        } else {
          setUser(null)
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
      const email = username.includes("@") ? username : `${username}@barangay.gov.ph`
      
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
      const userDoc = await getDoc(userDocRef)
      
      let userData: AuthUser
      if (userDoc.exists()) {
        userData = userDoc.data() as AuthUser
      } else {
        // Automatically create user doc if missing after auth
        let role: UserRole = "resident"
        
        // If it's the exact superadmin email, force superadmin role
        if (email === "superadmin@barangay.gov.ph") {
           role = "superadmin"
        } else {
           // Otherwise, check if the email is in the admin collection
           const { getDocs, query, collection, where } = await import("firebase/firestore")
           const adminQ = query(collection(db, "admins"), where("email", "==", email))
           const qSnap = await getDocs(adminQ)
           if (!qSnap.empty) {
             role = "admin"
           }
        }

        userData = {
          id: userCredential.user.uid,
          name: email === "superadmin@barangay.gov.ph" ? "Super Admin" : (userCredential.user.displayName || email),
          email: userCredential.user.email || email,
          initials: email === "superadmin@barangay.gov.ph" ? "SA" : (email)[0].toUpperCase(),
          role: role,
          dateOfBirth: "",
          contactNumber: "",
          address: "",
          accountExpiry: "",
        }
        await setDoc(userDocRef, userData)
      }
      setUser(userData)
      return userData
    } catch (error) {
      console.error("Firebase Login Error:", error)
      return null
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

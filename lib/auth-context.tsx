"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { AuthUser, UserRole } from "@/lib/auth-types"
import {
  findResidentByCredentials,
  loadSessionUser,
  saveSessionUser,
  updateResidentUser,
} from "@/lib/local-storage-store"
import { findAdminByCredentials } from "@/lib/superadmin-store"

interface AuthContextType {
  user: AuthUser | null
  login: (username: string, password: string) => AuthUser | null
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
const BOOTSTRAP_USERNAME = "superadmin"
const BOOTSTRAP_PASSWORD = "superadmin123"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const storedSession = loadSessionUser()
    if (storedSession) {
      setUser(storedSession)
    }
    setIsReady(true)
  }, [])

  const login = (username: string, password: string): AuthUser | null => {
    // 1. Bootstrap superadmin (always works)
    if (username === BOOTSTRAP_USERNAME && password === BOOTSTRAP_PASSWORD) {
      setUser(BOOTSTRAP_SUPERADMIN)
      saveSessionUser(BOOTSTRAP_SUPERADMIN)
      return BOOTSTRAP_SUPERADMIN
    }

    // 2. Admin accounts from localStorage (created by superadmin)
    const adminAccount = findAdminByCredentials(username, password)
    if (adminAccount) {
      const adminUser: AuthUser = {
        id: adminAccount.id,
        name: adminAccount.name,
        email: adminAccount.email,
        initials: adminAccount.initials,
        role: "admin",
        dateOfBirth: "",
        contactNumber: "",
        address: "",
        accountExpiry: "",
      }
      setUser(adminUser)
      saveSessionUser(adminUser)
      return adminUser
    }

    // 3. Resident accounts from localStorage (registered through the app)
    const residentAccount = findResidentByCredentials(username, password)
    if (residentAccount) {
      setUser(residentAccount.user)
      saveSessionUser(residentAccount.user)
      return residentAccount.user
    }

    return null
  }

  const updateUser = (updates: Partial<AuthUser>) => {
    setUser((previous) => {
      if (!previous) {
        return previous
      }

      const nextUser = { ...previous, ...updates }
      saveSessionUser(nextUser)

      if (previous.role === "resident") {
        updateResidentUser(previous.id, updates)
      }

      return nextUser
    })
  }

  const logout = () => {
    setUser(null)
    saveSessionUser(null)
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

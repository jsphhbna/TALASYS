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

interface AuthContextType {
  user: AuthUser | null
  login: (username: string, password: string) => boolean
  logout: () => void
  updateUser: (updates: Partial<AuthUser>) => void
  isAuthenticated: boolean
  isReady: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ADMIN_USER: AuthUser = {
  id: "admin-1",
  name: "Juan Dela Cruz",
  email: "admin@barangay.gov.ph",
  initials: "JD",
  role: "admin",
  dateOfBirth: "",
  contactNumber: "",
  address: "",
  accountExpiry: "",
}

const SUPERADMIN_USER: AuthUser = {
  id: "superadmin-1",
  name: "Super Admin",
  email: "superadmin@barangay.gov.ph",
  initials: "SA",
  role: "superadmin",
  dateOfBirth: "",
  contactNumber: "",
  address: "",
  accountExpiry: "",
}

export const DEMO_CREDENTIALS = {
  resident: { username: "user", password: "user123" },
  admin: { username: "admin", password: "admin123" },
  superadmin: { username: "superadmin", password: "superadmin123" },
}

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

  const login = (username: string, password: string): boolean => {
    if (username === DEMO_CREDENTIALS.admin.username && password === DEMO_CREDENTIALS.admin.password) {
      setUser(ADMIN_USER)
      saveSessionUser(ADMIN_USER)
      return true
    }

    if (username === DEMO_CREDENTIALS.superadmin.username && password === DEMO_CREDENTIALS.superadmin.password) {
      setUser(SUPERADMIN_USER)
      saveSessionUser(SUPERADMIN_USER)
      return true
    }

    const residentAccount = findResidentByCredentials(username, password)
    if (residentAccount) {
      setUser(residentAccount.user)
      saveSessionUser(residentAccount.user)
      return true
    }

    return false
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

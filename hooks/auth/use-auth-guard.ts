"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth, type UserRole } from "@/lib/auth"

interface UseAuthGuardOptions {
  requiredRole?: UserRole | UserRole[]
  redirectTo?: string
}

export function useAuthGuard(options: UseAuthGuardOptions = {}) {
  const { requiredRole, redirectTo = "/auth/login" } = options
  const { user, isAuthenticated, isReady } = useAuth()
  const router = useRouter()

  const isAuthorized = Boolean(
    isReady && isAuthenticated && (!requiredRole || 
      (Array.isArray(requiredRole) ? requiredRole.includes(user?.role as UserRole) : user?.role === requiredRole)
    ),
  )

  useEffect(() => {
    if (!isReady) {
      return
    }

    if (!isAuthorized) {
      router.replace(redirectTo)
    }
  }, [isAuthorized, isReady, redirectTo, router])

  return {
    user,
    isAuthenticated,
    isReady,
    isAuthorized,
  }
}

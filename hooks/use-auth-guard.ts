"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth, type UserRole } from "@/lib/auth-context"

interface UseAuthGuardOptions {
  requiredRole?: UserRole
  redirectTo?: string
}

export function useAuthGuard(options: UseAuthGuardOptions = {}) {
  const { requiredRole, redirectTo = "/login" } = options
  const { user, isAuthenticated, isReady } = useAuth()
  const router = useRouter()

  const isAuthorized = Boolean(
    isReady && isAuthenticated && (!requiredRole || user?.role === requiredRole),
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

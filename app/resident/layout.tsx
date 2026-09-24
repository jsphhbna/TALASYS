"use client"

import type React from "react"
import { useAuthGuard } from "@/hooks/auth/use-auth-guard"
import { useInactivityTimeout } from "@/hooks/auth"

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  const { isAuthorized } = useAuthGuard({ 
    requiredRole: ["resident"] 
  })
  useInactivityTimeout()

  if (!isAuthorized) {
    return null
  }

  return <>{children}</>
}

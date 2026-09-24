"use client"

import type React from "react"
import { useAuthGuard } from "@/hooks/auth/use-auth-guard"
import { useInactivityTimeout } from "@/hooks/auth"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthorized } = useAuthGuard({ 
    requiredRole: ["admin", "Full Access", "Verification Only", "Documents Only", "View Only", "superadmin", "Super Admin", "Resident Management", "Verifications", "Document Processing"] 
  })
  useInactivityTimeout()

  if (!isAuthorized) {
    return null
  }

  return <>{children}</>
}

"use client"

import type React from "react"
import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuthGuard } from "@/hooks/auth/use-auth-guard"
import { useInactivityTimeout } from "@/hooks/auth"
import { AdminSecurityDisclaimer } from "@/components/admin/admin-security-disclaimer"
import { StaffMobileAdvisory } from "@/components/admin/layout/staff-mobile-advisory"
import { isRouteAllowedForRole, getAllowedLandingPage } from "@/lib/auth"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthorized, isReady } = useAuthGuard({ 
    requiredRole: ["admin", "Full Access", "Verification Only", "Documents Only", "View Only", "superadmin", "Super Admin", "Resident Management", "Verifications", "Document Processing"] 
  })
  useInactivityTimeout()

  const isRoleRouteAllowed = Boolean(user?.role && isRouteAllowedForRole(pathname, user.role))

  useEffect(() => {
    if (!isReady || !isAuthorized) return

    // If the active role changes or caller visits a direct URL not permitted by canonical policy
    if (user?.role && !isRoleRouteAllowed) {
      console.warn(`[AdminLayout] Access denied for role "${user.role}" to route "${pathname}". Redirecting to allowed landing page.`)
      const destination = getAllowedLandingPage(user.role)
      router.replace(destination)
    }
  }, [isReady, isAuthorized, user?.role, isRoleRouteAllowed, pathname, router])

  if (!isAuthorized || !isRoleRouteAllowed) {
    return null
  }

  return (
    <>
      <AdminSecurityDisclaimer />
      <StaffMobileAdvisory />
      {children}
    </>
  )
}


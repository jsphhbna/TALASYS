export type UserRole = 
  | "resident" 
  | "admin" 
  | "Admin"
  | "superadmin" 
  | "SuperAdmin"
  | "Super Admin" 
  | "Full Access" 
  | "Verification Only" 
  | "Documents Only" 
  | "View Only" 
  | "Resident Management" 
  | "Verifications" 
  | "Document Processing"
  | "Deleted"

export interface AuthUser {
  id: string
  name: string
  email: string
  initials: string
  role: UserRole
  status?: string
  /** All resident statuses/categories (e.g. ["Adult", "Registered Voter"]) */
  statuses?: string[]
  dateOfBirth: string
  contactNumber: string
  address: string
  accountExpiry: string
  isVerified?: boolean
  profilePicture?: string
  createdAt?: number
  gender?: string
  // Structured name fields
  firstName?: string
  lastName?: string
  middleInitial?: string
  // Structured address fields
  street?: string
  barangay?: string
  city?: string
  province?: string
  registrationDenied?: boolean
  deniedAt?: number
  denialReason?: string
  _error?: string
}

// ─── Canonical Role & Permission Helpers ───

export function isSuperAdminRole(role?: string | null): boolean {
  if (!role) return false
  const normalized = role.trim().toLowerCase()
  return normalized === "superadmin" || normalized === "super admin"
}

export function isFullAdminRole(role?: string | null): boolean {
  if (!role) return false
  if (isSuperAdminRole(role)) return true
  const normalized = role.trim().toLowerCase()
  return normalized === "admin" || normalized === "full access"
}

export function isAnyAdminRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  const r = role.trim()
  return (
    r === "Resident Management" ||
    r === "Verifications" ||
    r === "Verification Only" ||
    r === "Document Processing" ||
    r === "Documents Only" ||
    r === "View Only"
  )
}

export function isVerificationOnlyRole(role?: string | null): boolean {
  if (!role) return false
  const r = role.trim()
  return r === "Verification Only" || r === "Verifications"
}

export function isDocumentProcessingRole(role?: string | null): boolean {
  if (!role) return false
  const r = role.trim()
  return r === "Document Processing" || r === "Documents Only"
}

export function isResidentManagementRole(role?: string | null): boolean {
  if (!role) return false
  return role.trim() === "Resident Management"
}

export function canManageResidentsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  return isResidentManagementRole(role)
}

export function canManageVerificationsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  return isVerificationOnlyRole(role)
}

export function canManageRequestsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  return isDocumentProcessingRole(role)
}

export function isReadOnlyAdminRole(role?: string | null): boolean {
  if (!role) return false
  return role.trim() === "View Only"
}

export function canManageNotificationsRole(role?: string | null): boolean {
  if (!role) return false
  if (isReadOnlyAdminRole(role)) return false
  return isAnyAdminRole(role)
}


/**
 * Returns the authoritative allowed landing page for a given role.
 */
export function getAllowedLandingPage(role?: string | null): string {
  if (!role) return "/auth/login"
  const r = role.trim()
  if (isSuperAdminRole(r)) return "/superadmin/dashboard"
  if (isVerificationOnlyRole(r)) return "/admin/dashboard"
  if (isDocumentProcessingRole(r)) return "/admin/dashboard"
  if (isResidentManagementRole(r)) return "/admin/dashboard"
  if (isAnyAdminRole(r)) return "/admin/dashboard"
  if (r.toLowerCase() === "resident") return "/resident/dashboard"
  return "/auth/login"
}

/**
 * Authoritative canonical route guard matrix across the application.
 */
export function isRouteAllowedForRole(pathname: string, role?: string | null): boolean {
  if (!role) return false
  const r = role.trim()

  // 1. Super Admin: full access to /superadmin/* and /admin/* suites
  if (isSuperAdminRole(r)) {
    return pathname.startsWith("/superadmin") || pathname.startsWith("/admin")
  }

  // Non-superadmins cannot access superadmin routes
  if (pathname.startsWith("/superadmin")) {
    return false
  }

  // 2. Full Admin (admin, Full Access): all /admin/* routes
  if (isFullAdminRole(r)) {
    return pathname.startsWith("/admin")
  }

  // 3. Verification Only / Verifications:
  // ONLY the verification workspace and its queues/history. Verification
  // notifications are embedded inside that workspace.
  // Explicitly forbids: residents, requests, generate, reports, activity logs.
  if (isVerificationOnlyRole(r)) {
    if (pathname === "/admin/dashboard") return true
    if (pathname.startsWith("/admin/verifications")) return true
    return false
  }

  // 4. Document Processing / Documents Only:
  // Processing queues, payment processing, generation, notifications.
  // Explicitly forbids: verifications, residents, reports, activity logs.
  if (isDocumentProcessingRole(r)) {
    if (pathname === "/admin/dashboard") return true
    if (pathname.startsWith("/admin/requests")) return true
    if (pathname.startsWith("/admin/generate")) return true
    if (pathname.startsWith("/admin/notifications")) return true
    return false
  }

  // 5. Resident Management:
  // Resident profiles, resident demographic reports, notifications.
  // Explicitly forbids: verifications, requests, generate, activity logs.
  if (isResidentManagementRole(r)) {
    if (pathname === "/admin/dashboard") return true
    if (pathname.startsWith("/admin/residents")) return true
    if (pathname.startsWith("/admin/reports")) return true
    if (pathname.startsWith("/admin/notifications")) return true
    return false
  }

  // 6. View Only:
  // Read-only views across dashboard, residents, verifications, requests, reports, notifications, logs.
  // Forbids: generate (since it creates documents).
  if (isReadOnlyAdminRole(r)) {
    if (pathname.startsWith("/admin/generate")) return false
    return pathname.startsWith("/admin")
  }

  // 7. Resident:
  // Portal pages under /resident/*
  if (r.toLowerCase() === "resident") {
    return pathname.startsWith("/resident")
  }

  return false
}

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

export function canManageResidentsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  return role.trim() === "Resident Management"
}

export function canManageVerificationsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  const r = role.trim()
  return r === "Verifications" || r === "Verification Only"
}

export function canManageRequestsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  const r = role.trim()
  return r === "Document Processing" || r === "Documents Only"
}

export function isReadOnlyAdminRole(role?: string | null): boolean {
  if (!role) return false
  return role.trim() === "View Only"
}

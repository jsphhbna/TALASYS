export type UserRole = "resident" | "admin" | "superadmin" | "Super Admin" | "Full Access" | "Verification Only" | "Documents Only" | "View Only"

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
  // Structured name fields
  firstName?: string
  lastName?: string
  middleInitial?: string
  // Structured address fields
  street?: string
  barangay?: string
  city?: string
  province?: string
}

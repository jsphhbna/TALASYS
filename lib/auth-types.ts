export type UserRole = "resident" | "admin" | "superadmin"

export interface AuthUser {
  id: string
  name: string
  email: string
  initials: string
  role: UserRole
  status?: string
  dateOfBirth: string
  contactNumber: string
  address: string
  accountExpiry: string
  isVerified?: boolean
  profilePicture?: string
}

"use client"
import type { AuthUser } from "@/lib/auth"
import { db } from "@/lib/firebase"
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore"
import { MASTER_STORAGE_UPDATED_EVENT } from "@/lib/constants"

// ─── Unified Types ───

export type AlertSeverity = "critical" | "warning" | "info"

export interface SystemAlert {
  id: string
  severity: AlertSeverity
  title: string
  description: string
  timestamp: string
  metric?: string
}

export interface AdminAccount {
  id: string
  name: string
  initials: string
  email: string
  password: string
  contactNumber?: string
  role: "Full Access" | "Verification Only" | "Documents Only" | "View Only" | "SuperAdmin"
  status: "Active" | "Locked"
  isOnline: boolean
  lastActive: string
  createdDate: string
  isVerified?: boolean
}

export interface ActivityLog {
  id: string
  date: string
  time: string
  timestamp: string
  admin: { name: string; initials: string; color: string }
  action: string
  actionType: string
  residentName?: string
  details: string
  ipAddress?: string
  role: "Admin" | "SuperAdmin"
  targetId?: string
  targetCollection?: "documentRequests" | "verifications" | "residents"
}

export interface SystemConfig {
  barangayName: string
  barangayCaptainName: string
  secretaryName?: string
  captainSignatureUrl?: string
  secretarySignatureUrl?: string
  contactNumber: string
  emailAddress: string
  address: string
  enabledModules: string[]
  documentTypes: string[]
  documentFees: Record<string, number>
  templates?: Record<string, string>
  customDocumentTypes?: any[]
}

export interface ResidentProofDocument {
  id: string
  name: string
  filename: string
  url?: string
  uploadDate: string
  status: "Valid" | "Pending" | "Expired"
}

export interface ResidentAccountRecord {
  id: string
  username: string
  user: AuthUser
}

export interface MasterDocumentRequest {
  id: string
  residentId: string
  residentName: string
  residentInitials: string
  residentCategory: string
  documentType: string
  purpose: string
  dateRequested: string
  status: "Pending" | "Awaiting Payment" | "Approved" | "On Process" | "Ready for Pick Up" | "Completed" | "Rejected"
  refNumber?: string
  downloadUrl?: string
  createdAt: number
  requestFor?: "myself" | "other"
  requestedByName?: string
  requestedByContact?: string
  relationship?: string
  authorizationLetter?: string
  statusTimestamps?: Record<string, number>
  
  // Payment fields
  documentFee?: number
  paymentStatus?: "unpaid" | "pending_verification" | "paid" | "waived"
  paymentMethod?: "gcash" | "cash"
  paymentReferenceNumber?: string
  gcashRefNumber?: string
  gcashScreenshotUrl?: string
  receiptNumber?: string
  paymentConfirmedAt?: number
  paymentConfirmedBy?: string
  paymentSubmittedAt?: number
}

export interface MasterNotification {
  id: string
  targetId: string 
  type: "urgent" | "success" | "info" | "read" | "registration" | "expiring" | "reactivation" | "error"
  title: string
  message: string
  timestamp: string
  isRead: boolean
  createdAt: number
  residentName?: string
  actionUrl?: string
}

export interface MasterVerification {
  id: string
  residentId: string
  name: string
  initials: string
  type: "registration" | "profile-edit" | "reactivation"
  submittedDate: string
  status?: "pending" | "approved" | "rejected"
  rejectionReason?: string
  categories: string[]
  age?: number
  gender?: "Male" | "Female" | string
  address?: string
  contactNumber?: string
  email?: string
  dateOfBirth?: string
  changes?: { field: string; oldValue: string; newValue: string }[]
  reason?: string
  documents: { name: string; status: "verified" | "pending" | "valid"; uploadDate?: string; url?: string }[]
}

// ─── Master Storage Schema ───

export interface MasterStorage {
  residents: ResidentAccountRecord[]
  admins: AdminAccount[]
  documentRequests: MasterDocumentRequest[]
  verifications: MasterVerification[]
  notifications: MasterNotification[]
  auditLogs: ActivityLog[]
  systemAlerts: SystemAlert[]
  systemConfig: SystemConfig
}

// ─── Core Helpers ───

/** Generates a collision-resistant ID using timestamp + random suffix. */
export const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** Extracts up to the first two words of a name and returns their uppercase initials. */
export const getInitials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")

/** Returns true when running in a browser context (not during SSR). */
const isBrowserEnvironment = () => typeof window !== "undefined"

const createDefaultMasterStorage = (): MasterStorage => ({
  residents: [],
  admins: [],
  documentRequests: [],
  verifications: [],
  notifications: [],
  auditLogs: [],
  systemAlerts: [],
  systemConfig: {
    barangayName: "",
    barangayCaptainName: "",
    contactNumber: "",
    emailAddress: "",
    address: "",
    enabledModules: [],
    documentTypes: ["Barangay Clearance", "Certificate of Indigency", "Certificate of Residency"],
    documentFees: {
      "Barangay Clearance": 50,
      "Certificate of Indigency": 0,
      "Certificate of Residency": 20,
    }
  },
})

// The in-memory store acts as a local cache so that synchronous reads throughout
// the app can always return data without awaiting a Firestore call on every access.
// Firestore onSnapshot listeners (in the hooks layer) push updates into this store.
let inMemoryStore: MasterStorage = createDefaultMasterStorage()

export const notifyMasterUpdated = () => {
  if (!isBrowserEnvironment()) return
  window.dispatchEvent(new Event(MASTER_STORAGE_UPDATED_EVENT))
}

export const initializeFirebaseStorage = (userRole: string | null, userId: string | null) => {
  // No-op. Hook subscriptions handle Firestore initialization reactively.
}

/** Returns the current in-memory master storage snapshot. */
export const readMasterStorage = (): MasterStorage => {
  return inMemoryStore
}

/**
 * @deprecated Writes are now performed directly against Firestore in the hooks layer.
 * This function is retained for backward compatibility with legacy call sites.
 */
export const writeMasterStorage = (next: MasterStorage) => {
  // Intentional no-op — direct Firestore writes replaced this local-write pattern.
}

/**
 * Subscribes to in-memory store update events dispatched by `notifyMasterUpdated`.
 * Returns an unsubscribe function to clean up the listener.
 */
export const subscribeToMasterStorage = (callback: () => void) => {
  if (!isBrowserEnvironment()) return () => { }
  window.addEventListener(MASTER_STORAGE_UPDATED_EVENT, callback)
  return () => {
    window.removeEventListener(MASTER_STORAGE_UPDATED_EVENT, callback)
  }
}

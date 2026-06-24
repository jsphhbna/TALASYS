"use client"
import type { AuthUser } from "@/lib/auth-types"
import { db } from "@/lib/firebase"
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore"

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
  contactNumber: string
  emailAddress: string
  address: string
  enabledModules: string[]
  documentTypes: string[]
  documentFees: Record<string, number>
}

export interface ResidentProofDocument {
  id: string
  name: string
  filename: string
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
  status: "Pending" | "Approved" | "On Process" | "Ready for Pick Up" | "Completed" | "Rejected"
  refNumber?: string
  downloadUrl?: string
  createdAt: number
  requestFor?: "myself" | "other"
  requestedByName?: string
  requestedByContact?: string
  relationship?: string
  authorizationLetter?: string
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
  gender?: "Male" | "Female"
  address?: string
  changes?: { field: string; oldValue: string; newValue: string }[]
  reason?: string
  documents: { name: string; status: "verified" | "pending" | "valid"; uploadDate?: string }[]
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

const MASTER_STORAGE_EVENT = "talasys-master-storage-updated"

// ─── Core Helpers ───

export const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
export const getInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
const canUseStorage = () => typeof window !== "undefined"

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

// Global runtime instance (to preserve synchronous reads everywhere else)
let memoryStore: MasterStorage = createDefaultMasterStorage()
let isFirebaseInitialized = false

export const notifyMasterUpdated = () => {
  if (!canUseStorage()) return
  window.dispatchEvent(new Event(MASTER_STORAGE_EVENT))
}

export const initializeFirebaseStorage = (userRole: string | null, userId: string | null) => {
    // No-op. Hook subscriptions handle this natively now.
}

export const readMasterStorage = (): MasterStorage => {
  return memoryStore
}

export const writeMasterStorage = (next: MasterStorage) => {
  // Deprecated. We write to firestore directly now.
}

export const subscribeToMasterStorage = (callback: () => void) => {
  if (!canUseStorage()) return () => { }
  window.addEventListener(MASTER_STORAGE_EVENT, callback)
  return () => {
    window.removeEventListener(MASTER_STORAGE_EVENT, callback)
  }
}

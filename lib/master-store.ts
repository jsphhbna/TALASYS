"use client"
import type { AuthUser } from "@/lib/auth-types"

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
    role: "Full Access" | "Verification Only" | "Documents Only" | "View Only" | "SuperAdmin" // Added SuperAdmin
    status: "Active" | "Locked"
    isOnline: boolean
    lastActive: string
    createdDate: string
}

export interface ActivityLog {
    id: string
    date: string
    time: string
    timestamp: string // the raw numerical or standardized timestamp
    admin: { name: string; initials: string; color: string }
    action: string
    actionType: string
    residentName?: string
    details: string
    ipAddress?: string
    role: "Admin" | "SuperAdmin"
}

export interface SystemConfig {
    barangayName: string
    barangayCaptainName: string
    contactNumber: string
    emailAddress: string
    address: string
    enabledModules: string[]
    documentTypes: string[]
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
    password: string
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
    status: "Pending" | "Approved" | "Rejected"
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
    targetId: string // e.g., resident specific ID, or "admin", or "superadmin"
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
    residentId: string // Bind to the real resident account id
    name: string
    initials: string
    type: "registration" | "profile-edit" | "reactivation"
    submittedDate: string
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

const MASTER_STORAGE_KEY = "talasys.master.storage.v1"
const MASTER_STORAGE_EVENT = "talasys-master-storage-updated"

// ─── Core Helpers ───

export const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
export const getInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
const canUseStorage = () => typeof window !== "undefined"
const safeParse = <T>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback
    try { return JSON.parse(raw) as T } catch { return fallback }
}

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
    },
})

export const notifyMasterUpdated = () => {
    if (!canUseStorage()) return
    window.dispatchEvent(new Event(MASTER_STORAGE_EVENT))
}

export const readMasterStorage = (): MasterStorage => {
    const fallback = createDefaultMasterStorage()
    if (!canUseStorage()) return fallback
    const parsed = safeParse<MasterStorage>(window.localStorage.getItem(MASTER_STORAGE_KEY), fallback)
    if (!window.localStorage.getItem(MASTER_STORAGE_KEY)) {
        window.localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(parsed))
    }
    return parsed
}

export const writeMasterStorage = (next: MasterStorage) => {
    if (!canUseStorage()) return
    window.localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(next))
    notifyMasterUpdated()
}

export const subscribeToMasterStorage = (callback: () => void) => {
    if (!canUseStorage()) return () => { }

    // Listen to our custom unified event
    window.addEventListener(MASTER_STORAGE_EVENT, callback)

    // Cross-tab synchronization
    const handleStorageChange = (e: StorageEvent) => {
        if (e.key === MASTER_STORAGE_KEY) {
            callback()
        }
    }
    window.addEventListener("storage", handleStorageChange)

    return () => {
        window.removeEventListener(MASTER_STORAGE_EVENT, callback)
        window.removeEventListener("storage", handleStorageChange)
    }
}

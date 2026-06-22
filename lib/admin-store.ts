"use client"
import {
    readMasterStorage,
    writeMasterStorage,
    generateId,
    getInitials,
    subscribeToMasterStorage,
    type MasterDocumentRequest,
    type MasterNotification,
    type MasterVerification,
    type ActivityLog,
} from "./master-store"

// ─── Re-exported Types ───
export type AdminDocumentRequest = MasterDocumentRequest
export type AdminNotification = MasterNotification
export type PendingVerification = MasterVerification
export type { ActivityLog }

// Define AdminResident to perfectly match the previous logic
export interface AdminResident {
    id: string
    name: string
    initials: string
    age: number
    gender: "Male" | "Female"
    address: string
    categories: string[]
    status: "Active" | "Expired" | "Expiring"
    isVoter: boolean
    expiryDate: string
    dateOfBirth: string
    contactNumber: string
    email: string
}

export const subscribeToAdminStorage = subscribeToMasterStorage
const formatTime = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(date)
const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
const formatShortDate = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)

// ─── Residents CRUD ───

export const getAdminResidents = (): AdminResident[] => {
    return readMasterStorage().residents.map(acc => ({
        id: acc.id,
        name: acc.user.name,
        initials: acc.user.initials,
        age: acc.user.dateOfBirth ? Math.floor((new Date().getTime() - new Date(acc.user.dateOfBirth).getTime()) / 31557600000) : 0,
        gender: "Male" as const,
        address: acc.user.address,
        categories: acc.user.statuses && acc.user.statuses.length > 0
            ? acc.user.statuses
            : (acc.user.status ? [acc.user.status] : []),
        status: "Active" as const,
        isVoter: (acc.user.statuses || []).includes("Registered Voter") || acc.user.status === "Registered Voter",
        expiryDate: acc.user.accountExpiry,
        dateOfBirth: acc.user.dateOfBirth,
        contactNumber: acc.user.contactNumber,
        email: acc.user.email,
    }))
}

export const addAdminResident = (input: Omit<AdminResident, "id" | "initials">) => {
    throw new Error("Residents must be registered via the Resident Portal to maintain Master synchronization.")
}

export const updateAdminResident = (id: string, updates: Partial<AdminResident>) => {
    const storage = readMasterStorage()
    const idx = storage.residents.findIndex((r) => r.id === id)
    if (idx === -1) return null
    if (updates.name) storage.residents[idx].user.name = updates.name
    if (updates.name) storage.residents[idx].user.initials = getInitials(updates.name)
    if (updates.address) storage.residents[idx].user.address = updates.address
    writeMasterStorage(storage)
    return storage.residents[idx]
}

export const deleteAdminResident = (id: string) => {
    const storage = readMasterStorage()
    storage.residents = storage.residents.filter(r => r.id !== id)
    writeMasterStorage(storage)
}

// ─── Verifications CRUD ───

export const getAdminVerifications = (): PendingVerification[] => {
    return readMasterStorage().verifications.filter(v => !v.status || v.status === "pending")
}

export const getAdminRejectedVerifications = (): PendingVerification[] => {
    return readMasterStorage().verifications.filter(v => v.status === "rejected")
}

export const addAdminVerification = (input: Omit<PendingVerification, "id" | "initials">) => {
    const storage = readMasterStorage()
    const verification: PendingVerification = { ...input, id: generateId(), initials: getInitials(input.name) }
    storage.verifications.push(verification)
    writeMasterStorage(storage)
    return verification
}

export const approveVerification = (id: string) => {
    const storage = readMasterStorage()
    const idx = storage.verifications.findIndex((v) => v.id === id)
    if (idx === -1) return null
    const verification = storage.verifications[idx]

    // SYNCHRONIZATION: Update native resident account
    const resident = storage.residents.find(r => r.id === verification.residentId)
    if (resident) {
        resident.user.isVerified = true
    }

    storage.verifications[idx].status = "approved"

    // Notify resident natively!
    if (verification.residentId) {
        storage.notifications.push({
            id: generateId(),
            targetId: verification.residentId,
            type: "success",
            title: "Account Verified",
            message: "Your resident account has been officially verified.",
            timestamp: "Just now",
            isRead: false,
            createdAt: Date.now()
        })
    }

    // Log the audit natively
    storage.auditLogs.unshift({
        id: generateId(),
        time: formatTime(new Date()),
        date: formatDate(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: "System Admin", initials: "AD", color: "#3b82f6" },
        action: `Approved ${verification.type} Verification`,
        actionType: "verified",
        residentName: verification.name,
        details: `Verified account for ${verification.name}`,
        role: "Admin",
        targetId: id,
        targetCollection: "verifications"
    })

    writeMasterStorage(storage)
    return verification
}

export const rejectVerification = (id: string, reason: string = "No reason provided") => {
    const storage = readMasterStorage()
    const idx = storage.verifications.findIndex((v) => v.id === id)
    if (idx === -1) return null

    const verification = storage.verifications[idx]
    storage.verifications[idx].status = "rejected"
    storage.verifications[idx].rejectionReason = reason

    if (verification.residentId) {
        storage.notifications.push({
            id: generateId(),
            targetId: verification.residentId,
            type: "urgent",
            title: "Verification Rejected",
            message: `Your resident account verification has been rejected. Reason: ${reason}`,
            timestamp: "Just now",
            isRead: false,
            createdAt: Date.now()
        })
    }

    // Log the audit natively
    storage.auditLogs.unshift({
        id: generateId(),
        time: formatTime(new Date()),
        date: formatDate(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: "System Admin", initials: "AD", color: "#3b82f6" },
        action: `Rejected ${verification.type} Verification`,
        actionType: "rejected",
        residentName: verification.name,
        details: `Rejected account for ${verification.name}`,
        role: "Admin",
        targetId: id,
        targetCollection: "verifications"
    })

    writeMasterStorage(storage)
    return verification
}

// ─── Document Requests CRUD ───

export const getAdminDocumentRequests = () => readMasterStorage().documentRequests

export const addAdminDocumentRequest = (input: Omit<AdminDocumentRequest, "id" | "residentInitials">) => {
    // Only used for walk-in requests technically
    const storage = readMasterStorage()
    const request: AdminDocumentRequest = {
        ...input,
        id: generateId(),
        residentInitials: getInitials(input.residentName),
    }
    storage.documentRequests.push(request)
    writeMasterStorage(storage)
    return request
}

export const updateDocumentRequestStatus = (
    id: string, 
    status: "Approved" | "On Process" | "Ready for Pick Up" | "Completed" | "Rejected"
) => {
    const storage = readMasterStorage()
    const idx = storage.documentRequests.findIndex((r) => r.id === id)
    if (idx === -1) return null
    storage.documentRequests[idx].status = status

    const req = storage.documentRequests[idx]

    // Determine notification type
    let notifType: "success" | "urgent" | "info" = "success"
    if (status === "Rejected") notifType = "urgent"
    if (status === "On Process") notifType = "info"

    // Cross-store alert
    storage.notifications.push({
        id: generateId(),
        targetId: req.residentId,
        type: notifType,
        title: `Document ${status}`,
        message: status === "Completed" 
            ? `Your request for ${req.documentType} has been completed and released.`
            : status === "On Process"
            ? `Your request for ${req.documentType} is now being processed.`
            : status === "Ready for Pick Up"
            ? `Your request for ${req.documentType} is ready for pick up at the barangay hall.`
            : `Your request for ${req.documentType} has been ${status.toLowerCase()}.`,
        timestamp: "Just now",
        isRead: false,
        createdAt: Date.now()
    })

    storage.auditLogs.unshift({
        id: generateId(),
        time: formatTime(new Date()),
        date: formatDate(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: "System Admin", initials: "AD", color: "#3b82f6" },
        action: `${status} Document`,
        actionType: status === "Rejected" ? "rejected" : "approved", // Using approved as umbrella for logs to avoid breaking color mappers
        residentName: req.residentName,
        details: `Marked request for ${req.documentType} as ${status}`,
        role: "Admin",
        targetId: id,
        targetCollection: "documentRequests"
    })

    writeMasterStorage(storage)
    return req
}

export const deleteAdminDocumentRequest = (id: string) => {
    const storage = readMasterStorage()
    storage.documentRequests = storage.documentRequests.filter((r) => r.id !== id)
    writeMasterStorage(storage)
}

// ─── Notifications CRUD ───

export const getAdminNotifications = () => readMasterStorage().notifications.filter(n => n.targetId === "admin")

export const addAdminNotification = (input: Omit<AdminNotification, "id">) => {
    const storage = readMasterStorage()
    const notification: AdminNotification = { ...input, id: generateId(), targetId: "admin", residentName: input.residentName, actionUrl: input.actionUrl }
    storage.notifications.unshift(notification)
    writeMasterStorage(storage)
    return notification
}

export const markAdminNotificationRead = (id: string) => {
    const storage = readMasterStorage()
    const notification = storage.notifications.find((n) => n.id === id)
    if (notification) notification.isRead = true
    writeMasterStorage(storage)
}

export const markAllAdminNotificationsRead = () => {
    const storage = readMasterStorage()
    storage.notifications.forEach((n) => { if (n.targetId === "admin") n.isRead = true })
    writeMasterStorage(storage)
}

export const deleteAdminNotification = (id: string) => {
    const storage = readMasterStorage()
    storage.notifications = storage.notifications.filter((n) => n.id !== id)
    writeMasterStorage(storage)
}

// ─── Activity Logs ───

export const getAdminActivityLogs = () => readMasterStorage().auditLogs.filter(l => l.role === "Admin")

export const addAdminActivityLog = (input: Omit<ActivityLog, "id" | "time" | "date" | "timestamp" | "role">) => {
    const storage = readMasterStorage()
    const log: ActivityLog = { ...input, id: generateId(), time: formatTime(new Date()), date: formatDate(new Date()), timestamp: Date.now().toString(), role: "Admin", admin: { name: "System Admin", initials: "AD", color: "#3b82f6" } }
    storage.auditLogs.unshift(log)
    writeMasterStorage(storage)
    return log
}

export const clearAdminActivityLogs = () => {
    const storage = readMasterStorage()
    storage.auditLogs = storage.auditLogs.filter(l => l.role !== "Admin")
    writeMasterStorage(storage)
}

// ─── Computed Stats ───

export const getAdminDashboardStats = () => {
    const storage = readMasterStorage()
    const residents = getAdminResidents()
    return {
        totalResidents: residents.length,
        activeResidents: residents.filter((r) => r.status === "Active").length,
        expiringResidents: residents.filter((r) => r.status === "Expiring").length,
        expiredResidents: residents.filter((r) => r.status === "Expired").length,
        pendingVerifications: storage.verifications.length,
        pendingRequests: storage.documentRequests.filter((r) => r.status === "Pending").length,
        approvedRequests: storage.documentRequests.filter((r) => 
            r.status === "Approved" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Completed"
        ).length,
        rejectedRequests: storage.documentRequests.filter((r) => r.status === "Rejected").length,
        totalRequests: storage.documentRequests.length,
        unreadNotifications: storage.notifications.filter((n) => !n.isRead && n.targetId === "admin").length,
        totalDocumentsGenerated: storage.documentRequests.filter((r) => 
            r.status === "Approved" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Completed"
        ).length,
        seniorCount: residents.filter((r) => r.categories.some((c) => c.toLowerCase().includes("senior"))).length,
        minorCount: residents.filter((r) => r.categories.some((c) => c.toLowerCase().includes("under") || c.toLowerCase().includes("minor"))).length,
        adultCount: residents.filter((r) => r.categories.some((c) => c.toLowerCase().includes("adult"))).length,
        voterCount: residents.filter((r) => r.isVoter).length,
    }
}

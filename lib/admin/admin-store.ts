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
} from "../master-store"
import {
    COLOR_ADMIN_BLUE,
    SYSTEM_ADMIN_DISPLAY_NAME,
    SYSTEM_ADMIN_INITIALS,
} from "../constants"

// ─── Re-exported Types ───
export type AdminDocumentRequest = MasterDocumentRequest
export type AdminNotification = MasterNotification
export type PendingVerification = MasterVerification
export type { ActivityLog }

export interface AdminResident {
    id: string
    name: string
    initials: string
    age: number
    gender: "Male" | "Female" | "Other" | string
    address: string
    categories: string[]
    status: "Active" | "Inactive" | "Verified" | "Expired" | "Expiring" | string
    isVoter: boolean
    expiryDate: string
    dateOfBirth: string
    contactNumber: string
    email: string
    profilePicture?: string
    createdAt?: string
}

export const subscribeToAdminStorage = subscribeToMasterStorage

const formatTimeDisplay = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(date)
const formatDateDisplay = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
const formatShortDateDisplay = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)

// ─── Residents ───

export const getAdminResidents = (): AdminResident[] => {
    return readMasterStorage().residents.map(residentAccount => ({
        id: residentAccount.id,
        name: residentAccount.user.name,
        initials: residentAccount.user.initials,
        age: residentAccount.user.dateOfBirth
            ? Math.floor((new Date().getTime() - new Date(residentAccount.user.dateOfBirth).getTime()) / 31557600000)
            : 0,
        gender: "Male" as const,
        address: residentAccount.user.address,
        categories: residentAccount.user.statuses && residentAccount.user.statuses.length > 0
            ? residentAccount.user.statuses
            : (residentAccount.user.status ? [residentAccount.user.status] : []),
        status: "Active" as const,
        isVoter: (residentAccount.user.statuses || []).includes("Registered Voter") || residentAccount.user.status === "Registered Voter",
        expiryDate: residentAccount.user.accountExpiry,
        dateOfBirth: residentAccount.user.dateOfBirth,
        contactNumber: residentAccount.user.contactNumber,
        email: residentAccount.user.email,
    }))
}

export const addAdminResident = (input: Omit<AdminResident, "id" | "initials">) => {
    throw new Error(
        "Residents cannot be added from the admin store. " +
        "They must register through the resident portal to maintain master data synchronization."
    )
}

export const updateAdminResident = (id: string, updates: Partial<AdminResident>) => {
    const storage = readMasterStorage()
    const residentIndex = storage.residents.findIndex((resident) => resident.id === id)
    if (residentIndex === -1) return null
    if (updates.name) storage.residents[residentIndex].user.name = updates.name
    if (updates.name) storage.residents[residentIndex].user.initials = getInitials(updates.name)
    if (updates.address) storage.residents[residentIndex].user.address = updates.address
    writeMasterStorage(storage)
    return storage.residents[residentIndex]
}

export const deleteAdminResident = (id: string) => {
    const storage = readMasterStorage()
    storage.residents = storage.residents.filter(resident => resident.id !== id)
    writeMasterStorage(storage)
}

// ─── Verifications ───

export const getAdminVerifications = (): PendingVerification[] => {
    return readMasterStorage().verifications.filter(verification => !verification.status || verification.status === "pending")
}

export const getAdminRejectedVerifications = (): PendingVerification[] => {
    return readMasterStorage().verifications.filter(verification => verification.status === "rejected")
}

export const addAdminVerification = (input: Omit<PendingVerification, "id" | "initials">) => {
    const storage = readMasterStorage()
    const verification: PendingVerification = { ...input, id: generateId(), initials: getInitials(input.name) }
    storage.verifications.push(verification)
    writeMasterStorage(storage)
    return verification
}

/**
 * Approves a pending verification, marks the resident as verified, and notifies them.
 * Also appends an audit log entry for admin accountability.
 */
export const approveVerification = (id: string) => {
    const storage = readMasterStorage()
    const verificationIndex = storage.verifications.findIndex((verification) => verification.id === id)
    if (verificationIndex === -1) return null
    const verification = storage.verifications[verificationIndex]

    // Cross-module synchronization: update the resident's verified flag so their
    // profile reflects the approval without requiring a separate Firestore write.
    const resident = storage.residents.find(resident => resident.id === verification.residentId)
    if (resident) {
        resident.user.isVerified = true
    }

    storage.verifications[verificationIndex].status = "approved"

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

    storage.auditLogs.unshift({
        id: generateId(),
        time: formatTimeDisplay(new Date()),
        date: formatDateDisplay(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: SYSTEM_ADMIN_DISPLAY_NAME, initials: SYSTEM_ADMIN_INITIALS, color: COLOR_ADMIN_BLUE },
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

/**
 * Rejects a pending verification with a mandatory reason, notifies the resident,
 * and logs the action for accountability.
 */
export const rejectVerification = (id: string, reason: string = "No reason provided") => {
    const storage = readMasterStorage()
    const verificationIndex = storage.verifications.findIndex((verification) => verification.id === id)
    if (verificationIndex === -1) return null

    const verification = storage.verifications[verificationIndex]
    storage.verifications[verificationIndex].status = "rejected"
    storage.verifications[verificationIndex].rejectionReason = reason

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

    storage.auditLogs.unshift({
        id: generateId(),
        time: formatTimeDisplay(new Date()),
        date: formatDateDisplay(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: SYSTEM_ADMIN_DISPLAY_NAME, initials: SYSTEM_ADMIN_INITIALS, color: COLOR_ADMIN_BLUE },
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

// ─── Document Requests ───

export const getAdminDocumentRequests = () => readMasterStorage().documentRequests

export const addAdminDocumentRequest = (input: Omit<AdminDocumentRequest, "id" | "residentInitials">) => {
    // Walk-in requests bypass the resident portal. This is the only admin-side path to create a document request.
    const storage = readMasterStorage()
    const documentRequest: AdminDocumentRequest = {
        ...input,
        id: generateId(),
        residentInitials: getInitials(input.residentName),
    }
    storage.documentRequests.push(documentRequest)
    writeMasterStorage(storage)
    return documentRequest
}

/**
 * Updates a document request's status, notifies the resident, and appends an audit log entry.
 *
 * The `actionType` for non-rejected statuses is deliberately set to "approved" to avoid
 * breaking existing log color mappers that only distinguish "approved" vs "rejected".
 */
export const updateDocumentRequestStatus = (
    id: string, 
    status: "Approved" | "On Process" | "Ready for Pick Up" | "Completed" | "Rejected"
) => {
    const storage = readMasterStorage()
    const requestIndex = storage.documentRequests.findIndex((request) => request.id === id)
    if (requestIndex === -1) return null
    storage.documentRequests[requestIndex].status = status

    const documentRequest = storage.documentRequests[requestIndex]

    let notificationType: "success" | "urgent" | "info" = "success"
    if (status === "Rejected") notificationType = "urgent"
    if (status === "On Process") notificationType = "info"

    storage.notifications.push({
        id: generateId(),
        targetId: documentRequest.residentId,
        type: notificationType,
        title: `Document ${status}`,
        message: status === "Completed" 
            ? `Your request for ${documentRequest.documentType} has been completed and released.`
            : status === "On Process"
            ? `Your request for ${documentRequest.documentType} is now being processed.`
            : status === "Ready for Pick Up"
            ? `Your request for ${documentRequest.documentType} is ready for pick up at the barangay hall.`
            : `Your request for ${documentRequest.documentType} has been ${status.toLowerCase()}.`,
        timestamp: "Just now",
        isRead: false,
        createdAt: Date.now()
    })

    storage.auditLogs.unshift({
        id: generateId(),
        time: formatTimeDisplay(new Date()),
        date: formatDateDisplay(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: SYSTEM_ADMIN_DISPLAY_NAME, initials: SYSTEM_ADMIN_INITIALS, color: COLOR_ADMIN_BLUE },
        action: `${status} Document`,
        // Non-rejected statuses use "approved" as a catch-all to avoid breaking existing log color mappers.
        actionType: status === "Rejected" ? "rejected" : "approved",
        residentName: documentRequest.residentName,
        details: `Marked request for ${documentRequest.documentType} as ${status}`,
        role: "Admin",
        targetId: id,
        targetCollection: "documentRequests"
    })

    writeMasterStorage(storage)
    return documentRequest
}

export const deleteAdminDocumentRequest = (id: string) => {
    const storage = readMasterStorage()
    storage.documentRequests = storage.documentRequests.filter((request) => request.id !== id)
    writeMasterStorage(storage)
}

// ─── Notifications ───

export const getAdminNotifications = () =>
    readMasterStorage().notifications.filter(notification => notification.targetId === "admin")

export const addAdminNotification = (input: Omit<AdminNotification, "id">) => {
    const storage = readMasterStorage()
    const notification: AdminNotification = { ...input, id: generateId(), targetId: "admin", residentName: input.residentName, actionUrl: input.actionUrl }
    storage.notifications.unshift(notification)
    writeMasterStorage(storage)
    return notification
}

export const markAdminNotificationRead = (id: string) => {
    const storage = readMasterStorage()
    const notification = storage.notifications.find((notification) => notification.id === id)
    if (notification) notification.isRead = true
    writeMasterStorage(storage)
}

export const markAllAdminNotificationsRead = () => {
    const storage = readMasterStorage()
    storage.notifications.forEach((notification) => { if (notification.targetId === "admin") notification.isRead = true })
    writeMasterStorage(storage)
}

export const deleteAdminNotification = (id: string) => {
    const storage = readMasterStorage()
    storage.notifications = storage.notifications.filter((notification) => notification.id !== id)
    writeMasterStorage(storage)
}

// ─── Activity Logs ───

export const getAdminActivityLogs = () =>
    readMasterStorage().auditLogs.filter(log => log.role === "Admin")

export const addAdminActivityLog = (input: Omit<ActivityLog, "id" | "time" | "date" | "timestamp" | "role">) => {
    const storage = readMasterStorage()
    const log: ActivityLog = {
        ...input,
        id: generateId(),
        time: formatTimeDisplay(new Date()),
        date: formatDateDisplay(new Date()),
        timestamp: Date.now().toString(),
        role: "Admin",
        admin: { name: SYSTEM_ADMIN_DISPLAY_NAME, initials: SYSTEM_ADMIN_INITIALS, color: COLOR_ADMIN_BLUE }
    }
    storage.auditLogs.unshift(log)
    writeMasterStorage(storage)
    return log
}

export const clearAdminActivityLogs = () => {
    const storage = readMasterStorage()
    storage.auditLogs = storage.auditLogs.filter(log => log.role !== "Admin")
    writeMasterStorage(storage)
}

// ─── Computed Stats ───

export const getAdminDashboardStats = () => {
    const storage = readMasterStorage()
    const residents = getAdminResidents()
    return {
        totalResidents: residents.length,
        activeResidents: residents.filter((resident) => resident.status === "Active").length,
        expiringResidents: residents.filter((resident) => resident.status === "Expiring").length,
        expiredResidents: residents.filter((resident) => resident.status === "Expired").length,
        pendingVerifications: storage.verifications.length,
        pendingRequests: storage.documentRequests.filter((request) => request.status === "Pending").length,
        approvedRequests: storage.documentRequests.filter((request) => 
            request.status === "Approved" || request.status === "On Process" || request.status === "Ready for Pick Up" || request.status === "Completed"
        ).length,
        rejectedRequests: storage.documentRequests.filter((request) => request.status === "Rejected").length,
        totalRequests: storage.documentRequests.length,
        unreadNotifications: storage.notifications.filter((notification) => !notification.isRead && notification.targetId === "admin").length,
        totalDocumentsGenerated: storage.documentRequests.filter((request) => 
            request.status === "Approved" || request.status === "On Process" || request.status === "Ready for Pick Up" || request.status === "Completed"
        ).length,
        seniorCount: residents.filter((resident) => resident.categories.some((category) => category.toLowerCase().includes("senior"))).length,
        minorCount: residents.filter((resident) => resident.categories.some((category) => category.toLowerCase().includes("under") || category.toLowerCase().includes("minor"))).length,
        adultCount: residents.filter((resident) => resident.categories.some((category) => category.toLowerCase().includes("adult"))).length,
        voterCount: residents.filter((resident) => resident.isVoter).length,
    }
}

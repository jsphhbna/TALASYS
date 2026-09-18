"use client"
import {
    readMasterStorage,
    writeMasterStorage,
    generateId,
    getInitials,
    subscribeToMasterStorage,
    type AdminAccount,
    type ActivityLog,
    type SystemAlert,
    type SystemConfig,
} from "../master-store"
import {
    COLOR_SUPERADMIN_GOLD,
    COLOR_SUPERADMIN_NAVY,
    COLOR_SUPERADMIN_SLATE,
    COLOR_NEUTRAL_GRAY,
    COLOR_ADMIN_GREEN,
    COLOR_ADMIN_RED,
    COLOR_ADMIN_BLUE,
    SUPERADMIN_DISPLAY_NAME,
    SUPERADMIN_INITIALS,
} from "../constants"

// ─── Re-exported Types ───
export type { AdminAccount, SystemAlert, SystemConfig }
export type AuditLog = ActivityLog
export type AlertSeverity = "critical" | "warning" | "info"

export const subscribeToSAStorage = subscribeToMasterStorage

const formatTimeDisplay = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(date)
const formatDateDisplay = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)

// ─── Admin Accounts ───

export const getAdminAccounts = () => readMasterStorage().admins.filter(adminAccount => adminAccount.role !== "SuperAdmin")

export const findAdminByCredentials = (email: string, password: string) => {
    const storage = readMasterStorage()
    // SuperAdmin can also authenticate through this path if needed.
    return storage.admins.find(
        (adminAccount) => adminAccount.email.toLowerCase() === email.toLowerCase() && adminAccount.password === password && adminAccount.status === "Active"
    ) ?? null
}

export const addAdminAccount = (input: Omit<AdminAccount, "id" | "initials" | "isOnline" | "lastActive" | "createdDate">) => {
    const storage = readMasterStorage()
    const account: AdminAccount = {
        ...input,
        id: generateId(),
        initials: getInitials(input.name),
        isOnline: false,
        lastActive: "Never",
        createdDate: formatDateDisplay(new Date()),
    }
    storage.admins.push(account)

    // Record admin creation for SuperAdmin accountability and audit visibility.
    storage.auditLogs.unshift({
        id: generateId(),
        date: formatDateDisplay(new Date()),
        time: formatTimeDisplay(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: SUPERADMIN_DISPLAY_NAME, initials: SUPERADMIN_INITIALS, color: COLOR_SUPERADMIN_GOLD },
        role: "SuperAdmin",
        action: "Created Admin",
        actionType: "Created Admin",
        details: `Created admin account for ${input.name} (${input.role})`,
        ipAddress: "localhost",
    })

    writeMasterStorage(storage)
    return account
}

export const updateAdminAccount = (id: string, updates: Partial<AdminAccount>) => {
    const storage = readMasterStorage()
    const adminIndex = storage.admins.findIndex((adminAccount) => adminAccount.id === id)
    if (adminIndex === -1) return null
    storage.admins[adminIndex] = { ...storage.admins[adminIndex], ...updates }
    if (updates.name) storage.admins[adminIndex].initials = getInitials(updates.name)
    writeMasterStorage(storage)
    return storage.admins[adminIndex]
}

export const deleteAdminAccount = (id: string) => {
    const storage = readMasterStorage()
    const adminAccount = storage.admins.find((adminAccount) => adminAccount.id === id)
    storage.admins = storage.admins.filter((adminAccount) => adminAccount.id !== id)

    if (adminAccount) {
        storage.auditLogs.unshift({
            id: generateId(),
            date: formatDateDisplay(new Date()),
            time: formatTimeDisplay(new Date()),
            timestamp: Date.now().toString(),
            admin: { name: SUPERADMIN_DISPLAY_NAME, initials: SUPERADMIN_INITIALS, color: COLOR_SUPERADMIN_GOLD },
            role: "SuperAdmin",
            action: "Deleted Admin",
            actionType: "Deleted Admin",
            details: `Deleted admin account: ${adminAccount.name}`,
            ipAddress: "localhost",
        })
    }

    writeMasterStorage(storage)
}

// ─── Audit Logs ───

// SuperAdmin has universal visibility to audit logs from all roles for accountability purposes.
export const getAuditLogs = () => readMasterStorage().auditLogs

export const addAuditLog = (input: Omit<ActivityLog, "id" | "date" | "time" | "timestamp" | "role">) => {
    const storage = readMasterStorage()
    const now = new Date()
    const log: ActivityLog = { ...input, id: generateId(), date: formatDateDisplay(now), time: formatTimeDisplay(now), timestamp: Date.now().toString(), role: "SuperAdmin", action: input.actionType }
    storage.auditLogs.unshift(log)
    writeMasterStorage(storage)
    return log
}

export const clearAuditLogs = () => {
    const storage = readMasterStorage()
    // Clears ALL audit logs — a destructive, irreversible operation. Only the SuperAdmin can perform it.
    storage.auditLogs = []
    writeMasterStorage(storage)
}

// ─── System Alerts ───

export const getSystemAlerts = () => readMasterStorage().systemAlerts

/**
 * Creates a system alert and broadcasts it as an urgent notification to both
 * admin and all active residents. Use sparingly — alerts are intrusive by design.
 */
export const addSystemAlert = (input: Omit<SystemAlert, "id" | "timestamp">) => {
    const storage = readMasterStorage()
    const alert: SystemAlert = { ...input, id: generateId(), timestamp: "Just now" }
    storage.systemAlerts.unshift(alert)

    storage.notifications.unshift({
        id: generateId(),
        targetId: "admin",
        type: "urgent",
        title: input.title,
        message: input.description,
        timestamp: "Just now",
        isRead: false,
        createdAt: Date.now()
    })

    // Broadcast the alert to all active residents as an urgent notification.
    storage.residents.forEach(residentAccount => {
        storage.notifications.unshift({
            id: generateId(),
            targetId: residentAccount.id,
            type: "urgent",
            title: input.title,
            message: input.description,
            timestamp: "Just now",
            isRead: false,
            createdAt: Date.now()
        })
    })

    writeMasterStorage(storage)
    return alert
}

export const dismissSystemAlert = (id: string) => {
    const storage = readMasterStorage()
    storage.systemAlerts = storage.systemAlerts.filter((alert) => alert.id !== id)
    writeMasterStorage(storage)
}

// ─── System Config ───

export const getSystemConfig = () => readMasterStorage().systemConfig

export const updateSystemConfig = (updates: Partial<SystemConfig>) => {
    const storage = readMasterStorage()
    storage.systemConfig = { ...storage.systemConfig, ...updates }

    storage.auditLogs.unshift({
        id: generateId(),
        date: formatDateDisplay(new Date()),
        time: formatTimeDisplay(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: SUPERADMIN_DISPLAY_NAME, initials: SUPERADMIN_INITIALS, color: COLOR_SUPERADMIN_GOLD },
        role: "SuperAdmin",
        action: "Config Edit",
        actionType: "Config Edit",
        details: `Updated system configuration: ${Object.keys(updates).join(", ")}`,
        ipAddress: "localhost",
    })

    writeMasterStorage(storage)
    return storage.systemConfig
}

// ─── Computed Stats ───

/**
 * Computes aggregated statistics for the SuperAdmin dashboard.
 * Role distribution and audit breakdowns are computed in memory from the current store snapshot.
 */
export const getSuperAdminStats = () => {
    const storage = readMasterStorage()
    const normalAdmins = getAdminAccounts()
    return {
        totalAdmins: normalAdmins.length,
        activeAdmins: normalAdmins.filter((adminAccount) => adminAccount.status === "Active").length,
        lockedAdmins: normalAdmins.filter((adminAccount) => adminAccount.status === "Locked").length,
        onlineAdmins: normalAdmins.filter((adminAccount) => adminAccount.isOnline).length,
        totalAuditLogs: storage.auditLogs.length,
        totalAlerts: storage.systemAlerts.length,
        criticalAlerts: storage.systemAlerts.filter((alert) => alert.severity === "critical").length,
        warningAlerts: storage.systemAlerts.filter((alert) => alert.severity === "warning").length,
        roleDistribution: [
            { name: "Full Access", value: normalAdmins.filter((adminAccount) => adminAccount.role === "Full Access").length, color: COLOR_SUPERADMIN_NAVY },
            { name: "Verification Only", value: normalAdmins.filter((adminAccount) => adminAccount.role === "Verification Only").length, color: COLOR_SUPERADMIN_SLATE },
            { name: "Documents Only", value: normalAdmins.filter((adminAccount) => adminAccount.role === "Documents Only").length, color: COLOR_SUPERADMIN_GOLD },
            { name: "View Only", value: normalAdmins.filter((adminAccount) => adminAccount.role === "View Only").length, color: COLOR_NEUTRAL_GRAY },
        ].filter((roleGroup) => roleGroup.value > 0),
        auditActionBreakdown: (() => {
            const actionCounts: Record<string, number> = {}
            storage.auditLogs.forEach((log) => { actionCounts[log.actionType] = (actionCounts[log.actionType] ?? 0) + 1 })
            const breakdownColors = [COLOR_ADMIN_GREEN, COLOR_ADMIN_BLUE, COLOR_ADMIN_RED, COLOR_SUPERADMIN_GOLD, COLOR_SUPERADMIN_NAVY, COLOR_NEUTRAL_GRAY]
            return Object.entries(actionCounts).map(([name, value], index) => ({ name, value, color: breakdownColors[index % breakdownColors.length] }))
        })(),
    }
}

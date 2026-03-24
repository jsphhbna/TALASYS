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
} from "./master-store"

// ─── Re-exported Types ───
export type { AdminAccount, SystemAlert, SystemConfig }
export type AuditLog = ActivityLog
export type AlertSeverity = "critical" | "warning" | "info"

export const subscribeToSAStorage = subscribeToMasterStorage
const formatTime = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(date)
const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)

// ─── Admin Accounts CRUD ───

export const getAdminAccounts = () => readMasterStorage().admins.filter(a => a.role !== "SuperAdmin")

export const findAdminByCredentials = (email: string, password: string) => {
    const storage = readMasterStorage()
    // Support finding SuperAdmins too via the same login door
    return storage.admins.find(
        (a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password && a.status === "Active"
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
        createdDate: formatDate(new Date()),
    }
    storage.admins.push(account)

    storage.auditLogs.unshift({
        id: generateId(),
        date: formatDate(new Date()),
        time: formatTime(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: "Super Admin", initials: "SA", color: "#C5A55A" },
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
    const idx = storage.admins.findIndex((a) => a.id === id)
    if (idx === -1) return null
    storage.admins[idx] = { ...storage.admins[idx], ...updates }
    if (updates.name) storage.admins[idx].initials = getInitials(updates.name)
    writeMasterStorage(storage)
    return storage.admins[idx]
}

export const deleteAdminAccount = (id: string) => {
    const storage = readMasterStorage()
    const account = storage.admins.find((a) => a.id === id)
    storage.admins = storage.admins.filter((a) => a.id !== id)

    if (account) {
        storage.auditLogs.unshift({
            id: generateId(),
            date: formatDate(new Date()),
            time: formatTime(new Date()),
            timestamp: Date.now().toString(),
            admin: { name: "Super Admin", initials: "SA", color: "#C5A55A" },
            role: "SuperAdmin",
            action: "Deleted Admin",
            actionType: "Deleted Admin",
            details: `Deleted admin account: ${account.name}`,
            ipAddress: "localhost",
        })
    }

    writeMasterStorage(storage)
}

// ─── Audit Logs ───

// SuperAdmin sees ALL audit logs! (Both "Admin" and "SuperAdmin" roles)
export const getAuditLogs = () => readMasterStorage().auditLogs

export const addAuditLog = (input: Omit<ActivityLog, "id" | "date" | "time" | "timestamp" | "role">) => {
    const storage = readMasterStorage()
    const now = new Date()
    const log: ActivityLog = { ...input, id: generateId(), date: formatDate(now), time: formatTime(now), timestamp: Date.now().toString(), role: "SuperAdmin", action: input.actionType }
    storage.auditLogs.unshift(log)
    writeMasterStorage(storage)
    return log
}

export const clearAuditLogs = () => {
    const storage = readMasterStorage()
    storage.auditLogs = [] // Complete system wipe
    writeMasterStorage(storage)
}

// ─── System Alerts CRUD ───

export const getSystemAlerts = () => readMasterStorage().systemAlerts

export const addSystemAlert = (input: Omit<SystemAlert, "id" | "timestamp">) => {
    const storage = readMasterStorage()
    const alert: SystemAlert = { ...input, id: generateId(), timestamp: "Just now" }
    storage.systemAlerts.unshift(alert)

    // Sync down natively as Urgent Notifications to Admin and Resident
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

    // Natively broadcast to ALL active residents!
    storage.residents.forEach(r => {
        storage.notifications.unshift({
            id: generateId(),
            targetId: r.id,
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
    storage.systemAlerts = storage.systemAlerts.filter((a) => a.id !== id)
    writeMasterStorage(storage)
}

// ─── System Config ───

export const getSystemConfig = () => readMasterStorage().systemConfig

export const updateSystemConfig = (updates: Partial<SystemConfig>) => {
    const storage = readMasterStorage()
    storage.systemConfig = { ...storage.systemConfig, ...updates }

    storage.auditLogs.unshift({
        id: generateId(),
        date: formatDate(new Date()),
        time: formatTime(new Date()),
        timestamp: Date.now().toString(),
        admin: { name: "Super Admin", initials: "SA", color: "#C5A55A" },
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

export const getSuperAdminStats = () => {
    const storage = readMasterStorage()
    const normalAdmins = getAdminAccounts()
    return {
        totalAdmins: normalAdmins.length,
        activeAdmins: normalAdmins.filter((a) => a.status === "Active").length,
        lockedAdmins: normalAdmins.filter((a) => a.status === "Locked").length,
        onlineAdmins: normalAdmins.filter((a) => a.isOnline).length,
        totalAuditLogs: storage.auditLogs.length, // Universal visibility 
        totalAlerts: storage.systemAlerts.length,
        criticalAlerts: storage.systemAlerts.filter((a) => a.severity === "critical").length,
        warningAlerts: storage.systemAlerts.filter((a) => a.severity === "warning").length,
        roleDistribution: [
            { name: "Full Access", value: normalAdmins.filter((a) => a.role === "Full Access").length, color: "#0C2340" },
            { name: "Verification Only", value: normalAdmins.filter((a) => a.role === "Verification Only").length, color: "#2a5080" },
            { name: "Documents Only", value: normalAdmins.filter((a) => a.role === "Documents Only").length, color: "#C5A55A" },
            { name: "View Only", value: normalAdmins.filter((a) => a.role === "View Only").length, color: "#94a3b8" },
        ].filter((r) => r.value > 0),
        auditActionBreakdown: (() => {
            const counts: Record<string, number> = {}
            storage.auditLogs.forEach((l) => { counts[l.actionType] = (counts[l.actionType] ?? 0) + 1 })
            const colors = ["#10b981", "#3b82f6", "#ef4444", "#C5A55A", "#0C2340", "#94a3b8"]
            return Object.entries(counts).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
        })(),
    }
}

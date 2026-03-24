"use client"

import { useCallback, useEffect, useState } from "react"
import {
    getAdminAccounts,
    getAuditLogs,
    getSystemAlerts,
    getSystemConfig,
    getSuperAdminStats,
    addAdminAccount,
    updateAdminAccount,
    deleteAdminAccount,
    findAdminByCredentials,
    addAuditLog,
    clearAuditLogs,
    addSystemAlert,
    dismissSystemAlert,
    updateSystemConfig,
    subscribeToSAStorage,
    type AdminAccount,
    type AuditLog,
    type SystemAlert,
    type SystemConfig,
} from "@/lib/superadmin-store"

export function useSuperAdminData() {
    const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([])
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
    const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([])
    const [systemConfig, setSystemConfig] = useState<SystemConfig>(getSystemConfig())
    const [isLoaded, setIsLoaded] = useState(false)

    const refresh = useCallback(() => {
        setAdminAccounts(getAdminAccounts())
        setAuditLogs(getAuditLogs())
        setSystemAlerts(getSystemAlerts())
        setSystemConfig(getSystemConfig())
        setIsLoaded(true)
    }, [])

    useEffect(() => {
        refresh()
        const unsubscribe = subscribeToSAStorage(refresh)
        return unsubscribe
    }, [refresh])

    const stats = getSuperAdminStats()

    return {
        // Data
        adminAccounts,
        auditLogs,
        systemAlerts,
        systemConfig,
        stats,
        isLoaded,
        refresh,

        // Admin Accounts
        addAdmin: useCallback((input: Omit<AdminAccount, "id" | "initials" | "isOnline" | "lastActive" | "createdDate">) => { const a = addAdminAccount(input); refresh(); return a }, [refresh]),
        updateAdmin: useCallback((id: string, updates: Partial<AdminAccount>) => { const a = updateAdminAccount(id, updates); refresh(); return a }, [refresh]),
        deleteAdmin: useCallback((id: string) => { deleteAdminAccount(id); refresh() }, [refresh]),
        findAdminByCredentials,

        // Audit Logs
        addAuditLog: useCallback((input: Omit<AuditLog, "id" | "date" | "timestamp">) => { const l = addAuditLog(input); refresh(); return l }, [refresh]),
        clearAuditLogs: useCallback(() => { clearAuditLogs(); refresh() }, [refresh]),

        // System Alerts
        addAlert: useCallback((input: Omit<SystemAlert, "id" | "timestamp">) => { const a = addSystemAlert(input); refresh(); return a }, [refresh]),
        dismissAlert: useCallback((id: string) => { dismissSystemAlert(id); refresh() }, [refresh]),

        // System Config
        updateConfig: useCallback((updates: Partial<SystemConfig>) => { const c = updateSystemConfig(updates); refresh(); return c }, [refresh]),
    }
}

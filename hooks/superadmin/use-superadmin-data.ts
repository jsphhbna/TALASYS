"use client"

import { useCallback, useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, query, onSnapshot, orderBy, doc, getCountFromServer, where, limit, getDocs } from "firebase/firestore"
import { isAnyAdminRole, isSuperAdminRole } from "@/lib/auth/auth-types"
import type {
    AdminAccount,
    AuditLog,
    SystemAlert,
    SystemConfig,
} from "@/lib/superadmin"
import {
    COLLECTION_USERS,
    COLLECTION_ACTIVITY_LOGS,
    COLLECTION_SYSTEM_ALERTS,
    COLLECTION_SYSTEM_CONFIG,
    COLLECTION_DOCUMENT_REQUESTS,
    COLLECTION_VERIFICATIONS,
    SYSTEM_CONFIG_DOCUMENT_ID,
    COLOR_SUPERADMIN_GOLD,
    COLOR_SUPERADMIN_NAVY,
    COLOR_SUPERADMIN_SLATE,
    COLOR_NEUTRAL_GRAY,
    COLOR_ADMIN_GREEN,
    COLOR_ADMIN_RED,
    COLOR_ADMIN_BLUE,
    SUPERADMIN_DISPLAY_NAME,
    SUPERADMIN_INITIALS,
} from "@/lib/constants"
import { normalizeAuditLog } from "@/lib/security/audit-utils"
import { callAdminOperation } from "@/lib/admin/client-operation"
import { fetchOrderedCollectionPages } from "@/lib/firestore-pagination"

export function useSuperAdminData() {
    const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([])
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
    const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([])
    const [refreshCounter, setRefreshCounter] = useState(0)
    
    const [systemConfig, setSystemConfig] = useState<SystemConfig>({
        barangayName: "",
        barangayCaptainName: "",
        contactNumber: "",
        emailAddress: "",
        address: "",
        enabledModules: [],
        documentTypes: [],
        documentFees: {},
    })
    
    const [isLoaded, setIsLoaded] = useState(false)
    const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({})
    const error = Object.values(sourceErrors).join("; ") || null
    const [stats, setStats] = useState({
        totalResidents: 0,
        activeRequests: 0,
        pendingVerifications: 0,
        systemHealth: 100,
        adminCount: 0,
    })

    useEffect(() => {
        const unsubscribeFunctions: (() => void)[] = []
        const sourcesLoaded = new Set<string>()
        const checkReady = (key: string) => {
            setSourceErrors(previous => { const next = { ...previous }; delete next[key]; return next })
            sourcesLoaded.add(key)
            if (sourcesLoaded.size >= 4) {
                setIsLoaded(true)
            }
        }

        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_USERS), (snapshot) => {
            const allUserDocuments = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as any))
            const adminUsers = allUserDocuments.filter(userData => isAnyAdminRole(userData.role)).map(adminUser => ({
                id: adminUser.id,
                name: adminUser.name || "Admin",
                email: adminUser.email || "",
                password: adminUser.password || "",
                contactNumber: adminUser.contactNumber || "",
                role: adminUser.role,
                status: adminUser.status || "Active",
                initials: adminUser.initials || "A",
                isOnline: false,
                lastActive: adminUser.lastActive || "Not recorded",
                createdDate: adminUser.createdDate || "Unknown",
                isVerified: adminUser.isVerified || false,
            }))
            setAdminAccounts(adminUsers.filter(adminUser => !isSuperAdminRole(adminUser.role)))
            setStats(prev => ({ ...prev, adminCount: adminUsers.length }))

            // Check for locked admins signal (#1) - clear signal if no accounts are locked
            const lockedAdmins = adminUsers.filter(a => a.status === "Locked")
            setSystemAlerts(prev => {
                const withoutLocked = prev.filter(a => !a.id.startsWith("signal-locked-admin"))
                if (lockedAdmins.length > 0) {
                    return [
                        ...withoutLocked,
                        {
                            id: "signal-locked-admin",
                            severity: "warning",
                            title: "Locked Administrator Account",
                            description: `${lockedAdmins.length} administrator account(s) are currently locked and cannot access the system.`,
                            metric: `${lockedAdmins.length} Locked`,
                            timestamp: "Active",
                        }
                    ]
                }
                return withoutLocked
            })
            checkReady("users")
        }, (err) => {
            console.error("users snapshot error in superadmin hook:", err)
            setSourceErrors(previous => ({ ...previous, users: err.message || "Failed to load users" }))
            setIsLoaded(true)
        }))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_ACTIVITY_LOGS), orderBy("timestamp", "desc"), limit(500)), async () => {
          try {
            const allLogs = await fetchOrderedCollectionPages<any>(db, COLLECTION_ACTIVITY_LOGS, "timestamp", 500)
            setAuditLogs(allLogs.map(normalizeAuditLog) as unknown as AuditLog[])
            checkReady("activityLogs")
          } catch (err: any) {
            console.error("activityLogs pagination error in superadmin hook:", err)
            setSourceErrors(previous => ({ ...previous, activityLogs: err.message || "Failed to load complete audit history" }))
            setIsLoaded(true)
          }
        }, (err) => {
            console.error("activityLogs snapshot error in superadmin hook:", err)
            setSourceErrors(previous => ({ ...previous, activityLogs: err.message || "Failed to load audit logs" }))
            setIsLoaded(true)
        }))

        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_SYSTEM_ALERTS), (snapshot) => {
            const persisted = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as SystemAlert))
            setSystemAlerts(prev => {
                const dynamic = prev.filter(a => a.id.startsWith("signal-"))
                return [...persisted, ...dynamic]
            })
            checkReady("alerts")
        }, (err) => {
            console.error("alerts snapshot error in superadmin hook:", err)
            setSourceErrors(previous => ({ ...previous, alerts: err.message || "Failed to load system alerts" }))
            setIsLoaded(true)
        }))

        unsubscribeFunctions.push(onSnapshot(doc(db, COLLECTION_SYSTEM_CONFIG, SYSTEM_CONFIG_DOCUMENT_ID), (snapshot) => {
            if (snapshot.exists()) setSystemConfig(snapshot.data() as SystemConfig)
            checkReady("config")
        }, (err) => {
            console.error("config snapshot error in superadmin hook:", err)
            setSourceErrors(previous => ({ ...previous, config: err.message || "Failed to load system config" }))
            setIsLoaded(true)
        }))

        // Aggregate counts: count residents strictly separately from admins (#8)
        async function fetchAggregateStats() {
            try {
                const [totalResidentsSnap, activeRequestsSnap, pendingVerificationsSnap] = await Promise.all([
                    getCountFromServer(query(collection(db, COLLECTION_USERS), where("role", "==", "resident"))),
                    getCountFromServer(query(collection(db, COLLECTION_DOCUMENT_REQUESTS), where("status", "==", "Pending"))),
                    getCountFromServer(query(collection(db, COLLECTION_VERIFICATIONS), where("status", "==", "pending"))),
                ])
                const pendingVerifsCount = pendingVerificationsSnap.data().count
                const activeReqsCount = activeRequestsSnap.data().count

                setStats(prev => ({
                    ...prev,
                    totalResidents: totalResidentsSnap.data().count,
                    activeRequests: activeReqsCount,
                    pendingVerifications: pendingVerifsCount,
                }))

                // Dynamic alert signals for pending items
                const queueSignals: SystemAlert[] = []
                if (pendingVerifsCount > 0) {
                    queueSignals.push({
                        id: "signal-pending-verifications",
                        severity: "warning",
                        title: "Pending Verifications",
                        description: `${pendingVerifsCount} resident verification request(s) waiting for review.`,
                        metric: `${pendingVerifsCount} Pending`,
                        timestamp: "Active",
                    })
                }
                if (activeReqsCount > 0) {
                    queueSignals.push({
                        id: "signal-pending-requests",
                        severity: "info",
                        title: "Pending Document Requests",
                        description: `${activeReqsCount} document request(s) awaiting processing.`,
                        metric: `${activeReqsCount} Pending`,
                        timestamp: "Active",
                    })
                }

                setSystemAlerts(prev => {
                    const withoutQueues = prev.filter(a => !a.id.startsWith("signal-pending-"))
                    return [...withoutQueues, ...queueSignals]
                })
            } catch (statsError) {
                console.error("Failed to fetch SuperAdmin aggregate stats:", statsError)
            }
        }
        fetchAggregateStats()

        // Listen to queue changes dynamically to keep signals and counts current (#8)
        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_VERIFICATIONS), where("status", "==", "pending")), () => {
            fetchAggregateStats()
        }))
        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_DOCUMENT_REQUESTS), where("status", "==", "Pending")), () => {
            fetchAggregateStats()
        }))

        return () => unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
    }, [refreshCounter])

    const refresh = useCallback(async () => {
        setIsLoaded(false)
        setSourceErrors({})
        setRefreshCounter(prev => prev + 1)
        try {
            const [totalResidentsSnap, activeRequestsSnap, pendingVerificationsSnap] = await Promise.all([
                getCountFromServer(query(collection(db, COLLECTION_USERS), where("role", "==", "resident"))),
                getCountFromServer(query(collection(db, COLLECTION_DOCUMENT_REQUESTS), where("status", "==", "Pending"))),
                getCountFromServer(query(collection(db, COLLECTION_VERIFICATIONS), where("status", "==", "pending"))),
            ])
            const pendingVerifsCount = pendingVerificationsSnap.data().count
            const activeReqsCount = activeRequestsSnap.data().count

            setStats(prev => ({
                ...prev,
                totalResidents: totalResidentsSnap.data().count,
                activeRequests: activeReqsCount,
                pendingVerifications: pendingVerifsCount,
            }))
        } catch (err: any) {
            console.error("Failed to refresh SuperAdmin dashboard:", err)
            setSourceErrors(previous => ({ ...previous, aggregates: err.message || "Failed to refresh dashboard stats" }))
        } finally {
            setIsLoaded(true)
        }
    }, [])

    return {
        adminAccounts,
        auditLogs,
        systemAlerts,
        systemConfig,
        isLoaded,
        error,
        hasError: !!error,
        stats: {
            ...stats,
            roleDistribution: [
                { name: "Full Access", value: adminAccounts.filter((adminAccount) => adminAccount.role === "Full Access").length, color: COLOR_SUPERADMIN_NAVY },
                { name: "Resident Management", value: adminAccounts.filter((adminAccount) => adminAccount.role === "Resident Management").length, color: COLOR_SUPERADMIN_SLATE },
                { name: "Verifications", value: adminAccounts.filter((adminAccount) => adminAccount.role === "Verifications").length, color: COLOR_ADMIN_GREEN },
                { name: "Document Processing", value: adminAccounts.filter((adminAccount) => adminAccount.role === "Document Processing").length, color: COLOR_SUPERADMIN_GOLD },
            ].filter((roleGroup) => roleGroup.value > 0),
            auditActionBreakdown: (() => {
                const actionCounts: Record<string, number> = {}
                auditLogs.forEach((log) => { actionCounts[log.actionType] = (actionCounts[log.actionType] ?? 0) + 1 })
                const breakdownColors = [COLOR_ADMIN_GREEN, COLOR_ADMIN_BLUE, COLOR_ADMIN_RED, COLOR_SUPERADMIN_GOLD, COLOR_SUPERADMIN_NAVY, COLOR_NEUTRAL_GRAY]
                return Object.entries(actionCounts).map(([name, value], index) => ({ name, value, color: breakdownColors[index % breakdownColors.length] }))
            })(),
            totalAuditLogs: auditLogs.length,
        },
        refresh,

        // Admin Accounts
        addAdmin: useCallback(async (input: Omit<AdminAccount, "id" | "initials" | "isOnline" | "lastActive" | "createdDate">) => {
            await callAdminOperation("admin.create", { payload: { name: input.name, email: input.email, password: input.password, contactNumber: input.contactNumber, role: input.role } })
        }, []),
        updateAdmin: useCallback(async (id: string, updates: Partial<AdminAccount>) => {
            const { password: _password, email: _email, id: _id, ...allowed } = updates as any
            await callAdminOperation("admin.update", { targetId: id, payload: { updates: allowed } })
        }, [adminAccounts]),
        deleteAdmin: useCallback(async (id: string) => {
            await callAdminOperation("admin.delete", { targetId: id })
        }, [adminAccounts]),

        // Audit Logs
        fetchAllAuditLogs: useCallback(async () => {
            try {
                const logs = await fetchOrderedCollectionPages<any>(db, COLLECTION_ACTIVITY_LOGS, "timestamp", 500)
                return logs.map(log => normalizeAuditLog(log) as unknown as AuditLog)
            } catch (e) {
                console.error("fetchAllAuditLogs failed:", e)
                return []
            }
        }, []),
        addAuditLog: useCallback(async (input: Omit<AuditLog, "id" | "time" | "date" | "timestamp">) => {
            throw new Error("Authoritative audit events are derived by typed server operations and cannot be submitted independently.")
        }, []),
        clearAuditLogs: useCallback(async () => {
            throw new Error("Audit log deletion is restricted to a dedicated server-authorized retention workflow.")
        }, []),

        // System Alerts
        addAlert: useCallback(async (input: Omit<SystemAlert, "id" | "timestamp">) => {
            await callAdminOperation("system.alert.create", { payload: { alert: input as any } })
        }, []),
        dismissAlert: useCallback(async (id: string) => {
            await callAdminOperation("system.alert.dismiss", { targetId: id })
        }, []),

        // System Config
        updateConfig: useCallback(async (updates: Partial<SystemConfig>) => {
            await callAdminOperation("system.config.update", { payload: { updates: updates as any } })
        }, []),
    }
}

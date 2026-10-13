"use client"

import { useCallback, useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, query, onSnapshot, orderBy, doc, updateDoc, deleteDoc, addDoc, getCountFromServer, where, setDoc, limit, getDocs } from "firebase/firestore"
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
import { parseAuditTimestamp } from "@/lib/security/audit-utils"
import { recordServerAudit } from "@/lib/audit/server-audit"

export function useSuperAdminData() {
    const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([])
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
    const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([])
    
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
    const [error, setError] = useState<string | null>(null)
    const [stats, setStats] = useState({
        totalResidents: 0,
        activeRequests: 0,
        pendingVerifications: 0,
        systemHealth: 100,
        adminCount: 0,
    })

    useEffect(() => {
        const unsubscribeFunctions: (() => void)[] = []

        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_USERS), (snapshot) => {
            const allUserDocuments = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as any))
            const adminUsers = allUserDocuments.filter(userData => isAnyAdminRole(userData.role)).map(adminUser => ({
                id: adminUser.id,
                name: adminUser.name || "Admin",
                email: adminUser.email || "",
                password: adminUser.password || "",
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
        }, (err) => {
            console.error("users snapshot error in superadmin hook:", err)
            setError(err.message || "Failed to load users")
        }))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_ACTIVITY_LOGS), orderBy("timestamp", "desc"), limit(500)), (snapshot) => {
            setAuditLogs(snapshot.docs.map(snapshotDoc => {
                const data = snapshotDoc.data()
                return {
                    id: snapshotDoc.id,
                    ...data,
                    timestamp: parseAuditTimestamp(data.timestamp) || 0,
                    action: data.action || data.actionType || "Action",
                    actionType: data.actionType || data.action || "Action",
                } as unknown as AuditLog
            }))
        }, (err) => {
            console.error("activityLogs snapshot error in superadmin hook:", err)
            setError(err.message || "Failed to load audit logs")
        }))

        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_SYSTEM_ALERTS), (snapshot) => {
            const persisted = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as SystemAlert))
            setSystemAlerts(prev => {
                const dynamic = prev.filter(a => a.id.startsWith("signal-"))
                return [...persisted, ...dynamic]
            })
        }, (err) => {
            console.error("alerts snapshot error in superadmin hook:", err)
            setError(err.message || "Failed to load system alerts")
        }))

        unsubscribeFunctions.push(onSnapshot(doc(db, COLLECTION_SYSTEM_CONFIG, SYSTEM_CONFIG_DOCUMENT_ID), (snapshot) => {
            if (snapshot.exists()) setSystemConfig(snapshot.data() as SystemConfig)
        }, (err) => {
            console.error("config snapshot error in superadmin hook:", err)
            setError(err.message || "Failed to load system config")
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

                const queueSignals: SystemAlert[] = []
                if (pendingVerifsCount >= 5) {
                    queueSignals.push({
                        id: "signal-pending-verifications",
                        severity: "warning",
                        title: "Verification Queue Backlog",
                        description: `${pendingVerifsCount} resident verification submissions are pending review.`,
                        metric: `${pendingVerifsCount} Pending`,
                        timestamp: "Active",
                    })
                }
                if (activeReqsCount >= 10) {
                    queueSignals.push({
                        id: "signal-pending-requests",
                        severity: "info",
                        title: "Document Processing Queue",
                        description: `${activeReqsCount} document requests are awaiting processing.`,
                        metric: `${activeReqsCount} Queued`,
                        timestamp: "Active",
                    })
                }

                // Dynamic alert replacement: clears signals when backlog conditions resolve (#1, #8)
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

        // A brief delay ensures all listeners are initialized before the UI renders data.
        setTimeout(() => setIsLoaded(true), 500)

        return () => unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
    }, [])

    const refresh = useCallback(async () => {
        setIsLoaded(false)
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
            setError(err.message || "Failed to refresh dashboard stats")
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
            try {
                const { initializeApp, deleteApp } = await import("firebase/app")
                const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth")
                const { firebaseConfig } = await import("@/lib/firebase")
                
                // A secondary Firebase app instance is used to create the admin account without
                // signing out the currently authenticated SuperAdmin from the primary app.
                const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp" + Date.now())
                const secondaryAuth = getAuth(secondaryApp)
                
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, input.email, input.password)
                const newAdminUid = userCredential.user.uid
                
                const { sendEmailVerification } = await import("firebase/auth")
                await sendEmailVerification(userCredential.user)
                
                const { password: _password, ...userDataToSave } = input;
                await setDoc(doc(db, COLLECTION_USERS, newAdminUid), {
                    ...userDataToSave,
                    initials: input.name.substring(0, 2).toUpperCase(),
                    isOnline: false,
                    lastActive: "Never",
                    createdDate: new Date().toISOString().split("T")[0],
                    createdAt: Date.now(),
                    isVerified: false,
                    role: input.role || "admin",
                })
                
                await deleteApp(secondaryApp)
                
                // Record the admin creation action via server-authored audit endpoint (#6)
                await recordServerAudit({
                    action: "Created Admin",
                    actionType: "Admin Management",
                    details: `Created admin account for ${input.name}`,
                    targetId: newAdminUid,
                    targetName: input.name,
                    targetCollection: "users"
                })
            } catch (createAdminError: any) {
                console.error(`Error creating admin auth account (email: ${input.email}):`, createAdminError)
                throw createAdminError
            }
        }, []),
        updateAdmin: useCallback(async (id: string, updates: Partial<AdminAccount>) => {
            await updateDoc(doc(db, COLLECTION_USERS, id), updates)
            const targetAdmin = adminAccounts.find(a => a.id === id)
            const targetName = targetAdmin?.name || id
            const actionName = updates.status === "Locked" ? "Locked Admin" : (updates.status === "Active" ? "Unlocked Admin" : (updates.role ? "Updated Admin Role" : "Updated Admin"))
            const details = updates.role ? `Changed role of ${targetName} to ${updates.role}` : (updates.status ? `${updates.status} account of ${targetName}` : `Updated settings for ${targetName}`)
            
            // Record admin update action via server-authored audit endpoint with real IP (#6)
            await recordServerAudit({
                action: actionName,
                actionType: "Admin Management",
                details,
                targetId: id,
                targetName,
                targetCollection: "users"
            })
        }, [adminAccounts]),
        deleteAdmin: useCallback(async (id: string) => {
            const targetAdmin = adminAccounts.find(a => a.id === id)
            const targetName = targetAdmin?.name || id
            await deleteDoc(doc(db, COLLECTION_USERS, id))
            
            // Record admin deletion action via server-authored audit endpoint with real IP (#6)
            await recordServerAudit({
                action: "Deleted Admin",
                actionType: "Admin Management",
                details: `Deleted admin account for ${targetName}`,
                targetId: id,
                targetName,
                targetCollection: "users"
            })
        }, [adminAccounts]),

        // Audit Logs
        fetchAllAuditLogs: useCallback(async () => {
            try {
                const snap = await getDocs(query(collection(db, COLLECTION_ACTIVITY_LOGS), orderBy("timestamp", "desc")))
                return snap.docs.map(snapshotDoc => {
                    const data = snapshotDoc.data()
                    return {
                        id: snapshotDoc.id,
                        ...data,
                        timestamp: parseAuditTimestamp(data.timestamp) || 0,
                        action: data.action || data.actionType || "Action",
                        actionType: data.actionType || data.action || "Action",
                    } as unknown as AuditLog
                })
            } catch (e) {
                console.error("fetchAllAuditLogs failed:", e)
                return []
            }
        }, []),
        addAuditLog: useCallback(async (input: Omit<AuditLog, "id" | "time" | "date" | "timestamp">) => {
            await recordServerAudit({
                action: input.action,
                actionType: input.actionType,
                details: input.details,
                targetId: input.targetId,
                targetName: input.residentName,
                targetCollection: input.targetCollection,
            })
        }, []),
        clearAuditLogs: useCallback(async () => {
            throw new Error("Audit log deletion is restricted to a dedicated server-authorized retention workflow.")
        }, []),

        // System Alerts
        addAlert: useCallback(async (input: Omit<SystemAlert, "id" | "timestamp">) => {
            await addDoc(collection(db, COLLECTION_SYSTEM_ALERTS), { ...input, timestamp: Date.now() })
        }, []),
        dismissAlert: useCallback(async (id: string) => {
            await deleteDoc(doc(db, COLLECTION_SYSTEM_ALERTS, id))
        }, []),

        // System Config
        updateConfig: useCallback(async (updates: Partial<SystemConfig>) => {
            await setDoc(doc(db, COLLECTION_SYSTEM_CONFIG, SYSTEM_CONFIG_DOCUMENT_ID), updates, { merge: true })
            await recordServerAudit({
                action: "Config Edit",
                actionType: "Config Edit",
                details: `Updated system configuration (${Object.keys(updates).join(", ")})`,
                targetCollection: "systemConfig",
            })
        }, []),
    }
}

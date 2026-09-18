"use client"

import { useCallback, useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, query, onSnapshot, orderBy, doc, updateDoc, deleteDoc, addDoc, getCountFromServer, where, setDoc } from "firebase/firestore"
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
            const adminUsers = allUserDocuments.filter(userData => 
                userData.role === "admin" || userData.role === "SuperAdmin" || userData.role === "superadmin" ||
                userData.role === "Full Access" || userData.role === "Verification Only" || 
                userData.role === "Documents Only" || userData.role === "View Only"
            ).map(adminUser => ({
                id: adminUser.id,
                name: adminUser.name || "Admin",
                email: adminUser.email || "",
                password: adminUser.password || "",
                role: adminUser.role,
                status: adminUser.status || "Active",
                initials: adminUser.initials || "A",
                isOnline: false,
                lastActive: "Never",
                createdDate: adminUser.createdDate || "Unknown",
                isVerified: adminUser.isVerified || false,
            }))
            setAdminAccounts(adminUsers.filter(adminUser => adminUser.role !== "SuperAdmin" && adminUser.role !== "superadmin"))
            setStats(prev => ({ ...prev, adminCount: adminUsers.length }))
        }))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_ACTIVITY_LOGS), orderBy("timestamp", "desc")), (snapshot) => {
            setAuditLogs(snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as AuditLog)))
        }))

        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_SYSTEM_ALERTS), (snapshot) => {
            setSystemAlerts(snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as SystemAlert)))
        }))

        unsubscribeFunctions.push(onSnapshot(doc(db, COLLECTION_SYSTEM_CONFIG, SYSTEM_CONFIG_DOCUMENT_ID), (snapshot) => {
            if (snapshot.exists()) setSystemConfig(snapshot.data() as SystemConfig)
        }))

        // Aggregate counts are fetched separately because Firestore onSnapshot does not
        // natively support server-side COUNT aggregates without a dedicated getCountFromServer call.
        async function fetchAggregateStats() {
            try {
                const [totalResidentsSnap, activeRequestsSnap, pendingVerificationsSnap] = await Promise.all([
                    getCountFromServer(collection(db, COLLECTION_USERS)),
                    getCountFromServer(query(collection(db, COLLECTION_DOCUMENT_REQUESTS), where("status", "==", "Pending"))),
                    getCountFromServer(query(collection(db, COLLECTION_VERIFICATIONS), where("status", "==", "pending"))),
                ])
                setStats(prev => ({
                    ...prev,
                    totalResidents: totalResidentsSnap.data().count,
                    activeRequests: activeRequestsSnap.data().count,
                    pendingVerifications: pendingVerificationsSnap.data().count,
                }))
            } catch (statsError) {
                console.error("Failed to fetch SuperAdmin aggregate stats:", statsError)
            }
        }
        fetchAggregateStats()

        // A brief delay ensures all listeners are initialized before the UI renders data.
        setTimeout(() => setIsLoaded(true), 500)

        return () => unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
    }, [])

    const refresh = useCallback(() => {}, [])

    return {
        adminAccounts,
        auditLogs,
        systemAlerts,
        systemConfig,
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
        isLoaded,
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
                
                await setDoc(doc(db, COLLECTION_USERS, newAdminUid), {
                    ...input,
                    initials: input.name.substring(0, 2).toUpperCase(),
                    isOnline: false,
                    lastActive: "Never",
                    createdDate: new Date().toISOString().split("T")[0],
                    createdAt: Date.now(),
                    isVerified: false,
                    role: input.role || "admin",
                })
                
                await deleteApp(secondaryApp)
                
                // Record the admin creation action for SuperAdmin accountability.
                await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                    timestamp: Date.now(),
                    admin: { name: SUPERADMIN_DISPLAY_NAME, initials: SUPERADMIN_INITIALS, color: COLOR_SUPERADMIN_GOLD },
                    role: "SuperAdmin",
                    action: "Created Admin",
                    actionType: "Created Admin",
                    details: `Created admin account for ${input.name}`,
                    ipAddress: "localhost"
                })
            } catch (createAdminError: any) {
                console.error(`Error creating admin auth account (email: ${input.email}):`, createAdminError)
                throw createAdminError
            }
        }, []),
        updateAdmin: useCallback(async (id: string, updates: Partial<AdminAccount>) => {
            await updateDoc(doc(db, COLLECTION_USERS, id), updates)
        }, []),
        deleteAdmin: useCallback(async (id: string) => {
            await deleteDoc(doc(db, COLLECTION_USERS, id))
        }, []),

        // Audit Logs
        addAuditLog: useCallback(async (input: Omit<AuditLog, "id" | "time" | "date" | "timestamp">) => {
            await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                ...input,
                date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                timestamp: Date.now()
            })
        }, []),
        clearAuditLogs: useCallback(async () => {
             // Delete all audit logs concurrently rather than sequentially.
             await Promise.all(auditLogs.map(auditLog => deleteDoc(doc(db, COLLECTION_ACTIVITY_LOGS, auditLog.id))))
        }, [auditLogs]),

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
        }, []),
    }
}

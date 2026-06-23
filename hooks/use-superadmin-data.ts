"use client"

import { useCallback, useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, query, onSnapshot, orderBy, doc, updateDoc, deleteDoc, addDoc, getCountFromServer, where, setDoc } from "firebase/firestore"
import type {
    AdminAccount,
    AuditLog,
    SystemAlert,
    SystemConfig,
} from "@/lib/superadmin-store"

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
        const unsubs: (() => void)[] = []

        unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
            const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
            const admins = allUsers.filter(u => 
                u.role === "admin" || u.role === "SuperAdmin" || u.role === "superadmin" ||
                u.role === "Full Access" || u.role === "Verification Only" || 
                u.role === "Documents Only" || u.role === "View Only"
            ).map(a => ({
                id: a.id,
                name: a.name || "Admin",
                email: a.email || "",
                password: a.password || "",
                role: a.role,
                status: a.status || "Active",
                initials: a.initials || "A",
                isOnline: false,
                lastActive: "Never",
                createdDate: a.createdDate || "Unknown",
            }))
            setAdminAccounts(admins.filter(a => a.role !== "SuperAdmin" && a.role !== "superadmin"))
            setStats(prev => ({ ...prev, adminCount: admins.length }))
        }))

        unsubs.push(onSnapshot(query(collection(db, "activityLogs"), orderBy("timestamp", "desc")), (snap) => {
            setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)))
        }))

        unsubs.push(onSnapshot(collection(db, "systemAlerts"), (snap) => {
            setSystemAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemAlert)))
        }))

        unsubs.push(onSnapshot(doc(db, "systemConfig", "global"), (snap) => {
            if (snap.exists()) setSystemConfig(snap.data() as SystemConfig)
        }))

        // Async Stats Fetch
        async function fetchStats() {
            try {
                const [totalResSnap, activeReqSnap, pendingVerSnap] = await Promise.all([
                    getCountFromServer(collection(db, "users")),
                    getCountFromServer(query(collection(db, "documentRequests"), where("status", "==", "Pending"))),
                    getCountFromServer(query(collection(db, "verifications"), where("status", "==", "pending"))),
                ])
                setStats(prev => ({
                    ...prev,
                    totalResidents: totalResSnap.data().count,
                    activeRequests: activeReqSnap.data().count,
                    pendingVerifications: pendingVerSnap.data().count,
                }))
            } catch (error) {}
        }
        fetchStats()

        setTimeout(() => setIsLoaded(true), 500)

        return () => unsubs.forEach(u => u())
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
                { name: "Full Access", value: adminAccounts.filter((a) => a.role === "Full Access").length, color: "#0C2340" },
                { name: "Verification Only", value: adminAccounts.filter((a) => a.role === "Verification Only").length, color: "#2a5080" },
                { name: "Documents Only", value: adminAccounts.filter((a) => a.role === "Documents Only").length, color: "#C5A55A" },
                { name: "View Only", value: adminAccounts.filter((a) => a.role === "View Only").length, color: "#94a3b8" },
            ].filter((r) => r.value > 0),
            auditActionBreakdown: (() => {
                const counts: Record<string, number> = {}
                auditLogs.forEach((l) => { counts[l.actionType] = (counts[l.actionType] ?? 0) + 1 })
                const colors = ["#10b981", "#3b82f6", "#ef4444", "#C5A55A", "#0C2340", "#94a3b8"]
                return Object.entries(counts).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
            })(),
            totalAuditLogs: auditLogs.length,
        },
        isLoaded,
        refresh,

        // Admin Accounts
        addAdmin: useCallback(async (input: Omit<AdminAccount, "id" | "initials" | "isOnline" | "lastActive" | "createdDate">) => {
             await addDoc(collection(db, "users"), {
                ...input,
                initials: input.name.substring(0, 2).toUpperCase(),
                createdDate: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                role: "admin",
             })
             // Audit Log
             await addDoc(collection(db, "activityLogs"), {
                date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                timestamp: Date.now(),
                admin: { name: "Super Admin", initials: "SA", color: "#C5A55A" },
                role: "SuperAdmin",
                action: "Created Admin",
                actionType: "Created Admin",
                details: `Created admin account for ${input.name}`,
                ipAddress: "localhost"
             })
        }, []),
        updateAdmin: useCallback(async (id: string, updates: Partial<AdminAccount>) => {
            await updateDoc(doc(db, "users", id), updates)
        }, []),
        deleteAdmin: useCallback(async (id: string) => {
            await deleteDoc(doc(db, "users", id))
        }, []),

        // Audit Logs
        addAuditLog: useCallback(async (input: Omit<AuditLog, "id" | "time" | "date" | "timestamp">) => {
            await addDoc(collection(db, "activityLogs"), {
                ...input,
                date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                timestamp: Date.now()
            })
        }, []),
        clearAuditLogs: useCallback(async () => {
             for (const l of auditLogs) await deleteDoc(doc(db, "activityLogs", l.id))
        }, [auditLogs]),

        // System Alerts
        addAlert: useCallback(async (input: Omit<SystemAlert, "id" | "timestamp">) => {
            await addDoc(collection(db, "systemAlerts"), { ...input, timestamp: Date.now() })
        }, []),
        dismissAlert: useCallback(async (id: string) => {
            await deleteDoc(doc(db, "systemAlerts", id))
        }, []),

        // System Config
        updateConfig: useCallback(async (updates: Partial<SystemConfig>) => {
            await setDoc(doc(db, "systemConfig", "global"), updates, { merge: true })
        }, []),
    }
}
